import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Alert,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useConvexAuth } from 'convex/react';
import { useUser } from '@clerk/clerk-expo';
import { api } from '../../../model-testing-app/convex/_generated/api';
import * as ExpoDocumentPicker from 'expo-document-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { resolveApiBase } from '@/lib/apiBase';
import {
  ArrowLeft, Upload, ChevronRight, ChevronDown, ChevronUp, Check, X,
  FileText, Table2, Image as ImageIcon, Mail, File as FileIcon, Plus,
  FolderOpen, Camera, Clock, Eye, CheckCircle2,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';
import MobileHeader from '@/components/MobileHeader';
import MiniTabBar from '@/components/MiniTabBar';
import ScopeToggle, { type UploadScope } from '@/components/upload/ScopeToggle';
import PickerSheet, { type PickerItem } from '@/components/upload/PickerSheet';
import FolderSheet from '@/components/upload/FolderSheet';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Gateway that runs the V4 AI pipeline server-side per uploaded item.
// The Next.js server keeps the Anthropic key; mobile just fires-and-forgets
// these requests so the batch screen can show reactive progress.
// URL resolution lives in `@/lib/apiBase` — see it for rules (simulator
// vs physical device, prod env override).
const PROCESS_API_URL = `${resolveApiBase()}/api/mobile/bulk-upload/process`;

// Match the mobile web allow-list exactly so what works in browser works here.
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'text/csv',
  'text/plain',
  'text/markdown',
  'message/rfc822',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
];

// Match the web's MAX_FILES — keeps the first batch size manageable for
// mobile networks while still letting power users batch-file.
const MAX_FILES = 5;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getUserInitials(name: string | undefined): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function FileTypeIcon({ fileName }: { fileName: string }) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return <FileText size={18} color="#ef4444" />;
  if (['xlsx', 'xls', 'xlsm', 'csv'].includes(ext))
    return <Table2 size={18} color="#16a34a" />;
  if (['docx', 'doc'].includes(ext))
    return <FileText size={18} color="#2563eb" />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'].includes(ext))
    return <ImageIcon size={18} color="#a855f7" />;
  if (ext === 'eml') return <Mail size={18} color="#d97706" />;
  return <FileIcon size={18} color={colors.textTertiary} />;
}

// ---------------------------------------------------------------------------
// Recent Batches carousel
// ---------------------------------------------------------------------------

