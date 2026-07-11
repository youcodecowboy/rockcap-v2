'use client';

// Inline editing for the lender profile — the Lenders tab is an operating
// surface, not a report. Three editors, each writing through the system's
// canonical mutation so provenance/supersession semantics hold:
//   • FacilityStatusSelect  → facilities.operatorSetStatus (operator override,
//     any direction; pipeline stamps still only upgrade afterwards)
//   • AppetitePanelContent  → appetiteSignals.record with sourceType "manual"
//     (a new current signal that SUPERSEDES the prior — history preserved)
//   • PeoplePanelContent    → contacts.create / contacts.update

import { useMemo, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import {
  Button,
  IconButton,
  Field,
  Input,
  Select,
  Modal,
  EmptyState,
  StatusPill,
} from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';
import { Pencil, Plus, Check, X, Users, Landmark, Lock } from 'lucide-react';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// ── Facility status ─────────────────────────────────────────────────────

const FACILITY_STATUSES = ['indicative', 'live', 'repaid', 'defaulted'] as const;

function facilityStatusTone(status: string | undefined, colors: ColorPalette): string {
  switch ((status ?? '').toLowerCase()) {
    case 'live': return colors.accent.green;
    case 'indicative': return colors.accent.yellow;
    case 'repaid': return colors.accent.blue;
    case 'defaulted': return colors.accent.red;
    default: return colors.text.muted;
  }
}

/** Status pill that becomes a select on click; saves on change. */
export function FacilityStatusSelect({
  facilityId,
  status,
}: {
  facilityId: Id<'facilities'>;
  status?: string;
}) {
  const colors = useColors();
  const setStatus = useMutation(api.knowledge.facilities.operatorSetStatus);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        title="Change status"
        style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        {status ? (
          <StatusPill label={status} tone={facilityStatusTone(status, colors)} />
        ) : (
          <span style={{ fontSize: 11, color: colors.text.dim }}>set…</span>
        )}
      </button>
    );
  }

  return (
    <select
      autoFocus
      disabled={saving}
      defaultValue={status ?? ''}
      onBlur={() => setEditing(false)}
      onChange={async (e) => {
        const next = e.target.value;
        if (!next || next === status) { setEditing(false); return; }
        setSaving(true);
        try {
          await setStatus({ facilityId, status: next });
        } finally {
          setSaving(false);
          setEditing(false);
        }
      }}
      style={{
        fontFamily: MONO,
        fontSize: 10,
        padding: '2px 4px',
        borderRadius: 3,
        border: `1px solid ${colors.border.default}`,
        background: colors.bg.card,
        color: colors.text.primary,
        maxWidth: 96,
      }}
    >
      <option value="" disabled>status…</option>
      {FACILITY_STATUSES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

// ── Appetite ────────────────────────────────────────────────────────────

export interface AppetiteEntry {
  value: unknown;
  valueType: string;
  sourceType: string;
  asOfDate?: string;
  confidence?: number;
}

/** Standard fieldPaths from the appetite-signal catalogue (matching-critical
 * first) — offered as suggestions in the add-signal form; custom paths allowed. */
const STANDARD_FIELD_PATHS: Array<{ path: string; valueType: string }> = [
  { path: 'dealSize.min', valueType: 'currency' },
  { path: 'dealSize.max', valueType: 'currency' },
  { path: 'products.offered', valueType: 'array' },
  { path: 'propertyType.allowed', valueType: 'array' },
  { path: 'geography.regions', valueType: 'array' },
  { path: 'ltv.maximum', valueType: 'percentage' },
  { path: 'ltgdv.maximum', valueType: 'percentage' },
  { path: 'timeline.typicalWeeksToOffer', valueType: 'number' },
  { path: 'pricing.bridgingFrom', valueType: 'percentage' },
  { path: 'pricing.devFinanceFrom', valueType: 'percentage' },
  { path: 'fees.arrangement', valueType: 'percentage' },
  { path: 'appetite.summary', valueType: 'string' },
  { path: 'notes.bdm', valueType: 'string' },
];

const VALUE_TYPES = ['currency', 'percentage', 'number', 'string', 'array', 'boolean'];

/** Parse the edit-box text back into a typed value for the given valueType. */
function parseValue(raw: string, valueType: string): unknown {
  const t = raw.trim();
  switch (valueType) {
    case 'currency':
    case 'percentage':
    case 'number': {
      const n = Number(t.replace(/[£$€,%\s]/g, ''));
      if (!Number.isFinite(n)) throw new Error('Not a number');
      return n;
    }
    case 'array':
      return t.split(',').map((x) => x.trim()).filter(Boolean);
    case 'boolean':
      return t === 'true' || t === 'yes';
    default:
      return t;
  }
}

function editBoxText(entry: AppetiteEntry): string {
  if (Array.isArray(entry.value)) return (entry.value as unknown[]).join(', ');
  return entry.value == null ? '' : String(entry.value);
}

/** One appetite row: read view (formatted by the caller) with a hover pencil;
 * click → inline input typed by valueType; save records a superseding
 * "manual" signal. footprint.* rows are locked (auto-maintained by enrich). */
function AppetiteRow({
  lenderId,
  fieldPath,
  entry,
  label,
  display,
}: {
  lenderId: Id<'clients'>;
  fieldPath: string;
  entry: AppetiteEntry;
  label: string;
  display: string;
}) {
  const colors = useColors();
  const record = useMutation(api.appetiteSignals.record);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const locked = fieldPath.startsWith('footprint.');

  const save = async () => {
    setError(null);
    let value: unknown;
    try {
      value = parseValue(text, entry.valueType);
    } catch {
      setError('invalid');
      return;
    }
    setSaving(true);
    try {
      await record({
        lenderClientId: lenderId,
        fieldPath,
        value,
        valueType: entry.valueType as never,
        sourceType: 'manual' as never,
        confidence: 1,
        notes: 'Edited on the Lenders tab',
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: 11, color: colors.text.secondary, flexShrink: 0 }}>{label}</span>
        <input
          autoFocus
          value={text}
          disabled={saving}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder={entry.valueType === 'array' ? 'comma, separated' : entry.valueType}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 3,
            border: `1px solid ${error ? colors.accent.red : colors.accent.blue}`,
            background: colors.bg.card,
            color: colors.text.primary,
            outline: 'none',
          }}
        />
        <IconButton label="Save" onClick={save}>
          <Check className="w-3 h-3" />
        </IconButton>
        <IconButton label="Cancel" onClick={() => setEditing(false)}>
          <X className="w-3 h-3" />
        </IconButton>
      </div>
    );
  }

  return (
    <div
      className="flex items-baseline justify-between gap-3"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span style={{ fontSize: 11, color: colors.text.secondary }}>{label}</span>
      <span className="flex items-center gap-1.5 min-w-0">
        <span
          className="text-right truncate"
          style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}
          title={`${entry.sourceType}${entry.asOfDate ? ` · as of ${entry.asOfDate}` : ''}${entry.confidence != null ? ` · confidence ${entry.confidence}` : ''}`}
        >
          {display}
        </span>
        {locked ? (
          hover && (
            <Lock
              className="w-3 h-3 flex-shrink-0"
              style={{ color: colors.text.dim }}
              aria-label="Auto-maintained from the charges register"
            />
          )
        ) : (
          <button
            onClick={() => { setText(editBoxText(entry)); setEditing(true); }}
            title="Edit value"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: colors.text.dim,
              opacity: hover ? 1 : 0,
              transition: 'opacity 100ms linear',
            }}
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </span>
    </div>
  );
}

