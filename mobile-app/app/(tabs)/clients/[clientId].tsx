import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../../model-testing-app/convex/_generated/api';
import { ArrowLeft } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const TABS = ['Overview', 'Docs', 'Notes', 'Tasks', 'Projects', 'Intelligence'] as const;
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

        {activeTab === 'Intelligence' && (
          <Card>
            <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-3">Client Intelligence</Text>
            {intelligence ? (
              <Text className="text-sm text-m-text-secondary leading-5">
                {typeof intelligence.overview === 'string' ? intelligence.overview : JSON.stringify(intelligence.overview, null, 2)}
              </Text>
            ) : (
              <Text className="text-sm text-m-text-tertiary">No intelligence available</Text>
            )}
          </Card>
        )}

        {activeTab === 'Tasks' && (
          <View className="gap-2">
            {tasks && tasks.length > 0 ? (
              tasks.map((t) => (
                <Card key={t._id}>
                  <Text className="text-sm text-m-text-primary">{t.title}</Text>
                  {t.dueDate ? (
                    <Text className="text-xs text-m-text-tertiary mt-1">Due: {new Date(t.dueDate).toLocaleDateString('en-GB')}</Text>
                  ) : null}
                </Card>
              ))
            ) : (
              <Text className="text-sm text-m-text-tertiary text-center py-8">No tasks</Text>
            )}
          </View>
        )}

        {activeTab === 'Notes' && (
          <View className="gap-2">
            {notes && notes.length > 0 ? (
              notes.map((n) => (
                <Card key={n._id}>
                  <Text className="text-sm text-m-text-secondary" numberOfLines={3}>
                    {typeof n.content === 'string' ? n.content : 'Note'}
                  </Text>
                </Card>
              ))
            ) : (
              <Text className="text-sm text-m-text-tertiary text-center py-8">No notes</Text>
            )}
          </View>
        )}

        {activeTab === 'Docs' && (
          <Text className="text-sm text-m-text-tertiary text-center py-8">Navigate to Docs tab to browse documents</Text>
        )}

        {activeTab === 'Projects' && (
          <View className="gap-2">
            {projects && projects.length > 0 ? (
              projects.map((p) => (
                <Card key={p._id}>
                  <Text className="text-sm font-medium text-m-text-primary">{p.name}</Text>
                  {p.status ? <Text className="text-xs text-m-text-tertiary mt-1 capitalize">{p.status}</Text> : null}
                  {p.description ? <Text className="text-sm text-m-text-secondary mt-2" numberOfLines={2}>{p.description}</Text> : null}
                </Card>
              ))
            ) : (
              <Text className="text-sm text-m-text-tertiary text-center py-8">No projects</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
