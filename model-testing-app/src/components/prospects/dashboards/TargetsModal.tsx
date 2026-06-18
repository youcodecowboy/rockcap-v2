"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { Modal, Button, Field, Input } from "@/components/layouts";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

type Targets = {
  weeklyReachOut: number;
  weeklyFollowUp: number;
  monthlyMeetings: number;
  monthlyTermsRequested: number;
  isDefault: boolean;
  updatedAt: string | null;
};

const FIELDS: { key: keyof Targets; label: string; hint: string }[] = [
  { key: "weeklyReachOut", label: "Reach-outs / week", hint: "New cold prospects to start each week" },
  { key: "weeklyFollowUp", label: "Follow-ups / week", hint: "Follow-up touches to send each week" },
  { key: "monthlyMeetings", label: "Meetings / month", hint: "Meetings to hold each month" },
  { key: "monthlyTermsRequested", label: "Terms requested / month", hint: "Terms to request each month (qualified)" },
];

// The targets edit modal — reads the singleton, lets the operator set the house
// weekly/monthly KPI targets the dashboards measure against. Self-contained:
// renders its own trigger button.
export function EditTargetsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Edit targets</Button>
      <TargetsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function TargetsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const colors = useColors();
  const stored = useQuery(api.prospectStages.getTargets, open ? {} : "skip") as Targets | undefined;
  const updateTargets = useMutation(api.prospectStages.updateTargets as any);

  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Seed the form from the stored targets each time the modal opens / loads.
  useEffect(() => {
    if (!open || !stored) return;
    setValues({
      weeklyReachOut: String(stored.weeklyReachOut),
      weeklyFollowUp: String(stored.weeklyFollowUp),
      monthlyMeetings: String(stored.monthlyMeetings),
      monthlyTermsRequested: String(stored.monthlyTermsRequested),
    });
  }, [open, stored]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateTargets({
        weeklyReachOut: Number(values.weeklyReachOut) || 0,
        weeklyFollowUp: Number(values.weeklyFollowUp) || 0,
        monthlyMeetings: Number(values.monthlyMeetings) || 0,
        monthlyTermsRequested: Number(values.monthlyTermsRequested) || 0,
      });
      onClose();
    } catch (err) {
      console.error("Failed to save targets", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pipeline targets"
      width={440}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !stored}>
            {saving ? "Saving…" : "Save targets"}
          </Button>
        </>
      }
    >
      {!stored ? (
        <div style={{ fontSize: 12, color: colors.text.muted, padding: "8px 0" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 11, color: colors.text.muted, margin: 0 }}>
            House targets the &quot;out of N&quot; KPIs measure against. They apply across the whole pipeline.
          </p>
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <Input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                style={{ fontFamily: MONO, maxWidth: 120 }}
              />
            </Field>
          ))}
          <div style={{ fontSize: 10, color: colors.text.dim, fontFamily: MONO }}>
            {stored.isDefault
              ? "Currently using defaults"
              : stored.updatedAt
                ? `Last updated ${String(stored.updatedAt).slice(0, 10)}`
                : ""}
          </div>
        </div>
      )}
    </Modal>
  );
}
