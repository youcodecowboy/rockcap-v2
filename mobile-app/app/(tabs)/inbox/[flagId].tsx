import {
  View, Text, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../../model-testing-app/convex/_generated/api';
import { ArrowLeft, Send, CheckCircle2 } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function FlagDetailScreen() {
  const { flagId } = useLocalSearchParams<{ flagId: string }>();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [replyText, setReplyText] = useState('');

  const flag = useQuery(api.flags.get, isAuthenticated && flagId ? { id: flagId as any } : 'skip');
  const thread = useQuery(api.flags.getThread, isAuthenticated && flagId ? { flagId: flagId as any } : 'skip');

  const replyToFlag = useMutation(api.flags.reply);
  const resolveFlag = useMutation(api.flags.resolve);

  const handleReply = async () => {
    if (!replyText.trim() || !flagId) return;
    try {
      await replyToFlag({ flagId: flagId as any, content: replyText.trim() } as any);
      setReplyText('');
    } catch (error) {
      Alert.alert('Error', 'Failed to send reply');
    }
  };

  const handleResolve = async () => {
    if (!flagId) return;
    try {
      await resolveFlag({ id: flagId as any } as any);
      Alert.alert('Resolved', 'Flag has been resolved.');
    } catch (error) {
      Alert.alert('Error', 'Failed to resolve flag');
    }
  };

  if (!flag) return <LoadingSpinner message="Loading flag..." />;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-m-bg">
      <View className="bg-m-bg-brand pt-14 pb-4 px-4 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <ArrowLeft size={20} color={colors.textOnBrand} />
          </TouchableOpacity>
          <Text className="text-base font-medium text-m-text-on-brand flex-1" numberOfLines={1}>{flag.title}</Text>
        </View>
        {flag.status === 'open' && (
          <TouchableOpacity
            onPress={handleResolve}
            className="ml-2 flex-row items-center gap-1 bg-white/10 rounded-full px-3 py-1.5"
          >
            <CheckCircle2 size={14} color={colors.textOnBrand} />
            <Text className="text-m-text-on-brand text-xs font-medium">Resolve</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView className="flex-1 px-4 pt-3" contentContainerStyle={{ paddingBottom: 16, gap: 8 }}>
        {thread?.map((entry) => (
          <Card key={entry._id}>
            <Text className="text-xs text-m-text-tertiary mb-1">
              {new Date(entry._creationTime).toLocaleString('en-GB')}
            </Text>
            <Text className="text-sm text-m-text-secondary">{entry.content}</Text>
          </Card>
        ))}
      </ScrollView>

      {flag.status === 'open' && (
        <View className="px-4 py-3 border-t border-m-border bg-m-bg-card flex-row items-center gap-2">
          <TextInput
            placeholder="Write a reply..."
            value={replyText}
            onChangeText={setReplyText}
            multiline
            className="flex-1 bg-m-bg-subtle rounded-lg px-3 py-2.5 text-sm text-m-text-primary max-h-24"
            placeholderTextColor={colors.textPlaceholder}
          />
          <TouchableOpacity onPress={handleReply} disabled={!replyText.trim()} style={{ opacity: replyText.trim() ? 1 : 0.3 }}>
            <Send size={20} color={colors.accent} />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
