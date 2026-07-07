"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { ProspectDetailHeader } from "@/components/prospects/ProspectDetailHeader";
import { ProspectDetailAside } from "@/components/prospects/ProspectDetailAside";
import { OverviewTab } from "@/components/prospects/tabs/OverviewTab";
import { IntelTab } from "@/components/prospects/tabs/IntelTab";
import { PeopleTab } from "@/components/prospects/tabs/PeopleTab";
import { CompaniesHouseTab } from "@/components/prospects/tabs/CompaniesHouseTab";
import { OutreachTab } from "@/components/prospects/tabs/OutreachTab";
import { RepliesTab } from "@/components/prospects/tabs/RepliesTab";
import { MeetingsTab } from "@/components/prospects/tabs/MeetingsTab";
import { FilesTab } from "@/components/prospects/tabs/FilesTab";
import { NotesTab } from "@/components/prospects/tabs/NotesTab";
import { ActivityTab } from "@/components/prospects/tabs/ActivityTab";
import { ThreadsTab } from "@/components/prospects/tabs/ThreadsTab";
import { KnowledgeTab } from "@/components/prospects/tabs/KnowledgeTab";
import { TrackRecordTab } from "@/components/prospects/tabs/TrackRecordTab";
import { StickyApprovalFooter } from "@/components/prospects/StickyApprovalFooter";
import { RevisionRequestModal } from "@/components/prospects/RevisionRequestModal";
import KnowledgeGraphDrawer from "@/components/knowledge/KnowledgeGraphDrawer";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default function ProspectDetailPage() {
  const colors = useColors();
  const router = useRouter();
  const params = useParams();
  const prospectId = params.prospectId as Id<"clients">;

  const [activeTab, setActiveTab] = useState<"overview" | "intel" | "people" | "ch" | "track-record" | "outreach" | "replies" | "meetings" | "files" | "notes" | "threads" | "knowledge" | "activity">("overview");
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  // Knowledge Graph drawer — prospects are clients rows, so the entry entity
  // is type "client"; entryIsProspect keeps the view unfiltered (§14b.6a).
  const [graphOpen, setGraphOpen] = useState(false);

  const prospect = useQuery(api.prospects.getById, { clientId: prospectId });
  const cadencesRaw = useQuery(
    api.cadences.listByClient,
    prospect !== undefined && prospect !== null
      ? { clientId: prospectId }
      : "skip",
  );
  const cadences = (cadencesRaw as any[]) ?? [];

  // Derive the intel run via the cadences' sourceSkillRunId where possible
  // (operationally linked path), falling back to a direct lookup by
  // linkedClientId for prospects that have a skillRun but no cadences yet
  // (e.g., freshly synthesized intel, package not yet created).
  const intelRunId = cadences[0]?.sourceSkillRunId as Id<"skillRuns"> | undefined;
  const intelRunFromCadence = useQuery(
    api.skillRuns.getById,
    intelRunId ? { runId: intelRunId } : "skip",
  );
  const intelRunFromBackref = useQuery(
    api.skillRuns.latestByLinkedClientId,
    !intelRunId && prospect ? { clientId: prospectId, skillName: "prospect-intel" } : "skip",
  );
  const intelRun = intelRunFromCadence ?? intelRunFromBackref;

  // Companies House profile + charges. Resolve the CH number robustly: prefer
  // the prospect's canonical companiesHouseNumber (set by clients.setProspectFacts),
  // falling back to the intel run's dedupKey. A refresh run started without a
  // dedupKey would otherwise blank chProfile here (and the People tab + aside),
  // making genuinely-synced data read as "not synced". Mirrors prospects.getDeepContext.
  const chNumber = ((prospect as any)?.companiesHouseNumber ?? (intelRun as any)?.dedupKey) as string | undefined;
  const chProfile = useQuery(
    api.companiesHouse.getCompanyByNumber,
    chNumber ? { companyNumber: chNumber } : "skip",
  );

  // Corporate-group charge rollup: aggregates charges across the parent +
  // sibling SPVs (clients.relatedCompaniesHouseNumbers, set by
  // resolve-related-entities). Empty shape (companyCount 0) when there are no
  // related numbers; the CH tab only renders the group section when > 1.
  const groupCharges = useQuery(
    api.companies.getGroupCharges,
    prospect ? { clientId: prospectId } : "skip",
  );

  // Lender-tier conflict: detect if the prospect borrows from a protected
  // lender (Tier 1 = park, Tier 2 = soften). Surfaced as a flag near the header.
  const lenderTierConflict = useQuery(
    api.companies.getLenderTierConflict,
    prospect ? { clientId: prospectId } : "skip",
  );

  // Track Record: prospect schemes (live / past) from the prospectSchemes table.
  const schemes = useQuery(api.companies.getProspectSchemes, prospect ? { clientId: prospectId } : "skip");

  // v1.3 — reply events linked to this client (for the Replies tab + count)
  const replies = useQuery(
    api.replyEvents.listByClient,
    prospect ? { clientId: prospectId, limit: 50 } : "skip",
  );

  // v1.3 Sprint C — meetings linked to this client (for the Meetings tab + count)
  const meetings = useQuery(
    api.meetings.getByClient,
    prospect ? { clientId: prospectId, limit: 100 } : "skip",
  );

  // People tab: existing HubSpot contacts for this prospect, so we can
  // match report "key people" to on-file contacts and avoid duplicates.
  const contacts = useQuery(api.contacts.getByClient, prospect ? { clientId: prospectId } : "skip");

  // Threads tab: collaborative conversations filed to this prospect (reuses the
  // conversations/directMessages messaging system). Fetched here for the nav
  // count; the tab itself re-reads (deduped) plus per-thread message queries.
  const threads = useQuery(
    api.conversations.getMyConversations,
    prospect ? { clientId: prospectId } : "skip",
  );

  // Knowledge tab: structured facts captured against this prospect (for the
  // nav count). The tab itself reads contextMarkdown + the facts list directly.
  const knowledgeFacts = useQuery(
    api.knowledgeLibrary.getKnowledgeItemsByClient,
    prospect ? { clientId: prospectId } : "skip",
  );

  const approvePackage = useMutation(api.cadences.approvePackage);
  const denyPackage = useMutation(api.cadences.denyPackage);
  const requestRevisionMut = useMutation(api.cadences.requestRevision);
  const upsertScheme = useMutation(api.companies.upsertProspectScheme);

  // Single-gate outreach: the cadence package is the approval surface. When a
  // pending package exists, land the operator on the Outreach tab (the approval
  // screen) automatically — but only once, so manual tab changes stick.
  const autoSwitchedRef = useRef(false);
  const pendingPackage = cadences[0]?.packageApprovalStatus === "pending";
  useEffect(() => {
    if (pendingPackage && !autoSwitchedRef.current) {
      autoSwitchedRef.current = true;
      setActiveTab("outreach");
    }
  }, [pendingPackage]);

  if (prospect === undefined) {
    return <div style={{ padding: 24, color: colors.text.muted }}>Loading…</div>;
  }
  if (prospect === null) {
    return <div style={{ padding: 24, color: colors.text.muted }}>Prospect not found.</div>;
  }

  const packageId = cadences[0]?.packageId;
  const packageApprovalStatus = cadences[0]?.packageApprovalStatus as string | undefined;

  // No-contact guard surface (mirrors the backend applyPackageApproval guard +
  // the dispatcher's fire-time check): Touch 1 is the lowest-order unfired
  // touch (falling back to Touch 1), and it must resolve to a contact with an
  // email for the package to be sendable. Drives the footer's disabled state.
  const sortedCadences = [...cadences].sort((a, b) => (a.packageOrder ?? 0) - (b.packageOrder ?? 0));
  const touchOneContactId =
    sortedCadences.find((c) => !c.lastFiredAt)?.contactId ?? sortedCadences[0]?.contactId;
  const touchOneContact = ((contacts as any[]) ?? []).find((ct) => ct._id === touchOneContactId);
  const hasSendableContact = !!touchOneContact?.email;
  const touchCount = cadences.length;

  return (
    <>
      <ProspectDetailHeader
        prospect={prospect}
        intelRun={intelRun}
        cadences={cadences}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        peopleCount={countKeyPeople((intelRun as any)?.intelMarkdown)}
        chargesCount={(chProfile as any)?.charges?.length ?? 0}
        repliesCount={replies?.length ?? 0}
        meetingsCount={meetings?.length ?? 0}
        schemesCount={((schemes as any)?.live?.length ?? 0) + ((schemes as any)?.past?.length ?? 0)}
        threadsCount={(threads as any[])?.length ?? 0}
        knowledgeCount={(knowledgeFacts as any[])?.length ?? 0}
        lenderTierConflict={lenderTierConflict as any}
        onOpenGraph={() => setGraphOpen(true)}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 1, background: colors.border.default, paddingBottom: 80 }}>
        <div style={{ background: colors.bg.card, padding: 24 }}>
          {activeTab === "overview" && (
            <OverviewTab
              prospect={prospect}
              intelRun={intelRun}
              cadences={cadences}
              onJumpToOutreach={() => setActiveTab("outreach")}
              onJumpToIntel={() => setActiveTab("intel")}
              lenderTierConflict={lenderTierConflict as any}
            />
          )}
          {activeTab === "intel" && <IntelTab intelRun={intelRun} />}
          {activeTab === "people" && (
            <PeopleTab prospect={prospect} intelRun={intelRun} chProfile={chProfile} contacts={contacts} />
          )}
          {activeTab === "ch" && (
            <CompaniesHouseTab prospect={prospect} intelRun={intelRun} chProfile={chProfile} groupCharges={groupCharges} />
          )}
          {activeTab === "track-record" && (
            <TrackRecordTab
              schemes={schemes as any}
              onConfirmScheme={(companyNumber, companyName) =>
                upsertScheme({ clientId: prospectId, companyNumber, companyName, operatorConfirmed: true })
              }
            />
          )}
          {activeTab === "outreach" && <OutreachTab cadences={cadences} contacts={(contacts as any[]) ?? []} clientId={prospectId} />}
          {activeTab === "replies" && <RepliesTab prospect={prospect} />}
          {activeTab === "meetings" && <MeetingsTab prospect={prospect} />}
          {activeTab === "files" && <FilesTab prospect={prospect} />}
          {activeTab === "notes" && <NotesTab prospect={prospect} />}
          {activeTab === "threads" && <ThreadsTab prospect={prospect} />}
          {activeTab === "knowledge" && <KnowledgeTab prospect={prospect} />}
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
          try {
            // Single gate (2026-06): approvePackage now ALSO writes Cold and
            // fires Touch 1 server-side (the old "mark outreach ready" accept
            // is backfilled). The dispatcher sends the first touch within
            // seconds and auto-sends later touches on their scheduled dates —
            // no second approval in /approvals. (Kill switches at
            // /settings/gmail still gate execution; failed sends retry there.)
            await approvePackage({ packageId });
          } catch (e: any) {
            const msg = String(e?.message ?? e);
            alert(
              msg.includes("no_sendable_contact")
                ? "Can't begin outreach: Touch 1 has no sendable email. Pick a recipient with an email on the Outreach tab, then approve again."
                : `Could not begin outreach: ${msg}`,
            );
            return;
          }
          alert(
            "Outreach begun. The first email sends now and the rest send automatically on their scheduled dates — no further approval needed. Track them in Approvals.",
          );
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
        packageId={packageId}
        packageApprovalStatus={packageApprovalStatus}
        hasSendableContact={hasSendableContact}
        touchCount={touchCount}
      />

      {/* Knowledge Graph drawer — prospect entry: always unfiltered, no
          "Prospect intel" toggle (spec §14b.6a). */}
      {graphOpen && (
        <KnowledgeGraphDrawer
          entryEntityType="client"
          entryEntityId={prospectId}
          entryName={prospect.name ?? "Prospect"}
          entryIsProspect
          onClose={() => setGraphOpen(false)}
        />
      )}

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

// Count how many "### {Name}" headings live under section 3 (Key People)
// of the intelMarkdown. Used for the tab count badge. The PeopleTab does
// the same parse with full extraction; this is just a fast count for the
// nav.
function countKeyPeople(intelMarkdown?: string): number {
  if (!intelMarkdown) return 0;
  const sec3 = intelMarkdown.match(/##\s*3\.\s*Key People([\s\S]*?)(?=##\s*\d|$)/i);
  if (!sec3) return 0;
  return (sec3[1].match(/^###\s+/gm) ?? []).length;
}
