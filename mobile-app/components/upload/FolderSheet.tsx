import {
  Modal, View, Text, TouchableOpacity, FlatList, ActivityIndicator,
  Platform,
} from 'react-native';
import { useMemo } from 'react';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { Folder, FolderOpen, X, Check } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import type { UploadScope } from './ScopeToggle';

// Bottom-sheet folder picker. Scope determines which folder sets to load:
//   client   → client-level + optional project-level folders
//   internal → internal folders
//   personal → personal folders
// Returns both the folderKey (folderType string) and a display name,
// plus the folder level for client-scope so the backend knows whether to
// file at client or project level.

interface Props {
  visible: boolean;
  scope: UploadScope;
  clientId?: string;
  projectId?: string;
  selectedFolderKey: string | null;
  onSelect: (
    folderKey: string | null,
    folderName: string | null,
    folderLevel: 'client' | 'project' | null,
  ) => void;
  onClose: () => void;
}

// Single row in the folder list — extracted for readability.
function FolderRow({
  name, isSelected, onPress,
}: {
  name: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  const Icon = isSelected ? FolderOpen : Folder;
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 py-3 border-b border-m-border-subtle"
      style={{ backgroundColor: isSelected ? colors.bgSubtle : 'transparent' }}
    >
      <Icon size={16} color={isSelected ? colors.accent : colors.textTertiary} />
      <Text className="flex-1 text-sm text-m-text-primary" numberOfLines={1}>
        {name}
      </Text>
      {isSelected && <Check size={16} color={colors.accent} />}
    </TouchableOpacity>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <View className="bg-m-bg-subtle px-4 py-1.5 border-b border-m-border">
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-m-text-secondary">
        {label}
      </Text>
    </View>
  );
}

export default function FolderSheet({
  visible, scope, clientId, projectId, selectedFolderKey, onSelect, onClose,
}: Props) {
  const { isAuthenticated } = useConvexAuth();

  const clientFolders = useQuery(
    api.clients.getClientFolders,
    isAuthenticated && scope === 'client' && clientId
      ? { clientId: clientId as any }
      : 'skip',
  );

  const projectFolders = useQuery(
    api.projects.getProjectFolders,
    isAuthenticated && scope === 'client' && projectId
      ? { projectId: projectId as any }
      : 'skip',
  );

  const internalFolders = useQuery(
    api.internalFolders.list,
    isAuthenticated && scope === 'internal' ? {} : 'skip',
  );

  const personalFolders = useQuery(
    api.personalFolders.list,
    isAuthenticated && scope === 'personal' ? {} : 'skip',
  );

  const isLoading =
    (scope === 'client' && clientId && clientFolders === undefined) ||
    (scope === 'client' && projectId && projectFolders === undefined) ||
    (scope === 'internal' && internalFolders === undefined) ||
    (scope === 'personal' && personalFolders === undefined);

  // Build sections for FlatList rendering.
  type Row =
    | { kind: 'section'; label: string }
    | {
        kind: 'folder';
        id: string;
        folderKey: string;
        name: string;
        level: 'client' | 'project' | null;
      }
    | { kind: 'none' };

  const rows: Row[] = useMemo(() => {
    const r: Row[] = [{ kind: 'none' }];

    if (scope === 'client') {
      if (clientFolders && clientFolders.length > 0) {
        r.push({ kind: 'section', label: 'Client Level' });
        for (const f of clientFolders as any[]) {
          r.push({
            kind: 'folder',
            id: f._id,
            folderKey: f.folderType,
            name: f.name,
            level: 'client',
          });
        }
      }
      if (projectFolders && projectFolders.length > 0) {
        r.push({ kind: 'section', label: 'Project Level' });
        for (const f of projectFolders as any[]) {
          r.push({
            kind: 'folder',
            id: f._id,
            folderKey: f.folderType,
            name: f.name,
            level: 'project',
          });
        }
      }
    } else if (scope === 'internal' && internalFolders) {
      if (internalFolders.length > 0) {
        r.push({ kind: 'section', label: 'Internal Folders' });
        for (const f of internalFolders as any[]) {
          r.push({
            kind: 'folder',
            id: f._id,
            folderKey: f.folderType,
            name: f.name,
            level: null,
          });
        }
      }
    } else if (scope === 'personal' && personalFolders) {
      if (personalFolders.length > 0) {
        r.push({ kind: 'section', label: 'Personal Folders' });
        for (const f of personalFolders as any[]) {
          r.push({
            kind: 'folder',
            id: f._id,
            folderKey: f.folderType,
            name: f.name,
            level: null,
          });
        }
      }
    }

    return r;
  }, [scope, clientFolders, projectFolders, internalFolders, personalFolders]);

  const handleSelect = (
    key: string | null,
    name: string | null,
    level: 'client' | 'project' | null,
  ) => {
    onSelect(key, name, level);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        onPress={onClose}
        activeOpacity={1}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }}
      />
      <View
        className="bg-m-bg rounded-t-[20px]"
        style={{ maxHeight: '80%', paddingBottom: Platform.OS === 'ios' ? 20 : 0 }}
      >
        {/* Grab handle */}
        <View className="items-center pt-2 pb-1">
          <View className="w-10 h-1 rounded-full bg-m-border" />
        </View>

        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-m-border">
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-m-text-primary">
              Select Folder
            </Text>
            <Text className="text-[11px] text-m-text-tertiary mt-0.5">
              Choose a destination folder for uploads
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} className="p-1" hitSlop={8}>
            <X size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* List */}
        {isLoading ? (
          <View className="py-8 items-center">
            <ActivityIndicator size="small" color={colors.textTertiary} />
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(row, idx) => {
              if (row.kind === 'section') return `section-${row.label}-${idx}`;
              if (row.kind === 'none') return 'none';
              return row.id;
            }}
            style={{ maxHeight: 500 }}
            contentContainerStyle={{ paddingBottom: 12 }}
            renderItem={({ item }) => {
              if (item.kind === 'section') return <SectionHeader label={item.label} />;
              if (item.kind === 'none') {
                return (
                  <FolderRow
                    name="No specific folder"
                    isSelected={selectedFolderKey === null}
                    onPress={() => handleSelect(null, null, null)}
                  />
                );
              }
              return (
                <FolderRow
                  name={item.name}
                  isSelected={selectedFolderKey === item.folderKey}
                  onPress={() => handleSelect(item.folderKey, item.name, item.level)}
                />
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}
