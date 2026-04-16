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
  const pendingInit = useRef<any>(null);

  const sendInit = useCallback((content: any) => {
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

  useEffect(() => {
    if (isReady && initialContent !== undefined) {
      sendInit(initialContent);
    } else if (!isReady) {
      pendingInit.current = initialContent;
    }
  }, [isReady, initialContent, sendInit]);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'ready') {
        setIsReady(true);
        if (pendingInit.current !== undefined) {
          // Small delay to ensure editor is fully mounted
          setTimeout(() => sendInit(pendingInit.current), 100);
          pendingInit.current = null;
        }
        onReady?.();
      }
      if (msg.type === 'content') {
        onChange?.(msg.data);
      }
    } catch {}
  }, [onChange, onReady, sendInit]);

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
