"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { useColors } from "@/lib/useColors";
import { IntelTab } from "@/components/prospects/tabs/IntelTab";
import { CompaniesHouseTab } from "@/components/prospects/tabs/CompaniesHouseTab";
import { TrackRecordTab } from "@/components/prospects/tabs/TrackRecordTab";

// Company tab — the prospecting intelligence (Intel report + Companies House +
// Track Record), preserved on the client after promotion. A promoted client is
// the SAME clients row as the prospect (same _id), so all this data persists and
// is queryable by clientId; this tab just re-surfaces it. Reuses the prospect
// tab components verbatim.
export default function ClientCompanyTab({
  clientId,
  client,
}: {
  clientId: Id<"clients">;
  client: any;
}) {
  const colors = useColors();
  const [sub, setSub] = useState<"intel" | "ch" | "track">("intel");

  const intelRun = useQuery(api.skillRuns.latestByLinkedClientId, {
    clientId,
    skillName: "prospect-intel",
  });
  const chNumber = (client?.companiesHouseNumber ?? (intelRun as any)?.dedupKey) as string | undefined;
  const chProfile = useQuery(
    api.companiesHouse.getCompanyByNumber,
    chNumber ? { companyNumber: chNumber } : "skip",
  );
  const groupCharges = useQuery(api.companies.getGroupCharges, { clientId });
  const schemes = useQuery(api.companies.getProspectSchemes, { clientId });

  const subTabs: { key: typeof sub; label: string }[] = [
    { key: "intel", label: "Intel Report" },
    { key: "ch", label: "Companies House" },
    { key: "track", label: "Track Record" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${colors.border.default}` }}>
        {subTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: sub === t.key ? 600 : 500,
              color: sub === t.key ? colors.text.primary : colors.text.muted,
              borderBottom: `2px solid ${sub === t.key ? colors.entityTypes.client : "transparent"}`,
              background: "transparent",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === "intel" && <IntelTab intelRun={intelRun} />}
      {sub === "ch" && (
        <CompaniesHouseTab prospect={client} intelRun={intelRun} chProfile={chProfile} groupCharges={groupCharges} />
      )}
      {sub === "track" && (
        <TrackRecordTab schemes={schemes as any} onConfirmScheme={() => { /* read view on the client */ }} />
      )}
    </div>
  );
}