/** Editable "Stated appetite" panel body. `format` renders a value for display
 * (shared with the read-only formatting the profile already has). */
export function AppetitePanelContent({
  lenderId,
  groups,
  formatValue,
  formatLeaf,
}: {
  lenderId: Id<'clients'>;
  groups: Array<[string, Array<{ fieldPath: string; entry: AppetiteEntry }>]>;
  formatValue: (entry: AppetiteEntry) => string;
  formatLeaf: (fieldPath: string) => string;
}) {
  const colors = useColors();
  const record = useMutation(api.appetiteSignals.record);
  const [adding, setAdding] = useState(false);
  const [fieldPath, setFieldPath] = useState('');
  const [valueType, setValueType] = useState('string');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const knownType = useMemo(
    () => STANDARD_FIELD_PATHS.find((s) => s.path === fieldPath)?.valueType,
    [fieldPath],
  );

  const addSignal = async () => {
    setError(null);
    if (!fieldPath.trim()) { setError('fieldPath required'); return; }
    let value: unknown;
    const vt = knownType ?? valueType;
    try {
      value = parseValue(text, vt);
    } catch {
      setError('value does not parse as ' + vt);
      return;
    }
    setSaving(true);
    try {
      await record({
        lenderClientId: lenderId,
        fieldPath: fieldPath.trim(),
        value,
        valueType: vt as never,
        sourceType: 'manual' as never,
        confidence: 1,
        notes: 'Added on the Lenders tab',
      });
      setAdding(false);
      setFieldPath('');
      setText('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {groups.length === 0 && !adding && (
        <EmptyState
          icon={<Landmark className="w-8 h-8" />}
          title="No appetite signals yet"
          body="Add one below, or capture from lender packets, BDM meetings, and deal behaviour."
        />
      )}

      {groups.length > 0 && (
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {groups.map(([group, entries]) => (
            <div key={group}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: colors.text.muted,
                  marginBottom: 6,
                }}
              >
                {group}
              </div>
              <div className="space-y-1.5">
                {entries.map(({ fieldPath: fp, entry }) => (
                  <AppetiteRow
                    key={fp}
                    lenderId={lenderId}
                    fieldPath={fp}
                    entry={entry}
                    label={formatLeaf(fp)}
                    display={formatValue(entry)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div
          className="space-y-2 p-3"
          style={{ border: `1px dashed ${colors.border.mid}`, borderRadius: 4 }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Field label="Field path">
              <>
                <Input
                  list="appetite-field-paths"
                  placeholder="e.g. ltv.maximum"
                  value={fieldPath}
                  onChange={(e) => setFieldPath(e.target.value)}
                />
                <datalist id="appetite-field-paths">
                  {STANDARD_FIELD_PATHS.map((s) => (
                    <option key={s.path} value={s.path} />
                  ))}
                </datalist>
              </>
            </Field>
            <Field label="Type" hint={knownType ? `standard path — ${knownType}` : undefined}>
              <Select
                value={knownType ?? valueType}
                disabled={!!knownType}
                onChange={(e) => setValueType(e.target.value)}
              >
                {VALUE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Value" error={error ?? undefined} hint="arrays: comma separated · percentages as stored (0.7 = 70%)">
            <Input value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <div className="flex items-center gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={saving} onClick={addSignal}>
              <Check className="w-3.5 h-3.5" />
              Record signal
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
          <Plus className="w-3.5 h-3.5" />
          Add signal
        </Button>
      )}
    </div>
  );
}

// ── People ──────────────────────────────────────────────────────────────

export interface LenderContact {
  _id: string;
  name: string;
  role?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
}

/** Editable People panel body: contact rows with a hover pencil opening an
 * edit modal, plus an add-person modal. Writes via contacts.create/update. */
export function PeoplePanelContent({
  lenderId,
  lenderName,
  contacts,
}: {
  lenderId: Id<'clients'>;
  lenderName: string;
  contacts: LenderContact[];
}) {
  const colors = useColors();
  const createContact = useMutation(api.contacts.create);
  const updateContact = useMutation(api.contacts.update);
  const [editTarget, setEditTarget] = useState<LenderContact | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', role: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const openFor = (c: LenderContact | 'new') => {
    setEditTarget(c);
    setForm(
      c === 'new'
        ? { name: '', role: '', email: '', phone: '' }
        : { name: c.name, role: c.role ?? c.jobTitle ?? '', email: c.email ?? '', phone: c.phone ?? '' },
    );
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editTarget === 'new') {
        await createContact({
          name: form.name.trim(),
          role: form.role.trim() || undefined,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          company: lenderName,
          clientId: lenderId,
          notes: 'Added on the Lenders tab',
        });
      } else if (editTarget) {
        await updateContact({
          id: editTarget._id as Id<'contacts'>,
          name: form.name.trim(),
          role: form.role.trim() || undefined,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
        });
      }
      setEditTarget(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {contacts.length === 0 ? (
        <div style={{ fontSize: 11, color: colors.text.muted }}>No contacts linked yet.</div>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => (
            <div
              key={c._id}
              className="flex items-start gap-2"
              onMouseEnter={() => setHoverId(c._id)}
              onMouseLeave={() => setHoverId(null)}
            >
              <Users className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: colors.entityTypes.contact }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                    {c.name}
                  </span>
                  <button
                    onClick={() => openFor(c)}
                    title="Edit person"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: colors.text.dim,
                      opacity: hoverId === c._id ? 1 : 0,
                      transition: 'opacity 100ms linear',
                    }}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
                {(c.jobTitle || c.role) && (
                  <div style={{ fontSize: 10, color: colors.text.muted }}>
                    {c.jobTitle || c.role}
                  </div>
                )}
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="hover:underline"
                    style={{ fontSize: 10, color: colors.accent.blue }}
                  >
                    {c.email}
                  </a>
                )}
                {c.phone && (
                  <div style={{ fontSize: 10, color: colors.text.muted }}>{c.phone}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3">
        <Button variant="ghost" size="sm" onClick={() => openFor('new')}>
          <Plus className="w-3.5 h-3.5" />
          Add person
        </Button>
      </div>

      <Modal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={editTarget === 'new' ? 'Add person' : 'Edit person'}
        footer={
          <div className="flex items-center gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={saving || !form.name.trim()} onClick={save}>
              <Check className="w-3.5 h-3.5" />
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Role">
            <Input placeholder="e.g. BDM, Director" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}
