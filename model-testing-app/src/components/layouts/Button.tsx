"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useColors } from "@/lib/useColors";
import type { ColorPalette } from "@/lib/colors";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  variant?: Variant;
  size?: Size;
  /** Accent for the primary variant (defaults to the brand orange). */
  accent?: string;
  children: ReactNode;
}

function palette(variant: Variant, accent: string, colors: ColorPalette, hover: boolean) {
  switch (variant) {
    case "primary":
      return { bg: hover ? `${accent}e6` : accent, fg: "#ffffff", border: accent };
    case "danger":
      return { bg: hover ? `${colors.accent.red}e6` : colors.accent.red, fg: "#ffffff", border: colors.accent.red };
    case "secondary":
      return { bg: hover ? colors.bg.cardAlt : colors.bg.card, fg: colors.text.primary, border: colors.border.default };
    case "ghost":
      return { bg: hover ? colors.bg.cardAlt : "transparent", fg: colors.text.secondary, border: "transparent" };
  }
}

// Canon button — replaces shadcn <Button>. Sharp radius, hairline border,
// 100ms linear hover. Tones derive from useColors() (theme-aware).
export function Button({ variant = "secondary", size = "md", accent, children, disabled, ...rest }: ButtonProps) {
  const colors = useColors();
  const [hover, setHover] = useState(false);
  const p = palette(variant, accent ?? colors.accent.orange, colors, hover && !disabled);
  return (
    <button
      {...rest}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: size === "sm" ? "4px 10px" : "7px 14px",
        fontSize: size === "sm" ? 11 : 12,
        fontWeight: 500,
        lineHeight: 1.2,
        color: p.fg,
        background: p.bg,
        border: `1px solid ${p.border}`,
        borderRadius: 4,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 100ms linear, border-color 100ms linear",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

// Square icon-only button (toolbar / row actions).
export function IconButton({
  children,
  label,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style"> & { label: string; children: ReactNode }) {
  const colors = useColors();
  const [hover, setHover] = useState(false);
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        color: colors.text.muted,
        background: hover ? colors.bg.cardAlt : "transparent",
        border: `1px solid ${hover ? colors.border.default : "transparent"}`,
        borderRadius: 4,
        cursor: "pointer",
        transition: "background 100ms linear, border-color 100ms linear",
      }}
    >
      {children}
    </button>
  );
}
