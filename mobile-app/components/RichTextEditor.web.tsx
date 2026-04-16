import { useRef, useEffect, useCallback, useState } from 'react';
import { View } from 'react-native';

interface RichTextEditorProps {
  initialContent?: any;
  placeholder?: string;
  onChange?: (json: any) => void;
  onReady?: () => void;
  style?: any;
}

function extractPlainText(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') {
    try { return extractPlainText(JSON.parse(content)); } catch { return content; }
  }
  const texts: string[] = [];
  function walk(node: any) {
    if (node.text) texts.push(node.text);
    if (node.content) node.content.forEach(walk);
    if (node.children) node.children.forEach(walk);
  }
  walk(content);
  return texts.join('\n');
}

function wrapInTiptapJson(text: string): any {
  const paragraphs = text.split('\n').map(line => ({
    type: 'paragraph',
    content: line ? [{ type: 'text', text: line }] : [],
  }));
  return { type: 'doc', content: paragraphs };
}

export default function RichTextEditor({
  initialContent,
  placeholder,
  onChange,
  onReady,
  style,
}: RichTextEditorProps) {
  const [text, setText] = useState('');
  const contentLoaded = useRef(false);

  useEffect(() => {
    // Wait for actual content to arrive (not undefined)
    if (initialContent !== undefined && !contentLoaded.current) {
      contentLoaded.current = true;
      setText(extractPlainText(initialContent));
      onReady?.();
    }
  }, [initialContent, onReady]);

  // New note (no noteId) — ready immediately
  useEffect(() => {
    if (initialContent === undefined) {
      // Will fire once initialContent arrives via state update
      const timer = setTimeout(() => {
        if (!contentLoaded.current) {
          contentLoaded.current = true;
          onReady?.();
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [initialContent, onReady]);

  const handleChange = useCallback((newText: string) => {
    setText(newText);
    onChange?.(wrapInTiptapJson(newText));
  }, [onChange]);

  return (
    <View style={[{ flex: 1 }, style]}>
      {/* Toolbar placeholder on web */}
      <div style={{
        display: 'flex', gap: 2, padding: '8px 12px',
        borderBottom: '1px solid #e5e5e5', flexWrap: 'wrap', alignItems: 'center',
      }}>
        {['B', 'I', 'U', 'S', '|', 'H1', 'H2', '|', '\u2022', '1.', '|', '\u201C', '\u2014'].map((label, i) => (
          label === '|' ? (
            <div key={i} style={{ width: 1, height: 20, background: '#e5e5e5', margin: '0 4px' }} />
          ) : (
            <button
              key={i}
              style={{
                width: 32, height: 32, border: 'none', background: 'transparent',
                borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#525252',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {label}
            </button>
          )
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e: any) => handleChange(e.target.value)}
        placeholder={placeholder || 'Start writing...'}
        style={{
          flex: 1, width: '100%', minHeight: 300,
          padding: 16, border: 'none', outline: 'none', resize: 'none',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          fontSize: 16, lineHeight: 1.6, color: '#0a0a0a',
        } as any}
      />
    </View>
  );
}
