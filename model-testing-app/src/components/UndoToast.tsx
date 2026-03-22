"use client";

import { toast } from "sonner";

interface UndoToastOptions {
  message: string;
  onUndo: () => void | Promise<void>;
  duration?: number;
}

export function showUndoToast({ message, onUndo, duration = 5000 }: UndoToastOptions) {
  toast(message, {
    duration,
    action: {
      label: "Undo",
      onClick: async () => {
        try {
          await onUndo();
          toast.success("Undone");
        } catch {
          toast.error("Failed to undo");
        }
      },
    },
  });
}
