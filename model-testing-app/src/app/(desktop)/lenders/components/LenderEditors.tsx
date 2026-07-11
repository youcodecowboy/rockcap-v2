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
import { useQuery } from 'convex/react';
import {
  Button,
  IconButton,
  Field,
  Input,
  Select,
  Textarea,
  Modal,
  EmptyState,
  StatusPill,
} from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';
import { Pencil, Plus, Check, X, Users, Landmark, Lock, Info, Activity as ActivityIcon, StickyNote, Briefcase } from 'lucide-react';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// ── Shared bits ─────────────────────────────────────────────────────────

/** Compact relative time: "3m ago", "2h ago", "5d ago", else a date. */
export function relTime(input: number | string | undefined): string {
  if (input == null) return '';
  const t = typeof input === 'number' ? input : Date.parse(input);
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 45) return `${d}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

export interface ProvenanceSource {
  label: string;
  documentId?: string;
}

/** The provenance dot — a small ⓘ that opens a styled hover card saying where
 * a value came from, with clickable source documents (native title tooltips
 * were too slow/invisible to read as an affordance). */
export function ProvenanceDot({
  lines,
  sources = [],
  manual,
  onOpenDocument,
}: {
  lines: string[];
  sources?: ProvenanceSource[];
  manual?: boolean;
  onOpenDocument?: (documentId: string) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Info
        className="w-3 h-3"
        style={{ color: manual ? colors.accent.orange : colors.text.dim, cursor: 'help' }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: -8,
            marginBottom: 6,
            width: 280,
            zIndex: 40,
            background: colors.bg.card,
            border: `1px solid ${colors.border.mid}`,
            borderRadius: 4,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            padding: '10px 12px',
            textAlign: 'left',
          }}
        >
          {manual && (
            <div style={{ marginBottom: 6 }}>
              <StatusPill label="manually added" tone={colors.accent.orange} />
            </div>
          )}
          <div className="space-y-1">
            {lines.map((l, i) => (
              <div key={i} style={{ fontSize: 10.5, color: colors.text.secondary, lineHeight: 1.45 }}>
                {l}
              </div>
            ))}
          </div>
          {sources.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.border.default}` }}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 8.5,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: colors.text.muted,
                  marginBottom: 4,
                }}
              >
                Source documents
              </div>
              <div className="space-y-1">
                {sources.map((src, i) =>
                  src.documentId && onOpenDocument ? (
                    <button
                      key={i}
                      onClick={() => { setOpen(false); onOpenDocument(src.documentId!); }}
                      className="block text-left hover:underline"
                      style={{
                        fontSize: 10.5,
                        color: colors.accent.blue,
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={src.label}
                    >
                      {src.label}
                    </button>
                  ) : (
                    <div key={i} style={{ fontSize: 10.5, color: colors.text.secondary }}>
                      {src.label}
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

/** Inline-editable facility term cell (amount / rate / maturity). Click the
 * value → typed input → Enter/blur saves via facilities.operatorUpdateTerms.
 * On pipeline rows the value holds until newer document evidence arrives. */
export function EditableTermCell({
  facilityId,
  field,
  value,
  display,
}: {
  facilityId: Id<'facilities'>;
  field: 'amountGBP' | 'interestRate' | 'maturityDate';
  value: number | string | null | undefined;
  display: string;
}) {
  const colors = useColors();
  const updateTerms = useMutation(api.knowledge.facilities.operatorUpdateTerms);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const save = async () => {
    const t = text.trim();
    if (!t) { setEditing(false); return; }
    let patch: { amountGBP?: number; interestRate?: number; maturityDate?: string };
    if (field === 'maturityDate') {
      patch = { maturityDate: t };
    } else {
      const n = Number(t.replace(/[£$€,%\s]/g, ''));
      if (!Number.isFinite(n)) { setInvalid(true); return; }
      patch = field === 'amountGBP' ? { amountGBP: n } : { interestRate: n };
    }
    setSaving(true);
    try {
      await updateTerms({ facilityId, ...patch });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        type={field === 'maturityDate' ? 'date' : 'text'}
        value={text}
        disabled={saving}
        onChange={(e) => { setInvalid(false); setText(e.target.value); }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
        style={{
          width: field === 'maturityDate' ? 120 : 84,
          fontFamily: MONO,
          fontSize: 10.5,
          padding: '2px 4px',
          borderRadius: 3,
          border: `1px solid ${invalid ? colors.accent.red : colors.accent.blue}`,
          background: colors.bg.card,
          color: colors.text.primary,
          outline: 'none',
        }}
      />
    );
  }

  return (
    <button
      onClick={() => {
        setText(
          field === 'maturityDate'
            ? String(value ?? '')
            : value == null ? '' : String(value),
        );
        setEditing(true);
      }}
      title="Click to edit"
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        color: display === '—' ? colors.text.dim : 'inherit',
        borderBottom: '1px dashed transparent',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = colors.border.mid; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = 'transparent'; }}
    >
      {display}
    </button>
  );
}

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
  sourceRef?: string;
  sourceLabel?: string;
  sourceDocumentId?: string;
  notes?: string;
  recordedAt?: number;
}

/** Structured hover-card lines for an appetite signal's provenance dot. */
export function appetiteProvenanceLines(entry: AppetiteEntry): string[] {
  const lines = [`source: ${entry.sourceType}${entry.sourceLabel && !entry.sourceDocumentId ? ` — ${entry.sourceLabel}` : ''}`];
  if (entry.asOfDate) lines.push(`as of ${entry.asOfDate}`);
  if (entry.recordedAt) lines.push(`recorded ${relTime(entry.recordedAt)}`);
  if (entry.confidence != null) lines.push(`confidence ${entry.confidence}`);
  if (entry.notes) lines.push(entry.notes);
  return lines;
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
  onOpenDocument,
}: {
  lenderId: Id<'clients'>;
  fieldPath: string;
  entry: AppetiteEntry;
  label: string;
  display: string;
  onOpenDocument?: (documentId: string) => void;
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
        >
          {display}
        </span>
        <ProvenanceDot
          lines={appetiteProvenanceLines(entry)}
          sources={entry.sourceDocumentId ? [{ label: entry.sourceLabel ?? 'source document', documentId: entry.sourceDocumentId }] : []}
          manual={entry.sourceType === 'manual'}
          onOpenDocument={onOpenDocument}
        />
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
  onOpenDocument,
}: {
  lenderId: Id<'clients'>;
  groups: Array<[string, Array<{ fieldPath: string; entry: AppetiteEntry }>]>;
  formatValue: (entry: AppetiteEntry) => string;
  formatLeaf: (fieldPath: string) => string;
  onOpenDocument?: (documentId: string) => void;
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
                    onOpenDocument={onOpenDocument}
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

// ── Add facility (manual) ───────────────────────────────────────────────

/** "Add facility" affordance for the facility-book panel. Operator-created
 * rows are flagged createdFrom: "operator" and surface as manually added. */
export function AddFacilityButton({ lenderId }: { lenderId: Id<'clients'> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    projectId: '',
    tranche: '',
    amount: '',
    rate: '',
    maturity: '',
    status: 'indicative',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const projects = useQuery(api.projects.list, open ? {} : 'skip');
  const createFacility = useMutation(api.knowledge.facilities.operatorCreate);

  const sortedProjects = useMemo(
    () =>
      [...(projects ?? [])].sort((a: { name: string }, b: { name: string }) =>
        a.name.localeCompare(b.name),
      ),
    [projects],
  );

  const save = async () => {
    setError(null);
    if (!form.projectId) { setError('Pick a project'); return; }
    const amount = form.amount.trim() ? Number(form.amount.replace(/[£,\s]/g, '')) : undefined;
    const rate = form.rate.trim() ? Number(form.rate.replace(/[%\s]/g, '')) : undefined;
    if (form.amount.trim() && !Number.isFinite(amount)) { setError('Amount is not a number'); return; }
    if (form.rate.trim() && !Number.isFinite(rate)) { setError('Rate is not a number'); return; }
    setSaving(true);
    try {
      const res = await createFacility({
        lenderClientId: lenderId,
        projectId: form.projectId as Id<'projects'>,
        tranche: form.tranche || undefined,
        amountGBP: amount,
        interestRate: rate,
        maturityDate: form.maturity || undefined,
        status: form.status || undefined,
      });
      if (res && 'error' in res && res.error === 'facility_exists') {
        setError('A facility for this project + tranche already exists on this lender.');
        return;
      }
      setOpen(false);
      setForm({ projectId: '', tranche: '', amount: '', rate: '', maturity: '', status: 'indicative' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-3.5 h-3.5" />
        Add facility
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add facility (manual)"
        footer={
          <div className="flex items-center gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={saving} onClick={save}>
              <Check className="w-3.5 h-3.5" />
              Add facility
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Project" error={error ?? undefined}>
            <Select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">Select a project…</option>
              {sortedProjects.map((p: { _id: string; name: string }) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tranche">
              <Select value={form.tranche} onChange={(e) => setForm({ ...form, tranche: e.target.value })}>
                <option value="">single (whole facility)</option>
                <option value="senior">senior</option>
                <option value="mezzanine">mezzanine</option>
                <option value="bridge">bridge</option>
                <option value="equity">equity</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="indicative">indicative</option>
                <option value="live">live</option>
                <option value="repaid">repaid</option>
                <option value="defaulted">defaulted</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Amount (GBP)">
              <Input placeholder="6500000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Rate (%)">
              <Input placeholder="9.5" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
            </Field>
            <Field label="Maturity">
              <Input type="date" value={form.maturity} onChange={(e) => setForm({ ...form, maturity: e.target.value })} />
            </Field>
          </div>
          <div style={{ fontSize: 10, opacity: 0.7 }}>
            Manually added facilities are flagged as such — document-sourced ones cite their source documents.
          </div>
        </div>
      </Modal>
    </>
  );
}

// ── Notes ───────────────────────────────────────────────────────────────

/** Plain-text preview from a TipTap doc (notes.content) — walks text nodes. */
function tipTapText(content: unknown, cap = 180): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as { text?: string; content?: unknown[] };
    if (typeof n.text === 'string') parts.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(content);
  const s = parts.join(' ').trim();
  return s.length > cap ? `${s.slice(0, cap - 1)}…` : s;
}

/** Notes panel body: quick-add textarea + recent notes. Writes through the
 * markdown lane, so lender notes atomize into the knowledge graph too. */
export function NotesPanelContent({ lenderId }: { lenderId: Id<'clients'> }) {
  const colors = useColors();
  const notes = useQuery(api.notes.getByClient, { clientId: lenderId });
  const createNote = useMutation(api.notes.createFromMarkdown);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const body = text.trim();
    if (!body) return;
    setSaving(true);
    try {
      const firstLine = body.split('\n')[0];
      await createNote({
        title: firstLine.length > 60 ? `${firstLine.slice(0, 59)}…` : firstLine,
        markdown: body,
        clientId: lenderId,
        tags: ['lender'],
      });
      setText('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Textarea
          rows={2}
          placeholder="Jot a note on this lender…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {text.trim() && (
          <div className="flex justify-end">
            <Button variant="primary" size="sm" disabled={saving} onClick={save}>
              <Check className="w-3.5 h-3.5" />
              Save note
            </Button>
          </div>
        )}
      </div>

      {(notes ?? []).length === 0 ? (
        <div style={{ fontSize: 11, color: colors.text.muted }}>No notes yet.</div>
      ) : (
        <div className="space-y-2">
          {(notes ?? []).slice(0, 5).map((n) => (
            <div key={n._id} className="flex items-start gap-2">
              <StickyNote className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: colors.accent.yellow }} />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                    {n.title}
                  </span>
                  <span style={{ fontSize: 9, color: colors.text.dim, fontFamily: MONO }}>
                    {relTime(n._creationTime)}
                  </span>
                </div>
                {tipTapText(n.content) && tipTapText(n.content) !== n.title && (
                  <div style={{ fontSize: 10, color: colors.text.muted }}>
                    {tipTapText(n.content)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Activity ────────────────────────────────────────────────────────────

const ACTIVITY_KIND_ICON: Record<string, typeof ActivityIcon> = {
  appetite: ActivityIcon,
  facility: Briefcase,
  person: Users,
  note: StickyNote,
};

/** Activity panel body: the merged when-did-this-change timeline. */
export function ActivityPanelContent({ lenderId }: { lenderId: Id<'clients'> }) {
  const colors = useColors();
  const items = useQuery(api.appetiteSignals.lenderActivity, {
    lenderClientId: lenderId,
    limit: 20,
  });

  if (items === undefined) {
    return <div style={{ fontSize: 11, color: colors.text.muted }}>Loading…</div>;
  }
  if (items.length === 0) {
    return <div style={{ fontSize: 11, color: colors.text.muted }}>No activity recorded yet.</div>;
  }

  return (
    <div className="space-y-1.5">
      {items.map((it, i) => {
        const Icon = ACTIVITY_KIND_ICON[it.kind] ?? ActivityIcon;
        return (
          <div key={i} className="flex items-baseline gap-2">
            <Icon className="w-3 h-3 flex-shrink-0 self-center" style={{ color: colors.text.dim }} />
            <span className="min-w-0 truncate" style={{ fontSize: 11, color: colors.text.secondary }} title={it.detail ? `${it.label} · ${it.detail}` : it.label}>
              {it.label}
            </span>
            <span className="ml-auto flex-shrink-0" style={{ fontSize: 9, color: colors.text.dim, fontFamily: MONO }}>
              {relTime(it.at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
