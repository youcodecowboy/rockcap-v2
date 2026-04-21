import {
  View, Text, TouchableOpacity, ScrollView, TextInput, Alert, Linking, Platform,
} from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../../model-testing-app/convex/_generated/api';
import {
  X, Send, Download, ExternalLink, Layers, ChevronDown, ChevronUp, FileText,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';
import { useDocTabs } from '@/contexts/TabContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import DocumentRenderer from '@/components/DocumentRenderer';
import MobileHeader from '@/components/MobileHeader';
import TabManager from '@/components/TabManager';

const TABS = ['Preview', 'Summary', 'Details', 'Intelligence', 'Notes'] as const;
type TabKey = typeof TABS[number];

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number | string | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ViewerScreen() {
  const { documentId, title, fileType } = useLocalSearchParams<{
    documentId: string; title?: string; fileType?: string;
  }>();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { openTab } = useDocTabs();
  const [activeTab, setActiveTab] = useState<TabKey>('Preview');

  const document = useQuery(
    api.documents.get,
    isAuthenticated && documentId ? { id: documentId as any } : 'skip'
  );

  const fileUrl = useQuery(
    api.documents.getFileUrl,
    isAuthenticated && document?.fileStorageId
      ? { storageId: document.fileStorageId as any }
      : 'skip'
  );

  const docTitle = (document as any)?.fileName || title || 'Document';
  const category = (document as any)?.category;
  const clientName = (document as any)?.clientName;

  const handleAddToTabs = useCallback(() => {
    if (!documentId) return;
    openTab({
      documentId,
      title: docTitle,
      fileType: fileType || (document as any)?.fileType || '',
      fileUrl: fileUrl || undefined,
    });
    Alert.alert('Added', 'Document added to tabs');
  }, [documentId, docTitle, fileType, fileUrl, openTab, document]);

  // Share opens the "new conversation" screen with this doc pre-attached
  // as a reference (directMessages.send supports references → document).
  // Previously the button fired an "Alert: Coming soon" stub.
  const handleShare = useCallback(() => {
    if (!documentId) return;
    router.push({
      pathname: '/(tabs)/inbox/conversation/new',
      params: {
        attachDocId: documentId as string,
        attachDocName: docTitle,
      },
    } as any);
  }, [router, documentId, docTitle]);

  const handleDownload = useCallback(() => {
    if (!fileUrl) { Alert.alert('Not ready', 'File still loading'); return; }
    Linking.openURL(fileUrl).catch(() => Alert.alert('Error', 'Could not open file'));
  }, [fileUrl]);

  if (!document) {
    return (
      <View className="flex-1 bg-m-bg">
        <MobileHeader />
        <LoadingSpinner message="Loading document..." />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-m-bg">
      <MobileHeader />
      <TabManager />

      {/* Document sub-header */}
      <View className="bg-m-bg-card border-b border-m-border px-4 py-3 flex-row items-start">
        <View className="flex-1 mr-2">
          <Text className="text-base font-semibold text-m-text-primary" numberOfLines={1}>
            {docTitle}
          </Text>
          <Text className="text-xs text-m-text-tertiary mt-0.5" numberOfLines={1}>
            {[category, clientName].filter(Boolean).join(' · ') || ' '}
          </Text>
        </View>
        <TouchableOpacity className="p-1 mr-2" onPress={handleShare}>
          <Send size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity className="p-1" onPress={() => router.back()}>
          <X size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, maxHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bgCard }}
        contentContainerStyle={{ paddingHorizontal: 8, alignItems: 'center' }}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`px-3 py-2.5 ${activeTab === tab ? 'border-b-2 border-m-accent' : ''}`}
          >
            <Text className={`text-sm font-medium ${activeTab === tab ? 'text-m-text-primary' : 'text-m-text-tertiary'}`}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'Preview' && (
          <PreviewTab fileUrl={fileUrl} fileType={(document as any).fileType} fileName={docTitle} />
        )}
        {activeTab === 'Summary' && <SummaryTab doc={document as any} />}
        {activeTab === 'Details' && <DetailsTab doc={document as any} />}
        {activeTab === 'Intelligence' && <IntelligenceTab documentId={documentId!} />}
        {activeTab === 'Notes' && <NotesTab documentId={documentId!} />}
      </View>

      {/* Sticky action bar */}
      <View className="flex-row gap-2 px-3 py-2 border-t border-m-border bg-m-bg-card">
        <ActionButton icon={Download} label="Download" onPress={handleDownload} />
        <ActionButton icon={ExternalLink} label="Open" onPress={handleDownload} />
        <ActionButton icon={Layers} label="Add to tabs" onPress={handleAddToTabs} />
      </View>
    </View>
  );
}

// ── Action button ────────────────────────────────────────────

function ActionButton({ icon: Icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-1 flex-row items-center justify-center gap-1.5 bg-m-bg-subtle rounded-lg py-2.5"
    >
      <Icon size={14} color={colors.textPrimary} />
      <Text className="text-sm font-medium text-m-text-primary">{label}</Text>
    </TouchableOpacity>
  );
}

