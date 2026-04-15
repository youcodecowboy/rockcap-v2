import { View, TouchableOpacity, Text } from 'react-native';
import { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../../model-testing-app/convex/_generated/api';
import FolderBrowser from '@/components/FolderBrowser';
import MobileHeader from '@/components/MobileHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { FileText, ChevronLeft } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import type { Id } from '../../../../model-testing-app/convex/_generated/dataModel';

type NavLevel =
  | { level: 'clients' }
  | { level: 'projects'; clientId: Id<'clients'>; clientName: string }
  | { level: 'folders'; clientId: Id<'clients'>; clientName: string; projectId: Id<'projects'>; projectName: string }
  | { level: 'documents'; clientId: Id<'clients'>; clientName: string; projectId: Id<'projects'>; projectName: string; folderType: string; folderName: string };

export default function DocsScreen() {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [nav, setNav] = useState<NavLevel>({ level: 'clients' });

  // Conditional queries based on current navigation level
  const clients = useQuery(
    api.clients.list,
    isAuthenticated ? {} : 'skip'
  );

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

  // Build items for current level
  const items = useMemo(() => {
    switch (nav.level) {
      case 'clients':
        return (clients || []).map((c) => ({
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
        const projectCounts = folderCounts?.projectFolders?.[nav.projectId] ?? {};
        return (folders || []).map((f) => ({
          id: f._id,
          name: f.name,
          type: 'folder' as const,
          documentCount: projectCounts[f._id] ?? 0,
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
        />
      )}
    </View>
  );
}
