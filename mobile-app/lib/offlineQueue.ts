import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'rockcap:pendingMutations';

export interface PendingMutation {
  id: string;
  mutation: string;
  args: Record<string, any>;
  createdAt: number;
  status: 'pending' | 'syncing' | 'failed';
}

export async function getQueue(): Promise<PendingMutation[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function addToQueue(mutation: string, args: Record<string, any>): Promise<void> {
  const queue = await getQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    mutation,
    args,
    createdAt: Date.now(),
    status: 'pending',
  });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter((item) => item.id !== id);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
