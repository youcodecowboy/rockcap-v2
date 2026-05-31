'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button, Modal, Input } from '@/components/layouts';
import { useColors } from '@/lib/useColors';

interface Shortcut {
  category: string;
  keys: string[];
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  // Navigation
  { category: 'Navigation', keys: ['Arrow Keys'], description: 'Move selection' },
  { category: 'Navigation', keys: ['Ctrl', 'Arrow Keys'], description: 'Move to edge of data region' },
  { category: 'Navigation', keys: ['Home'], description: 'Move to beginning of row' },
  { category: 'Navigation', keys: ['Ctrl', 'Home'], description: 'Move to A1' },
  { category: 'Navigation', keys: ['End'], description: 'Move to end of row' },
  { category: 'Navigation', keys: ['Ctrl', 'End'], description: 'Move to last cell' },
  { category: 'Navigation', keys: ['Page Up'], description: 'Move up one screen' },
  { category: 'Navigation', keys: ['Page Down'], description: 'Move down one screen' },
  { category: 'Navigation', keys: ['Tab'], description: 'Move to next cell' },
  { category: 'Navigation', keys: ['Shift', 'Tab'], description: 'Move to previous cell' },
  { category: 'Navigation', keys: ['Enter'], description: 'Move down' },
  { category: 'Navigation', keys: ['Shift', 'Enter'], description: 'Move up' },

  // Editing
  { category: 'Editing', keys: ['F2'], description: 'Edit active cell' },
  { category: 'Editing', keys: ['Delete'], description: 'Clear cell contents' },
  { category: 'Editing', keys: ['Backspace'], description: 'Clear cell and enter edit mode' },
  { category: 'Editing', keys: ['Esc'], description: 'Cancel editing' },
  { category: 'Editing', keys: ['Ctrl', 'Enter'], description: 'Fill selected cells with current value' },

  // Copy/Paste
  { category: 'Copy/Paste', keys: ['Ctrl', 'C'], description: 'Copy selection' },
  { category: 'Copy/Paste', keys: ['Ctrl', 'X'], description: 'Cut selection' },
  { category: 'Copy/Paste', keys: ['Ctrl', 'V'], description: 'Paste' },
  { category: 'Copy/Paste', keys: ['Ctrl', 'Z'], description: 'Undo' },
  { category: 'Copy/Paste', keys: ['Ctrl', 'Y'], description: 'Redo' },

  // Selection
  { category: 'Selection', keys: ['Ctrl', 'A'], description: 'Select all' },
  { category: 'Selection', keys: ['Shift', 'Arrow Keys'], description: 'Extend selection' },
  { category: 'Selection', keys: ['Ctrl', 'Shift', 'Arrow Keys'], description: 'Extend selection to edge' },
  { category: 'Selection', keys: ['Shift', 'Click'], description: 'Extend selection to clicked cell' },
  { category: 'Selection', keys: ['Ctrl', 'Click'], description: 'Add to selection' },

  // Formatting
  { category: 'Formatting', keys: ['Ctrl', 'B'], description: 'Bold' },
  { category: 'Formatting', keys: ['Ctrl', 'I'], description: 'Italic' },
  { category: 'Formatting', keys: ['Ctrl', 'U'], description: 'Underline' },

  // Insert/Delete
  { category: 'Insert/Delete', keys: ['Ctrl', '+'], description: 'Insert row/column' },
  { category: 'Insert/Delete', keys: ['Ctrl', '-'], description: 'Delete row/column' },

  // Formula
  { category: 'Formula', keys: ['='], description: 'Start formula' },
  { category: 'Formula', keys: ['F4'], description: 'Toggle absolute/relative reference' },

  // General
  { category: 'General', keys: ['Ctrl', 'F'], description: 'Find' },
  { category: 'General', keys: ['Ctrl', 'H'], description: 'Find and replace' },
  { category: 'General', keys: ['F1'], description: 'Help' },
  { category: 'General', keys: ['?'], description: 'Show keyboard shortcuts' },
];

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export default function KeyboardShortcutsModal({ open, onOpenChange }: KeyboardShortcutsModalProps) {
  const colors = useColors();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredShortcuts = SHORTCUTS.filter(shortcut => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      shortcut.description.toLowerCase().includes(query) ||
      shortcut.keys.some(key => key.toLowerCase().includes(query)) ||
      shortcut.category.toLowerCase().includes(query)
    );
  });

  const groupedShortcuts = filteredShortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, Shortcut[]>);

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Keyboard Shortcuts"
      width={760}
      footer={<Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>}
    >
      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.text.dim, pointerEvents: 'none' }} />
        <Input
          type="text"
          placeholder="Search shortcuts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ paddingLeft: 32 }}
        />
      </div>

      {/* Shortcuts List */}
      <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        {Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
          <div key={category} style={{ marginBottom: 24 }}>
            <h3
              style={{
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 500,
                color: colors.text.muted,
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {category}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {shortcuts.map((shortcut, index) => (
                <div
                  key={`${category}-${index}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: colors.text.secondary }}>{shortcut.description}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {shortcut.keys.map((key, keyIndex) => (
                      <span key={keyIndex} style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <kbd
                          style={{
                            padding: '2px 6px',
                            fontFamily: MONO,
                            fontSize: 11,
                            fontWeight: 500,
                            color: colors.text.primary,
                            background: colors.bg.cardAlt,
                            border: `1px solid ${colors.border.default}`,
                            borderRadius: 2,
                          }}
                        >
                          {key === ' ' ? 'Space' : key}
                        </kbd>
                        {keyIndex < shortcut.keys.length - 1 && (
                          <span style={{ margin: '0 4px', color: colors.text.dim }}>+</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {filteredShortcuts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: colors.text.muted, fontSize: 13 }}>
            No shortcuts found matching &quot;{searchQuery}&quot;
          </div>
        )}
      </div>
    </Modal>
  );
}
