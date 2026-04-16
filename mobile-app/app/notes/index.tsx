import { View, Text, FlatList, TouchableOpacity, TextInput } from 'react-native';
import { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { ArrowLeft, Plus, FileText, Search, Trash2 } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';

function extractPlainText(content: any): string {
  if (!content) return '';
  // Handle JSON strings — parse before walking
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      return extractPlainText(parsed);
    } catch {
      return content;
    }
  }
  const texts: string[] = [];
  function walk(node: any) {
    if (node.text) texts.push(node.text);
    if (node.content) node.content.forEach(walk);
    if (node.children) node.children.forEach(walk);
  }
  walk(content);
  return texts.join(' ');
}

const TAG_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

const TABS = ['All Notes', 'Personal', 'Filed'] as const;
type NoteTab = typeof TABS[number];

export default function NotesScreen() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const notes = useQuery(api.notes.getAll, isAuthenticated ? {} : 'skip');
  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');
  const projects = useQuery(api.projects.list, isAuthenticated ? {} : 'skip');

  const [activeTab, setActiveTab] = useState<NoteTab>('All Notes');
  const [search, setSearch] = useState('');

  const clientMap = useMemo(() => {
    const m = new Map<string, string>();
    clients?.forEach((c: any) => m.set(c._id, c.name));
    return m;
  }, [clients]);

  const projectMap = useMemo(() => {
    const m = new Map<string, string>();
    projects?.forEach((p: any) => m.set(p._id, p.name));
    return m;
  }, [projects]);

  const filteredNotes = useMemo(() => {
    if (!notes) return [];
    let filtered = [...notes];

    // Tab filter
    if (activeTab === 'Personal') {
      filtered = filtered.filter((n) => !n.clientId && !n.projectId);
    } else if (activeTab === 'Filed') {
      filtered = filtered.filter((n) => n.clientId || n.projectId);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((n) =>
        (n.title || '').toLowerCase().includes(q) ||
        extractPlainText(n.content).toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [notes, activeTab, search]);

  return (
    <View className="flex-1 bg-m-bg">
      {/* Header */}
      <View className="bg-m-bg-brand pt-14 pb-3 px-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <ArrowLeft size={18} color={colors.textOnBrand} />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-m-text-on-brand">Notes</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/notes/editor')}
          className="w-7 h-7 rounded-full bg-white/10 items-center justify-center"
        >
          <Plus size={16} color={colors.textOnBrand} />
        </TouchableOpacity>
      </View>

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
            placeholder="Search notes..."
            value={search}
            onChangeText={setSearch}
            className="flex-1 text-sm ml-2"
            placeholderTextColor={colors.textTertiary}
          />
        </View>
      </View>

      {/* New Note button */}
      <View className="px-4 pb-2">
        <TouchableOpacity
          onPress={() => router.push('/notes/editor')}
          className="bg-m-bg-brand rounded-lg py-3 flex-row items-center justify-center"
        >
          <Plus size={16} color={colors.textOnBrand} />
          <Text className="text-sm font-medium text-m-text-on-brand ml-2">New Note</Text>
        </TouchableOpacity>
      </View>

      {!notes ? (
        <LoadingSpinner />
      ) : filteredNotes.length === 0 ? (
        <EmptyState icon={FileText} title="No notes" description="Tap + to create one" />
      ) : (
        <FlatList
          data={filteredNotes}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => {
            const preview = extractPlainText(item.content);
            const truncatedPreview = preview.length > 80 ? preview.slice(0, 80) + '...' : preview;
            const displayDate = item.updatedAt ?? item.createdAt ?? item._creationTime;
            const clientName = item.clientId ? clientMap.get(item.clientId) : null;
            const projectName = item.projectId ? projectMap.get(item.projectId) : null;

            return (
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/notes/editor', params: { noteId: item._id } })}
                className="border-b border-m-border px-4 py-3"
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 mr-2">
                    <Text className="text-sm text-m-text-primary font-medium" numberOfLines={1}>
                      {item.emoji ? `${item.emoji} ` : ''}{item.title || 'Untitled'}
                    </Text>
                    {truncatedPreview ? (
                      <Text className="text-xs text-m-text-secondary mt-0.5" numberOfLines={2}>
                        {truncatedPreview}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity className="p-1 opacity-40">
                    <Trash2 size={14} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>

                {item.tags && item.tags.length > 0 && (
                  <View className="flex-row flex-wrap gap-1 mt-1.5">
                    {item.tags.map((tag: string) => (
                      <View
                        key={tag}
                        className="rounded-full px-2 py-0.5"
                        style={{ backgroundColor: getTagColor(tag) + '20' }}
                      >
                        <Text style={{ color: getTagColor(tag), fontSize: 10, fontWeight: '500' }}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View className="flex-row items-center mt-1.5 gap-2">
                  <Text className="text-[10px] text-m-text-tertiary">
                    {new Date(displayDate).toLocaleDateString('en-GB')}
                  </Text>
                  {clientName && (
                    <Text className="text-[10px] text-m-text-tertiary" numberOfLines={1}>
                      {clientName}
                    </Text>
                  )}
                  {projectName && (
                    <Text className="text-[10px] text-m-text-tertiary" numberOfLines={1}>
                      {projectName}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      )}
    </View>
  );
}
