import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { ArrowLeft, Plus, FileText } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';

export default function NotesScreen() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const notes = useQuery(api.notes.getAll, isAuthenticated ? {} : 'skip');

  return (
    <View className="flex-1 bg-m-bg">
      <View className="bg-m-bg-brand pt-14 pb-4 px-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <ArrowLeft size={20} color={colors.textOnBrand} />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-m-text-on-brand">Notes</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/notes/editor')}
          className="w-8 h-8 rounded-full bg-white/10 items-center justify-center"
        >
          <Plus size={18} color={colors.textOnBrand} />
        </TouchableOpacity>
      </View>

      {!notes ? (
        <LoadingSpinner />
      ) : notes.length === 0 ? (
        <EmptyState icon={FileText} title="No notes" description="Tap + to create one" />
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => router.push({ pathname: '/notes/editor', params: { noteId: item._id } })}>
              <Card>
                <Text className="text-sm text-m-text-primary font-medium" numberOfLines={1}>
                  {typeof item.content === 'string' ? item.content.slice(0, 60) : 'Untitled note'}
                </Text>
                <Text className="text-xs text-m-text-tertiary mt-1">
                  {new Date(item._creationTime).toLocaleDateString('en-GB')}
                </Text>
              </Card>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: 16, gap: 8 }}
        />
      )}
    </View>
  );
}
