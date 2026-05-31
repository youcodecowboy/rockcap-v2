"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { useColors } from "@/lib/useColors";

interface HubSpotLinkProps {
  url?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function HubSpotLink({ url, className, size = "md" }: HubSpotLinkProps) {
  const colors = useColors();
  const [hover, setHover] = useState(false);

  if (!url) {
    return null;
  }

  const px = size === "sm" ? 12 : size === "lg" ? 20 : 16;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title="View in HubSpot"
      aria-label="View in HubSpot"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        color: hover ? colors.accent.orange : colors.text.muted,
        transition: "color 100ms linear",
      }}
    >
      <ExternalLink size={px} />
    </a>
  );
}
