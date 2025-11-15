'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Editor } from '@tiptap/core';

interface BlockMenuProps {
  editor: Editor;
  onOpenSlashMenu?: () => void;
}

export default function BlockMenu({ editor, onOpenSlashMenu }: BlockMenuProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [showMenu, setShowMenu] = useState(false);
  const [currentBlock, setCurrentBlock] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!editor) return;

    const editorElement = editor.view.dom;

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Don't hide if hovering over the menu buttons
      if (containerRef.current?.contains(target)) {
        return;
      }
      
      if (!editorElement.contains(target)) {
        setIsVisible(false);
        setCurrentBlock(null);
        return;
      }

      // Find the closest paragraph/block element
      let blockElement = target.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, table, hr, .ProseMirror > div');
      
      if (blockElement && editorElement.contains(blockElement)) {
        const rect = blockElement.getBoundingClientRect();
        const editorRect = editorElement.getBoundingClientRect();
        
        setPosition({
          top: rect.top - editorRect.top + editorElement.scrollTop,
          left: -50, // Position to the left of content
        });
        setIsVisible(true);
        setCurrentBlock(blockElement as HTMLElement);
        
        // Clear any pending hide timeout
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }
      } else {
        // Delay hiding to allow clicking
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
        }
        hoverTimeoutRef.current = setTimeout(() => {
          if (!containerRef.current?.matches(':hover')) {
            setIsVisible(false);
            setCurrentBlock(null);
          }
        }, 200);
      }
    };

    const handleMouseLeave = (e: MouseEvent) => {
      // Only hide if we're leaving the editor AND not moving to the menu
      const relatedTarget = e.relatedTarget as HTMLElement;
      if (!containerRef.current?.contains(relatedTarget)) {
        hoverTimeoutRef.current = setTimeout(() => {
          if (!containerRef.current?.matches(':hover')) {
            setIsVisible(false);
            setCurrentBlock(null);
          }
        }, 300);
      }
    };

    editorElement.addEventListener('mousemove', handleMouseMove);
    editorElement.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      editorElement.removeEventListener('mousemove', handleMouseMove);
      editorElement.removeEventListener('mouseleave', handleMouseLeave);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [editor]);

  // Keep visible when hovering over menu
  useEffect(() => {
    const handleMenuMouseEnter = () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    };

    const handleMenuMouseLeave = () => {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
        setCurrentBlock(null);
        setShowMenu(false);
      }, 200);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mouseenter', handleMenuMouseEnter);
      container.addEventListener('mouseleave', handleMenuMouseLeave);
    }

    return () => {
      if (container) {
        container.removeEventListener('mouseenter', handleMenuMouseEnter);
        container.removeEventListener('mouseleave', handleMenuMouseLeave);
      }
    };
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        containerRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleDeleteBlock = () => {
    if (!editor || !currentBlock) return;

    // If it's a table, delete the whole table
    if (currentBlock.tagName === 'TABLE') {
      editor.chain().focus().deleteTable().run();
      setShowMenu(false);
      setIsVisible(false);
      return;
    }

    const { state } = editor;
    const { selection } = state;
    
    // Try to find the node position
    const pos = editor.view.posAtDOM(currentBlock, 0);
    if (pos === null || pos === undefined) return;

    // Get the node at this position
    const $pos = state.doc.resolve(pos);
    let depth = $pos.depth;
    
    // Walk up to find a block-level node
    while (depth > 0) {
      const node = $pos.node(depth);
      const nodeType = node.type.name;
      
      // Skip text nodes and inline nodes
      if (nodeType === 'paragraph' || nodeType === 'heading' || nodeType === 'blockquote' || 
          nodeType === 'codeBlock' || nodeType === 'horizontalRule' || nodeType === 'listItem') {
        const start = $pos.start(depth);
        const end = $pos.end(depth);
        
        editor
          .chain()
          .focus()
          .deleteRange({ from: start, to: end })
          .run();
        break;
      }
      
      depth--;
    }
    
    setShowMenu(false);
    setIsVisible(false);
  };

  const handleAddBlock = () => {
    // If we're in a table, show table options
    if (currentBlock?.tagName === 'TABLE' || editor.isActive('table')) {
      setShowMenu(!showMenu);
      return;
    }
    
    // Otherwise trigger slash command menu by inserting '/' and focusing
    editor.chain().focus().insertContent('/').run();
    // The slash command menu will automatically open
    setShowMenu(false);
  };

  if (!isVisible && !showMenu) return null;

  const isTable = currentBlock?.tagName === 'TABLE';

  return (
    <div 
      ref={containerRef}
      style={{ position: 'absolute', top: position.top, left: position.left }} 
      className="flex gap-1 z-[100]"
    >
      <button
        ref={buttonRef}
        onClick={handleAddBlock}
        className="p-1.5 rounded hover:bg-gray-200 transition-colors bg-white shadow-sm border border-gray-200"
        title="Add block"
      >
        <Plus className="w-4 h-4 text-gray-600" />
      </button>
      
      {currentBlock && (
        <button
          onClick={handleDeleteBlock}
          className="p-1.5 rounded hover:bg-red-100 transition-colors bg-white shadow-sm border border-gray-200"
          title="Delete block"
        >
          <Trash2 className="w-4 h-4 text-red-600" />
        </button>
      )}

      {(isTable || (currentBlock && currentBlock.tagName === 'TABLE')) && showMenu && (
        <div
          ref={menuRef}
          className="absolute top-8 left-0 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50 min-w-[180px]"
        >
          <button
            onClick={() => {
              editor.chain().focus().addColumnAfter().run();
              setShowMenu(false);
            }}
            className="w-full text-left px-3 py-2 hover:bg-gray-100 transition-colors text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Column
          </button>
          <button
            onClick={() => {
              editor.chain().focus().deleteColumn().run();
              setShowMenu(false);
            }}
            className="w-full text-left px-3 py-2 hover:bg-gray-100 transition-colors text-sm flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete Column
          </button>
          <button
            onClick={() => {
              editor.chain().focus().addRowAfter().run();
              setShowMenu(false);
            }}
            className="w-full text-left px-3 py-2 hover:bg-gray-100 transition-colors text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Row
          </button>
          <button
            onClick={() => {
              editor.chain().focus().deleteRow().run();
              setShowMenu(false);
            }}
            className="w-full text-left px-3 py-2 hover:bg-gray-100 transition-colors text-sm flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete Row
          </button>
          <div className="border-t border-gray-200 my-1"></div>
          <button
            onClick={() => {
              editor.chain().focus().deleteTable().run();
              setShowMenu(false);
            }}
            className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 transition-colors text-sm flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete Table
          </button>
        </div>
      )}
    </div>
  );
}