// ── Preview Tab ──────────────────────────────────────────────

function PreviewTab({ fileUrl, fileType, fileName }: { fileUrl?: string; fileType?: string; fileName: string }) {
  if (!fileUrl) return <LoadingSpinner message="Loading file..." />;
  return <DocumentRenderer fileUrl={fileUrl} fileType={fileType || ''} fileName={fileName} />;
}

// ── Summary Tab ──────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text className="text-xs font-medium text-m-text-secondary mb-1.5">{children}</Text>;
}

function ChipList({ items }: { items: string[] }) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {items.map((item, i) => (
        <View key={i} className="px-2.5 py-1 bg-m-bg-inset rounded-full">
          <Text className="text-xs text-m-text-primary">{item}</Text>
        </View>
      ))}
    </View>
  );
}

function SummaryTab({ doc }: { doc: any }) {
  const analysis = doc.documentAnalysis;
  const executive = analysis?.executiveSummary || doc.summary;
  const hasAnyData = executive || analysis?.detailedSummary ||
    analysis?.keyDates?.length || analysis?.keyAmounts?.length || analysis?.keyTerms?.length;

  if (!hasAnyData) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-sm text-m-text-tertiary text-center">Document not yet analyzed</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 20 }}>
      {executive && (
        <View>
          <SectionLabel>Summary</SectionLabel>
          <Text className="text-sm text-m-text-primary leading-5">{executive}</Text>
        </View>
      )}
      {analysis?.detailedSummary && (
        <View>
          <SectionLabel>Detailed Summary</SectionLabel>
          <Text className="text-sm text-m-text-primary leading-5">{analysis.detailedSummary}</Text>
        </View>
      )}
      {analysis?.keyDates?.length > 0 && (
        <View><SectionLabel>Key Dates</SectionLabel><ChipList items={analysis.keyDates} /></View>
      )}
      {analysis?.keyAmounts?.length > 0 && (
        <View><SectionLabel>Key Amounts</SectionLabel><ChipList items={analysis.keyAmounts} /></View>
      )}
      {analysis?.keyTerms?.length > 0 && (
        <View><SectionLabel>Key Terms</SectionLabel><ChipList items={analysis.keyTerms} /></View>
      )}
    </ScrollView>
  );
}

// ── Details Tab ──────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start py-3 border-b border-m-border-subtle">
      <Text className="text-xs text-m-text-tertiary w-28">{label}</Text>
      <Text className="text-sm text-m-text-primary flex-1" numberOfLines={2}>{value}</Text>
    </View>
  );
}

function DetailsTab({ doc }: { doc: any }) {
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const characteristics: string[] = [];
  const ch = doc.documentAnalysis?.documentCharacteristics;
  if (ch) {
    if (ch.isFinancial) characteristics.push('Financial');
    if (ch.isLegal) characteristics.push('Legal');
    if (ch.isIdentity) characteristics.push('Identity');
    if (ch.isReport) characteristics.push('Report');
    if (ch.isDesign) characteristics.push('Design');
    if (ch.isCorrespondence) characteristics.push('Correspondence');
    if (ch.hasMultipleProjects) characteristics.push('Multi-project');
    if (ch.isInternal) characteristics.push('Internal');
  }
  const confidence = doc.confidence ? `${Math.round(doc.confidence * 100)}%` : '—';

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 20 }}>
      <View>
        <SectionLabel>Document Type</SectionLabel>
        <View className="self-start"><ChipList items={[doc.fileTypeDetected || doc.documentType || '—']} /></View>
      </View>

      <View>
        <SectionLabel>Category</SectionLabel>
        <View className="self-start"><ChipList items={[doc.category || '—']} /></View>
      </View>

      <View>
        <SectionLabel>Confidence</SectionLabel>
        <View className="self-start bg-emerald-100 px-2.5 py-1 rounded-full">
          <Text className="text-xs font-medium text-emerald-700">{confidence}</Text>
        </View>
      </View>

      {characteristics.length > 0 && (
        <View><SectionLabel>Characteristics</SectionLabel><ChipList items={characteristics} /></View>
      )}

      {doc.classificationReasoning && (
        <View>
          <TouchableOpacity
            onPress={() => setReasoningExpanded(!reasoningExpanded)}
            className="flex-row items-center justify-between py-2 border-b border-m-border-subtle"
          >
            <Text className="text-xs font-medium text-m-text-secondary">Classification Reasoning</Text>
            {reasoningExpanded ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />}
          </TouchableOpacity>
          {reasoningExpanded && (
            <Text className="text-xs text-m-text-secondary mt-2 leading-5">{doc.classificationReasoning}</Text>
          )}
        </View>
      )}

      <View className="bg-m-bg-card border border-m-border rounded-xl px-4">
        <DetailRow label="File name" value={doc.fileName || '—'} />
        {doc.documentCode && <DetailRow label="Document code" value={doc.documentCode} />}
        <DetailRow label="File size" value={formatBytes(doc.fileSize)} />
        <DetailRow label="File type" value={(doc.fileType || '—').toUpperCase()} />
        {doc.version && <DetailRow label="Version" value={doc.version} />}
        {doc.uploaderInitials && <DetailRow label="Uploaded by" value={doc.uploaderInitials} />}
        <DetailRow label="Uploaded" value={formatDate(doc.uploadedAt || doc._creationTime)} />
      </View>
    </ScrollView>
  );
}

