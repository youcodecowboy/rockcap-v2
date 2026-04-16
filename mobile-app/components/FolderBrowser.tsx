import { View, Text, TouchableOpacity, FlatList, ActionSheetIOS, Platform, Alert } from 'react-native';
import { Folder, FileText, ChevronRight, MoreVertical } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface FolderItem {
  id: string;
  name: string;
  type: 'folder' | 'document';
  documentCount?: number;
  fileType?: string;
}

interface FolderBrowserProps {
  items: FolderItem[];
  breadcrumbs: { id: string; name: string }[];
  onFolderPress: (folderId: string, folderName: string) => void;
  onDocumentPress: (documentId: string, title: string, fileType: string) => void;
  onBreadcrumbPress: (index: number) => void;
  onDocumentAction?: (documentId: string, action: 'duplicate' | 'flag' | 'delete') => void;
}

export default function FolderBrowser({
  items, breadcrumbs, onFolderPress, onDocumentPress, onBreadcrumbPress, onDocumentAction,
}: FolderBrowserProps) {
  function showDocumentActions(documentId: string) {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Duplicate', 'Flag', 'Delete', 'Cancel'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 3,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) onDocumentAction?.(documentId, 'duplicate');
          if (buttonIndex === 1) onDocumentAction?.(documentId, 'flag');
          if (buttonIndex === 2) onDocumentAction?.(documentId, 'delete');
        }
      );
    } else {
      Alert.alert('Document Actions', '', [
        { text: 'Duplicate', onPress: () => onDocumentAction?.(documentId, 'duplicate') },
        { text: 'Flag', onPress: () => onDocumentAction?.(documentId, 'flag') },
        { text: 'Delete', style: 'destructive', onPress: () => onDocumentAction?.(documentId, 'delete') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  return (
    <View className="flex-1">
      {breadcrumbs.length > 0 && (
        <View className="flex-row items-center px-4 py-2 bg-m-bg-subtle border-b border-m-border-subtle flex-wrap">
          {breadcrumbs.map((crumb, i) => (
            <View key={crumb.id} className="flex-row items-center">
              {i > 0 && <ChevronRight size={12} color={colors.textTertiary} />}
              <TouchableOpacity onPress={() => onBreadcrumbPress(i)}>
                <Text className={`text-xs ${i === breadcrumbs.length - 1 ? 'text-m-text-primary font-medium' : 'text-m-text-tertiary'}`}>
                  {crumb.name}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() =>
              item.type === 'folder'
                ? onFolderPress(item.id, item.name)
                : onDocumentPress(item.id, item.name, item.fileType || '')
            }
            className="flex-row items-center px-4 py-3 border-b border-m-border-subtle"
          >
            {item.type === 'folder' ? (
              <Folder size={18} color={colors.textTertiary} />
            ) : (
              <FileText size={18} color={colors.textTertiary} />
            )}
            <View className="flex-1 ml-3">
              <Text className="text-sm text-m-text-primary" numberOfLines={1}>{item.name}</Text>
              {item.type === 'folder' && item.documentCount !== undefined ? (
                <Text className="text-xs text-m-text-tertiary mt-0.5">
                  {item.documentCount} document{item.documentCount !== 1 ? 's' : ''}
                </Text>
              ) : null}
              {item.type === 'document' && item.fileType ? (
                <Text className="text-xs text-m-text-tertiary mt-0.5 uppercase">{item.fileType}</Text>
              ) : null}
            </View>
            {item.type === 'document' && onDocumentAction && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  showDocumentActions(item.id);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                className="px-2"
              >
                <MoreVertical size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
            <ChevronRight size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}
