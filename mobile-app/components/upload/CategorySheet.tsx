import {
  Modal, View, Text, TouchableOpacity, TextInput, FlatList,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState } from 'react';
import { X, Search, Check } from 'lucide-react-native';
import { colors } from '@/lib/theme';

// Canonical category list — matches the mobile-web CategorySheet so the same
// feedback loop applies (user edits get captured in userEdits, AI learns).
const CATEGORIES = [
  'Appraisals',
  'Plans',
  'Inspections',
  'Professional Reports',
  'KYC',
  'Loan Terms',
  'Legal Documents',
  'Project Documents',
  'Financial Documents',
  'Insurance',
  'Communications',
  'Warranties',
  'Photographs',
];

interface Props {
  visible: boolean;
  currentCategory: string;
  currentType: string;
  onSelect: (category: string, type: string) => void;
  onClose: () => void;
}

export default function CategorySheet({
  visible, currentCategory, currentType, onSelect, onClose,
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState(currentCategory);
  const [docType, setDocType] = useState(currentType);
  const [search, setSearch] = useState('');

  const filtered = search
    ? CATEGORIES.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
    : CATEGORIES;

  const handleConfirm = () => {
    if (!selectedCategory) return;
    onSelect(selectedCategory, docType || selectedCategory);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={1}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }}
        />

        <View
          className="bg-m-bg rounded-t-[20px]"
          style={{ maxHeight: '85%', paddingBottom: Platform.OS === 'ios' ? 20 : 0 }}
        >
          <View className="items-center pt-2 pb-1">
            <View className="w-10 h-1 rounded-full bg-m-border" />
          </View>

          <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-m-border">
            <Text className="text-[15px] font-semibold text-m-text-primary">
              Classification
            </Text>
            <TouchableOpacity onPress={onClose} className="p-1" hitSlop={8}>
              <X size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* Doc type free-text input */}
          <View className="px-4 py-2.5 border-b border-m-border-subtle">
            <Text className="text-[10px] font-semibold text-m-text-secondary uppercase tracking-wide mb-1.5">
              Document Type
            </Text>
            <TextInput
              value={docType}
              onChangeText={setDocType}
              placeholder="e.g. Site Photo, Term Sheet"
              placeholderTextColor={colors.textTertiary}
              className="px-3 py-2 rounded-[10px] bg-m-bg-subtle border border-m-border text-sm text-m-text-primary"
            />
          </View>

          {/* Search categories */}
          <View className="px-4 py-2.5">
            <Text className="text-[10px] font-semibold text-m-text-secondary uppercase tracking-wide mb-1.5">
              Category
            </Text>
            <View className="flex-row items-center gap-2 px-3 py-2 rounded-[10px] bg-m-bg-subtle border border-m-border">
              <Search size={14} color={colors.textTertiary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search categories..."
                placeholderTextColor={colors.textTertiary}
                className="flex-1 text-sm text-m-text-primary py-0"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                  <X size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(c) => c}
            style={{ maxHeight: 360 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = item === selectedCategory;
              return (
                <TouchableOpacity
                  onPress={() => setSelectedCategory(item)}
                  className="flex-row items-center gap-3 px-4 py-3 border-b border-m-border-subtle"
                  style={{
                    backgroundColor: isSelected ? colors.bgSubtle : 'transparent',
                  }}
                >
                  <Text className="flex-1 text-sm text-m-text-primary">
                    {item}
                  </Text>
                  {isSelected && <Check size={16} color={colors.accent} />}
                </TouchableOpacity>
              );
            }}
          />

          <View className="px-4 pt-3 border-t border-m-border">
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={!selectedCategory}
              className="py-3 rounded-[10px] items-center"
              style={{
                backgroundColor: selectedCategory ? colors.bgBrand : colors.bgSubtle,
                opacity: selectedCategory ? 1 : 0.5,
              }}
            >
              <Text
                className="text-sm font-semibold"
                style={{ color: colors.textOnBrand }}
              >
                Confirm
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
