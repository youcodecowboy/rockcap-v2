export interface ProspectFlag { key: string; label: string; severity: "ok" | "info" | "warn"; }

interface ClientLike { primaryContactId?: string; contactsWithEmail?: number; }
interface IntelRunLike { status?: string; gaps?: { kind: string; description: string }[]; }
interface LenderTierConflictLike { action: "park" | "soften" | "none"; tier1: string[]; tier2: string[]; }

export function computeProspectFlags(
  client: ClientLike,
  intelRun: IntelRunLike | null,
  lenderTierConflict?: LenderTierConflictLike,
): ProspectFlag[] {
  const flags: ProspectFlag[] = [];

  // Lender-tier conflict: checked first so it appears at the top of the flag list.
  if (lenderTierConflict?.action === "park") {
    flags.push({ key: "lender-park", label: "Parked — Tier 1 lender", severity: "warn" });
  } else if (lenderTierConflict?.action === "soften") {
    flags.push({ key: "lender-soften", label: "Soften — Tier 2 lender", severity: "info" });
  }

  const hasContact = (client.contactsWithEmail ?? 0) > 0 || !!client.primaryContactId;
  if (!hasContact) {
    flags.push({ key: "no_contact", label: "No contact — add an email to send", severity: "warn" });
  }
  for (const gap of intelRun?.gaps ?? []) {
    flags.push({ key: gap.kind, label: gap.description, severity: "info" });
  }
  if (flags.length === 0) {
    flags.push({ key: "all_clear", label: "All found", severity: "ok" });
  }
  return flags;
}