function RecentBatches({ userId }: { userId: string }) {
  const router = useRouter();
  const recent = useQuery(api.bulkUpload.getRecentBatches, {
    userId: userId as any,
    limit: 5,
  });

  if (!recent || recent.length === 0) return null;

  return (
    <View className="mb-4">
      <Text className="text-[10px] font-semibold text-m-text-secondary uppercase tracking-wide mb-2">
        Recent Uploads
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {recent.map((batch: any) => {
          const scopeLabel =
            batch.scope === 'internal'
              ? 'Internal'
              : batch.scope === 'personal'
              ? 'Personal'
              : batch.clientName || 'Client';
          const created = new Date(batch._creationTime);
          const dateStr = created.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
          });
          return (
            <TouchableOpacity
              key={batch._id}
              onPress={() => router.push(`/upload/${batch._id}` as any)}
              style={{ width: 160 }}
              className="bg-m-bg-subtle border border-m-border rounded-[10px] p-2.5"
            >
              <RecentStatusBadge status={batch.status} />
              <Text
                className="text-[13px] font-medium text-m-text-primary mt-1.5"
                numberOfLines={1}
              >
                {scopeLabel}
              </Text>
              <View className="flex-row items-center justify-between mt-0.5">
                <Text className="text-[11px] text-m-text-tertiary">
                  {batch.totalFiles} {batch.totalFiles === 1 ? 'file' : 'files'}
                </Text>
                <Text className="text-[11px] text-m-text-tertiary">{dateStr}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function RecentStatusBadge({ status }: { status: string }) {
  if (status === 'processing' || status === 'uploading') {
    return (
      <View
        className="flex-row items-center self-start gap-1 rounded-[6px] px-1.5 py-0.5"
        style={{ backgroundColor: '#fef3c7' }}
      >
        <Clock size={10} color="#b45309" />
        <Text className="text-[10px] font-medium" style={{ color: '#b45309' }}>
          Processing
        </Text>
      </View>
    );
  }
  if (status === 'review') {
    return (
      <View
        className="flex-row items-center self-start gap-1 rounded-[6px] px-1.5 py-0.5"
        style={{ backgroundColor: '#dbeafe' }}
      >
        <Eye size={10} color="#1d4ed8" />
        <Text className="text-[10px] font-medium" style={{ color: '#1d4ed8' }}>
          Review
        </Text>
      </View>
    );
  }
  return (
    <View
      className="flex-row items-center self-start gap-1 rounded-[6px] px-1.5 py-0.5"
      style={{ backgroundColor: '#dcfce7' }}
    >
      <CheckCircle2 size={10} color="#15803d" />
      <Text className="text-[10px] font-medium" style={{ color: '#15803d' }}>
        Completed
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function UploadScreen() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { user } = useUser();

  // --- Deep-link params ---
  // When launched from client/project detail, we pre-fill scope, client,
  // project, and optionally folder. This matches the mobile-web m-upload
  // page's `initialContext` behavior.
  const params = useLocalSearchParams<{
    clientId?: string;
    clientName?: string;
    projectId?: string;
    projectName?: string;
    folderType?: string;
    folderName?: string;
    folderLevel?: 'client' | 'project';
  }>();

  // --- Form state ---
  const [scope, setScope] = useState<UploadScope>('client');
  const [clientId, setClientId] = useState<string | undefined>(params.clientId);
  const [clientName, setClientName] = useState<string | undefined>(params.clientName);
  const [projectId, setProjectId] = useState<string | undefined>(params.projectId);
  const [projectName, setProjectName] = useState<string | undefined>(params.projectName);
  const [folderKey, setFolderKey] = useState<string | null>(params.folderType || null);
  const [folderName, setFolderName] = useState<string | null>(params.folderName || null);
  const [folderLevel, setFolderLevel] = useState<'client' | 'project' | null>(
    params.folderLevel || null,
  );
  const [instructions, setInstructions] = useState('');
  const [instructionsExpanded, setInstructionsExpanded] = useState(false);
  const [deepExtraction, setDeepExtraction] = useState(false);
  const [files, setFiles] = useState<ExpoDocumentPicker.DocumentPickerAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  // --- Sheet visibility ---
  const [showClientSheet, setShowClientSheet] = useState(false);
  const [showProjectSheet, setShowProjectSheet] = useState(false);
  const [showFolderSheet, setShowFolderSheet] = useState(false);

  // --- Camera state (secondary flow) ---
  const [cameraMode, setCameraMode] = useState<'off' | 'capture' | 'preview'>('off');
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // --- Queries ---
  const currentUser = useQuery(api.users.getCurrent, isAuthenticated ? {} : 'skip');
  const clients = useQuery(
    api.clients.list,
    isAuthenticated && scope === 'client' ? {} : 'skip',
  );
  const projects = useQuery(
    api.projects.getByClient,
    isAuthenticated && scope === 'client' && clientId
      ? { clientId: clientId as any }
      : 'skip',
  );

  // --- Mutations ---
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const createBatch = useMutation(api.bulkUpload.createBatch);
  const addItemToBatch = useMutation(api.bulkUpload.addItemToBatch);
  const updateItemStatus = useMutation(api.bulkUpload.updateItemStatus);
  // `addItemToBatch` already accepts fileStorageId, so we upload the bytes
  // first and then create the batch item atomically with the storage reference
  // attached. No intermediate "item without a file" state.

  // Picker items
  const clientItems: PickerItem[] = useMemo(
    () =>
      (clients || []).map((c: any) => ({
        id: c._id,
        label: c.name,
        sublabel: c.type || undefined,
      })),
    [clients],
  );

  const projectItems: PickerItem[] = useMemo(() => {
    const items: PickerItem[] = [
      { id: '__none__', label: 'Client-level (no project)', italic: true },
    ];
    for (const p of (projects as any[]) || []) {
      items.push({
        id: p._id,
        label: p.name,
        sublabel: p.projectShortcode || undefined,
      });
    }
    return items;
  }, [projects]);

  // --- Handlers ---

  const handleScopeChange = useCallback((next: UploadScope) => {
    setScope(next);
    if (next !== 'client') {
      setClientId(undefined);
      setClientName(undefined);
      setProjectId(undefined);
      setProjectName(undefined);
    }
    // Folder depends on scope — reset.
    setFolderKey(null);
    setFolderName(null);
    setFolderLevel(null);
  }, []);

  const handleClientSelect = useCallback((id: string, name: string) => {
    setClientId(id);
    setClientName(name);
    setProjectId(undefined);
    setProjectName(undefined);
    setFolderKey(null);
    setFolderName(null);
    setFolderLevel(null);
    setShowClientSheet(false);
  }, []);

  const handleProjectSelect = useCallback((id: string, name: string) => {
    if (id === '__none__') {
      setProjectId(undefined);
      setProjectName(undefined);
    } else {
      setProjectId(id);
      setProjectName(name);
    }
    setFolderKey(null);
    setFolderName(null);
    setFolderLevel(null);
    setShowProjectSheet(false);
  }, []);

  const pickFiles = useCallback(async () => {
    try {
      const result = await ExpoDocumentPicker.getDocumentAsync({
        type: ACCEPTED_MIME_TYPES,
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const assets = result.assets ?? [];
      setFiles((prev) => {
        const combined = [...prev, ...assets];
        if (combined.length > MAX_FILES) {
          Alert.alert(
            'Limit reached',
            `Up to ${MAX_FILES} files per batch. Only the first ${MAX_FILES} will be kept.`,
          );
          return combined.slice(0, MAX_FILES);
        }
        return combined;
      });
    } catch (e: any) {
      Alert.alert('File picker error', e.message || 'Could not open file picker');
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ---------------- Camera (secondary path) ----------------

  const openCamera = useCallback(async () => {
    if (!cameraPermission?.granted) {
      const p = await requestCameraPermission();
      if (!p.granted) {
        Alert.alert('Camera access', 'Camera permission is required to capture photos.');
        return;
      }
    }
    setCameraMode('capture');
  }, [cameraPermission, requestCameraPermission]);

  const capturePhoto = useCallback(async () => {
    if (!cameraRef) return;
    const photo = await cameraRef.takePictureAsync({ quality: 0.85 });
    if (photo) {
      setCapturedPhoto(photo.uri);
      setCameraMode('preview');
    }
  }, [cameraRef]);

  const attachCapturedPhoto = useCallback(() => {
    if (!capturedPhoto) return;
    // Synthesize an asset-shaped entry so the same submit pipeline handles it.
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `Site-Photo-${timestamp}.jpg`;
    setFiles((prev) => {
      const next = [
        ...prev,
        {
          uri: capturedPhoto,
          name: fileName,
          mimeType: 'image/jpeg',
          size: 0, // unknown until upload — Convex still accepts
        } as ExpoDocumentPicker.DocumentPickerAsset,
      ];
      if (next.length > MAX_FILES) {
        Alert.alert('Limit reached', `Up to ${MAX_FILES} files per batch.`);
        return next.slice(0, MAX_FILES);
      }
      return next;
    });
    setCapturedPhoto(null);
    setCameraMode('off');
  }, [capturedPhoto]);

  // ---------------- Submit ----------------

  const canSubmit = useMemo(() => {
    if (files.length === 0) return false;
    if (submitting) return false;
    if (scope === 'client' && !clientId) return false;
    return true;
  }, [files.length, submitting, scope, clientId]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !currentUser) return;
    setSubmitting(true);
    setSubmitError(null);
    setUploadProgress({ current: 0, total: files.length });

    try {
      // Try to include rough geolocation for site photos; non-blocking.
      let coords: { latitude: number; longitude: number } | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          coords = loc.coords;
        }
      } catch {}

      const uploaderInitials = getUserInitials(
        user?.fullName || user?.firstName || currentUser?.name || 'User',
      );

      const projectShortcode =
        projectId && projects
          ? (projects as any[]).find((p) => p._id === projectId)?.projectShortcode
          : undefined;

      // 1. Create batch record
      const batchId = await createBatch({
        scope,
        clientId: clientId ? (clientId as any) : undefined,
        clientName,
        projectId: projectId ? (projectId as any) : undefined,
        projectName,
        projectShortcode: projectShortcode || undefined,
        internalFolderId:
          scope === 'internal' && folderKey ? folderKey : undefined,
        internalFolderName:
          scope === 'internal' && folderName ? folderName : undefined,
        personalFolderId:
          scope === 'personal' && folderKey ? folderKey : undefined,
        personalFolderName:
          scope === 'personal' && folderName ? folderName : undefined,
        isInternal: scope === 'internal',
        instructions: instructions || undefined,
        uploaderInitials,
        userId: currentUser._id,
        totalFiles: files.length,
        processingMode: 'foreground',
      });

      // 2. Per file: upload bytes first, then create the batch item with the
      // resulting storageId attached. Items that fail to upload are still
      // created so they show up in the batch review with status='error'.
      // coords is captured above but there's no schema field for it on
      // bulkUploadItems — keep it for future use once we add a metadata field.
      void coords;

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setUploadProgress({ current: i, total: files.length });

        let storageId: string | undefined;
        let uploadError: string | undefined;

        try {
          const uploadUrl = await generateUploadUrl();
          const blob = await fetch(f.uri).then((r) => r.blob());
          const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'Content-Type': f.mimeType || 'application/octet-stream',
            },
            body: blob,
          });
          if (!uploadRes.ok) {
            throw new Error(`Upload failed (HTTP ${uploadRes.status})`);
          }
          const payload = await uploadRes.json();
          storageId = payload.storageId;
        } catch (uploadErr: any) {
          console.error(`Upload error for ${f.name}:`, uploadErr);
          uploadError = uploadErr.message || 'Upload failed';
        }

        // Always create the item — even on upload failure — so the batch has
        // a complete view of what was attempted. AI pipeline skips items
        // without a fileStorageId.
        const itemId = await addItemToBatch({
          batchId,
          fileName: f.name || `file-${i + 1}`,
          fileSize: f.size || 0,
          fileType: f.mimeType || 'application/octet-stream',
          fileStorageId: storageId ? (storageId as any) : undefined,
          folderHint: folderKey || undefined,
        });

        if (uploadError) {
          await updateItemStatus({
            itemId: itemId as any,
            status: 'error',
            error: uploadError,
          });
        } else if (storageId) {
          // Fire-and-forget the V4 analysis trigger. The server-side gateway
          // owns all the state transitions (processing → ready_for_review);
          // we just kick it off and let Convex's reactive subscription on
          // the batch screen show live progress.
          //
          // NOTE: on native RN, in-flight fetches continue across screen
          // transitions as long as the JS runtime is alive. The batch screen
          // subscription picks up status updates as they land.
          //
          // If the trigger fails (server unreachable, wrong URL, etc.) we
          // update the item to `error` so the batch UI stops showing 0%
          // forever. Previously this was a silent console.warn — users just
          // saw items stuck "pending" with no explanation.
          fetch(PROCESS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId }),
          })
            .then(async (res) => {
              if (!res.ok) {
                const body = await res.text().catch(() => '');
                throw new Error(
                  `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`,
                );
              }
            })
            .catch(async (e: any) => {
              console.warn(
                `[upload] trigger failed for ${f.name} at ${PROCESS_API_URL}:`,
                e,
              );
              try {
                await updateItemStatus({
                  itemId: itemId as any,
                  status: 'error',
                  error: `Failed to trigger processing: ${e?.message || 'network error'} (${PROCESS_API_URL})`,
                });
              } catch {}
            });
        }
      }

      setUploadProgress({ current: files.length, total: files.length });

      // 3. Navigate to the batch page so the user can watch processing.
      router.replace(`/upload/${batchId}` as any);
    } catch (err: any) {
      console.error('Submit error:', err);
      setSubmitError(err.message || 'Failed to create upload batch');
      setSubmitting(false);
      setUploadProgress(null);
    }
  }, [
    canSubmit, currentUser, user, files, scope, clientId, clientName, projectId,
    projectName, projects, folderKey, folderName, instructions,
    createBatch, addItemToBatch, generateUploadUrl, updateItemStatus, router,
  ]);

  // Render camera mode full-screen overlays before the main layout.
  if (cameraMode === 'capture') {
    return (
      <View className="flex-1 bg-black">
        <CameraView
          ref={(ref) => setCameraRef(ref)}
          style={{ flex: 1 }}
          facing="back"
        >
          <View className="flex-1 justify-end pb-12">
            <View className="flex-row items-center justify-center gap-8">
              <TouchableOpacity
                onPress={() => setCameraMode('off')}
                className="w-12 h-12 rounded-full bg-white/20 items-center justify-center"
              >
                <X size={22} color="white" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={capturePhoto}
                className="w-20 h-20 rounded-full border-[3px] border-white items-center justify-center"
              >
                <View className="w-16 h-16 rounded-full bg-white" />
              </TouchableOpacity>
              <View style={{ width: 48 }} />
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  if (cameraMode === 'preview' && capturedPhoto) {
    return (
      <View className="flex-1 bg-black">
        <Image source={{ uri: capturedPhoto }} style={{ flex: 1 }} resizeMode="contain" />
        <View
          className="absolute bottom-0 left-0 right-0 pt-4 pb-12 px-6 flex-row gap-3"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        >
          <TouchableOpacity
            onPress={() => {
              setCapturedPhoto(null);
              setCameraMode('capture');
            }}
            className="flex-1 bg-white/20 rounded-xl py-3 items-center"
          >
            <Text className="text-white font-medium">Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={attachCapturedPhoto}
            className="flex-1 bg-white rounded-xl py-3 items-center"
          >
            <Text className="text-m-text-primary font-medium">Add to Batch</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---------------- Main setup form ----------------

  return (
    <View className="flex-1 bg-m-bg">
      <MobileHeader />

      {/* Sub-header */}
      <View className="bg-m-bg-card border-b border-m-border px-4 py-3 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <ArrowLeft size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text className="text-[15px] font-medium text-m-text-primary">Upload</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        >
          {/* Recent batches */}
          {currentUser?._id && <RecentBatches userId={currentUser._id} />}

          {/* Scope */}
          <View className="mb-4">
            <Text className="text-[10px] font-semibold text-m-text-secondary uppercase tracking-wide mb-2">
              Upload Scope
            </Text>
            <ScopeToggle value={scope} onChange={handleScopeChange} />
          </View>

          {/* Client (client scope only) */}
          {scope === 'client' && (
            <FieldRow
              label="Client *"
              value={clientName}
              placeholder="Select client..."
              onPress={() => setShowClientSheet(true)}
            />
          )}

          {/* Project (client scope + client selected) */}
          {scope === 'client' && clientId && (
            <FieldRow
              label="Project"
              value={projectName}
              placeholder="Client-level (no project)"
              onPress={() => setShowProjectSheet(true)}
            />
          )}

          {/* Folder */}
          <FieldRow
            label="Folder"
            value={folderName}
            placeholder="No specific folder"
            leadingIcon={<FolderOpen size={14} color={colors.textTertiary} />}
            onPress={() => setShowFolderSheet(true)}
            disabled={scope === 'client' && !clientId}
          />

          {/* Instructions — collapsible */}
          <View className="mb-4">
            <TouchableOpacity
              onPress={() => setInstructionsExpanded(!instructionsExpanded)}
              className="flex-row items-center gap-1.5 mb-2"
            >
              <Text className="text-[10px] font-semibold text-m-text-secondary uppercase tracking-wide">
                Instructions
              </Text>
              {instructionsExpanded ? (
                <ChevronUp size={12} color={colors.textTertiary} />
              ) : (
                <ChevronDown size={12} color={colors.textTertiary} />
              )}
              {instructions && !instructionsExpanded && (
                <Check size={12} color={colors.success} style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>
            {instructionsExpanded && (
              <TextInput
                value={instructions}
                onChangeText={setInstructions}
                placeholder="Optional instructions for the AI classifier..."
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                className="text-sm text-m-text-primary bg-m-bg-subtle border border-m-border rounded-[10px] px-3 py-2.5"
                style={{ minHeight: 80 }}
              />
            )}
          </View>

          {/* Deep Extraction toggle */}
          <View className="flex-row items-start gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-[10px] font-semibold text-m-text-secondary uppercase tracking-wide">
                Deep Extraction
              </Text>
              <Text className="text-[11px] text-m-text-tertiary mt-0.5">
                Run a detailed second-pass analysis on spreadsheets
              </Text>
            </View>
            <Switch value={deepExtraction} onChange={setDeepExtraction} />
          </View>

          {/* Files */}
          <View className="mb-4">
            <Text className="text-[10px] font-semibold text-m-text-secondary uppercase tracking-wide mb-2">
              Files ({files.length}/{MAX_FILES})
            </Text>

            {files.length > 0 && (
              <View className="bg-m-bg-subtle border border-m-border rounded-[10px] mb-3">
                {files.map((f, idx) => (
                  <View
                    key={`${f.name}-${idx}`}
                    className="flex-row items-center gap-3 px-3 py-2.5"
                    style={{
                      borderTopWidth: idx > 0 ? 1 : 0,
                      borderTopColor: colors.borderSubtle,
                    }}
                  >
                    <FileTypeIcon fileName={f.name || ''} />
                    <View className="flex-1 min-w-0">
                      <Text
                        className="text-[13px] text-m-text-primary"
                        numberOfLines={1}
                      >
                        {f.name}
                      </Text>
                      <Text className="text-[11px] text-m-text-tertiary">
                        {f.size ? formatFileSize(f.size) : '—'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeFile(idx)}
                      hitSlop={8}
                      className="p-1"
                    >
                      <X size={14} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {files.length < MAX_FILES && (
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={pickFiles}
                  className="flex-1 flex-col items-center justify-center rounded-xl py-5"
                  style={{
                    backgroundColor: colors.bgSubtle,
                    borderWidth: 2,
                    borderColor: colors.accent,
                    borderStyle: 'dashed',
                  }}
                >
                  <View style={{ position: 'relative' }}>
                    <FileIcon size={28} color={colors.accent} />
                    <View
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -6,
                        backgroundColor: colors.bgSubtle,
                        borderRadius: 8,
                      }}
                    >
                      <Plus size={14} color={colors.accent} />
                    </View>
                  </View>
                  <Text className="text-[12px] font-medium text-m-text-primary mt-2">
                    Add Files
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={openCamera}
                  className="flex-col items-center justify-center rounded-xl py-5 px-5 bg-m-bg-card border border-m-border"
                >
                  <Camera size={28} color={colors.textSecondary} />
                  <Text className="text-[12px] font-medium text-m-text-primary mt-2">
                    Camera
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Submit footer */}
        <View
          className="border-t border-m-border bg-m-bg px-4 pt-3 pb-4"
          style={{ paddingBottom: Platform.OS === 'ios' ? 32 : 16 }}
        >
          {submitError && (
            <Text className="text-[12px] text-m-error mb-2">{submitError}</Text>
          )}
          {uploadProgress && submitting && (
            <Text className="text-[12px] text-m-text-tertiary mb-2">
              Uploading {uploadProgress.current + 1} of {uploadProgress.total}...
            </Text>
          )}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            className="flex-row items-center justify-center gap-2 rounded-xl py-3"
            style={{
              backgroundColor: canSubmit ? colors.bgBrand : colors.bgSubtle,
              opacity: canSubmit ? 1 : 0.6,
            }}
          >
            {submitting ? (
              <>
                <ActivityIndicator size="small" color={colors.textOnBrand} />
                <Text className="text-[15px] font-semibold" style={{ color: colors.textOnBrand }}>
                  Creating batch...
                </Text>
              </>
            ) : (
              <>
                <Upload size={16} color={canSubmit ? colors.textOnBrand : colors.textTertiary} />
                <Text
                  className="text-[15px] font-semibold"
                  style={{ color: canSubmit ? colors.textOnBrand : colors.textTertiary }}
                >
                  Upload &amp; Analyze
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <MiniTabBar />

      {/* Pickers */}
      <PickerSheet
        visible={showClientSheet}
        title="Select Client"
        items={clientItems}
        selectedId={clientId}
        onSelect={handleClientSelect}
        onClose={() => setShowClientSheet(false)}
        isLoading={clients === undefined}
        emptyMessage="No clients yet"
      />

      <PickerSheet
        visible={showProjectSheet}
        title="Select Project"
        items={projectItems}
        selectedId={projectId || '__none__'}
        onSelect={handleProjectSelect}
        onClose={() => setShowProjectSheet(false)}
        isLoading={projects === undefined && !!clientId}
      />

      <FolderSheet
        visible={showFolderSheet}
        scope={scope}
        clientId={clientId}
        projectId={projectId}
        selectedFolderKey={folderKey}
        onSelect={(key, name, level) => {
          setFolderKey(key);
          setFolderName(name);
          setFolderLevel(level);
        }}
        onClose={() => setShowFolderSheet(false)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Field row — the "tap to open sheet" input
// ---------------------------------------------------------------------------

function FieldRow({
  label, value, placeholder, onPress, disabled, leadingIcon,
}: {
  label: string;
  value: string | null | undefined;
  placeholder: string;
  onPress: () => void;
  disabled?: boolean;
  leadingIcon?: React.ReactNode;
}) {
  return (
    <View className="mb-4">
      <Text className="text-[10px] font-semibold text-m-text-secondary uppercase tracking-wide mb-2">
        {label}
      </Text>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        className="flex-row items-center px-3 py-2.5 rounded-[10px] bg-m-bg-subtle border border-m-border"
        style={{ opacity: disabled ? 0.4 : 1 }}
      >
        {leadingIcon && <View className="mr-2">{leadingIcon}</View>}
        <Text
          className="flex-1 text-sm"
          style={{ color: value ? colors.textPrimary : colors.textTertiary }}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <ChevronRight size={14} color={colors.textTertiary} />
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Toggle switch — simple pill
// ---------------------------------------------------------------------------

function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      activeOpacity={0.7}
      style={{
        width: 42,
        height: 24,
        borderRadius: 12,
        backgroundColor: value ? colors.bgBrand : colors.border,
        justifyContent: 'center',
        padding: 2,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: 'white',
          transform: [{ translateX: value ? 18 : 0 }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.15,
          shadowRadius: 1,
          elevation: 2,
        }}
      />
    </TouchableOpacity>
  );
}
