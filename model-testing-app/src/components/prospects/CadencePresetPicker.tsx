"use client";
// v1.2 stub — preset apply logic in v1.2.1
export function CadencePresetPicker({ current, onSelect }: { current: string; onSelect: (p: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {["light", "moderate", "aggressive", "custom"].map((p) => (
        <button key={p} onClick={() => onSelect(p)} style={{ padding: "4px 10px", fontSize: 11, border: "1px solid #e0e0e0", borderRadius: 4, background: p === current ? "#eab308" : "#ffffff", cursor: "pointer", textTransform: "capitalize" as const }}>{p}</button>
      ))}
    </div>
  );
}
