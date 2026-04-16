import {
  Modal, View, Text, TouchableOpacity, TextInput, FlatList, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useMemo, useState } from 'react';
import { X, Search, Check } from 'lucide-react-native';
import { colors } from '@/lib/theme';

// A reusable searchable bottom-sheet-style picker. Used for clients and
// projects in the upload setup flow. Keeping it generic (items = {id, label})
// lets the caller pass whatever shape it has without each picker needing its
// own component. Long-term, if pickers grow extra features (avatars, badges,
// grouping), this can grow an `renderItem` prop — keep it simple for now.
export interface PickerItem {
  id: string;
  label: string;
  sublabel?: string;
  italic?: boolean; // Render label in italic (used for "None" sentinels)
}

interface Props {
  visible: boolean;
  title: string;
  items: PickerItem[];
  selectedId?: string;
  onSelect: (id: string, label: string) => void;
  onClose: () => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

export default function PickerSheet({
  visible, title, items, selectedId, onSelect, onClose, isLoading, emptyMessage,
}: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        (i.sublabel || '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const handleSelect = (id: string, label: string) => {
    onSelect(id, label);
    setSearch('');
  };

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Backdrop */}
        <TouchableOpacity
          onPress={handleClose}
          activeOpacity={1}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }}
        />

        {/* Sheet */}
        <View
          className="bg-m-bg rounded-t-[20px]"
          style={{ maxHeight: '85%', paddingBottom: Platform.OS === 'ios' ? 20 : 0 }}
        >
          {/* Grab handle */}
          <View className="items-center pt-2 pb-1">
            <View className="w-10 h-1 rounded-full bg-m-border" />
          </View>

          {/* Header */}
          <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-m-border">
            <Text className="text-[15px] font-semibold text-m-text-primary">{title}</Text>
            <TouchableOpacity onPress={handleClose} className="p-1" hitSlop={8}>
              <X size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View className="px-4 py-2.5">
            <View className="flex-row items-center gap-2 px-3 py-2 rounded-[10px] bg-m-bg-subtle border border-m-border">
              <Search size={14} color={colors.textTertiary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search..."
                placeholderTextColor={colors.textTertiary}
                className="flex-1 text-sm text-m-text-primary py-0"
                autoFocus
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                  <X size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* List */}
          {isLoading ? (
            <View className="py-8 items-center">
              <ActivityIndicator size="small" color={colors.textTertiary} />
            </View>
          ) : filtered.length === 0 ? (
            <View className="py-8 items-center px-6">
              <Text className="text-sm text-m-text-tertiary text-center">
                {search
                  ? 'No results found'
                  : emptyMessage || 'Nothing here yet'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 400 }}
              contentContainerStyle={{ paddingBottom: 12 }}
              renderItem={({ item }) => {
                const isSelected = item.id === selectedId;
                return (
                  <TouchableOpacity
                    onPress={() => handleSelect(item.id, item.label)}
                    className="flex-row items-center gap-3 px-4 py-3 border-b border-m-border-subtle"
                    style={{
                      backgroundColor: isSelected ? colors.bgSubtle : 'transparent',
                    }}
                  >
                    <View className="flex-1 min-w-0">
                      <Text
                        className={`text-sm ${
                          item.italic ? 'italic text-m-text-secondary' : 'text-m-text-primary'
                        }`}
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>
                      {item.sublabel ? (
                        <Text className="text-xs text-m-text-tertiary mt-0.5" numberOfLines={1}>
                          {item.sublabel}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected && <Check size={16} color={colors.accent} />}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
