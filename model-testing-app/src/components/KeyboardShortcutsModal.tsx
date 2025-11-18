'use client';

import { useState } from 'react';
import { X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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

export default function KeyboardShortcutsModal({ open, onOpenChange }: KeyboardShortcutsModalProps) {
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

  const formatKeys = (keys: string[]): string => {
    return keys.map(key => {
      if (key === ' ') return 'Space';
      return key;
    }).join(' + ');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Shortcuts List */}
        <div className="flex-1 overflow-y-auto">
          {Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
            <div key={category} className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                {category}
              </h3>
              <div className="space-y-2">
                {shortcuts.map((shortcut, index) => (
                  <div
                    key={`${category}-${index}`}
                    className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded"
                  >
                    <span className="text-sm text-gray-700">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <span key={keyIndex}>
                          <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded shadow-sm">
                            {key === ' ' ? 'Space' : key}
                          </kbd>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="mx-1 text-gray-400">+</span>
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
            <div className="text-center py-8 text-gray-500">
              No shortcuts found matching "{searchQuery}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

