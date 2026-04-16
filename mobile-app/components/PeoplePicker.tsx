import { View, Text, TouchableOpacity, Modal, TextInput, FlatList } from 'react-native';
import { useState, useMemo } from 'react';
import { X, Search, Check, User as UserIcon } from 'lucide-react-native';
import { colors } from '@/lib/theme';

export interface PersonOption {
  id: string;
  name: string;
  email?: string;
  source: 'user' | 'contact';
}

interface PeoplePickerProps {
  options: PersonOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  title?: string;
  placeholder?: string; // Label when nothing selected
  triggerClassName?: string;
  renderTrigger?: (selected: PersonOption[]) => React.ReactNode;
  maxSelection?: number;
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export default function PeoplePicker({
  options, selectedIds, onChange, title = 'Select People', placeholder = 'No one',
  renderTrigger, maxSelection,
}: PeoplePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.name.toLowerCase().includes(q) || (o.email || '').toLowerCase().includes(q));
  }, [options, search]);

  const selected = useMemo(
    () => options.filter(o => selectedIds.includes(o.id)),
    [options, selectedIds]
  );

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      if (maxSelection && selectedIds.length >= maxSelection) return;
      onChange([...selectedIds, id]);
    }
  };

  const summary = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? selected[0].name
      : `${selected[0].name} +${selected.length - 1}`;

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)}>
        {renderTrigger
          ? renderTrigger(selected)
          : <Text className={`text-sm ${selected.length > 0 ? 'text-m-text-primary' : 'text-m-text-tertiary'}`}>{summary}</Text>
        }
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-m-border bg-m-bg-card">
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text className="text-base font-semibold text-m-text-primary">{title}</Text>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
              <Text className="text-sm font-semibold text-m-text-primary">Done</Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View className="px-4 py-2 bg-m-bg-card border-b border-m-border">
            <View className="bg-m-bg-subtle rounded-lg flex-row items-center px-3 py-2">
              <Search size={14} color={colors.textTertiary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name or email..."
                className="flex-1 ml-2 text-sm text-m-text-primary"
                placeholderTextColor={colors.textPlaceholder}
              />
            </View>
          </View>

          {/* Selection summary */}
          {selected.length > 0 && (
            <View className="px-4 py-2 border-b border-m-border bg-m-bg-subtle">
              <Text className="text-xs text-m-text-tertiary">
                {selected.length} selected{maxSelection ? ` · max ${maxSelection}` : ''}
              </Text>
            </View>
          )}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isSelected = selectedIds.includes(item.id);
              return (
                <TouchableOpacity
                  onPress={() => toggle(item.id)}
                  className="flex-row items-center gap-3 px-4 py-3 border-b border-m-border-subtle"
                >
                  <View className="w-8 h-8 rounded-full bg-m-bg-inset items-center justify-center">
                    <Text className="text-[11px] font-semibold text-m-text-secondary">{getInitials(item.name)}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-m-text-primary">{item.name}</Text>
                    {item.email && item.email !== item.name && (
                      <Text className="text-xs text-m-text-tertiary">{item.email}</Text>
                    )}
                  </View>
                  {item.source === 'contact' && (
                    <View className="bg-m-bg-subtle rounded-full px-2 py-0.5 mr-2">
                      <Text className="text-[10px] text-m-text-tertiary">Contact</Text>
                    </View>
                  )}
                  <View
                    className={`w-5 h-5 rounded-full border items-center justify-center ${
                      isSelected ? 'bg-m-bg-brand border-m-bg-brand' : 'border-m-border'
                    }`}
                  >
                    {isSelected && <Check size={12} color={colors.textOnBrand} />}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View className="py-8 items-center">
                <UserIcon size={24} color={colors.textTertiary} />
                <Text className="text-sm text-m-text-tertiary mt-2">No matches</Text>
              </View>
            }
          />
        </View>
      </Modal>
    </>
  );
}
