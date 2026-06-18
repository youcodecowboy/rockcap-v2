'use client';

import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { useColors } from '@/lib/useColors';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}

export default function TagInput({ tags, onChange, suggestions = [], placeholder = 'Add tags...' }: TagInputProps) {
  const colors = useColors();
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredSuggestions = suggestions.filter(
    suggestion => 
      suggestion.toLowerCase().includes(inputValue.toLowerCase()) &&
      !tags.includes(suggestion)
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    setShowSuggestions(value.length > 0);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      addTag(inputValue.trim());
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  const addTag = (tag: string) => {
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
      setInputValue('');
      setShowSuggestions(false);
    }
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter(t => t !== tag));
  };

  const handleSuggestionClick = (suggestion: string) => {
    addTag(suggestion);
  };

  return (
    <div className="relative" ref={containerRef}>
      <div
        className="flex flex-wrap gap-2"
        style={{ padding: 8, border: `1px solid ${colors.border.default}`, borderRadius: 4, minHeight: 42, background: colors.bg.card }}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1"
            style={{ padding: '2px 8px', borderRadius: 4, fontSize: 13, background: `${colors.accent.blue}1f`, color: colors.accent.blue }}
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              type="button"
              style={{ lineHeight: 0, color: 'inherit', cursor: 'pointer' }}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          onFocus={() => setShowSuggestions(inputValue.length > 0 || filteredSuggestions.length > 0)}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 border-none outline-none bg-transparent"
          style={{ minWidth: 120, fontSize: 13, color: colors.text.primary }}
        />
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 z-50 overflow-y-auto"
          style={{ marginTop: 4, background: colors.bg.card, border: `1px solid ${colors.border.default}`, borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 192 }}
        >
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => handleSuggestionClick(suggestion)}
              className="w-full text-left"
              style={{ padding: '8px 12px', fontSize: 13, color: colors.text.primary, cursor: 'pointer' }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

