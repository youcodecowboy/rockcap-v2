import {
  View, Text, TextInput, TouchableOpacity, Modal, FlatList, Alert, ActivityIndicator,
} from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import * as ExpoDocumentPicker from 'expo-document-picker';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../model-testing-app/convex/_generated/api';
import {
  X, Search, FileText, Check, Upload, Building, FolderOpen, UserCircle,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';

export interface AttachedDoc {
  id: string;
  name: string;
  fileType?: string;
}

type Scope = 'personal' | 'client' | 'project';

interface DocumentPickerProps {
  visible: boolean;
  onClose: () => void;
  selectedIds: string[];
  onChange: (attached: AttachedDoc[]) => void;
  // Optional: if task has a client/project, pre-filter/suggest docs from there
  contextClientId?: string;
  contextProjectId?: string;
}

type Mode = 'browse' | 'upload-scope' | 'uploading';

export default function DocumentPicker({
  visible, onClose, selectedIds, onChange, contextClientId, contextProjectId,
}: DocumentPickerProps) {
  const { isAuthenticated } = useConvexAuth();
  const [mode, setMode] = useState<Mode>('browse');
  const [search, setSearch] = useState('');
  const [filterScope, setFilterScope] = useState<'all' | 'client' | 'project' | 'personal'>('all');

  // Upload state
  const [uploadFile, setUploadFile] = useState<ExpoDocumentPicker.DocumentPickerAsset | null>(null);
  const [uploadScope, setUploadScope] = useState<Scope>(contextClientId || contextProjectId ? (contextProjectId ? 'project' : 'client') : 'personal');
  const [uploadClientId, setUploadClientId] = useState<string | null>(contextClientId || null);
  const [uploadProjectId, setUploadProjectId] = useState<string | null>(contextProjectId || null);

  // Queries
  const recentDocs = useQuery(api.documents.getRecent, isAuthenticated ? { limit: 100 } : 'skip');
  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');
  const projects = useQuery(api.projects.list, isAuthenticated ? {} : 'skip');

  // Mutations
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const createDocument = useMutation(api.documents.create);

  const clientMap = useMemo(() => {
    const map: Record<string, string> = {};
    (clients || []).forEach((c: any) => { map[c._id] = c.name; });
    return map;
  }, [clients]);

  const filteredDocs = useMemo(() => {
    if (!recentDocs) return [];
    let docs = recentDocs as any[];
    if (filterScope !== 'all') {
      if (filterScope === 'personal') {
        docs = docs.filter((d) => !d.clientId && !d.projectId);
      } else if (filterScope === 'client') {
        docs = docs.filter((d) => d.clientId && !d.projectId);
      } else if (filterScope === 'project') {
        docs = docs.filter((d) => d.projectId);
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      docs = docs.filter((d) => (d.fileName || '').toLowerCase().includes(q));
    }
    return docs;
  }, [recentDocs, filterScope, search]);

  const toggleDoc = useCallback((doc: any) => {
    const id = doc._id;
    const isSelected = selectedIds.includes(id);
    // Build full attached list by reading selectedIds against the known docs
    const known = new Map<string, AttachedDoc>();
    (recentDocs as any[] || []).forEach((d) => {
      known.set(d._id, { id: d._id, name: d.fileName || 'Document', fileType: d.fileType });
    });

    if (isSelected) {
      onChange(
        selectedIds
          .filter((sid) => sid !== id)
          .map((sid) => known.get(sid))
          .filter((d): d is AttachedDoc => Boolean(d))
      );
    } else {
      const current = selectedIds
        .map((sid) => known.get(sid))
        .filter((d): d is AttachedDoc => Boolean(d));
      onChange([...current, { id: doc._id, name: doc.fileName || 'Document', fileType: doc.fileType }]);
    }
  }, [selectedIds, onChange, recentDocs]);

  const pickFile = useCallback(async () => {
    try {
      const res = await ExpoDocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      setUploadFile(res.assets[0]);
      setMode('upload-scope');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to pick file');
    }
  }, []);

  const uploadAndAttach = useCallback(async () => {
    if (!uploadFile) return;
    setMode('uploading');
    try {
      // Step 1: get upload URL
      const uploadUrl = await generateUploadUrl();

      // Step 2: upload file bytes
      const fileUri = uploadFile.uri;
      const fileBlob = await fetch(fileUri).then((r) => r.blob());
      const contentType = uploadFile.mimeType || 'application/octet-stream';

      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: fileBlob,
      });
      if (!uploadRes.ok) throw new Error('Upload failed');
      const { storageId } = await uploadRes.json();

      // Step 3: create document record
      const fileName = uploadFile.name || 'Untitled';
      const ext = (fileName.split('.').pop() || 'file').toLowerCase();
      const args: any = {
        fileStorageId: storageId,
        fileName,
        fileSize: uploadFile.size || 0,
        fileType: ext,
        summary: '', // empty — user didn't classify
        fileTypeDetected: ext,
        category: uploadScope === 'personal' ? 'Personal' : 'Attachment',
        scope: uploadScope,
      };
      if (uploadScope === 'client' && uploadClientId) {
        args.clientId = uploadClientId;
        args.clientName = clientMap[uploadClientId];
      } else if (uploadScope === 'project' && uploadProjectId) {
        args.projectId = uploadProjectId;
        const project = (projects as any[] || []).find((p) => p._id === uploadProjectId);
        if (project) {
          args.clientId = project.clientId;
          args.clientName = clientMap[project.clientId];
        }
      }

      const docId = await createDocument(args);

      // Attach to task
      const current = selectedIds.map((sid) => {
        const d = (recentDocs as any[] || []).find((doc) => doc._id === sid);
        return d ? { id: sid, name: d.fileName || 'Document', fileType: d.fileType } : null;
      }).filter((d): d is AttachedDoc => Boolean(d));
      onChange([...current, { id: docId, name: fileName, fileType: ext }]);

      // Reset + close
      setUploadFile(null);
      setMode('browse');
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Upload failed');
      setMode('upload-scope');
    }
  }, [uploadFile, uploadScope, uploadClientId, uploadProjectId, generateUploadUrl, createDocument, clientMap, projects, selectedIds, recentDocs, onChange, onClose]);

  const filteredProjects = useMemo(
    () => (projects || []).filter((p: any) => !uploadClientId || p.clientId === uploadClientId),
    [projects, uploadClientId]
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-m-border bg-m-bg-card">
          <TouchableOpacity
            onPress={() => { if (mode === 'upload-scope') setMode('browse'); else onClose(); }}
            hitSlop={8}
          >
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text className="text-base font-semibold text-m-text-primary">
            {mode === 'upload-scope' ? 'File Document' : mode === 'uploading' ? 'Uploading...' : 'Attach Documents'}
          </Text>
          {mode === 'browse' ? (
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Text className="text-sm font-semibold text-m-text-primary">Done</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 20 }} />
          )}
        </View>

        {mode === 'browse' && (
          <>
            {/* Upload CTA */}
            <View className="px-4 py-3 border-b border-m-border">
              <TouchableOpacity
                onPress={pickFile}
                className="flex-row items-center gap-2 bg-m-bg-brand rounded-lg px-3 py-2.5 justify-center"
              >
                <Upload size={14} color={colors.textOnBrand} />
                <Text className="text-sm font-semibold text-m-text-on-brand">Upload New File</Text>
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View className="px-4 py-2 border-b border-m-border">
              <View className="bg-m-bg-subtle rounded-lg flex-row items-center px-3 py-2">
                <Search size={14} color={colors.textTertiary} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search document library..."
                  className="flex-1 ml-2 text-sm text-m-text-primary"
                  placeholderTextColor={colors.textPlaceholder}
                />
              </View>
            </View>

            {/* Scope filter pills */}
            <View className="px-4 py-2 flex-row gap-1.5 border-b border-m-border">
              {(['all', 'personal', 'client', 'project'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setFilterScope(s)}
                  className={`px-3 py-1.5 rounded-full border ${
                    filterScope === s ? 'bg-m-bg-brand border-m-bg-brand' : 'border-m-border bg-m-bg-card'
                  }`}
                >
                  <Text className={`text-xs font-medium capitalize ${
                    filterScope === s ? 'text-m-text-on-brand' : 'text-m-text-tertiary'
                  }`}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Selected summary */}
            {selectedIds.length > 0 && (
              <View className="px-4 py-2 bg-m-bg-subtle border-b border-m-border">
                <Text className="text-xs text-m-text-tertiary">
                  {selectedIds.length} document{selectedIds.length === 1 ? '' : 's'} attached
                </Text>
              </View>
            )}

            {/* Document list */}
            <FlatList
              data={filteredDocs}
              keyExtractor={(item: any) => item._id}
              renderItem={({ item }: { item: any }) => {
                const isSelected = selectedIds.includes(item._id);
                const badge = item.projectId ? 'Project' : item.clientId ? 'Client' : 'Personal';
                return (
                  <TouchableOpacity
                    onPress={() => toggleDoc(item)}
                    className="flex-row items-center gap-3 px-4 py-3 border-b border-m-border-subtle"
                  >
                    <FileText size={16} color={colors.textTertiary} />
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-m-text-primary" numberOfLines={1}>
                        {item.fileName || 'Document'}
                      </Text>
                      <View className="flex-row items-center gap-1.5 mt-0.5">
                        <View className="bg-m-bg-subtle rounded-full px-1.5 py-0.5">
                          <Text className="text-[10px] text-m-text-tertiary uppercase">{(item.fileType || 'file').slice(0, 4)}</Text>
                        </View>
                        <Text className="text-[10px] text-m-text-tertiary">{badge}</Text>
                        {item.clientName && (
                          <Text className="text-[10px] text-m-text-tertiary" numberOfLines={1}>
                            · {item.clientName}
                          </Text>
                        )}
                      </View>
                    </View>
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
                <View className="py-10 items-center">
                  <FileText size={28} color={colors.textTertiary} />
                  <Text className="text-sm text-m-text-tertiary mt-2">No documents</Text>
                </View>
              }
            />
          </>
        )}

        {mode === 'upload-scope' && uploadFile && (
          <View style={{ flex: 1 }}>
            <View className="px-4 py-4 border-b border-m-border">
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-1.5">File</Text>
              <View className="flex-row items-center gap-3 bg-m-bg-card border border-m-border rounded-xl p-3">
                <FileText size={18} color={colors.textSecondary} />
                <View className="flex-1">
                  <Text className="text-sm font-medium text-m-text-primary" numberOfLines={1}>
                    {uploadFile.name}
                  </Text>
                  <Text className="text-xs text-m-text-tertiary">
                    {uploadFile.size ? `${(uploadFile.size / 1024).toFixed(0)} KB` : 'Unknown size'}
                  </Text>
                </View>
              </View>
            </View>

            <View className="px-4 py-4">
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">Where should this be filed?</Text>

              {(['personal', 'client', 'project'] as const).map((s) => {
                const active = uploadScope === s;
                const icon = s === 'personal' ? UserCircle : s === 'client' ? Building : FolderOpen;
                const Icon = icon;
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => {
                      setUploadScope(s);
                      if (s === 'personal') { setUploadClientId(null); setUploadProjectId(null); }
                    }}
                    className={`flex-row items-center gap-3 px-3 py-3 rounded-xl mb-2 border ${
                      active ? 'border-m-accent bg-m-bg-subtle' : 'border-m-border bg-m-bg-card'
                    }`}
                  >
                    <Icon size={16} color={active ? colors.textPrimary : colors.textTertiary} />
                    <View className="flex-1">
                      <Text className={`text-sm font-medium capitalize ${active ? 'text-m-text-primary' : 'text-m-text-secondary'}`}>
                        {s === 'personal' ? 'Personal (just for me)' : s === 'client' ? 'Client library' : 'Project library'}
                      </Text>
                    </View>
                    <View
                      className={`w-4 h-4 rounded-full border ${
                        active ? 'border-m-accent bg-m-accent' : 'border-m-border'
                      }`}
                    />
                  </TouchableOpacity>
                );
              })}

              {/* Client picker */}
              {(uploadScope === 'client' || uploadScope === 'project') && (
                <View className="mt-3">
                  <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-1.5">Client</Text>
                  <ScopePickerInline
                    options={[{ id: '', name: 'Select client...' }, ...((clients || []) as any[]).map((c: any) => ({ id: c._id, name: c.name }))]}
                    selectedId={uploadClientId || ''}
                    onSelect={(id) => { setUploadClientId(id || null); setUploadProjectId(null); }}
                  />
                </View>
              )}

              {/* Project picker */}
              {uploadScope === 'project' && uploadClientId && (
                <View className="mt-3">
                  <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-1.5">Project</Text>
                  <ScopePickerInline
                    options={[{ id: '', name: 'Select project...' }, ...filteredProjects.map((p: any) => ({ id: p._id, name: p.name }))]}
                    selectedId={uploadProjectId || ''}
                    onSelect={(id) => setUploadProjectId(id || null)}
                  />
                </View>
              )}
            </View>

            <View style={{ flex: 1 }} />

            {/* Bottom action */}
            <View className="px-4 py-3 border-t border-m-border bg-m-bg-card">
              <TouchableOpacity
                onPress={uploadAndAttach}
                disabled={uploadScope === 'client' && !uploadClientId}
                className="bg-m-bg-brand rounded-lg py-3 items-center"
                style={{ opacity: (uploadScope === 'client' && !uploadClientId) || (uploadScope === 'project' && !uploadProjectId) ? 0.4 : 1 }}
              >
                <Text className="text-sm font-semibold text-m-text-on-brand">
                  Upload & Attach
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {mode === 'uploading' && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={colors.textPrimary} />
            <Text className="text-sm text-m-text-tertiary mt-3">Uploading {uploadFile?.name}...</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── Inline picker (reusable) ─────────────────────────────────

function ScopePickerInline({ options, selectedId, onSelect }: {
  options: { id: string; name: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === selectedId);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        className="bg-m-bg-card border border-m-border rounded-xl px-3 py-3"
      >
        <Text className={`text-sm ${selectedId ? 'text-m-text-primary' : 'text-m-text-tertiary'}`}>
          {selected?.name || 'Select...'}
        </Text>
      </TouchableOpacity>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-m-border bg-m-bg-card">
            <TouchableOpacity onPress={() => setOpen(false)}><X size={20} color={colors.textSecondary} /></TouchableOpacity>
            <Text className="text-base font-semibold text-m-text-primary">Select</Text>
            <View style={{ width: 20 }} />
          </View>
          <FlatList
            data={options}
            keyExtractor={(item) => item.id || 'none'}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => { onSelect(item.id); setOpen(false); }}
                className="px-4 py-3 border-b border-m-border-subtle"
              >
                <Text className={`text-sm ${item.id === selectedId ? 'font-semibold text-m-text-primary' : 'text-m-text-secondary'}`}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </>
  );
}
