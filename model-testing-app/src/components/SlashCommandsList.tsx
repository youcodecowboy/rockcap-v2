'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useMemo,
} from 'react';

interface SlashCommandsListProps {
  items: Array<{
    title: string;
    description: string;
    icon?: any;
    category?: string;
    command: (props: any) => void;
  }>;
  command: (item: any) => void;
}

const categoryLabels: Record<string, string> = {
  assistant: 'AI Assistant',
  formatting: 'Text Formatting',
  headings: 'Headings',
  lists: 'Lists',
  blocks: 'Blocks',
  tables: 'Tables',
  actions: 'Actions',
};

const SlashCommandsList = forwardRef((props: SlashCommandsListProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Group items by category
  const groupedItems = useMemo(() => {
    const groups: Record<string, Array<typeof props.items[0] & { originalIndex: number }>> = {};
    props.items.forEach((item, index) => {
      const category = item.category || 'other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push({ ...item, originalIndex: index });
    });
    return groups;
  }, [props.items]);

  // Flatten grouped items for selection
  const flatItems = useMemo(() => {
    return props.items;
  }, [props.items]);

  const selectItem = (index: number) => {
    const item = flatItems[index];
    if (item) {
      props.command(item);
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + flatItems.length - 1) % flatItems.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % flatItems.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [flatItems]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }

      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }

      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }

      return false;
    },
  }));

  // Calculate which item is selected across all groups
  let currentIndex = 0;

  return (
    <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden max-h-96 overflow-y-auto w-80">
      {Object.entries(groupedItems).map(([category, items]) => {
        const categoryStartIndex = currentIndex;
        const categoryEndIndex = currentIndex + items.length;
        const hasSelection = selectedIndex >= categoryStartIndex && selectedIndex < categoryEndIndex;
        
        const categoryElement = (
          <div key={category}>
            {category !== 'other' && (
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
                {categoryLabels[category] || category}
              </div>
            )}
            {items.map((item, itemIndex) => {
              const globalIndex = categoryStartIndex + itemIndex;
              const isSelected = globalIndex === selectedIndex;
              const Icon = item.icon;
              
              currentIndex++;
              
              return (
                <button
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors flex items-start gap-3 ${
                    isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                  }`}
                  key={globalIndex}
                  onClick={() => selectItem(globalIndex)}
                >
                  {Icon && (
                    <div className={`flex-shrink-0 mt-0.5 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                      {item.title}
                    </div>
                    <div className={`text-xs mt-0.5 ${isSelected ? 'text-blue-700' : 'text-gray-500'}`}>
                      {item.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        );
        
        return categoryElement;
      })}
      
      {flatItems.length === 0 && (
        <div className="px-4 py-3 text-sm text-gray-500 text-center">No results</div>
      )}
    </div>
  );
});

SlashCommandsList.displayName = 'SlashCommandsList';

export default SlashCommandsList;
