import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { Folder, FileText, ChevronRight } from 'lucide-react-native';
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
}

export default function FolderBrowser({
  items, breadcrumbs, onFolderPress, onDocumentPress, onBreadcrumbPress,
}: FolderBrowserProps) {
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
            <ChevronRight size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}
