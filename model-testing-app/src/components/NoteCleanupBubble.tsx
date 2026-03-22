"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NoteCleanupBubbleProps {
  containerRef: React.RefObject<HTMLElement | null>;
  onCleanup: (selectedText: string, range: Range) => Promise<void>;
}

export default function NoteCleanupBubble({ containerRef, onCleanup }: NoteCleanupBubbleProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<Range | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (
        !selection ||
        selection.isCollapsed ||
        !selection.rangeCount ||
        !container.contains(selection.anchorNode)
      ) {
        if (!isLoading) setPosition(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const text = selection.toString().trim();
      if (text.length < 5) {
        if (!isLoading) setPosition(null);
        return;
      }

      rangeRef.current = range.cloneRange();
      const rect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      setPosition({
        top: rect.top - containerRect.top - 40,
        left: rect.left - containerRect.left + rect.width / 2,
      });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [containerRef, isLoading]);

  if (!position) return null;

  const handleClick = async () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || !rangeRef.current) return;

    setIsLoading(true);
    try {
      await onCleanup(text, rangeRef.current);
    } finally {
      setIsLoading(false);
      setPosition(null);
    }
  };

  return (
    <div
      ref={bubbleRef}
      className="absolute z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-1 duration-150"
      style={{ top: position.top, left: position.left }}
    >
      <Button
        size="sm"
        variant="secondary"
        className="shadow-lg text-xs gap-1.5 h-7 px-2.5"
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Sparkles className="w-3 h-3" />
        )}
        Clean up
      </Button>
    </div>
  );
}
