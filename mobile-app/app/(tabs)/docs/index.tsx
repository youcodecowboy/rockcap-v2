import { View, Text } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../../model-testing-app/convex/_generated/api';
import FolderBrowser from '@/components/FolderBrowser';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { FileText } from 'lucide-react-native';

interface Breadcrumb {
  id: string;
  name: string;
}

export default function DocsScreen() {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);

  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');

  const isAtRoot = breadcrumbs.length === 0;

  const items = isAtRoot
    ? (clients || []).map((c) => ({
        id: c._id,
        name: c.name,
        type: 'folder' as const,
      }))
    : [];

  const handleFolderPress = (folderId: string, folderName: string) => {
    setBreadcrumbs((prev) => [...prev, { id: folderId, name: folderName }]);
  };

  const handleDocumentPress = (documentId: string, title: string, fileType: string) => {
    router.push({
      pathname: '/docs/viewer',
      params: { documentId, title, fileType },
    });
  };

  const handleBreadcrumbPress = (index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  if (!clients) return <LoadingSpinner />;

  return (
    <View className="flex-1 bg-m-bg">
      <View className="bg-m-bg-brand pt-14 pb-4 px-4">
        <Text className="text-xl font-bold text-m-text-on-brand">Documents</Text>
      </View>

      {items.length === 0 ? (
        <EmptyState icon={FileText} title="No documents" />
      ) : (
        <FolderBrowser
          items={items}
          breadcrumbs={breadcrumbs}
          onFolderPress={handleFolderPress}
          onDocumentPress={handleDocumentPress}
          onBreadcrumbPress={handleBreadcrumbPress}
        />
      )}
    </View>
  );
}
