"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { Modal, Button, Field, Input, Textarea } from "@/components/layouts";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function fmtGBP(n: number): string {
  if (n >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(2)}bn`;
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${Math.round(n)}`;
}

// Operator-entered deal value for a prospect. The pipeline-value metric sums ONLY
// this; it is never guessed from the AI dealSizeRange estimate (shown as a dim
// hint to help the operator, not as the number). Entered in £m for convenience.
export function DealValueControl({
  clientId,
  valueGBP,
  note,
  aiEstimate,
}: {
  clientId: string;
  valueGBP?: number | null;
  note?: string | null;
  aiEstimate?: string | null;
}) {
  const colors = useColors();
  const setDealValue = useMutation(api.prospectStages.setDealValue as any);
  const [open, setOpen] = useState(false);
  const [mn, setMn] = useState("");
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMn(typeof valueGBP === "number" && valueGBP > 0 ? String(valueGBP / 1_000_000) : "");
    setNoteText(note ?? "");
  }, [open, valueGBP, note]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const parsed = parseFloat(mn);
      const gbp = isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1_000_000) : null;
      await setDealValue({ clientId, valueGBP: gbp, note: noteText.trim() || undefined });
      setOpen(false);
    } catch (err) {
      console.error("Failed to set deal value", err);
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await setDealValue({ clientId, valueGBP: null });
      setOpen(false);
    } catch (err) {
      console.error("Failed to clear deal value", err);
    } finally {
      setSaving(false);
    }
  };

  const hasValue = typeof valueGBP === "number" && valueGBP > 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={note || (hasValue ? "Deal value" : "Set the deal value")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          fontSize: 12,
          borderRadius: 6,
          border: `1px solid ${hasValue ? `${colors.accent.green}55` : colors.border.default}`,
          background: hasValue ? `${colors.accent.green}12` : colors.bg.card,
          color: hasValue ? colors.text.primary : colors.text.muted,
          cursor: "pointer",
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.text.muted }}>
          Deal value
        </span>
        <span style={{ fontWeight: 500, color: hasValue ? colors.accent.green : colors.text.dim }}>
          {hasValue ? fmtGBP(valueGBP as number) : "— set"}
        </span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Deal value"
        width={420}
        footer={
          <>
            {hasValue && (
              <Button size="sm" variant="ghost" onClick={clear} disabled={saving}>Clear</Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 11, color: colors.text.muted, margin: 0 }}>
            Your figure for this deal — this is the only number the pipeline-value total sums. Leave blank to mark it un-priced.
          </p>
          <Field label="Deal value · £m" hint="e.g. 7.5 for £7.5m">
            <Input
              type="number"
              min={0}
              step={0.1}
              inputMode="decimal"
              value={mn}
              onChange={(e) => setMn(e.target.value)}
              placeholder="—"
              style={{ fontFamily: MONO, maxWidth: 160 }}
            />
          </Field>
          <Field label="Basis / note" hint="Optional — where the figure came from">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="e.g. £7.5m senior facility, confirmed on call 14 Jun"
              style={{ minHeight: 56 }}
            />
          </Field>
          {aiEstimate && (
            <div style={{ fontSize: 10, color: colors.text.dim, fontFamily: MONO }}>
              AI estimate (not counted): {aiEstimate}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
