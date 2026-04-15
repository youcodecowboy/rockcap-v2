import {
  View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { ArrowLeft, Plus, CheckCircle2 } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import TaskListItem from '@/components/TaskListItem';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';

export default function TasksScreen() {
  const router = useRouter();
  const { create } = useLocalSearchParams();
  const { isAuthenticated } = useConvexAuth();
  const [showCreate, setShowCreate] = useState(create === 'true');
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const tasks = useQuery(api.tasks.getByUser, isAuthenticated ? {} : 'skip');
  const createTask = useMutation(api.tasks.create);
  const completeTask = useMutation(api.tasks.complete);

  const handleCreate = async () => {
    if (!newTaskTitle.trim()) return;
    try {
      await createTask({ title: newTaskTitle.trim() } as any);
      setNewTaskTitle('');
      setShowCreate(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to create task');
    }
  };

  const handleComplete = async (taskId: string) => {
    try {
      await completeTask({ id: taskId } as any);
    } catch (error) {
      Alert.alert('Error', 'Failed to complete task');
    }
  };

  const activeTasks = tasks?.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  const completedTasks = tasks?.filter((t) => t.status === 'completed');

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-m-bg">
      <View className="bg-m-bg-brand pt-14 pb-4 px-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <ArrowLeft size={20} color={colors.textOnBrand} />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-m-text-on-brand">Tasks</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowCreate(true)}
          className="w-8 h-8 rounded-full bg-white/10 items-center justify-center"
        >
          <Plus size={18} color={colors.textOnBrand} />
        </TouchableOpacity>
      </View>

      {showCreate && (
        <View className="px-4 py-3 bg-m-bg-card border-b border-m-border flex-row items-center gap-2">
          <TextInput
            placeholder="What needs to be done?"
            value={newTaskTitle}
            onChangeText={setNewTaskTitle}
            autoFocus
            onSubmitEditing={handleCreate}
            returnKeyType="done"
            className="flex-1 bg-m-bg-subtle rounded-lg px-3 py-2.5 text-sm text-m-text-primary"
            placeholderTextColor={colors.textPlaceholder}
          />
          <TouchableOpacity
            onPress={handleCreate}
            disabled={!newTaskTitle.trim()}
            className="bg-m-accent rounded-lg px-4 py-2.5"
            style={{ opacity: newTaskTitle.trim() ? 1 : 0.3 }}
          >
            <Text className="text-m-text-on-brand text-sm font-medium">Add</Text>
          </TouchableOpacity>
        </View>
      )}

      {!tasks ? (
        <LoadingSpinner />
      ) : activeTasks?.length === 0 && completedTasks?.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No tasks" description="Tap + to create one" />
      ) : (
        <FlatList
          data={[...(activeTasks || []), ...(completedTasks?.slice(0, 5) || [])]}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => <TaskListItem task={item} onComplete={handleComplete} />}
          contentContainerStyle={{ padding: 16, gap: 8 }}
        />
      )}
    </KeyboardAvoidingView>
  );
}
