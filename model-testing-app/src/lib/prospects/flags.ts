export interface ProspectFlag { key: string; label: string; severity: "ok" | "info" | "warn"; }

interface ClientLike { primaryContactId?: string; contactsWithEmail?: number; }
interface IntelRunLike { status?: string; gaps?: { kind: string; description: string }[]; }

export function computeProspectFlags(client: ClientLike, intelRun: IntelRunLike | null): ProspectFlag[] {
  const flags: ProspectFlag[] = [];
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
