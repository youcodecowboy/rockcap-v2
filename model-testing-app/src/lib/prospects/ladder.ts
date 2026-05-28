// Canonical prospect ladder. Maps the stored prospectState enum to the
// operator-facing rung + label. `engaged` shows as "Meeting booked";
// `needs_revision` collapses into Drafted (revision is a flag, not a rung).
export type ProspectStateValue =
  | "researched" | "drafted" | "needs_revision" | "active"
  | "replied" | "engaged" | "promoted" | "parked" | "lost";

export interface Rung { key: string; label: string; order: number; }

const MAP: Record<ProspectStateValue, Rung> = {
  researched:     { key: "researched", label: "Researched",     order: 1 },
  drafted:        { key: "drafted",    label: "Drafted",        order: 2 },
  needs_revision: { key: "drafted",    label: "Drafted",        order: 2 },
  active:         { key: "active",     label: "Outreach active", order: 3 },
  replied:        { key: "replied",    label: "Replied",        order: 4 },
  engaged:        { key: "engaged",    label: "Meeting booked", order: 5 },
  promoted:       { key: "promoted",   label: "Promoted",       order: 6 },
  parked:         { key: "parked",     label: "Parked",         order: 90 },
  lost:           { key: "lost",       label: "Lost",           order: 91 },
};

export const RUNGS = MAP;

// The active ladder shown in the Prospects tab (excludes promoted/parked/lost holding).
export const PROSPECT_RUNGS: Rung[] = [
  MAP.researched, MAP.drafted, MAP.active, MAP.replied, MAP.engaged,
];

export function rungFor(state: ProspectStateValue | undefined | null): Rung | null {
  if (!state) return null;
  return MAP[state] ?? null;
}
