import { View, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../../model-testing-app/convex/_generated/api';
import { ArrowLeft } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import { useDocTabs } from '@/contexts/TabContext';
import TabManager from '@/components/TabManager';
import DocumentRenderer from '@/components/DocumentRenderer';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useEffect } from 'react';

export default function ViewerScreen() {
  const { documentId, title, fileType } = useLocalSearchParams<{
    documentId: string;
    title: string;
    fileType: string;
  }>();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { tabs, activeTabId, openTab } = useDocTabs();

  const document = useQuery(
    api.documents.get,
    isAuthenticated && documentId ? { id: documentId as any } : 'skip'
  );
  const fileUrl = useQuery(
    api.documents.getFileUrl,
    isAuthenticated && documentId ? { documentId: documentId as any } : 'skip'
  );

  useEffect(() => {
    if (documentId && title) {
      openTab({
        documentId,
        title: title || 'Document',
        fileType: fileType || '',
        fileUrl: fileUrl || undefined,
      });
    }
  }, [documentId]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (!fileUrl) return <LoadingSpinner message="Loading document..." />;

  return (
    <View className="flex-1 bg-m-bg">
      <View className="bg-m-bg-brand pt-14 pb-3 px-4 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <ArrowLeft size={20} color={colors.textOnBrand} />
        </TouchableOpacity>
        <Text className="text-base font-medium text-m-text-on-brand flex-1" numberOfLines={1}>
          {activeTab?.title || title || 'Document'}
        </Text>
      </View>

      <TabManager />

      <DocumentRenderer
        fileUrl={fileUrl}
        fileType={activeTab?.fileType || fileType || ''}
        fileName={activeTab?.title || title || ''}
      />
    </View>
  );
}
