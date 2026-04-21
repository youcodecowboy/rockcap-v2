import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Animated, Easing, Alert,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useConvexAuth, useMutation } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Eye, FileText, Sparkles,
  ChevronDown, FolderOpen, Tag, ListChecks,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';
import MobileHeader from '@/components/MobileHeader';
import MiniTabBar from '@/components/MiniTabBar';
import Card from '@/components/ui/Card';
import CategorySheet from '@/components/upload/CategorySheet';
import FolderSheet from '@/components/upload/FolderSheet';
import type { UploadScope } from '@/components/upload/ScopeToggle';

// ---------------------------------------------------------------------------
// Batch detail / processing status screen (Phase 1)
//
// This screen is intentionally a "status dashboard" today. The full review
// flow (per-doc cards, classification edits, completion summary) lands in
// Phase 2 — matching mobile-web's ReviewFlow / CompletionSummary components.
//
// Phase 1 responsibilities:
// 1. Show reactive batch status via Convex subscription
// 2. Show per-item status (pending/processing/ready/error)
// 3. Direct the user to desktop for AI review when the batch reaches review
// ---------------------------------------------------------------------------

function StatusPill({
  kind, label,
}: {
  kind: 'ok' | 'warn' | 'err' | 'info';
  label: string;
}) {
  const palette = {
    ok: { bg: '#dcfce7', fg: '#15803d' },
    warn: { bg: '#fef3c7', fg: '#b45309' },
    err: { bg: '#fef2f2', fg: '#b91c1c' },
    info: { bg: '#dbeafe', fg: '#1d4ed8' },
  }[kind];
  return (
    <View
      className="self-start rounded-[6px] px-1.5 py-0.5"
      style={{ backgroundColor: palette.bg }}
    >
      <Text className="text-[10px] font-semibold" style={{ color: palette.fg }}>
        {label}
      </Text>
    </View>
  );
}

function ItemStatusPill({ status }: { status: string }) {
  if (status === 'pending' || status === 'processing') {
    return <StatusPill kind="warn" label={status === 'processing' ? 'Analysing' : 'Queued'} />;
  }
  if (status === 'ready_for_review') {
    return <StatusPill kind="info" label="Ready" />;
  }
  if (status === 'filed') {
    return <StatusPill kind="ok" label="Filed" />;
  }
  if (status === 'error') {
    return <StatusPill kind="err" label="Failed" />;
  }
  if (status === 'discarded') {
    return <StatusPill kind="err" label="Discarded" />;
  }
  return <StatusPill kind="info" label={status} />;
}

