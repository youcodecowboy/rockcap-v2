import type { BatchInfo } from '@/lib/bulkQueueProcessor';

// Module-level cache for passing File objects between pages.
// File objects can't be serialized into URLs, so we hold them here
// between the setup page and the [batchId] processing page.

let pendingProcessing: { files: File[]; batchInfo: BatchInfo } | null = null;

export function setPendingProcessing(data: { files: File[]; batchInfo: BatchInfo }) {
  pendingProcessing = data;
}

export function consumePendingProcessing() {
  const data = pendingProcessing;
  pendingProcessing = null;
  return data;
}
