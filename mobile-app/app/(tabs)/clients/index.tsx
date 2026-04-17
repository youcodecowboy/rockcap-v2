import { View, Text, FlatList, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { useState, useMemo } from 'react';
import { useQuery, useConvexAuth } from 'convex/react';
import { useRouter } from 'expo-router';
import { api } from '../../../../model-testing-app/convex/_generated/api';
import { Search, Building, Clock, Plus } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import MobileHeader from '@/components/MobileHeader';
import ClientListItem from '@/components/ClientListItem';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';

export default function ClientsScreen() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');
  const allProjects = useQuery(api.projects.list, isAuthenticated ? {} : 'skip');
  const clientDocCounts = useQuery(api.documents.getClientDocumentCounts, isAuthenticated ? {} : 'skip') as Record<string, number> | undefined;
  const [search, setSearch] = useState('');

  // Build project counts per client.
  //
  // Projects use `clientRoles: [{ clientId, role }]` (multi-client shape for
  // borrower/lender/developer roles) — NOT a flat `clientId`. A legacy
  // version of this screen read `p.clientId` directly, which is always
  // undefined, so every client card showed "0 projects". Count via clientRoles.
  const projectCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (allProjects) {
      for (const p of allProjects) {
        const roles = (p as any).clientRoles ?? [];
        const seen = new Set<string>();
        for (const r of roles) {
          if (r?.clientId && !seen.has(r.clientId)) {
            seen.add(r.clientId); // count each client once per project
            map[r.clientId] = (map[r.clientId] || 0) + 1;
          }
        }
      }
    }
    return map;
  }, [allProjects]);

  // Recent clients: last 3 by _creationTime (proxy for recently accessed)
  const recentClients = useMemo(() => {
    if (!clients || clients.length === 0) return [];
    return [...clients]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 3);
  }, [clients]);

  const filtered = useMemo(() => {
    if (!clients) return [];
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, search]);

  const isSearching = search.trim().length > 0;

  return (
    <View className="flex-1 bg-m-bg">
      <MobileHeader />
      <View className="px-4 py-2 bg-m-bg-card border-b border-m-border flex-row items-center gap-2">
        <View className="flex-1 bg-m-bg-subtle rounded-lg flex-row items-center px-3 py-2">
          <Search size={16} color={colors.textTertiary} />
          <TextInput
            placeholder="Search clients..."
            value={search}
            onChangeText={setSearch}
            className="flex-1 text-m-text text-sm ml-2"
            placeholderTextColor={colors.textTertiary}
          />
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/clients/new' as any)}
          className="w-9 h-9 rounded-full bg-m-text-primary items-center justify-center"
          accessibilityLabel="Create new client"
          hitSlop={8}
        >
          <Plus size={16} color="#ffffff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {!clients ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building}
          title={search ? 'No matching clients' : 'No clients yet'}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          ListHeaderComponent={
            !isSearching && recentClients.length > 0 ? (
              <View className="mb-4">
                <View className="flex-row items-center gap-2 mb-2">
                  <Clock size={14} color={colors.textTertiary} />
                  <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide">
                    Recent
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {recentClients.map((c) => (
                    <View key={c._id} style={{ width: 200 }}>
                      <ClientListItem
                        client={c}
                        projectCount={projectCountMap[c._id]}
                        docCount={clientDocCounts?.[c._id]}
                        compact
                      />
                    </View>
                  ))}
                </ScrollView>
                <View className="mt-4 mb-1">
                  <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide">
                    All Clients
                  </Text>
                </View>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <ClientListItem
              client={item}
              projectCount={projectCountMap[item._id] ?? 0}
              docCount={clientDocCounts?.[item._id] ?? 0}
            />
          )}
          contentContainerStyle={{ padding: 16, gap: 8 }}
        />
      )}
    </View>
  );
}
