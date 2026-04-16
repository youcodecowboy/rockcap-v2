import { View, TouchableOpacity, Text, ScrollView, Alert, TextInput } from 'react-native';
import { useState, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../../model-testing-app/convex/_generated/api';
import FolderBrowser from '@/components/FolderBrowser';
import MobileHeader from '@/components/MobileHeader';
import ClientListItem from '@/components/ClientListItem';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { FileText, ChevronLeft, Search } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import type { Id } from '../../../../model-testing-app/convex/_generated/dataModel';

type NavLevel =
  | { level: 'clients' }
  | { level: 'projects'; clientId: Id<'clients'>; clientName: string }
  | { level: 'folders'; clientId: Id<'clients'>; clientName: string; projectId: Id<'projects'>; projectName: string }
  | { level: 'documents'; clientId: Id<'clients'>; clientName: string; projectId: Id<'projects'>; projectName: string; folderType: string; folderName: string };

const TABS = ['Clients', 'Internal', 'Personal'] as const;
type DocTab = typeof TABS[number];

export default function DocsScreen() {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();

  // Deep-link params — other screens can push /docs?clientId=X&projectId=Y
  // &folderType=Z to jump straight to a specific level. Names are optional
  // (show "..." during the brief window before data loads) but clients usually
  // have them on hand and pass them for instant breadcrumbs.
  const params = useLocalSearchParams<{
    clientId?: string;
    clientName?: string;
    projectId?: string;
    projectName?: string;
    folderType?: string;
    folderName?: string;
  }>();

  const [nav, setNav] = useState<NavLevel>(() => {
    // Lazy initializer runs once on mount. We build the deepest nav state
    // the params support, falling back to the root clients list.
    if (params.folderType && params.projectId && params.clientId) {
      return {
        level: 'documents',
        clientId: params.clientId as Id<'clients'>,
        clientName: params.clientName || '...',
        projectId: params.projectId as Id<'projects'>,
        projectName: params.projectName || '...',
        folderType: params.folderType,
        folderName: params.folderName || params.folderType,
      };
    }
    if (params.projectId && params.clientId) {
      return {
        level: 'folders',
        clientId: params.clientId as Id<'clients'>,
        clientName: params.clientName || '...',
        projectId: params.projectId as Id<'projects'>,
        projectName: params.projectName || '...',
      };
    }
    if (params.clientId) {
      return {
        level: 'projects',
        clientId: params.clientId as Id<'clients'>,
        clientName: params.clientName || '...',
      };
    }
    return { level: 'clients' };
  });
  const [activeTab, setActiveTab] = useState<DocTab>('Clients');
  const [search, setSearch] = useState('');

  const duplicateDoc = useMutation(api.documents.duplicateDocument);
  const removeDoc = useMutation(api.documents.remove);
  const createFlag = useMutation(api.flags.create);

  const handleDocumentAction = async (documentId: string, action: 'duplicate' | 'flag' | 'delete') => {
    try {
      if (action === 'duplicate') {
        await duplicateDoc({ documentId: documentId as any });
        Alert.alert('Done', 'Document duplicated');
      } else if (action === 'flag') {
        await createFlag({
          entityType: 'document',
          entityId: documentId,
          note: 'Flagged from mobile',
          priority: 'normal',
        } as any);
        Alert.alert('Done', 'Document flagged');
      } else if (action === 'delete') {
        Alert.alert('Delete Document', 'Are you sure?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              await removeDoc({ id: documentId as any });
              Alert.alert('Done', 'Document deleted');
            },
          },
        ]);
      }
    } catch (error) {
      Alert.alert('Error', 'Action failed');
    }
  };

  // Conditional queries based on current navigation level
  const clients = useQuery(
    api.clients.list,
    isAuthenticated ? {} : 'skip'
  );

  const clientDocCounts = useQuery(
    api.documents.getClientDocumentCounts,
    isAuthenticated ? {} : 'skip'
  ) as Record<string, number> | undefined;

  const allProjects = useQuery(api.projects.list, isAuthenticated ? {} : 'skip');
  const projectCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (allProjects) {
      for (const p of allProjects) {
        if (p.clientId) map[p.clientId] = (map[p.clientId] || 0) + 1;
      }
    }
    return map;
  }, [allProjects]);

  const projects = useQuery(
    api.projects.getByClient,
    isAuthenticated && nav.level !== 'clients'
      ? { clientId: nav.clientId }
      : 'skip'
  );

  const folders = useQuery(
    api.projects.getProjectFolders,
    isAuthenticated && (nav.level === 'folders' || nav.level === 'documents')
      ? { projectId: nav.projectId }
      : 'skip'
  );

  const documents = useQuery(
    api.documents.getByFolder,
    isAuthenticated && nav.level === 'documents'
      ? {
          clientId: nav.clientId,
          folderType: nav.folderType,
          level: 'project' as const,
          projectId: nav.projectId,
        }
      : 'skip'
  );

  // Folder counts for showing document counts on folders
  const folderCounts = useQuery(
    api.documents.getFolderCounts,
    isAuthenticated && nav.level !== 'clients'
      ? { clientId: nav.clientId }
      : 'skip'
  );

  // Recent clients — first 3 sorted by lastAccessedAt if available
  const recentClients = useMemo(() => {
    if (!clients) return [];
    const sorted = [...clients].sort((a, b) => {
      const aTime = (a as any).lastAccessedAt ?? a._creationTime ?? 0;
      const bTime = (b as any).lastAccessedAt ?? b._creationTime ?? 0;
      return (typeof bTime === 'number' ? bTime : new Date(bTime).getTime()) -
             (typeof aTime === 'number' ? aTime : new Date(aTime).getTime());
    });
    return sorted.slice(0, 3);
  }, [clients]);

  // Build breadcrumbs from current nav state
  const breadcrumbs = useMemo(() => {
    const crumbs: { id: string; name: string }[] = [];
    if (nav.level === 'clients') return crumbs;

    crumbs.push({ id: nav.clientId, name: nav.clientName });
    if (nav.level === 'projects') return crumbs;

    crumbs.push({ id: nav.projectId, name: nav.projectName });
    if (nav.level === 'folders') return crumbs;

    crumbs.push({ id: nav.folderType, name: nav.folderName });
    return crumbs;
  }, [nav]);

  // Filter clients by search and tab
  const filteredClients = useMemo(() => {
    if (!clients) return [];
    let filtered = clients;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(q));
    }
    return filtered;
  }, [clients, search]);

  // Build items for current level
  const items = useMemo(() => {
    switch (nav.level) {
      case 'clients':
        return filteredClients.map((c) => ({
          id: c._id,
          name: c.name,
          type: 'folder' as const,
        }));
      case 'projects': {
        const pFolders = folderCounts?.projectFolders ?? {};
        return (projects || []).map((p) => {
          const projectCounts = pFolders[p._id] ?? {};
          const total = Object.values(projectCounts).reduce((sum: number, n: number) => sum + n, 0);
          return {
            id: p._id,
            name: p.name,
            type: 'folder' as const,
            documentCount: total,
          };
        });
      }
      case 'folders': {
        // Important: `folderCounts.projectFolders[projectId]` is keyed by
        // `folderType` (the string like "background"/"kyc"), not by `_id`.
        // Documents store their folder as `doc.folderId = folderType`, and
        // getFolderCounts mirrors that — so look up by folderType here.
        const projectCounts = folderCounts?.projectFolders?.[nav.projectId] ?? {};
        return (folders || []).map((f) => ({
          id: f._id,
          name: f.name,
          type: 'folder' as const,
          documentCount: projectCounts[f.folderType] ?? 0,
        }));
      }
      case 'documents':
        return (documents || []).map((d) => ({
          id: d._id,
          name: d.fileName || 'Untitled',
          type: 'document' as const,
          fileType: d.fileType,
        }));
    }
  }, [nav.level, clients, projects, folders, documents, folderCounts]);

  // Loading state
  const isLoading =
    (nav.level === 'clients' && !clients) ||
    (nav.level === 'projects' && !projects) ||
    (nav.level === 'folders' && !folders) ||
    (nav.level === 'documents' && !documents);

  const handleFolderPress = (folderId: string, folderName: string) => {
    switch (nav.level) {
      case 'clients':
        setNav({
          level: 'projects',
          clientId: folderId as Id<'clients'>,
          clientName: folderName,
        });
        break;
      case 'projects':
        setNav({
          ...nav,
          level: 'folders',
          projectId: folderId as Id<'projects'>,
          projectName: folderName,
        });
        break;
      case 'folders': {
        const folder = folders?.find((f) => f._id === folderId);
        setNav({
          ...nav,
          level: 'documents',
          folderType: folder?.folderType || folderId,
          folderName: folderName,
        });
        break;
      }
    }
  };

  const handleDocumentPress = (documentId: string, title: string, fileType: string) => {
    router.push({
      pathname: '/docs/viewer',
      params: { documentId, title, fileType },
    });
  };

  const handleBreadcrumbPress = (index: number) => {
    // index 0 = client level, 1 = project level, 2 = folder level
    if (nav.level === 'clients') return;

    if (index === 0) {
      // Tapped client breadcrumb → show projects for that client
      setNav({
        level: 'projects',
        clientId: nav.clientId,
        clientName: nav.clientName,
      });
    } else if (index === 1 && (nav.level === 'folders' || nav.level === 'documents')) {
      // Tapped project breadcrumb → show folders for that project
      setNav({
        level: 'folders',
        clientId: nav.clientId,
        clientName: nav.clientName,
        projectId: nav.projectId,
        projectName: nav.projectName,
      });
    }
    // index === 2 at documents level = tapped current folder, no-op
  };

  const handleBack = () => {
    switch (nav.level) {
      case 'clients':
        break;
      case 'projects':
        setNav({ level: 'clients' });
        break;
      case 'folders':
        setNav({
          level: 'projects',
          clientId: nav.clientId,
          clientName: nav.clientName,
        });
        break;
      case 'documents':
        setNav({
          level: 'folders',
          clientId: nav.clientId,
          clientName: nav.clientName,
          projectId: nav.projectId,
          projectName: nav.projectName,
        });
        break;
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <View className="flex-1 bg-m-bg">
      <MobileHeader />

      {nav.level !== 'clients' && (
        <View className="bg-m-bg-brand pb-2 px-4">
          <TouchableOpacity onPress={handleBack} className="flex-row items-center">
            <ChevronLeft size={16} color={colors.textOnBrand} />
            <Text className="text-sm text-m-text-on-brand ml-1">Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {nav.level === 'clients' && (
        <>
          {/* Filter tabs */}
          <View className="flex-row border-b border-m-border">
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 items-center ${activeTab === tab ? 'border-b-2 border-m-accent' : ''}`}
              >
                <Text className={`text-sm font-medium ${activeTab === tab ? 'text-m-text-primary' : 'text-m-text-tertiary'}`}>
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Search */}
          <View className="px-4 py-2">
            <View className="bg-m-bg-subtle rounded-lg flex-row items-center px-3 py-2">
              <Search size={16} color={colors.textTertiary} />
              <TextInput
                placeholder="Search clients..."
                value={search}
                onChangeText={setSearch}
                className="flex-1 text-sm ml-2"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          </View>

          {/* Recent cards */}
          {recentClients.length > 0 && !search.trim() && (
            <View>
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide px-4 pt-2 pb-2">
                Recent
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
                className="pb-3"
              >
                {recentClients.map((client) => (
                  <View key={client._id} style={{ width: 180 }}>
                    <ClientListItem
                      client={client}
                      docCount={clientDocCounts?.[client._id] ?? 0}
                      compact
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={
            nav.level === 'clients' ? 'No clients' :
            nav.level === 'projects' ? 'No projects' :
            nav.level === 'folders' ? 'No folders' :
            'No documents'
          }
        />
      ) : (
        <FolderBrowser
          items={items}
          breadcrumbs={breadcrumbs}
          onFolderPress={handleFolderPress}
          onDocumentPress={handleDocumentPress}
          onBreadcrumbPress={handleBreadcrumbPress}
          onDocumentAction={handleDocumentAction}
        />
      )}
    </View>
  );
}
