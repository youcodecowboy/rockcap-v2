"use client";

import ClientNotesTab from "@/app/(desktop)/clients/[clientId]/components/ClientNotesTab";

// Notes tab for a prospect. Notes key on clientId, and a prospect's _id IS the
// clientId, so we reuse the client Notes component directly — same notes carry
// through after promotion (no migration, no duplicate lane).
export function NotesTab({ prospect }: { prospect: any }) {
  if (!prospect?._id) return null;
  return <ClientNotesTab clientId={prospect._id} clientName={prospect.name ?? ""} />;
}
