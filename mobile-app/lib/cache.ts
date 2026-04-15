import * as FileSystem from 'expo-file-system';

const CACHE_DIR = `${FileSystem.documentDirectory}cache/docs/`;

async function ensureCacheDir() {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

export async function getCachedFile(documentId: string, extension: string): Promise<string | null> {
  const path = `${CACHE_DIR}${documentId}.${extension}`;
  const info = await FileSystem.getInfoAsync(path);
  return info.exists ? path : null;
}

export async function cacheFile(documentId: string, extension: string, remoteUrl: string): Promise<string> {
  await ensureCacheDir();
  const localPath = `${CACHE_DIR}${documentId}.${extension}`;
  await FileSystem.downloadAsync(remoteUrl, localPath);
  return localPath;
}

export async function getCachedOrDownload(documentId: string, extension: string, remoteUrl: string): Promise<string> {
  const cached = await getCachedFile(documentId, extension);
  if (cached) return cached;
  return cacheFile(documentId, extension, remoteUrl);
}

export async function clearCache(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
  }
}
