"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "../../../../../convex/_generated/api";
import { useQuery } from "convex/react";
import { Panel, Section, Row, StatusPill, Button } from "@/components/layouts";
import { useColors } from "@/lib/useColors";
import { ExternalLink, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import type { ColorPalette } from "@/lib/colors";

function statusTone(status: string | undefined, colors: ColorPalette): string {
  switch (status) {
    case "success":
      return colors.accent.green;
    case "error":
      return colors.accent.red;
    case "in_progress":
      return colors.accent.blue;
    default:
      return colors.text.dim;
  }
}

// Result banner — canon-toned replacement for the ad-hoc colored result cards.
function ResultBanner({
  success,
  tone,
  title,
  children,
  colors,
}: {
  success: boolean;
  tone: string;
  title: string;
  children?: React.ReactNode;
  colors: ColorPalette;
}) {
  const t = success ? tone : colors.accent.red;
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 4,
        border: `1px solid ${t}40`,
        background: `${t}15`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {success ? (
          <CheckCircle2 size={18} style={{ color: t }} />
        ) : (
          <XCircle size={18} style={{ color: colors.accent.red }} />
        )}
        <span style={{ fontWeight: 500, fontSize: 13, color: t }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function HubSpotSettingsPage() {
  const colors = useColors();
  const syncConfig = useQuery(api.hubspotSync.getSyncConfig as any);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [isSyncingLeads, setIsSyncingLeads] = useState(false);
  const [leadsSyncResult, setLeadsSyncResult] = useState<any>(null);
  const [isSyncingDeals, setIsSyncingDeals] = useState(false);
  const [dealsSyncResult, setDealsSyncResult] = useState<any>(null);
  const [isSyncingCompanies, setIsSyncingCompanies] = useState(false);
  const [companiesSyncResult, setCompaniesSyncResult] = useState<any>(null);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const [contactsSyncResult, setContactsSyncResult] = useState<any>(null);
  const [isTestingImport, setIsTestingImport] = useState(false);
  const [testImportResult, setTestImportResult] = useState<any>(null);
  const [recurringSyncEnabled, setRecurringSyncEnabled] = useState(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (syncConfig && isMountedRef.current) {
      setRecurringSyncEnabled(syncConfig.isRecurringSyncEnabled);
    }
  }, [syncConfig]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);

    try {
      const response = await fetch("/api/hubspot/sync-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // maxRecords omitted → sync-all defaults to unlimited (Infinity)
          syncCompanies: true,
          syncContacts: true,
          syncDeals: true, // Re-enabled — previous "SDK errors" were stale
          syncActivities: true, // New: HubSpot engagement timeline
        }),
      });

      const result = await response.json();
      setSyncResult(result);
    } catch (error: any) {
      setSyncResult({
        success: false,
        error: error.message || "Sync failed",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncLeads = async () => {
    setIsSyncingLeads(true);
    setLeadsSyncResult(null);

    try {
      const response = await fetch("/api/hubspot/sync-leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          maxRecords: 20, // Test with 20 leads
        }),
      });

      const result = await response.json();
      setLeadsSyncResult(result);
    } catch (error: any) {
      setLeadsSyncResult({
        success: false,
        error: error.message || "Leads sync failed",
      });
    } finally {
      setIsSyncingLeads(false);
    }
  };

  const handleSyncDeals = async () => {
    setIsSyncingDeals(true);
    setDealsSyncResult(null);

    try {
      const response = await fetch("/api/hubspot/sync-deals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          maxRecords: 100, // Sync 100 deals
        }),
      });

      const result = await response.json();
      setDealsSyncResult(result);
    } catch (error: any) {
      setDealsSyncResult({
        success: false,
        error: error.message || "Deals sync failed",
      });
    } finally {
      setIsSyncingDeals(false);
    }
  };

  const handleSyncCompanies = async () => {
    setIsSyncingCompanies(true);
    setCompaniesSyncResult(null);

    try {
      const response = await fetch("/api/hubspot/sync-companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          maxRecords: 500, // Sync 500 companies
        }),
      });

      const result = await response.json();
      setCompaniesSyncResult(result);
    } catch (error: any) {
      setCompaniesSyncResult({
        success: false,
        error: error.message || "Companies sync failed",
      });
    } finally {
      setIsSyncingCompanies(false);
    }
  };

  const handleSyncContacts = async () => {
    setIsSyncingContacts(true);
    setContactsSyncResult(null);

    try {
      const response = await fetch("/api/hubspot/sync-contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          maxRecords: 500, // Sync 500 contacts
        }),
      });

      const result = await response.json();
      setContactsSyncResult(result);
    } catch (error: any) {
      setContactsSyncResult({
        success: false,
        error: error.message || "Contacts sync failed",
      });
    } finally {
      setIsSyncingContacts(false);
    }
  };

  const handleTestSingleImport = async () => {
    setIsTestingImport(true);
    setTestImportResult(null);

    try {
      const response = await fetch("/api/hubspot/test-single-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contactId: "223385175264", // Default test contact from the provided URL
        }),
      });

      const result = await response.json();
      setTestImportResult(result);
    } catch (error: any) {
      setTestImportResult({
        success: false,
        error: error.message || "Test import failed",
      });
    } finally {
      setIsTestingImport(false);
    }
  };

  const handleToggleRecurringSync = async () => {
    try {
      const response = await fetch("/api/hubspot/recurring-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isRecurringSyncEnabled: !recurringSyncEnabled,
          // Informational only — the actual cron schedule is declared in
          // convex/crons.ts at { hours: 6 }. Convex crons are static and
          // don't read this value; keeping it in sync so any future UI
          // that displays it stays truthful.
          syncIntervalHours: 6,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setRecurringSyncEnabled(!recurringSyncEnabled);
      }
    } catch (error: any) {
      console.error("Failed to toggle recurring sync:", error);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  };

  const anyBusy =
    isSyncing ||
    isSyncingLeads ||
    isSyncingDeals ||
    isSyncingCompanies ||
    isSyncingContacts ||
    isTestingImport;

  const muted = { fontSize: 12, color: colors.text.muted };
  const detail = { fontSize: 11, color: colors.text.muted };

  return (
    <div style={{ background: colors.bg.light, minHeight: "100vh" }}>
      <div
        style={{
          maxWidth: 896,
          margin: "0 auto",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <div
          style={{
            borderRadius: 4,
            border: `1px solid ${colors.accent.blue}40`,
            background: `${colors.accent.blue}15`,
            padding: 14,
          }}
        >
          <h3 style={{ fontWeight: 600, fontSize: 13, color: colors.accent.blue }}>
            New sync interface available
          </h3>
          <p style={{ fontSize: 12, color: colors.text.secondary, marginTop: 4 }}>
            The unified HubSpot sync (V2) has moved to{" "}
            <a
              href="/settings/hubspot-sync"
              style={{ color: colors.accent.blue, fontWeight: 500, textDecoration: "underline" }}
            >
              /settings/hubspot-sync
            </a>
            . This legacy page has scoped sync buttons that pre-date the unified pipeline.
          </p>
        </div>

        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.text.primary, marginBottom: 4 }}>
            HubSpot Integration
          </h1>
          <p style={muted}>Sync your HubSpot CRM data with this application</p>
        </div>

        {/* Sync Status */}
        <Panel title="Sync Status">
          <Section title="Last sync">
            <Row label="Last sync" value={formatDate(syncConfig?.lastSyncAt)} mono />
            <Row
              label="Status"
              value={
                <StatusPill
                  label={syncConfig?.lastSyncStatus ?? "none"}
                  tone={statusTone(syncConfig?.lastSyncStatus, colors)}
                />
              }
            />
          </Section>
          {syncConfig?.lastSyncStats && (
            <Section title="Statistics">
              <Row label="Companies synced" value={syncConfig.lastSyncStats.companiesSynced} mono />
              <Row label="Contacts synced" value={syncConfig.lastSyncStats.contactsSynced} mono />
              <Row label="Deals synced" value={syncConfig.lastSyncStats.dealsSynced} mono />
              {syncConfig.lastSyncStats.errors > 0 && (
                <Row
                  label="Errors"
                  value={syncConfig.lastSyncStats.errors}
                  mono
                  valueColor={colors.accent.red}
                />
              )}
            </Section>
          )}
        </Panel>

        {/* Test Single Import */}
        <Panel title="Test Single Import">
          <p style={{ ...muted, marginBottom: 14 }}>
            Import a single contact, company, and deal to verify they link together correctly
          </p>
          <Button
            variant="primary"
            onClick={handleTestSingleImport}
            disabled={anyBusy}
            style={{ width: "100%", justifyContent: "center" }}
          >
            <RefreshCw size={14} className={isTestingImport ? "animate-spin" : undefined} />
            {isTestingImport ? "Testing Import..." : "Test Single Import"}
          </Button>

          {testImportResult && (
            <div style={{ marginTop: 14 }}>
              <ResultBanner
                success={testImportResult.success}
                tone={colors.accent.green}
                title={testImportResult.success ? "Test Import Completed" : "Test Import Failed"}
                colors={colors}
              >
                {testImportResult.results && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {testImportResult.results.contact && (
                      <div style={{ padding: 8, background: colors.bg.card, borderRadius: 4, border: `1px solid ${colors.border.default}` }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>Contact:</div>
                        <div style={detail}>
                          ID: {testImportResult.results.contact.id} | HubSpot ID:{" "}
                          {testImportResult.results.contact.hubspotId} | Name:{" "}
                          {testImportResult.results.contact.name} | Action:{" "}
                          {testImportResult.results.contact.action}
                        </div>
                      </div>
                    )}
                    {testImportResult.results.company && (
                      <div style={{ padding: 8, background: colors.bg.card, borderRadius: 4, border: `1px solid ${colors.border.default}` }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>Company:</div>
                        <div style={detail}>
                          ID: {testImportResult.results.company.id} | HubSpot ID:{" "}
                          {testImportResult.results.company.hubspotId} | Name:{" "}
                          {testImportResult.results.company.name} | Action:{" "}
                          {testImportResult.results.company.action}
                        </div>
                      </div>
                    )}
                    {testImportResult.results.deal && (
                      <div style={{ padding: 8, background: colors.bg.card, borderRadius: 4, border: `1px solid ${colors.border.default}` }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>Deal:</div>
                        <div style={detail}>
                          ID: {testImportResult.results.deal.id} | HubSpot ID:{" "}
                          {testImportResult.results.deal.hubspotId} | Name:{" "}
                          {testImportResult.results.deal.name} | Action:{" "}
                          {testImportResult.results.deal.action}
                        </div>
                      </div>
                    )}
                    {testImportResult.results.links && (
                      <div style={{ padding: 8, background: colors.bg.card, borderRadius: 4, border: `1px solid ${colors.border.default}` }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>Links:</div>
                        <div style={{ ...detail, display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
                          <div>Deal → Contact: {testImportResult.results.links.dealLinkedToContact ? "Linked" : "Not Linked"}</div>
                          <div>Deal → Company: {testImportResult.results.links.dealLinkedToCompany ? "Linked" : "Not Linked"}</div>
                          {testImportResult.results.links.dealLinkedContactIds && testImportResult.results.links.dealLinkedContactIds.length > 0 && (
                            <div>Linked Contact IDs: {testImportResult.results.links.dealLinkedContactIds.join(", ")}</div>
                          )}
                          {testImportResult.results.links.dealLinkedCompanyIds && testImportResult.results.links.dealLinkedCompanyIds.length > 0 && (
                            <div>Linked Company IDs: {testImportResult.results.links.dealLinkedCompanyIds.join(", ")}</div>
                          )}
                        </div>
                      </div>
                    )}
                    {testImportResult.results.associations && (
                      <div style={{ padding: 8, background: colors.bg.card, borderRadius: 4, border: `1px solid ${colors.border.default}` }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>HubSpot Associations:</div>
                        <div style={{ ...detail, display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
                          {testImportResult.results.associations.contactToCompany && (
                            <div>Contact → Companies: {testImportResult.results.associations.contactToCompany.join(", ")}</div>
                          )}
                          {testImportResult.results.associations.contactToDeal && (
                            <div>Contact → Deals: {testImportResult.results.associations.contactToDeal.join(", ")}</div>
                          )}
                          {testImportResult.results.associations.dealToContact && (
                            <div>Deal → Contacts: {testImportResult.results.associations.dealToContact.join(", ")}</div>
                          )}
                          {testImportResult.results.associations.dealToCompany && (
                            <div>Deal → Companies: {testImportResult.results.associations.dealToCompany.join(", ")}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {testImportResult.error && (
                  <div style={{ fontSize: 12, color: colors.accent.red, marginTop: 8 }}>{testImportResult.error}</div>
                )}
              </ResultBanner>
            </div>
          )}
        </Panel>

        {/* Background Variables */}
        <Panel title="Background Variables">
          <p style={{ ...muted, marginBottom: 14 }}>
            Sync pipeline and stage definitions from HubSpot to map IDs to names
          </p>
          <Button
            variant="primary"
            onClick={async () => {
              try {
                const response = await fetch("/api/hubspot/sync-pipelines", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                });
                const result = await response.json();
                if (result.success) {
                  alert(`Pipelines synced: ${result.pipelines.synced} (${result.pipelines.created} created, ${result.pipelines.updated} updated)\nDeals updated: ${result.deals.updated} of ${result.deals.total}`);
                } else {
                  alert(`Error: ${result.error}`);
                }
              } catch (error: any) {
                alert(`Error: ${error.message}`);
              }
            }}
            style={{ width: "100%", justifyContent: "center" }}
          >
            <RefreshCw size={14} />
            Sync Pipelines & Stages
          </Button>
        </Panel>

        {/* Data Fixes */}
        <Panel title="Data Fixes">
          <p style={{ ...muted, marginBottom: 14 }}>
            Fix existing data: extract dates from metadata and link contacts to companies
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  const response = await fetch("/api/hubspot/fix-data", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "link-contacts-to-companies" }),
                  });
                  const result = await response.json();
                  alert(`Contacts linked: ${result.result?.contactsUpdated || 0}, Companies updated: ${result.result?.companiesUpdated || 0}`);
                } catch (error: any) {
                  alert(`Error: ${error.message}`);
                }
              }}
              style={{ width: "100%", justifyContent: "center" }}
            >
              Link Contacts to Companies
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  const response = await fetch("/api/hubspot/fix-data", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "link-deals" }),
                  });
                  const result = await response.json();
                  alert(`Deals linked: ${result.result?.dealsUpdated || 0}`);
                } catch (error: any) {
                  alert(`Error: ${error.message}`);
                }
              }}
              style={{ width: "100%", justifyContent: "center" }}
            >
              Link Deals to Contacts/Companies
            </Button>
          </div>
          <Button
            variant="primary"
            onClick={async () => {
              try {
                const response = await fetch("/api/hubspot/fix-data", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "fix-all" }),
                });
                const result = await response.json();
                alert(`All fixes completed! Check console for details.`);
                console.log("Fix all results:", result.results);
              } catch (error: any) {
                alert(`Error: ${error.message}`);
              }
            }}
            style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
          >
            Fix All Data
          </Button>
        </Panel>

        {/* Manual Sync */}
        <Panel title="Manual Sync">
          <p style={{ ...muted, marginBottom: 14 }}>
            Trigger a one-time sync of up to 20 records from HubSpot
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <Button variant="primary" onClick={handleManualSync} disabled={anyBusy} style={{ width: "100%", justifyContent: "center" }}>
              <RefreshCw size={14} className={isSyncing ? "animate-spin" : undefined} />
              {isSyncing ? "Syncing..." : "Sync All"}
            </Button>
            <Button variant="secondary" onClick={handleSyncLeads} disabled={anyBusy} style={{ width: "100%", justifyContent: "center" }}>
              <RefreshCw size={14} className={isSyncingLeads ? "animate-spin" : undefined} />
              {isSyncingLeads ? "Syncing Leads..." : "Sync Leads Only"}
            </Button>
            <Button variant="secondary" onClick={handleSyncDeals} disabled={anyBusy} style={{ width: "100%", justifyContent: "center" }}>
              <RefreshCw size={14} className={isSyncingDeals ? "animate-spin" : undefined} />
              {isSyncingDeals ? "Syncing Deals..." : "Sync Deals Only"}
            </Button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <Button variant="secondary" onClick={handleSyncCompanies} disabled={anyBusy} style={{ width: "100%", justifyContent: "center" }}>
              <RefreshCw size={14} className={isSyncingCompanies ? "animate-spin" : undefined} />
              {isSyncingCompanies ? "Syncing Companies..." : "Sync Companies (500)"}
            </Button>
            <Button variant="secondary" onClick={handleSyncContacts} disabled={anyBusy} style={{ width: "100%", justifyContent: "center" }}>
              <RefreshCw size={14} className={isSyncingContacts ? "animate-spin" : undefined} />
              {isSyncingContacts ? "Syncing Contacts..." : "Sync Contacts (500)"}
            </Button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
            {syncResult && (
              <ResultBanner
                success={syncResult.success}
                tone={colors.accent.green}
                title={syncResult.success ? "Sync Completed" : "Sync Failed"}
                colors={colors}
              >
                {syncResult.stats && (
                  <div style={{ ...detail, display: "flex", flexDirection: "column", gap: 2 }}>
                    <div>Companies: {syncResult.stats.companiesSynced}</div>
                    <div>Contacts: {syncResult.stats.contactsSynced}</div>
                    <div>Deals: {syncResult.stats.dealsSynced}</div>
                    {syncResult.stats.errors > 0 && (
                      <div style={{ color: colors.accent.red }}>Errors: {syncResult.stats.errors}</div>
                    )}
                  </div>
                )}
                {syncResult.error && (
                  <div style={{ fontSize: 12, color: colors.accent.red, marginTop: 8 }}>{syncResult.error}</div>
                )}
                {syncResult.errorMessages && syncResult.errorMessages.length > 0 && (
                  <div style={{ fontSize: 12, color: colors.accent.red, marginTop: 8 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>Error Details:</div>
                    <ul style={{ listStyle: "disc", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
                      {syncResult.errorMessages.slice(0, 5).map((msg: string, i: number) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </ResultBanner>
            )}

            {leadsSyncResult && (
              <ResultBanner
                success={leadsSyncResult.success}
                tone={colors.accent.blue}
                title={leadsSyncResult.success ? "Leads Sync Completed" : "Leads Sync Failed"}
                colors={colors}
              >
                {leadsSyncResult.stats && (
                  <div style={{ ...detail, display: "flex", flexDirection: "column", gap: 2 }}>
                    <div>Contacts Processed: {leadsSyncResult.stats.contactsProcessed}</div>
                    <div>Leads Synced: {leadsSyncResult.stats.leadsSynced}</div>
                    {leadsSyncResult.stats.errors > 0 && (
                      <div style={{ color: colors.accent.red }}>Errors: {leadsSyncResult.stats.errors}</div>
                    )}
                  </div>
                )}
                {leadsSyncResult.error && (
                  <div style={{ fontSize: 12, color: colors.accent.red, marginTop: 8 }}>{leadsSyncResult.error}</div>
                )}
                {leadsSyncResult.stats?.errorDetails && leadsSyncResult.stats.errorDetails.length > 0 && (
                  <div style={{ fontSize: 12, color: colors.accent.red, marginTop: 8 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>Error Details:</div>
                    <ul style={{ listStyle: "disc", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
                      {leadsSyncResult.stats.errorDetails.slice(0, 5).map((msg: string, i: number) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </ResultBanner>
            )}

            {dealsSyncResult && (
              <ResultBanner
                success={dealsSyncResult.success}
                tone={colors.accent.purple}
                title={dealsSyncResult.success ? "Deals Sync Completed" : "Deals Sync Failed"}
                colors={colors}
              >
                {dealsSyncResult.success && (
                  <div style={{ ...detail, display: "flex", flexDirection: "column", gap: 2 }}>
                    <div>Deals Synced: {dealsSyncResult.synced || 0}</div>
                    <div>Created: {dealsSyncResult.created || 0}</div>
                    <div>Updated: {dealsSyncResult.updated || 0}</div>
                    {dealsSyncResult.errors > 0 && (
                      <div style={{ color: colors.accent.red }}>Errors: {dealsSyncResult.errors}</div>
                    )}
                  </div>
                )}
                {dealsSyncResult.error && (
                  <div style={{ fontSize: 12, color: colors.accent.red, marginTop: 8 }}>{dealsSyncResult.error}</div>
                )}
                {dealsSyncResult.errorMessages && dealsSyncResult.errorMessages.length > 0 && (
                  <div style={{ fontSize: 12, color: colors.accent.red, marginTop: 8 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>Error Details:</div>
                    <ul style={{ listStyle: "disc", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
                      {dealsSyncResult.errorMessages.slice(0, 5).map((msg: string, i: number) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </ResultBanner>
            )}

            {companiesSyncResult && (
              <ResultBanner
                success={companiesSyncResult.success}
                tone={colors.accent.cyan}
                title={companiesSyncResult.success ? "Companies Sync Completed" : "Companies Sync Failed"}
                colors={colors}
              >
                {companiesSyncResult.success && (
                  <div style={{ ...detail, display: "flex", flexDirection: "column", gap: 2 }}>
                    <div>Companies Synced: {companiesSyncResult.synced || 0}</div>
                    <div>Created: {companiesSyncResult.created || 0}</div>
                    <div>Updated: {companiesSyncResult.updated || 0}</div>
                    {companiesSyncResult.errors > 0 && (
                      <div style={{ color: colors.accent.red }}>Errors: {companiesSyncResult.errors}</div>
                    )}
                  </div>
                )}
                {companiesSyncResult.error && (
                  <div style={{ fontSize: 12, color: colors.accent.red, marginTop: 8 }}>{companiesSyncResult.error}</div>
                )}
                {companiesSyncResult.errorMessages && companiesSyncResult.errorMessages.length > 0 && (
                  <div style={{ fontSize: 12, color: colors.accent.red, marginTop: 8 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>Error Details:</div>
                    <ul style={{ listStyle: "disc", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
                      {companiesSyncResult.errorMessages.slice(0, 5).map((msg: string, i: number) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </ResultBanner>
            )}

            {contactsSyncResult && (
              <ResultBanner
                success={contactsSyncResult.success}
                tone={colors.accent.indigo}
                title={contactsSyncResult.success ? "Contacts Sync Completed" : "Contacts Sync Failed"}
                colors={colors}
              >
                {contactsSyncResult.success && (
                  <div style={{ ...detail, display: "flex", flexDirection: "column", gap: 2 }}>
                    <div>Contacts Synced: {contactsSyncResult.synced || 0}</div>
                    <div>Created: {contactsSyncResult.created || 0}</div>
                    <div>Updated: {contactsSyncResult.updated || 0}</div>
                    {contactsSyncResult.errors > 0 && (
                      <div style={{ color: colors.accent.red }}>Errors: {contactsSyncResult.errors}</div>
                    )}
                  </div>
                )}
                {contactsSyncResult.error && (
                  <div style={{ fontSize: 12, color: colors.accent.red, marginTop: 8 }}>{contactsSyncResult.error}</div>
                )}
                {contactsSyncResult.errorMessages && contactsSyncResult.errorMessages.length > 0 && (
                  <div style={{ fontSize: 12, color: colors.accent.red, marginTop: 8 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>Error Details:</div>
                    <ul style={{ listStyle: "disc", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
                      {contactsSyncResult.errorMessages.slice(0, 5).map((msg: string, i: number) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </ResultBanner>
            )}
          </div>
        </Panel>

        {/* Recurring Sync */}
        <Panel title="Recurring Sync">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>Recurring Sync</div>
              <div style={detail}>
                {recurringSyncEnabled
                  ? "Syncs every 6 hours (incremental — only changes since last sync)"
                  : "Currently disabled"}
              </div>
            </div>
            <Button
              variant={recurringSyncEnabled ? "danger" : "primary"}
              size="sm"
              onClick={handleToggleRecurringSync}
            >
              {recurringSyncEnabled ? "Disable" : "Enable"}
            </Button>
          </div>
        </Panel>

        {/* HubSpot Portal Link */}
        <Panel title="HubSpot Portal">
          <p style={{ ...muted, marginBottom: 14 }}>Access your HubSpot account</p>
          <a
            href="https://app.hubspot.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: colors.accent.blue,
            }}
          >
            <ExternalLink size={14} />
            Open HubSpot Portal
          </a>
        </Panel>
      </div>
    </div>
  );
}
