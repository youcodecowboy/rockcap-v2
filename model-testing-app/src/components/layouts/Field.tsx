"use client";

import { useState, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from "react";
import { useColors } from "@/lib/useColors";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// Label + control wrapper. Label is 9px mono-uppercase per canon.
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && (
        <label
          style={{
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: colors.text.muted,
            fontWeight: 500,
          }}
        >
          {label}
        </label>
      )}
      {children}
      {error ? (
        <span style={{ fontSize: 10, color: colors.accent.red }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: 10, color: colors.text.dim }}>{hint}</span>
      ) : null}
    </div>
  );
}

function controlStyle(colors: ReturnType<typeof useColors>, focused: boolean) {
  return {
    width: "100%",
    padding: "7px 10px",
    fontSize: 12,
    color: colors.text.primary,
    background: colors.bg.card,
    border: `1px solid ${focused ? colors.accent.blue : colors.border.default}`,
    borderRadius: 4,
    outline: "none",
    transition: "border-color 100ms linear",
  } as const;
}

export function Input(props: Omit<InputHTMLAttributes<HTMLInputElement>, "style">) {
  const colors = useColors();
  const [f, setF] = useState(false);
  return <input {...props} onFocus={(e) => { setF(true); props.onFocus?.(e); }} onBlur={(e) => { setF(false); props.onBlur?.(e); }} style={controlStyle(colors, f)} />;
}

export function Textarea(props: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "style">) {
  const colors = useColors();
  const [f, setF] = useState(false);
  return <textarea {...props} onFocus={(e) => { setF(true); props.onFocus?.(e); }} onBlur={(e) => { setF(false); props.onBlur?.(e); }} style={{ ...controlStyle(colors, f), resize: "vertical", minHeight: 72, fontFamily: "inherit" }} />;
}

export function Select(props: Omit<SelectHTMLAttributes<HTMLSelectElement>, "style"> & { children: ReactNode }) {
  const colors = useColors();
  const [f, setF] = useState(false);
  return <select {...props} onFocus={(e) => { setF(true); props.onFocus?.(e); }} onBlur={(e) => { setF(false); props.onBlur?.(e); }} style={{ ...controlStyle(colors, f), cursor: "pointer", appearance: "none" }} />;
}