// ── Intelligence Tab ─────────────────────────────────────────

function IntelligenceTab({ documentId }: { documentId: string }) {
  const { isAuthenticated } = useConvexAuth();
  const items = useQuery(
    api.documents.getDocumentIntelligence,
    isAuthenticated && documentId ? { documentId: documentId as any } : 'skip'
  );

  const grouped = useMemo(() => {
    if (!items) return null;
    const map: Record<string, any[]> = {};
    for (const item of items as any[]) {
      const cat = item.category || 'Other';
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    }
    return map;
  }, [items]);

  if (!items) return <LoadingSpinner />;
  if ((items as any[]).length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-sm text-m-text-tertiary text-center">No intelligence extracted yet</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }}>
      {grouped && Object.entries(grouped).map(([category, fields]) => (
        <View key={category}>
          <View className="px-4 py-2 bg-m-bg-subtle border-b border-m-border">
            <Text className="text-[11px] font-semibold uppercase text-m-text-secondary tracking-wide">
              {category}
            </Text>
          </View>
          {fields.map((field: any) => {
            const conf = field.normalizationConfidence
              ? `${Math.round(field.normalizationConfidence * 100)}%` : null;
            return (
              <View key={field._id} className="px-4 py-3 border-b border-m-border-subtle">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-xs text-m-text-tertiary flex-1" numberOfLines={1}>
                    {field.label || field.fieldPath}
                  </Text>
                  {conf && <Text className="text-[10px] text-m-text-tertiary ml-2">{conf}</Text>}
                </View>
                <Text className="text-sm text-m-text-primary" numberOfLines={3}>
                  {String(field.value ?? '—')}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

// ── Notes Tab ────────────────────────────────────────────────

function NotesTab({ documentId }: { documentId: string }) {
  const { isAuthenticated } = useConvexAuth();
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const notes = useQuery(
    api.documentNotes.getByDocument,
    isAuthenticated && documentId ? { documentId: documentId as any } : 'skip'
  );
  const createNote = useMutation(api.documentNotes.create);
  const removeNote = useMutation(api.documentNotes.remove);

  const handleAdd = async () => {
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    try {
      await createNote({
        documentId: documentId as any,
        content: draft.trim(),
        addToIntelligence: false,
      });
      setDraft('');
    } catch {
      Alert.alert('Error', 'Failed to add note');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete note?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await removeNote({ id: id as any }); } catch { Alert.alert('Error', 'Failed'); }
        },
      },
    ]);
  };

  return (
    <View className="flex-1">
      {/* Composer */}
      <View className="px-4 py-3 border-b border-m-border bg-m-bg-card flex-row items-end gap-2">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a note..."
          multiline
          className="flex-1 bg-m-bg-subtle rounded-lg px-3 py-2 text-sm text-m-text-primary max-h-[100px]"
          placeholderTextColor={colors.textPlaceholder}
        />
        <TouchableOpacity
          onPress={handleAdd}
          disabled={!draft.trim() || submitting}
          className={`w-9 h-9 rounded-full items-center justify-center ${draft.trim() ? 'bg-m-bg-brand' : 'bg-m-bg-inset'}`}
        >
          <Send size={14} color={draft.trim() ? colors.textOnBrand : colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {!notes ? (
        <LoadingSpinner />
      ) : (notes as any[]).length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm text-m-text-tertiary text-center">No notes yet — add one above</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
          {(notes as any[]).map((note) => (
            <View key={note._id} className="bg-m-bg-card border border-m-border rounded-xl p-3">
              <View className="flex-row items-center justify-between mb-1">
                <View className="flex-row items-center gap-2">
                  <View className="w-5 h-5 rounded-full bg-m-bg-inset items-center justify-center">
                    <Text className="text-[9px] font-semibold text-m-text-secondary">
                      {note.createdByInitials || '?'}
                    </Text>
                  </View>
                  <Text className="text-xs font-medium text-m-text-primary">{note.createdByName || 'User'}</Text>
                </View>
                <Text className="text-[10px] text-m-text-tertiary">{formatDate(note.createdAt)}</Text>
              </View>
              <Text className="text-sm text-m-text-primary leading-5">{note.content}</Text>
              <TouchableOpacity onPress={() => handleDelete(note._id)} className="self-end mt-1">
                <Text className="text-[11px] text-m-text-tertiary">Delete</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
