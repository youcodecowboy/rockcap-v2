import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../../model-testing-app/convex/_generated/api';
import { ArrowLeft, Check, FolderOpen } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const TABS = ['Overview', 'Projects', 'Docs', 'Intelligence', 'Notes', 'Tasks', 'Checklist', 'Meetings', 'Flags'] as const;
type TabName = (typeof TABS)[number];

export default function ClientDetailScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [activeTab, setActiveTab] = useState<TabName>('Overview');

  const client = useQuery(
    api.clients.get,
    isAuthenticated && clientId ? { id: clientId as any } : 'skip'
  );
  const projects = useQuery(
    api.projects.getByClient,
    isAuthenticated && clientId ? { clientId: clientId as any } : 'skip'
  );
  const intelligence = useQuery(
    api.intelligence.getClientIntelligence,
    isAuthenticated && clientId ? { clientId: clientId as any } : 'skip'
  );
  const tasks = useQuery(
    api.tasks.getByClient,
    isAuthenticated && clientId ? { clientId: clientId as any } : 'skip'
  );
  const notes = useQuery(
    api.notes.getByClient,
    isAuthenticated && clientId ? { clientId: clientId as any } : 'skip'
  );
  const documents = useQuery(
    api.documents.getByClient,
    isAuthenticated && clientId ? { clientId: clientId as any } : 'skip'
  );

  // Optional APIs - may not exist, wrapped safely
  let checklist: any = undefined;
  let meetings: any = undefined;
  let clientFlags: any = undefined;

  try {
    checklist = useQuery(
      api.knowledgeLibrary.getClientLevelChecklist,
      isAuthenticated && clientId ? { clientId: clientId as any } : 'skip'
    );
  } catch {
    // API may not exist
  }

  try {
    meetings = useQuery(
      api.meetings.getByClient,
      isAuthenticated && clientId ? { clientId: clientId as any } : 'skip'
    );
  } catch {
    // API may not exist
  }

  try {
    clientFlags = useQuery(
      api.flags.getByClient,
      isAuthenticated && clientId ? { clientId: clientId as any } : 'skip'
    );
  } catch {
    // API may not exist
  }

  // Group documents by project for Docs tab
  const docsByProject = (() => {
    if (!documents || !projects) return [];
    const map: Record<string, { name: string; count: number }> = {};
    for (const doc of documents) {
      const pid = doc.projectId || '_unassigned';
      if (!map[pid]) {
        const proj = projects.find((p) => p._id === pid);
        map[pid] = { name: proj?.name || 'Unassigned', count: 0 };
      }
      map[pid].count++;
    }
    return Object.entries(map).map(([id, data]) => ({ id, ...data }));
  })();

  const totalDocs = documents?.length ?? 0;

  if (!client) return <LoadingSpinner message="Loading client..." />;

  return (
    <View className="flex-1 bg-m-bg">
      <View className="bg-m-bg-brand pt-14 pb-4 px-4">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center mb-2">
          <ArrowLeft size={20} color={colors.textOnBrand} />
          <Text className="text-m-text-on-brand/60 text-sm ml-1">Clients</Text>
        </TouchableOpacity>
        <Text className="text-xl font-bold text-m-text-on-brand">{client.name}</Text>
        {client.status ? (
          <Text className="text-sm text-m-text-on-brand/50 capitalize mt-0.5">{client.status}</Text>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="border-b border-m-border bg-m-bg-card"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 4 }}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`py-2.5 px-3 ${activeTab === tab ? 'border-b-2 border-m-accent' : ''}`}
          >
            <Text className={`text-xs font-medium ${activeTab === tab ? 'text-m-text-primary' : 'text-m-text-tertiary'}`}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView className="flex-1 px-4 pt-3" contentContainerStyle={{ paddingBottom: 24, gap: 12 }}>
        {activeTab === 'Overview' && (
          <>
            <Card>
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">Details</Text>
              {client.email ? <Text className="text-sm text-m-text-secondary">{client.email}</Text> : null}
              {client.phone ? <Text className="text-sm text-m-text-secondary mt-1">{client.phone}</Text> : null}
              {client.stageNote ? (
                <View className="mt-3 pt-3 border-t border-m-border-subtle">
                  <Text className="text-xs text-m-text-tertiary mb-1">Stage Note</Text>
                  <Text className="text-sm text-m-text-secondary">{client.stageNote}</Text>
                </View>
              ) : null}
            </Card>
            <Card>
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">Summary</Text>
              <View className="flex-row gap-6">
                <View>
                  <Text className="text-lg font-bold text-m-text-primary">{projects?.length ?? 0}</Text>
                  <Text className="text-xs text-m-text-tertiary">Projects</Text>
                </View>
                <View>
                  <Text className="text-lg font-bold text-m-text-primary">{totalDocs}</Text>
                  <Text className="text-xs text-m-text-tertiary">Documents</Text>
                </View>
                <View>
                  <Text className="text-lg font-bold text-m-text-primary">{tasks?.length ?? 0}</Text>
                  <Text className="text-xs text-m-text-tertiary">Tasks</Text>
                </View>
              </View>
            </Card>
            {projects && projects.length > 0 ? (
              <Card>
                <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">Projects ({projects.length})</Text>
                <View className="gap-2">
                  {projects.map((p) => (
                    <View key={p._id} className="flex-row items-center gap-2">
                      <View className="w-1.5 h-1.5 rounded-full bg-m-accent" />
                      <Text className="text-sm text-m-text-primary">{p.name}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}
          </>
        )}

        {activeTab === 'Projects' && (
          <View className="gap-2">
            {projects && projects.length > 0 ? (
              projects.map((p) => (
                <TouchableOpacity
                  key={p._id}
                  onPress={() => router.push(`/projects/${p._id}` as any)}
                >
                  <Card>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-m-text-primary">{p.name}</Text>
                        {p.status ? <Text className="text-xs text-m-text-tertiary mt-1 capitalize">{p.status}</Text> : null}
                      </View>
                      {p.status && (
                        <View className={`px-2 py-0.5 rounded-full ${p.status === 'active' ? 'bg-m-success/15' : 'bg-m-warning/15'}`}>
                          <Text className={`text-[10px] font-medium capitalize ${p.status === 'active' ? 'text-m-success' : 'text-m-warning'}`}>
                            {p.status}
                          </Text>
                        </View>
                      )}
                    </View>
                    {p.description ? <Text className="text-sm text-m-text-secondary mt-2" numberOfLines={2}>{p.description}</Text> : null}
                  </Card>
                </TouchableOpacity>
              ))
            ) : (
              <Text className="text-sm text-m-text-tertiary text-center py-8">No projects</Text>
            )}
          </View>
        )}

        {activeTab === 'Docs' && (
          <View className="gap-2">
            <Card>
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
                Documents ({totalDocs})
              </Text>
              {docsByProject.length > 0 ? (
                <View className="gap-3">
                  {docsByProject.map((folder) => (
                    <View key={folder.id} className="flex-row items-center gap-2">
                      <FolderOpen size={14} color={colors.textTertiary} />
                      <Text className="text-sm text-m-text-primary flex-1">{folder.name}</Text>
                      <Text className="text-xs text-m-text-tertiary">{folder.count} docs</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-sm text-m-text-tertiary">No documents</Text>
              )}
            </Card>
          </View>
        )}

        {activeTab === 'Intelligence' && (
          <Card>
            <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-3">Client Intelligence</Text>
            {intelligence ? (
              typeof intelligence.overview === 'string' ? (
                <Text className="text-sm text-m-text-secondary leading-5">{intelligence.overview}</Text>
              ) : intelligence.overview && typeof intelligence.overview === 'object' ? (
                <View className="gap-2">
                  {Object.entries(intelligence.overview).map(([key, value]) => (
                    <View key={key}>
                      <Text className="text-xs font-semibold text-m-text-tertiary capitalize mb-0.5">{key.replace(/_/g, ' ')}</Text>
                      <Text className="text-sm text-m-text-secondary leading-5">
                        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-sm text-m-text-tertiary">No intelligence available</Text>
              )
            ) : (
              <Text className="text-sm text-m-text-tertiary">No intelligence available</Text>
            )}
          </Card>
        )}

        {activeTab === 'Notes' && (
          <View className="gap-2">
            {notes && notes.length > 0 ? (
              notes.map((n) => (
                <Card key={n._id}>
                  {(n as any).title ? (
                    <Text className="text-sm font-medium text-m-text-primary mb-1">{(n as any).title}</Text>
                  ) : null}
                  <Text className="text-sm text-m-text-secondary" numberOfLines={3}>
                    {typeof n.content === 'string' ? n.content : 'Note'}
                  </Text>
                  {n._creationTime ? (
                    <Text className="text-[10px] text-m-text-tertiary mt-2">
                      {new Date(n._creationTime).toLocaleDateString('en-GB')}
                    </Text>
                  ) : null}
                </Card>
              ))
            ) : (
              <Text className="text-sm text-m-text-tertiary text-center py-8">No notes</Text>
            )}
          </View>
        )}

        {activeTab === 'Tasks' && (
          <View className="gap-2">
            {tasks && tasks.length > 0 ? (
              tasks.map((t) => (
                <Card key={t._id}>
                  <View className="flex-row items-start gap-2">
                    <View className={`w-4 h-4 rounded border mt-0.5 items-center justify-center ${(t as any).completed ? 'bg-m-success border-m-success' : 'border-m-border'}`}>
                      {(t as any).completed && <Check size={10} color="#fff" />}
                    </View>
                    <View className="flex-1">
                      <Text className={`text-sm ${(t as any).completed ? 'text-m-text-tertiary line-through' : 'text-m-text-primary'}`}>
                        {t.title}
                      </Text>
                      {t.dueDate ? (
                        <Text className="text-xs text-m-text-tertiary mt-1">Due: {new Date(t.dueDate).toLocaleDateString('en-GB')}</Text>
                      ) : null}
                    </View>
                  </View>
                </Card>
              ))
            ) : (
              <Text className="text-sm text-m-text-tertiary text-center py-8">No tasks</Text>
            )}
          </View>
        )}

        {activeTab === 'Checklist' && (
          <View className="gap-2">
            {checklist === undefined ? (
              <Text className="text-sm text-m-text-tertiary text-center py-8">Coming soon</Text>
            ) : checklist && checklist.length > 0 ? (
              checklist.map((item: any) => (
                <Card key={item._id}>
                  <View className="flex-row items-start gap-2">
                    <View className={`w-4 h-4 rounded border mt-0.5 items-center justify-center ${item.completed ? 'bg-m-success border-m-success' : 'border-m-border'}`}>
                      {item.completed && <Check size={10} color="#fff" />}
                    </View>
                    <View className="flex-1">
                      <Text className={`text-sm ${item.completed ? 'text-m-text-tertiary line-through' : 'text-m-text-primary'}`}>
                        {item.title || item.name || 'Checklist item'}
                      </Text>
                      {item.description ? (
                        <Text className="text-xs text-m-text-tertiary mt-1" numberOfLines={2}>{item.description}</Text>
                      ) : null}
                    </View>
                  </View>
                </Card>
              ))
            ) : (
              <Text className="text-sm text-m-text-tertiary text-center py-8">No checklist items</Text>
            )}
          </View>
        )}

        {activeTab === 'Meetings' && (
          <View className="gap-2">
            {meetings === undefined ? (
              <Text className="text-sm text-m-text-tertiary text-center py-8">Coming soon</Text>
            ) : meetings && meetings.length > 0 ? (
              meetings.map((m: any) => (
                <Card key={m._id}>
                  <Text className="text-sm font-medium text-m-text-primary">{m.title || m.subject || 'Meeting'}</Text>
                  {m.date || m.scheduledAt ? (
                    <Text className="text-xs text-m-text-tertiary mt-1">
                      {new Date(m.date || m.scheduledAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                  ) : null}
                  {m.notes ? (
                    <Text className="text-sm text-m-text-secondary mt-2" numberOfLines={2}>{m.notes}</Text>
                  ) : null}
                  {m.status ? (
                    <View className="mt-2">
                      <Text className="text-[10px] text-m-text-tertiary capitalize">{m.status}</Text>
                    </View>
                  ) : null}
                </Card>
              ))
            ) : (
              <Text className="text-sm text-m-text-tertiary text-center py-8">No meetings</Text>
            )}
          </View>
        )}

        {activeTab === 'Flags' && (
          <View className="gap-2">
            {clientFlags === undefined ? (
              <Text className="text-sm text-m-text-tertiary text-center py-8">Coming soon</Text>
            ) : clientFlags && clientFlags.length > 0 ? (
              clientFlags.map((f: any) => (
                <Card key={f._id}>
                  <View className="flex-row items-start gap-2">
                    <View className={`w-2 h-2 rounded-full mt-1.5 ${f.severity === 'high' || f.severity === 'critical' ? 'bg-m-danger' : f.severity === 'medium' ? 'bg-m-warning' : 'bg-m-text-tertiary'}`} />
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-m-text-primary">{f.title || f.message || 'Flag'}</Text>
                      {f.description ? (
                        <Text className="text-xs text-m-text-secondary mt-1" numberOfLines={2}>{f.description}</Text>
                      ) : null}
                      {f.severity ? (
                        <Text className="text-[10px] text-m-text-tertiary capitalize mt-1">{f.severity}</Text>
                      ) : null}
                    </View>
                    {f.resolved && (
                      <Text className="text-[10px] text-m-success">Resolved</Text>
                    )}
                  </View>
                </Card>
              ))
            ) : (
              <Text className="text-sm text-m-text-tertiary text-center py-8">No flags</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
