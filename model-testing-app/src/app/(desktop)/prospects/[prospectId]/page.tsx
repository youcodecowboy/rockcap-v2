"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { ProspectDetailHeader } from "@/components/prospects/ProspectDetailHeader";
import { ProspectDetailAside } from "@/components/prospects/ProspectDetailAside";
import { OverviewTab } from "@/components/prospects/tabs/OverviewTab";
import { IntelTab } from "@/components/prospects/tabs/IntelTab";
import { OutreachTab } from "@/components/prospects/tabs/OutreachTab";
import { ActivityTab } from "@/components/prospects/tabs/ActivityTab";
import { StickyApprovalFooter } from "@/components/prospects/StickyApprovalFooter";
import { RevisionRequestModal } from "@/components/prospects/RevisionRequestModal";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default function ProspectDetailPage() {
  const colors = useColors();
  const router = useRouter();
  const params = useParams();
  const prospectId = params.prospectId as Id<"clients">;

  const [activeTab, setActiveTab] = useState<"overview" | "intel" | "outreach" | "activity">("overview");
  const [showRevisionModal, setShowRevisionModal] = useState(false);

  const prospect = useQuery(api.prospects.getById, { clientId: prospectId });
  const cadencesRaw = useQuery(
    api.cadences.listByClient,
    prospect !== undefined && prospect !== null
      ? { clientId: prospectId }
      : "skip",
  );
  const cadences = (cadencesRaw as any[]) ?? [];

  // Derive the intel run via the cadences' sourceSkillRunId — far more
  // robust than dedupKey lookup. The cadences carry the link between
  // a clients row and the skill output that produced them, regardless
  // of whether the clients row has hubspotCompanyId populated.
  const intelRunId = cadences[0]?.sourceSkillRunId as Id<"skillRuns"> | undefined;
  const intelRun = useQuery(
    api.skillRuns.getById,
    intelRunId ? { runId: intelRunId } : "skip",
  );

  // Companies House profile + charges. For prospect-intel runs the dedupKey
  // IS the CH number — use it to surface the structured CH data in the
  // right aside (company status, SIC, charges, lender names).
  const chNumber = (intelRun as any)?.dedupKey as string | undefined;
  const chProfile = useQuery(
    api.companiesHouse.getCompanyByNumber,
    chNumber ? { companyNumber: chNumber } : "skip",
  );

  const approvePackage = useMutation(api.cadences.approvePackage);
  const denyPackage = useMutation(api.cadences.denyPackage);
  const requestRevisionMut = useMutation(api.cadences.requestRevision);

  if (prospect === undefined) {
    return <div style={{ padding: 24, color: colors.text.muted }}>Loading…</div>;
  }
  if (prospect === null) {
    return <div style={{ padding: 24, color: colors.text.muted }}>Prospect not found.</div>;
  }

  const packageId = cadences[0]?.packageId;

  return (
    <>
      <ProspectDetailHeader
        prospect={prospect}
        intelRun={intelRun}
        cadences={cadences}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 1, background: colors.border.default, paddingBottom: 80 }}>
        <div style={{ background: colors.bg.card, padding: 24 }}>
          {activeTab === "overview" && (
            <OverviewTab
              prospect={prospect}
              intelRun={intelRun}
              cadences={cadences}
              onJumpToOutreach={() => setActiveTab("outreach")}
            />
          )}
          {activeTab === "intel" && <IntelTab intelRun={intelRun} />}
          {activeTab === "outreach" && <OutreachTab cadences={cadences} />}
          {activeTab === "activity" && (
            <ActivityTab prospect={prospect} intelRun={intelRun} cadences={cadences} />
          )}
        </div>
        <aside style={{ background: colors.bg.light, padding: 20, borderLeft: `1px solid ${colors.border.default}` }}>
          <ProspectDetailAside prospect={prospect} intelRun={intelRun} cadences={cadences} chProfile={chProfile} />
        </aside>
      </div>

      <StickyApprovalFooter
        prospect={prospect}
        positionInList={1}
        totalInList={1}
        stateLabel={(prospect as any)?.prospectState ?? "drafted"}
        onApprove={async () => {
          if (!packageId) { alert("No package to approve"); return; }
          await approvePackage({ packageId });
          router.push("/prospects");
        }}
        onDeny={async () => {
          if (!packageId) { alert("No package to deny"); return; }
          await denyPackage({ packageId });
          router.push("/prospects");
        }}
        onRequestRevision={() => setShowRevisionModal(true)}
        onSkip={() => router.push("/prospects")}
        onPrev={() => { /* arrow nav v1.2.1 */ }}
        onNext={() => { /* arrow nav v1.2.1 */ }}
      />

      {showRevisionModal && (
        <RevisionRequestModal
          onCancel={() => setShowRevisionModal(false)}
          onSubmit={async (note) => {
            if (!packageId) { alert("No package"); return; }
            await requestRevisionMut({ packageId, revisionNote: note });
            setShowRevisionModal(false);
            router.push("/prospects");
          }}
        />
      )}
    </>
  );
}
