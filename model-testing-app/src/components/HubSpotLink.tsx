"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface HubSpotLinkProps {
  url?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function HubSpotLink({ url, className, size = "md" }: HubSpotLinkProps) {
  if (!url) {
    return null;
  }

  const sizeClasses = {
    sm: "size-3",
    md: "size-4",
    lg: "size-5",
  };

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center text-muted-foreground hover:text-primary transition-colors",
        className
      )}
      title="View in HubSpot"
      aria-label="View in HubSpot"
    >
      <ExternalLink className={sizeClasses[size]} />
    </a>
  );
}

