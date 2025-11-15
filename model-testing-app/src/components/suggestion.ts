'use client';

import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import { Editor } from '@tiptap/core';
import SlashCommandsList from './SlashCommandsList';
import {
  Type,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Minus,
  Table,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Link as LinkIcon,
  Image as ImageIcon,
  Trash2,
  Plus,
  Columns,
  Rows,
  Sparkles,
} from 'lucide-react';

export default function getSuggestion() {
  return {
    items: ({ query }: { query: string }) => {
      const commands = [
        // AI Assistant
        {
          title: 'AI Assistant',
          description: 'Get AI help creating formatted notes with context',
          icon: Sparkles,
          category: 'assistant',
          searchTerms: ['ai', 'assistant', 'help', 'generate', 'create'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            const { from, to } = range;
            
            console.log('AI Assistant command triggered', { from, to, editor });
            
            editor
              .chain()
              .focus()
              .deleteRange({ from, to })
              .insertContent([
                {
                  type: 'aiAssistantBlock',
                  attrs: {
                    prompt: '',
                    state: 'pending',
                    errorMessage: null,
                  },
                },
              ])
              .run();
            
            console.log('AI Assistant command executed');
          },
        },
        // Text Formatting
        {
          title: 'Bold',
          description: 'Make text bold',
          icon: Bold,
          category: 'formatting',
          searchTerms: ['bold', 'strong', 'b'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent('Bold text')
              .setTextSelection({ from: editor.state.selection.from - 9, to: editor.state.selection.from })
              .toggleBold()
              .run();
          },
        },
        {
          title: 'Italic',
          description: 'Make text italic',
          icon: Italic,
          category: 'formatting',
          searchTerms: ['italic', 'emphasis', 'i'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent('Italic text')
              .setTextSelection({ from: editor.state.selection.from - 11, to: editor.state.selection.from })
              .toggleItalic()
              .run();
          },
        },
        {
          title: 'Underline',
          description: 'Underline text',
          icon: Underline,
          category: 'formatting',
          searchTerms: ['underline', 'u'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent('Underlined text')
              .setTextSelection({ from: editor.state.selection.from - 15, to: editor.state.selection.from })
              .toggleUnderline()
              .run();
          },
        },
        {
          title: 'Strikethrough',
          description: 'Cross out text',
          icon: Strikethrough,
          category: 'formatting',
          searchTerms: ['strike', 'strikethrough', 'delete'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent('Strikethrough text')
              .setTextSelection({ from: editor.state.selection.from - 17, to: editor.state.selection.from })
              .toggleStrike()
              .run();
          },
        },
        {
          title: 'Highlight',
          description: 'Highlight text',
          icon: Highlighter,
          category: 'formatting',
          searchTerms: ['highlight', 'mark', 'yellow'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent('Highlighted text')
              .setTextSelection({ from: editor.state.selection.from - 15, to: editor.state.selection.from })
              .toggleHighlight()
              .run();
          },
        },
        {
          title: 'Link',
          description: 'Add a link',
          icon: LinkIcon,
          category: 'formatting',
          searchTerms: ['link', 'url', 'href'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            // Insert placeholder text that user can replace
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent('Link text')
              .setTextSelection({ from: editor.state.selection.from - 9, to: editor.state.selection.from })
              .setLink({ href: 'https://example.com' })
              .run();
          },
        },
        
        // Headings
        {
          title: 'Heading 1',
          description: 'Big section heading',
          icon: Type,
          category: 'headings',
          searchTerms: ['h1', 'heading', 'title', 'big'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .setNode('heading', { level: 1 })
              .run();
          },
        },
        {
          title: 'Heading 2',
          description: 'Medium section heading',
          icon: Type,
          category: 'headings',
          searchTerms: ['h2', 'heading', 'subtitle', 'medium'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .setNode('heading', { level: 2 })
              .run();
          },
        },
        {
          title: 'Heading 3',
          description: 'Small section heading',
          icon: Type,
          category: 'headings',
          searchTerms: ['h3', 'heading', 'small'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .setNode('heading', { level: 3 })
              .run();
          },
        },
        
        // Lists
        {
          title: 'Bullet List',
          description: 'Create a bulleted list',
          icon: List,
          category: 'lists',
          searchTerms: ['bullet', 'ul', 'list', 'unordered'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .toggleBulletList()
              .run();
          },
        },
        {
          title: 'Numbered List',
          description: 'Create a numbered list',
          icon: ListOrdered,
          category: 'lists',
          searchTerms: ['number', 'ol', 'list', 'ordered'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .toggleOrderedList()
              .run();
          },
        },
        {
          title: 'Todo List',
          description: 'Track tasks with a checklist',
          icon: CheckSquare,
          category: 'lists',
          searchTerms: ['todo', 'task', 'checkbox', 'checklist'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .toggleTaskList()
              .run();
          },
        },
        
        // Blocks
        {
          title: 'Quote',
          description: 'Capture a quote',
          icon: Quote,
          category: 'blocks',
          searchTerms: ['blockquote', 'quote', 'citation'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .toggleBlockquote()
              .run();
          },
        },
        {
          title: 'Code Block',
          description: 'Show code with syntax highlighting',
          icon: Code,
          category: 'blocks',
          searchTerms: ['code', 'codeblock', 'pre'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .toggleCodeBlock()
              .run();
          },
        },
        {
          title: 'Divider',
          description: 'Visually divide blocks',
          icon: Minus,
          category: 'blocks',
          searchTerms: ['hr', 'horizontal', 'rule', 'divider', 'line'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .setHorizontalRule()
              .run();
          },
        },
        {
          title: 'Image',
          description: 'Insert an image',
          icon: ImageIcon,
          category: 'blocks',
          searchTerms: ['image', 'img', 'picture', 'photo'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            // Insert placeholder image
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .setImage({ src: 'https://via.placeholder.com/400' })
              .run();
          },
        },
        
        // Tables
        {
          title: 'Table',
          description: 'Insert a table',
          icon: Table,
          category: 'tables',
          searchTerms: ['table', 'grid', 'spreadsheet'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run();
          },
        },
        {
          title: 'Add Column',
          description: 'Add a column to the table',
          icon: Columns,
          category: 'tables',
          searchTerms: ['add', 'column', 'table'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .addColumnAfter()
              .run();
          },
        },
        {
          title: 'Delete Column',
          description: 'Remove a column from the table',
          icon: Columns,
          category: 'tables',
          searchTerms: ['delete', 'remove', 'column', 'table'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .deleteColumn()
              .run();
          },
        },
        {
          title: 'Add Row',
          description: 'Add a row to the table',
          icon: Rows,
          category: 'tables',
          searchTerms: ['add', 'row', 'table'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .addRowAfter()
              .run();
          },
        },
        {
          title: 'Delete Row',
          description: 'Remove a row from the table',
          icon: Rows,
          category: 'tables',
          searchTerms: ['delete', 'remove', 'row', 'table'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .deleteRow()
              .run();
          },
        },
        
        // Actions
        {
          title: 'Delete Block',
          description: 'Delete the current block',
          icon: Trash2,
          category: 'actions',
          searchTerms: ['delete', 'remove', 'block', 'clear'],
          command: ({ editor, range }: { editor: Editor; range: any }) => {
            const { state } = editor;
            const { selection } = state;
            const { $from } = selection;
            
            // Check if we're in a table
            if (editor.isActive('table')) {
              editor.chain().focus().deleteTable().run();
              return;
            }
            
            // Find the current node
            let depth = $from.depth;
            let node = $from.node(depth);
            let pos = $from.before(depth);
            
            // If we're in a list item, delete the whole list item
            if (node.type.name === 'listItem') {
              editor.chain().focus().deleteRange(range).deleteRange({ from: pos, to: pos + node.nodeSize }).run();
              return;
            }
            
            // Otherwise delete the current block
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .deleteRange({ from: pos, to: pos + node.nodeSize })
              .run();
          },
        },
      ];

      const filtered = commands.filter(item => {
        const searchQuery = query.toLowerCase();
        return (
          item.title.toLowerCase().includes(searchQuery) ||
          item.description.toLowerCase().includes(searchQuery) ||
          item.searchTerms.some(term => term.toLowerCase().includes(searchQuery))
        );
      });

      // Group by category
      const grouped = filtered.reduce((acc, item) => {
        if (!acc[item.category]) {
          acc[item.category] = [];
        }
        acc[item.category].push(item);
        return acc;
      }, {} as Record<string, typeof commands>);

      return filtered;
    },

    render: () => {
      let component: ReactRenderer;
      let popup: any;

      return {
        onStart: (props: any) => {
          component = new ReactRenderer(SlashCommandsList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
          });
        },

        onUpdate(props: any) {
          component.updateProps(props);

          if (!props.clientRect) {
            return;
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect,
          });
        },

        onKeyDown(props: any) {
          if (props.event.key === 'Escape') {
            popup[0].hide();
            return true;
          }

          return component.ref?.onKeyDown(props);
        },

        onExit() {
          popup[0].destroy();
          component.destroy();
        },
      };
    },
  };
}
