import { useRef, useCallback, useEffect, useState } from 'react';
import { View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

// Load the HTML asset
const editorHtml = require('@/assets/tiptap-editor.html');

export interface MentionItem {
  id: string;
  label: string;
  type: 'user' | 'client' | 'project' | 'contact';
}

interface RichTextEditorProps {
  initialContent?: any; // Tiptap JSON, JSON string, or plain text
  placeholder?: string;
  onChange?: (json: any) => void;
  onReady?: () => void;
  mentionItems?: MentionItem[];
  style?: any;
}

export default function RichTextEditor({
  initialContent,
  placeholder,
  onChange,
  onReady,
  mentionItems,
  style,
}: RichTextEditorProps) {
  const webViewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);
  // Guard against double-init. The Tiptap HTML constructs a new Editor every
  // time it receives an init message and doesn't destroy the previous one —
  // constructing a second editor on the same <div> corrupts ProseMirror's
  // DOM attachment and the editor silently becomes unresponsive.
  const initSentRef = useRef(false);

  const sendInit = useCallback((content: any) => {
    if (initSentRef.current) return;
    initSentRef.current = true;

    // Normalize content: if it's a plain string that's not JSON, wrap it
    let normalized = content;
    if (typeof content === 'string') {
      try {
        normalized = JSON.parse(content);
      } catch {
        // Plain text — wrap as Tiptap doc
        normalized = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }],
        };
      }
    }

    const msg = JSON.stringify({
      type: 'init',
      content: normalized || '',
      placeholder: placeholder || 'Start writing...',
    });

    webViewRef.current?.postMessage(msg);
  }, [placeholder]);

  // Single init path. Fires when both the WebView is ready AND initialContent
  // is known (i.e. not the `undefined` "still-fetching" sentinel). Handles
  // both orderings: ready-before-fetch and fetch-before-ready.
  useEffect(() => {
    if (isReady && initialContent !== undefined) {
      sendInit(initialContent);
    }
  }, [isReady, initialContent, sendInit]);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'ready') {
        setIsReady(true);
        onReady?.();
      }
      if (msg.type === 'content') {
        onChange?.(msg.data);
      }
    } catch {}
  }, [onChange, onReady]);

  // Request content (for save)
  const getContent = useCallback(() => {
    webViewRef.current?.postMessage(JSON.stringify({ type: 'getContent' }));
  }, []);

  return (
    <View style={[{ flex: 1 }, style]}>
      <WebView
        ref={webViewRef}
        source={editorHtml}
        originWhitelist={['*']}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView={false}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      />
    </View>
  );
}
