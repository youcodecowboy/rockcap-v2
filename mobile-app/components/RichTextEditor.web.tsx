import { useRef, useEffect, useCallback, useState } from 'react';
import { View } from 'react-native';

export interface MentionItem {
  id: string;
  label: string;
  type: 'user' | 'client' | 'project';
}

interface RichTextEditorProps {
  initialContent?: any;
  placeholder?: string;
  onChange?: (json: any) => void;
  onReady?: () => void;
  mentionItems?: MentionItem[];
  style?: any;
}

const EDITOR_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; color: #0a0a0a; background: #fff; }
  .toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; gap: 2px; padding: 8px 12px;
    background: #fff; border-bottom: 1px solid #e5e5e5;
    flex-wrap: wrap; align-items: center;
  }
  .toolbar button {
    width: 32px; height: 32px; border: none; background: transparent;
    border-radius: 6px; font-size: 13px; font-weight: 600; color: #525252;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
  }
  .toolbar button:active, .toolbar button.is-active { background: #f5f5f4; color: #0a0a0a; }
  .toolbar .sep { width: 1px; height: 20px; background: #e5e5e5; margin: 0 4px; }
  .ProseMirror { padding: 16px; min-height: 300px; outline: none; line-height: 1.6; }
  .ProseMirror p { margin-bottom: 0.5em; }
  .ProseMirror h1 { font-size: 1.5em; font-weight: 700; margin-bottom: 0.3em; }
  .ProseMirror h2 { font-size: 1.25em; font-weight: 600; margin-bottom: 0.3em; }
  .ProseMirror ul, .ProseMirror ol { padding-left: 1.5em; margin-bottom: 0.5em; }
  .ProseMirror li { margin-bottom: 0.2em; }
  .ProseMirror blockquote { border-left: 3px solid #e5e5e5; padding-left: 12px; color: #525252; margin-bottom: 0.5em; }
  .ProseMirror hr { border: none; border-top: 1px solid #e5e5e5; margin: 1em 0; }
  .ProseMirror strong { font-weight: 600; }
  .ProseMirror em { font-style: italic; }
  .ProseMirror u { text-decoration: underline; }
  .ProseMirror s { text-decoration: line-through; }
  .mention { background: #dbeafe; color: #1d4ed8; padding: 1px 4px; border-radius: 4px; font-weight: 500; }
  .ProseMirror p.is-editor-empty:first-child::before {
    content: attr(data-placeholder); float: left; color: #d4d4d4; pointer-events: none; height: 0;
  }
  .loading { padding: 16px; color: #a3a3a3; font-size: 14px; }
</style>
</head>
<body>
<div class="toolbar" id="toolbar">
  <button id="btn-bold"><b>B</b></button>
  <button id="btn-italic"><i>I</i></button>
  <button id="btn-underline"><u>U</u></button>
  <button id="btn-strike"><s>S</s></button>
  <div class="sep"></div>
  <button id="btn-h1">H1</button>
  <button id="btn-h2">H2</button>
  <div class="sep"></div>
  <button id="btn-ul">&#8226;</button>
  <button id="btn-ol">1.</button>
  <div class="sep"></div>
  <button id="btn-bq">&ldquo;</button>
  <button id="btn-hr">&mdash;</button>
</div>
<div id="editor"><p class="loading">Loading editor...</p></div>
<div id="mention-popup" style="display:none;position:fixed;z-index:100;background:#fff;border:1px solid #e5e5e5;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);max-height:200px;overflow-y:auto;width:240px;right:8px;"></div>

<script type="module">
import { Editor } from 'https://esm.sh/@tiptap/core@2.11.7';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.11.7';
import Underline from 'https://esm.sh/@tiptap/extension-underline@2.11.7';
import Placeholder from 'https://esm.sh/@tiptap/extension-placeholder@2.11.7';
import Mention from 'https://esm.sh/@tiptap/extension-mention@2.11.7';

let editor;
let mentionItems = []; // populated from parent via postMessage
let selectedMentionIndex = 0;
let currentMentionCommand = null;

const typeIcons = { user: '\\ud83d\\udc64', client: '\\ud83c\\udfe2', project: '\\ud83d\\udcc1' };
const typeColors = { user: '#3b82f6', client: '#f59e0b', project: '#8b5cf6' };

function renderMentionPopup(items, command) {
  const popup = document.getElementById('mention-popup');
  currentMentionCommand = command;
  selectedMentionIndex = 0;
  if (!items.length) { popup.style.display = 'none'; return; }

  popup.innerHTML = items.map((item, i) =>
    '<div class="mention-item' + (i === 0 ? ' selected' : '') + '" data-index="' + i + '" style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;' + (i === 0 ? 'background:#f5f5f4;' : '') + '">' +
    '<span style="font-size:14px;">' + (typeIcons[item.type] || '\\ud83d\\udc64') + '</span>' +
    '<span style="font-size:13px;color:#0a0a0a;">' + item.label + '</span>' +
    '<span style="font-size:10px;color:' + (typeColors[item.type] || '#525252') + ';margin-left:auto;text-transform:uppercase;font-weight:600;">' + item.type + '</span>' +
    '</div>'
  ).join('');

  // Position near cursor
  const sel = window.getSelection();
  if (sel.rangeCount) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    popup.style.left = rect.left + 'px';
    popup.style.top = (rect.bottom + 4) + 'px';
  }
  popup.style.display = 'block';

  // Click handlers
  popup.querySelectorAll('.mention-item').forEach((el, i) => {
    el.onclick = () => { command(items[i]); popup.style.display = 'none'; };
  });
}

function init(content, placeholder) {
  document.getElementById('editor').innerHTML = '';
  if (editor) editor.destroy();
  editor = new Editor({
    element: document.getElementById('editor'),
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder: placeholder || 'Start writing...' }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        renderHTML({ node }) {
          const t = node.attrs.type || 'user';
          const label = node.attrs.label || node.attrs.id;
          return ['span', { class: 'mention mention-' + t, 'data-type': t, 'data-id': node.attrs.id }, '@' + label];
        },
        suggestion: {
          items: ({ query }) => {
            const q = (query || '').toLowerCase();
            return mentionItems.filter(i => i.label.toLowerCase().includes(q)).slice(0, 10);
          },
          render: () => ({
            onStart: (props) => { renderMentionPopup(props.items, props.command); },
            onUpdate: (props) => { renderMentionPopup(props.items, props.command); },
            onExit: () => { document.getElementById('mention-popup').style.display = 'none'; },
            onKeyDown: (props) => {
              if (props.event.key === 'ArrowDown') { selectedMentionIndex = Math.min(selectedMentionIndex + 1, props.items.length - 1); highlightMention(); return true; }
              if (props.event.key === 'ArrowUp') { selectedMentionIndex = Math.max(selectedMentionIndex - 1, 0); highlightMention(); return true; }
              if (props.event.key === 'Enter') { if (props.items[selectedMentionIndex]) currentMentionCommand(props.items[selectedMentionIndex]); document.getElementById('mention-popup').style.display = 'none'; return true; }
              return false;
            },
          }),
        },
      }),
    ],
    content: content || '',
    onUpdate() {
      window.parent.postMessage(JSON.stringify({ type: 'content', data: editor.getJSON() }), '*');
    },
    onSelectionUpdate() { updateToolbar(); },
  });
  updateToolbar();
}

function highlightMention() {
  document.querySelectorAll('#mention-popup .mention-item').forEach((el, i) => {
    el.style.background = i === selectedMentionIndex ? '#f5f5f4' : 'transparent';
  });
}

function updateToolbar() {
  if (!editor) return;
  const map = {
    'btn-bold': () => editor.isActive('bold'),
    'btn-italic': () => editor.isActive('italic'),
    'btn-underline': () => editor.isActive('underline'),
    'btn-strike': () => editor.isActive('strike'),
    'btn-h1': () => editor.isActive('heading', { level: 1 }),
    'btn-h2': () => editor.isActive('heading', { level: 2 }),
    'btn-ul': () => editor.isActive('bulletList'),
    'btn-ol': () => editor.isActive('orderedList'),
    'btn-bq': () => editor.isActive('blockquote'),
  };
  for (const [id, check] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('is-active', check());
  }
}

function cmd(name, attrs) {
  if (!editor) return;
  editor.chain().focus()[name](attrs).run();
  updateToolbar();
}

// Wire up toolbar buttons
document.getElementById('btn-bold').onclick = () => cmd('toggleBold');
document.getElementById('btn-italic').onclick = () => cmd('toggleItalic');
document.getElementById('btn-underline').onclick = () => cmd('toggleUnderline');
document.getElementById('btn-strike').onclick = () => cmd('toggleStrike');
document.getElementById('btn-h1').onclick = () => cmd('toggleHeading', { level: 1 });
document.getElementById('btn-h2').onclick = () => cmd('toggleHeading', { level: 2 });
document.getElementById('btn-ul').onclick = () => cmd('toggleBulletList');
document.getElementById('btn-ol').onclick = () => cmd('toggleOrderedList');
document.getElementById('btn-bq').onclick = () => cmd('toggleBlockquote');
document.getElementById('btn-hr').onclick = () => cmd('setHorizontalRule');

window.addEventListener('message', (e) => {
  try {
    const msg = JSON.parse(e.data);
    if (msg.type === 'init') {
      let content = msg.content;
      if (typeof content === 'string') { try { content = JSON.parse(content); } catch {} }
      init(content, msg.placeholder);
      window.parent.postMessage(JSON.stringify({ type: 'init-ack' }), '*');
    }
    if (msg.type === 'getContent' && editor) {
      window.parent.postMessage(JSON.stringify({ type: 'content', data: editor.getJSON() }), '*');
    }
    if (msg.type === 'setMentionItems') {
      mentionItems = msg.items || [];
    }
  } catch {}
});

window.parent.postMessage(JSON.stringify({ type: 'ready' }), '*');
</script>
</body>
</html>`;

export default function RichTextEditor({
  initialContent,
  placeholder,
  onChange,
  onReady,
  mentionItems,
  style,
}: RichTextEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const initialized = useRef(false);

  // Listen for messages from the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'ready') onReady?.();
        if (msg.type === 'content') onChange?.(msg.data);
        if (msg.type === 'init-ack') initialized.current = true;
      } catch {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onChange, onReady]);

  // Retry sending init until iframe acknowledges. Handles all timing issues.
  useEffect(() => {
    if (initialContent === undefined) return;

    let content = initialContent;
    if (typeof content === 'string') {
      try { content = JSON.parse(content); } catch {}
    }

    initialized.current = false;
    const msg = JSON.stringify({
      type: 'init',
      content: content || '',
      placeholder: placeholder || 'Start writing...',
    });

    const interval = setInterval(() => {
      if (initialized.current) { clearInterval(interval); return; }
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(msg, '*');
      }
    }, 300);

    return () => clearInterval(interval);
  }, [initialContent, placeholder]);

  // Send mention items to iframe — retry until iframe is listening
  useEffect(() => {
    if (!mentionItems?.length) return;
    const msg = JSON.stringify({ type: 'setMentionItems', items: mentionItems });
    // Send immediately and also retry a few times to handle timing
    const send = () => {
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) iframe.contentWindow.postMessage(msg, '*');
    };
    send();
    const t1 = setTimeout(send, 500);
    const t2 = setTimeout(send, 1500);
    const t3 = setTimeout(send, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [mentionItems]);

  return (
    <View style={[{ flex: 1 }, style]}>
      <iframe
        ref={iframeRef as any}
        srcDoc={EDITOR_HTML}
        style={{
          flex: 1, border: 'none', width: '100%', height: '100%', minHeight: 400,
        } as any}
      />
    </View>
  );
}