export default function BatchDetailScreen() {
  const router = useRouter();
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const { isAuthenticated } = useConvexAuth();

  const batch = useQuery(
    api.bulkUpload.getBatch,
    isAuthenticated && batchId ? { batchId: batchId as any } : 'skip',
  );
  const items = useQuery(
    api.bulkUpload.getBatchItems,
    isAuthenticated && batchId ? { batchId: batchId as any } : 'skip',
  );

  // --- Shimmer/spinner for "analysing" state ---
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  if (batch === undefined || items === undefined) {
    return (
      <View className="flex-1 bg-m-bg items-center justify-center">
        <ActivityIndicator size="small" color={colors.textTertiary} />
        <Text className="text-sm text-m-text-tertiary mt-3">Loading batch...</Text>
      </View>
    );
  }

  if (batch === null) {
    return (
      <View className="flex-1 bg-m-bg">
        <MobileHeader />
        <View className="flex-1 items-center justify-center px-8">
          <AlertCircle size={32} color={colors.textTertiary} />
          <Text className="text-sm font-medium text-m-text-primary mt-3">
            Batch not found
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/upload')}
            className="mt-4 px-4 py-2 bg-m-bg-brand rounded-[10px]"
          >
            <Text className="text-sm font-medium text-m-text-on-brand">
              Back to Upload
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Derived status from actual item states. The backend sometimes lags
  // updating batch.status behind per-item transitions (e.g. items all go
  // ready_for_review but batch stays 'uploading'), which caused the
  // "Uploading your files. Keep the app open..." banner to persist after
  // processing was actually done.
  const rawStatus = batch.status as string;
  const totalItems = items.length;
  const pendingCount = items.filter(
    (i: any) => i.status === 'pending' || i.status === 'processing',
  ).length;
  const readyCount = items.filter((i: any) => i.status === 'ready_for_review').length;
  const filedCount = items.filter((i: any) => i.status === 'filed').length;
  const erroredCount = items.filter((i: any) => i.status === 'error').length;

  const status =
    totalItems === 0
      ? rawStatus
      : filedCount === totalItems
        ? 'completed'
        : pendingCount === 0 && readyCount > 0
          ? 'review'
          : pendingCount > 0
            ? 'processing'
            : rawStatus;

  const isUploading = status === 'uploading';
  const isProcessing = status === 'processing';
  const isReview = status === 'review';
  const isComplete = status === 'completed' || status === 'filed';

  // Scope / destination label
  const scopeLabel =
    batch.scope === 'internal'
      ? 'Internal'
      : batch.scope === 'personal'
      ? 'Personal'
      : batch.clientName || 'Client upload';

  const subLabel = batch.projectName
    ? `${batch.projectName}${batch.projectShortcode ? ` · ${batch.projectShortcode}` : ''}`
    : batch.internalFolderName || batch.personalFolderName || undefined;

  // Aliases for the JSX below (keep original names).
  const total = totalItems;
  const ready = readyCount;
  const filed = filedCount;
  const errored = erroredCount;
  const pending = pendingCount;

  // Progress percentage (treat "filed" + "ready" + "error" as "done")
  const done = ready + filed + errored;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <View className="flex-1 bg-m-bg">
      <MobileHeader />

      {/* Sub-header */}
      <View className="bg-m-bg-card border-b border-m-border px-4 py-3 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <ArrowLeft size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text className="text-[15px] font-medium text-m-text-primary">
          Batch Detail
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      >
        {/* Status hero card */}
        <Card>
          <View className="flex-row items-start gap-3">
            <View
              className="w-10 h-10 rounded-[10px] items-center justify-center"
              style={{
                backgroundColor:
                  isComplete
                    ? '#dcfce7'
                    : isReview
                    ? '#dbeafe'
                    : '#fef3c7',
              }}
            >
              {isComplete ? (
                <CheckCircle2 size={20} color={colors.success} />
              ) : isReview ? (
                <Eye size={20} color="#1d4ed8" />
              ) : (
                <Animated.View style={{ opacity: pulseOpacity }}>
                  <Sparkles size={20} color="#b45309" />
                </Animated.View>
              )}
            </View>
            <View className="flex-1 min-w-0">
              <Text
                className="text-base font-semibold text-m-text-primary"
                numberOfLines={1}
              >
                {scopeLabel}
              </Text>
              {subLabel ? (
                <Text className="text-xs text-m-text-tertiary mt-0.5" numberOfLines={1}>
                  {subLabel}
                </Text>
              ) : null}
              <View className="mt-2">
                <StatusHeroText
                  status={status}
                  total={total}
                  ready={ready}
                  pending={pending}
                  errored={errored}
                />
              </View>
            </View>
          </View>

          {/* Progress bar */}
          {(isUploading || isProcessing) && total > 0 && (
            <View className="mt-4">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs text-m-text-secondary">
                  {done} of {total} processed
                </Text>
                <Text className="text-xs font-semibold text-m-text-primary">
                  {pct}%
                </Text>
              </View>
              <View className="h-1.5 bg-m-bg-inset rounded-full overflow-hidden">
                <View
                  className="h-full bg-m-accent rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </View>
            </View>
          )}
        </Card>

        {/* Review helper banner */}
        {isReview && ready > 0 && (
          <Card>
            <View className="flex-row items-start gap-2.5">
              <Eye size={16} color="#1d4ed8" style={{ marginTop: 2 }} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-m-text-primary">
                  Ready to review
                </Text>
                <Text className="text-xs text-m-text-secondary mt-1 leading-5">
                  Tap any row below to adjust the AI's classification, folder,
                  or checklist match, then file.
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Instructions (if any) */}
        {batch.instructions ? (
          <Card>
            <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide mb-1">
              Instructions
            </Text>
            <Text className="text-sm text-m-text-secondary leading-5">
              {batch.instructions}
            </Text>
          </Card>
        ) : null}

        {/* Per-file list */}
        <Card>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-sm font-semibold text-m-text-primary">
              Files
            </Text>
            <Text className="text-xs text-m-text-tertiary">
              {total} {total === 1 ? 'file' : 'files'}
            </Text>
          </View>
          {items.length === 0 ? (
            <Text className="text-sm text-m-text-tertiary text-center py-2">
              No files in batch
            </Text>
          ) : (
            <View>
              {items.map((item: any, idx: number) =>
                item.status === 'ready_for_review' ? (
                  <ReviewItem
                    key={item._id}
                    item={item}
                    batch={batch}
                    isFirst={idx === 0}
                  />
                ) : (
                  <View key={item._id}>
                    {idx > 0 && <View className="h-px bg-m-border-subtle" />}
                    <View className="flex-row items-center gap-2.5 py-2.5">
                      <FileText size={15} color={colors.textTertiary} />
                      <View className="flex-1 min-w-0">
                        <Text
                          className="text-sm text-m-text-primary"
                          numberOfLines={1}
                        >
                          {item.fileName}
                        </Text>
                        {item.error ? (
                          <Text
                            className="text-[11px] mt-0.5"
                            style={{ color: colors.error }}
                            numberOfLines={2}
                          >
                            {item.error}
                          </Text>
                        ) : item.category ? (
                          <Text
                            className="text-[11px] text-m-text-tertiary mt-0.5"
                            numberOfLines={1}
                          >
                            {item.category}
                            {item.confidence
                              ? ` · ${Math.round(item.confidence * 100)}%`
                              : ''}
                          </Text>
                        ) : null}
                      </View>
                      <ItemStatusPill status={item.status} />
                    </View>
                  </View>
                ),
              )}
            </View>
          )}
        </Card>

        {/* Actions */}
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => router.replace('/upload')}
            className="flex-1 py-3 rounded-[10px] items-center bg-m-bg-card border border-m-border"
          >
            <Text className="text-sm font-medium text-m-text-primary">
              Upload More
            </Text>
          </TouchableOpacity>
          {isComplete && (
            <TouchableOpacity
              onPress={() => router.replace('/(tabs)/docs' as any)}
              className="flex-1 py-3 rounded-[10px] items-center"
              style={{ backgroundColor: colors.bgBrand }}
            >
              <Text
                className="text-sm font-medium"
                style={{ color: colors.textOnBrand }}
              >
                View in Docs
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      <MiniTabBar />
    </View>
  );
}

// ---------------------------------------------------------------------------
// ReviewItem — inline per-doc review card for items in 'ready_for_review'.
// Lets the user edit category/type, folder, and confirm checklist match
// suggestions, then file via the existing Convex `fileItem` mutation.
// ---------------------------------------------------------------------------

function ReviewItem({
  item, batch, isFirst,
}: {
  item: any;
  batch: any;
  isFirst: boolean;
}) {
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [showFolderSheet, setShowFolderSheet] = useState(false);
  const [isFiling, setIsFiling] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  // Local checklist selection state — start with all AI suggestions checked
  // (mirrors desktop default). User can un-toggle before filing.
  const initialChecklistIds: string[] = Array.isArray(item.suggestedChecklistItems)
    ? item.suggestedChecklistItems.map((m: any) => m.itemId).filter(Boolean)
    : [];
  const [selectedChecklistIds, setSelectedChecklistIds] = useState<string[]>(
    Array.isArray(item.confirmedChecklistItemIds) && item.confirmedChecklistItemIds.length > 0
      ? item.confirmedChecklistItemIds
      : initialChecklistIds,
  );

  const updateItemDetails = useMutation(api.bulkUpload.updateItemDetails);
  const fileItemMut = useMutation(api.bulkUpload.fileItem);

  const confidencePct =
    typeof item.confidence === 'number' ? Math.round(item.confidence * 100) : null;

  const handleCategory = async (category: string, type: string) => {
    setShowCategorySheet(false);
    try {
      await updateItemDetails({
        itemId: item._id as any,
        category,
        fileTypeDetected: type,
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update classification');
    }
  };

  const handleFolder = async (
    folderKey: string | null,
    _folderName: string | null,
    _folderLevel: 'client' | 'project' | null,
  ) => {
    setShowFolderSheet(false);
    if (!folderKey) return;
    try {
      await updateItemDetails({
        itemId: item._id as any,
        targetFolder: folderKey,
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update folder');
    }
  };

  const toggleChecklist = (id: string) => {
    setSelectedChecklistIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleFile = async () => {
    setFileError(null);
    setIsFiling(true);
    try {
      // Persist confirmed checklist matches before filing so they stick.
      if (Array.isArray(item.suggestedChecklistItems) && item.suggestedChecklistItems.length > 0) {
        await updateItemDetails({
          itemId: item._id as any,
          checklistItemIds: selectedChecklistIds as any,
        });
      }
      await fileItemMut({
        itemId: item._id as any,
        uploaderInitials: batch?.uploaderInitials || 'XX',
      });
    } catch (e: any) {
      setFileError(e?.message || 'Filing failed');
      setIsFiling(false);
    }
  };

  return (
    <View>
      {!isFirst && <View className="h-px bg-m-border-subtle my-2" />}
      <View className="py-2.5">
        {/* Filename header */}
        <View className="flex-row items-start gap-2.5 mb-3">
          <FileText size={15} color={colors.textTertiary} style={{ marginTop: 2 }} />
          <View className="flex-1 min-w-0">
            <Text className="text-sm font-medium text-m-text-primary" numberOfLines={1}>
              {item.fileName}
            </Text>
            {item.generatedDocumentCode ? (
              <Text className="text-[11px] text-m-text-tertiary mt-0.5" numberOfLines={1}>
                {item.generatedDocumentCode}
              </Text>
            ) : null}
          </View>
          <StatusPill kind="info" label="Ready" />
        </View>

        {/* Type / Category row */}
        <TouchableOpacity
          onPress={() => setShowCategorySheet(true)}
          className="flex-row items-center gap-2.5 px-3 py-2.5 rounded-[10px] bg-m-bg-subtle border border-m-border mb-2"
        >
          <Tag size={14} color={colors.textTertiary} />
          <View className="flex-1 min-w-0">
            <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
              Type
            </Text>
            <Text className="text-sm text-m-text-primary mt-0.5" numberOfLines={1}>
              {item.category || 'Unknown'}
              {item.fileTypeDetected && item.fileTypeDetected !== item.category
                ? ` · ${item.fileTypeDetected}`
                : ''}
            </Text>
          </View>
          {confidencePct !== null && (
            <Text className="text-[11px] text-m-text-tertiary mr-1">
              {confidencePct}%
            </Text>
          )}
          <ChevronDown size={14} color={colors.textTertiary} />
        </TouchableOpacity>

        {/* Folder row */}
        <TouchableOpacity
          onPress={() => setShowFolderSheet(true)}
          className="flex-row items-center gap-2.5 px-3 py-2.5 rounded-[10px] bg-m-bg-subtle border border-m-border mb-2"
        >
          <FolderOpen size={14} color={colors.textTertiary} />
          <View className="flex-1 min-w-0">
            <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
              Folder
            </Text>
            <Text className="text-sm text-m-text-primary mt-0.5" numberOfLines={1}>
              {item.targetFolder
                ? String(item.targetFolder).replace(/_/g, ' ')
                : 'Unfiled'}
            </Text>
          </View>
          <ChevronDown size={14} color={colors.textTertiary} />
        </TouchableOpacity>

        {/* Checklist matches (if AI suggested any) */}
        {Array.isArray(item.suggestedChecklistItems) &&
          item.suggestedChecklistItems.length > 0 && (
            <View className="px-3 py-2.5 rounded-[10px] bg-m-bg-subtle border border-m-border mb-2">
              <View className="flex-row items-center gap-2 mb-2">
                <ListChecks size={14} color={colors.textTertiary} />
                <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
                  Checklist Matches
                </Text>
              </View>
              {item.suggestedChecklistItems.map((m: any) => {
                const checked = selectedChecklistIds.includes(m.itemId);
                return (
                  <TouchableOpacity
                    key={m.itemId}
                    onPress={() => toggleChecklist(m.itemId)}
                    className="flex-row items-start gap-2 py-1.5"
                  >
                    <View
                      className="w-4 h-4 rounded border items-center justify-center mt-0.5"
                      style={{
                        backgroundColor: checked ? colors.accent : 'transparent',
                        borderColor: checked ? colors.accent : colors.border,
                      }}
                    >
                      {checked && <CheckCircle2 size={10} color="#fff" />}
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-[13px] text-m-text-primary" numberOfLines={1}>
                        {m.itemName || 'Checklist item'}
                      </Text>
                      {m.category ? (
                        <Text className="text-[11px] text-m-text-tertiary">
                          {m.category}
                          {typeof m.confidence === 'number'
                            ? ` · ${Math.round(m.confidence * 100)}%`
                            : ''}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

        {/* Summary (compact) */}
        {item.summary ? (
          <Text
            className="text-[11px] text-m-text-secondary leading-5 px-1 mb-2"
            numberOfLines={3}
          >
            {item.summary}
          </Text>
        ) : null}

        {/* File error */}
        {fileError && (
          <Text className="text-[11px] mb-2" style={{ color: colors.error }}>
            {fileError}
          </Text>
        )}

        {/* File button */}
        <TouchableOpacity
          onPress={handleFile}
          disabled={isFiling}
          className="flex-row items-center justify-center gap-2 py-2.5 rounded-[10px]"
          style={{
            backgroundColor: colors.bgBrand,
            opacity: isFiling ? 0.6 : 1,
          }}
        >
          {isFiling ? (
            <ActivityIndicator size="small" color={colors.textOnBrand} />
          ) : (
            <CheckCircle2 size={14} color={colors.textOnBrand} />
          )}
          <Text
            className="text-sm font-semibold"
            style={{ color: colors.textOnBrand }}
          >
            {isFiling ? 'Filing...' : 'File'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sheets */}
      <CategorySheet
        visible={showCategorySheet}
        currentCategory={item.category || ''}
        currentType={item.fileTypeDetected || ''}
        onSelect={handleCategory}
        onClose={() => setShowCategorySheet(false)}
      />
      <FolderSheet
        visible={showFolderSheet}
        scope={(batch?.scope || 'client') as UploadScope}
        clientId={batch?.clientId}
        projectId={batch?.projectId}
        selectedFolderKey={item.targetFolder || null}
        onSelect={handleFolder}
        onClose={() => setShowFolderSheet(false)}
      />
    </View>
  );
}

function StatusHeroText({
  status, total, ready, pending, errored,
}: {
  status: string;
  total: number;
  ready: number;
  pending: number;
  errored: number;
}) {
  if (status === 'uploading') {
    return (
      <Text className="text-[13px] text-m-text-secondary">
        Uploading your files. Keep the app open until this completes...
      </Text>
    );
  }
  if (status === 'processing') {
    return (
      <Text className="text-[13px] text-m-text-secondary">
        AI is analysing {pending} {pending === 1 ? 'file' : 'files'}...
      </Text>
    );
  }
  if (status === 'review') {
    return (
      <Text className="text-[13px] text-m-text-secondary">
        {ready} {ready === 1 ? 'document' : 'documents'} ready for review
        {errored > 0 ? ` · ${errored} failed` : ''}
      </Text>
    );
  }
  if (status === 'completed' || status === 'filed') {
    return (
      <Text className="text-[13px] text-m-text-secondary">
        All {total} {total === 1 ? 'document is' : 'documents are'} filed.
      </Text>
    );
  }
  return (
    <Text className="text-[13px] text-m-text-secondary capitalize">
      Status: {status.replace(/_/g, ' ')}
    </Text>
  );
}
