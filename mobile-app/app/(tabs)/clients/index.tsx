import { View, Text, FlatList, TextInput } from 'react-native';
import { useState, useMemo } from 'react';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../../model-testing-app/convex/_generated/api';
import { Search, Building } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import ClientListItem from '@/components/ClientListItem';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';

export default function ClientsScreen() {
  const { isAuthenticated } = useConvexAuth();
  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!clients) return [];
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, search]);

  return (
    <View className="flex-1 bg-m-bg">
      <View className="bg-m-bg-brand pt-14 pb-4 px-4">
        <Text className="text-xl font-bold text-m-text-on-brand mb-3">Clients</Text>
        <View className="bg-white/10 rounded-lg flex-row items-center px-3 py-2">
          <Search size={16} color="rgba(255,255,255,0.5)" />
          <TextInput
            placeholder="Search clients..."
            value={search}
            onChangeText={setSearch}
            className="flex-1 text-m-text-on-brand text-sm ml-2"
            placeholderTextColor="rgba(255,255,255,0.4)"
          />
        </View>
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
          renderItem={({ item }) => <ClientListItem client={item} />}
          contentContainerStyle={{ padding: 16, gap: 8 }}
        />
      )}
    </View>
  );
}
