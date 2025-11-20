"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "../../../../convex/_generated/api";
import { useQuery } from "convex/react";
import { ExternalLink, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";

export default function HubSpotSettingsPage() {
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
          maxRecords: 20, // Reduced for testing
          syncCompanies: true,
          syncContacts: true,
          syncDeals: false, // Disabled - causing SDK errors
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
          maxRecords: 20, // Test with 20 deals
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
          maxRecords: 50, // Sync 50 companies
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
          maxRecords: 50, // Sync 50 contacts
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
          syncIntervalHours: 24,
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

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "success":
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2 className="size-3 mr-1" />
            Success
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive">
            <XCircle className="size-3 mr-1" />
            Error
          </Badge>
        );
      case "in_progress":
        return (
          <Badge variant="secondary">
            <Clock className="size-3 mr-1" />
            In Progress
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">HubSpot Integration</h1>
        <p className="text-muted-foreground">
          Sync your HubSpot CRM data with this application
        </p>
      </div>

      <div className="space-y-6">
        {/* Sync Status Card */}
        <Card>
          <CardHeader>
            <CardTitle>Sync Status</CardTitle>
            <CardDescription>
              Last sync information and statistics
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Last Sync:</span>
              <span className="font-medium">
                {formatDate(syncConfig?.lastSyncAt)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status:</span>
              {getStatusBadge(syncConfig?.lastSyncStatus)}
            </div>
            {syncConfig?.lastSyncStats && (
              <div className="pt-4 border-t space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Companies Synced:</span>
                  <span className="font-medium">{syncConfig.lastSyncStats.companiesSynced}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Contacts Synced:</span>
                  <span className="font-medium">{syncConfig.lastSyncStats.contactsSynced}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Deals Synced:</span>
                  <span className="font-medium">{syncConfig.lastSyncStats.dealsSynced}</span>
                </div>
                {syncConfig.lastSyncStats.errors > 0 && (
                  <div className="flex items-center justify-between text-destructive">
                    <span className="text-sm">Errors:</span>
                    <span className="font-medium">{syncConfig.lastSyncStats.errors}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test Single Import Card */}
        <Card>
          <CardHeader>
            <CardTitle>Test Single Import</CardTitle>
            <CardDescription>
              Import a single contact, company, and deal to verify they link together correctly
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleTestSingleImport}
              disabled={isSyncing || isSyncingLeads || isSyncingDeals || isSyncingCompanies || isSyncingContacts || isTestingImport}
              variant="default"
              className="w-full"
            >
              {isTestingImport ? (
                <>
                  <RefreshCw className="size-4 mr-2 animate-spin" />
                  Testing Import...
                </>
              ) : (
                <>
                  <RefreshCw className="size-4 mr-2" />
                  Test Single Import
                </>
              )}
            </Button>

            {testImportResult && (
              <div className={`p-4 rounded-lg border ${
                testImportResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {testImportResult.success ? (
                    <CheckCircle2 className="size-5 text-green-600" />
                  ) : (
                    <XCircle className="size-5 text-red-600" />
                  )}
                  <span className={`font-medium ${
                    testImportResult.success ? "text-green-900" : "text-red-900"
                  }`}>
                    {testImportResult.success ? "Test Import Completed" : "Test Import Failed"}
                  </span>
                </div>
                {testImportResult.results && (
                  <div className="text-sm space-y-2 mt-3">
                    {testImportResult.results.contact && (
                      <div className="p-2 bg-white rounded border">
                        <div className="font-medium">Contact:</div>
                        <div className="text-xs text-muted-foreground">
                          ID: {testImportResult.results.contact.id} | 
                          HubSpot ID: {testImportResult.results.contact.hubspotId} | 
                          Name: {testImportResult.results.contact.name} | 
                          Action: {testImportResult.results.contact.action}
                        </div>
                      </div>
                    )}
                    {testImportResult.results.company && (
                      <div className="p-2 bg-white rounded border">
                        <div className="font-medium">Company:</div>
                        <div className="text-xs text-muted-foreground">
                          ID: {testImportResult.results.company.id} | 
                          HubSpot ID: {testImportResult.results.company.hubspotId} | 
                          Name: {testImportResult.results.company.name} | 
                          Action: {testImportResult.results.company.action}
                        </div>
                      </div>
                    )}
                    {testImportResult.results.deal && (
                      <div className="p-2 bg-white rounded border">
                        <div className="font-medium">Deal:</div>
                        <div className="text-xs text-muted-foreground">
                          ID: {testImportResult.results.deal.id} | 
                          HubSpot ID: {testImportResult.results.deal.hubspotId} | 
                          Name: {testImportResult.results.deal.name} | 
                          Action: {testImportResult.results.deal.action}
                        </div>
                      </div>
                    )}
                    {testImportResult.results.links && (
                      <div className="p-2 bg-white rounded border">
                        <div className="font-medium">Links:</div>
                        <div className="text-xs text-muted-foreground space-y-1 mt-1">
                          <div>Deal → Contact: {testImportResult.results.links.dealLinkedToContact ? '✅ Linked' : '❌ Not Linked'}</div>
                          <div>Deal → Company: {testImportResult.results.links.dealLinkedToCompany ? '✅ Linked' : '❌ Not Linked'}</div>
                          {testImportResult.results.links.dealLinkedContactIds && testImportResult.results.links.dealLinkedContactIds.length > 0 && (
                            <div>Linked Contact IDs: {testImportResult.results.links.dealLinkedContactIds.join(', ')}</div>
                          )}
                          {testImportResult.results.links.dealLinkedCompanyIds && testImportResult.results.links.dealLinkedCompanyIds.length > 0 && (
                            <div>Linked Company IDs: {testImportResult.results.links.dealLinkedCompanyIds.join(', ')}</div>
                          )}
                        </div>
                      </div>
                    )}
                    {testImportResult.results.associations && (
                      <div className="p-2 bg-white rounded border">
                        <div className="font-medium">HubSpot Associations:</div>
                        <div className="text-xs text-muted-foreground space-y-1 mt-1">
                          {testImportResult.results.associations.contactToCompany && (
                            <div>Contact → Companies: {testImportResult.results.associations.contactToCompany.join(', ')}</div>
                          )}
                          {testImportResult.results.associations.contactToDeal && (
                            <div>Contact → Deals: {testImportResult.results.associations.contactToDeal.join(', ')}</div>
                          )}
                          {testImportResult.results.associations.dealToContact && (
                            <div>Deal → Contacts: {testImportResult.results.associations.dealToContact.join(', ')}</div>
                          )}
                          {testImportResult.results.associations.dealToCompany && (
                            <div>Deal → Companies: {testImportResult.results.associations.dealToCompany.join(', ')}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {testImportResult.error && (
                  <div className="text-sm text-red-600 mt-2">{testImportResult.error}</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Background Variables Sync Card */}
        <Card>
          <CardHeader>
            <CardTitle>Background Variables</CardTitle>
            <CardDescription>
              Sync pipeline and stage definitions from HubSpot to map IDs to names
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
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
              variant="default"
              className="w-full"
            >
              <RefreshCw className="size-4 mr-2" />
              Sync Pipelines & Stages
            </Button>
          </CardContent>
        </Card>

        {/* Data Fixes Card */}
        <Card>
          <CardHeader>
            <CardTitle>Data Fixes</CardTitle>
            <CardDescription>
              Fix existing data: extract dates from metadata and link contacts to companies
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Button
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
                variant="outline"
                className="w-full"
              >
                Link Contacts to Companies
              </Button>
              <Button
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
                variant="outline"
                className="w-full"
              >
                Link Deals to Contacts/Companies
              </Button>
            </div>
            <Button
              onClick={async () => {
                try {
                  const response = await fetch("/api/hubspot/fix-data", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "fix-all" }),
                  });
                  const result = await response.json();
                  alert(`All fixes completed! Check console for details.`);
                  console.log('Fix all results:', result.results);
                } catch (error: any) {
                  alert(`Error: ${error.message}`);
                }
              }}
              variant="default"
              className="w-full"
            >
              Fix All Data
            </Button>
          </CardContent>
        </Card>

        {/* Manual Sync Card */}
        <Card>
          <CardHeader>
            <CardTitle>Manual Sync</CardTitle>
            <CardDescription>
              Trigger a one-time sync of up to 20 records from HubSpot
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Button
                onClick={handleManualSync}
                disabled={isSyncing || isSyncingLeads || isSyncingDeals || isSyncingCompanies || isSyncingContacts || isTestingImport}
                className="w-full"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="size-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-4 mr-2" />
                    Sync All
                  </>
                )}
              </Button>
              <Button
                onClick={handleSyncLeads}
                disabled={isSyncing || isSyncingLeads || isSyncingDeals || isSyncingCompanies || isSyncingContacts || isTestingImport}
                variant="outline"
                className="w-full"
              >
                {isSyncingLeads ? (
                  <>
                    <RefreshCw className="size-4 mr-2 animate-spin" />
                    Syncing Leads...
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-4 mr-2" />
                    Sync Leads Only
                  </>
                )}
              </Button>
              <Button
                onClick={handleSyncDeals}
                disabled={isSyncing || isSyncingLeads || isSyncingDeals || isSyncingCompanies || isSyncingContacts || isTestingImport}
                variant="outline"
                className="w-full"
              >
                {isSyncingDeals ? (
                  <>
                    <RefreshCw className="size-4 mr-2 animate-spin" />
                    Syncing Deals...
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-4 mr-2" />
                    Sync Deals Only
                  </>
                )}
              </Button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <Button
                onClick={handleSyncCompanies}
                disabled={isSyncing || isSyncingLeads || isSyncingDeals || isSyncingCompanies || isSyncingContacts || isTestingImport}
                variant="outline"
                className="w-full"
              >
                {isSyncingCompanies ? (
                  <>
                    <RefreshCw className="size-4 mr-2 animate-spin" />
                    Syncing Companies...
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-4 mr-2" />
                    Sync Companies (50)
                  </>
                )}
              </Button>
              <Button
                onClick={handleSyncContacts}
                disabled={isSyncing || isSyncingLeads || isSyncingDeals || isSyncingCompanies || isSyncingContacts || isTestingImport}
                variant="outline"
                className="w-full"
              >
                {isSyncingContacts ? (
                  <>
                    <RefreshCw className="size-4 mr-2 animate-spin" />
                    Syncing Contacts...
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-4 mr-2" />
                    Sync Contacts (50)
                  </>
                )}
              </Button>
            </div>

            {syncResult && (
              <div className={`p-4 rounded-lg border ${
                syncResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {syncResult.success ? (
                    <CheckCircle2 className="size-5 text-green-600" />
                  ) : (
                    <XCircle className="size-5 text-red-600" />
                  )}
                  <span className={`font-medium ${
                    syncResult.success ? "text-green-900" : "text-red-900"
                  }`}>
                    {syncResult.success ? "Sync Completed" : "Sync Failed"}
                  </span>
                </div>
                {syncResult.stats && (
                  <div className="text-sm space-y-1 mt-2">
                    <div>Companies: {syncResult.stats.companiesSynced}</div>
                    <div>Contacts: {syncResult.stats.contactsSynced}</div>
                    <div>Deals: {syncResult.stats.dealsSynced}</div>
                    {syncResult.stats.errors > 0 && (
                      <div className="text-red-600">Errors: {syncResult.stats.errors}</div>
                    )}
                  </div>
                )}
                {syncResult.error && (
                  <div className="text-sm text-red-600 mt-2">{syncResult.error}</div>
                )}
                {syncResult.errorMessages && syncResult.errorMessages.length > 0 && (
                  <div className="text-sm text-red-600 mt-2">
                    <div className="font-medium mb-1">Error Details:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {syncResult.errorMessages.slice(0, 5).map((msg: string, i: number) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            {leadsSyncResult && (
              <div className={`p-4 rounded-lg border ${
                leadsSyncResult.success ? "bg-blue-50 border-blue-200" : "bg-red-50 border-red-200"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {leadsSyncResult.success ? (
                    <CheckCircle2 className="size-5 text-blue-600" />
                  ) : (
                    <XCircle className="size-5 text-red-600" />
                  )}
                  <span className={`font-medium ${
                    leadsSyncResult.success ? "text-blue-900" : "text-red-900"
                  }`}>
                    {leadsSyncResult.success ? "Leads Sync Completed" : "Leads Sync Failed"}
                  </span>
                </div>
                {leadsSyncResult.stats && (
                  <div className="text-sm space-y-1 mt-2">
                    <div>Contacts Processed: {leadsSyncResult.stats.contactsProcessed}</div>
                    <div>Leads Synced: {leadsSyncResult.stats.leadsSynced}</div>
                    {leadsSyncResult.stats.errors > 0 && (
                      <div className="text-red-600">Errors: {leadsSyncResult.stats.errors}</div>
                    )}
                  </div>
                )}
                {leadsSyncResult.error && (
                  <div className="text-sm text-red-600 mt-2">{leadsSyncResult.error}</div>
                )}
                {leadsSyncResult.stats?.errorDetails && leadsSyncResult.stats.errorDetails.length > 0 && (
                  <div className="text-sm text-red-600 mt-2">
                    <div className="font-medium mb-1">Error Details:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {leadsSyncResult.stats.errorDetails.slice(0, 5).map((msg: string, i: number) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            {dealsSyncResult && (
              <div className={`p-4 rounded-lg border ${
                dealsSyncResult.success ? "bg-purple-50 border-purple-200" : "bg-red-50 border-red-200"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {dealsSyncResult.success ? (
                    <CheckCircle2 className="size-5 text-purple-600" />
                  ) : (
                    <XCircle className="size-5 text-red-600" />
                  )}
                  <span className={`font-medium ${
                    dealsSyncResult.success ? "text-purple-900" : "text-red-900"
                  }`}>
                    {dealsSyncResult.success ? "Deals Sync Completed" : "Deals Sync Failed"}
                  </span>
                </div>
                {dealsSyncResult.success && (
                  <div className="text-sm space-y-1 mt-2">
                    <div>Deals Synced: {dealsSyncResult.synced || 0}</div>
                    <div>Created: {dealsSyncResult.created || 0}</div>
                    <div>Updated: {dealsSyncResult.updated || 0}</div>
                    {dealsSyncResult.errors > 0 && (
                      <div className="text-red-600">Errors: {dealsSyncResult.errors}</div>
                    )}
                  </div>
                )}
                {dealsSyncResult.error && (
                  <div className="text-sm text-red-600 mt-2">{dealsSyncResult.error}</div>
                )}
                {dealsSyncResult.errorMessages && dealsSyncResult.errorMessages.length > 0 && (
                  <div className="text-sm text-red-600 mt-2">
                    <div className="font-medium mb-1">Error Details:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {dealsSyncResult.errorMessages.slice(0, 5).map((msg: string, i: number) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            {companiesSyncResult && (
              <div className={`p-4 rounded-lg border ${
                companiesSyncResult.success ? "bg-cyan-50 border-cyan-200" : "bg-red-50 border-red-200"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {companiesSyncResult.success ? (
                    <CheckCircle2 className="size-5 text-cyan-600" />
                  ) : (
                    <XCircle className="size-5 text-red-600" />
                  )}
                  <span className={`font-medium ${
                    companiesSyncResult.success ? "text-cyan-900" : "text-red-900"
                  }`}>
                    {companiesSyncResult.success ? "Companies Sync Completed" : "Companies Sync Failed"}
                  </span>
                </div>
                {companiesSyncResult.success && (
                  <div className="text-sm space-y-1 mt-2">
                    <div>Companies Synced: {companiesSyncResult.synced || 0}</div>
                    <div>Created: {companiesSyncResult.created || 0}</div>
                    <div>Updated: {companiesSyncResult.updated || 0}</div>
                    {companiesSyncResult.errors > 0 && (
                      <div className="text-red-600">Errors: {companiesSyncResult.errors}</div>
                    )}
                  </div>
                )}
                {companiesSyncResult.error && (
                  <div className="text-sm text-red-600 mt-2">{companiesSyncResult.error}</div>
                )}
                {companiesSyncResult.errorMessages && companiesSyncResult.errorMessages.length > 0 && (
                  <div className="text-sm text-red-600 mt-2">
                    <div className="font-medium mb-1">Error Details:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {companiesSyncResult.errorMessages.slice(0, 5).map((msg: string, i: number) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            {contactsSyncResult && (
              <div className={`p-4 rounded-lg border ${
                contactsSyncResult.success ? "bg-indigo-50 border-indigo-200" : "bg-red-50 border-red-200"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {contactsSyncResult.success ? (
                    <CheckCircle2 className="size-5 text-indigo-600" />
                  ) : (
                    <XCircle className="size-5 text-red-600" />
                  )}
                  <span className={`font-medium ${
                    contactsSyncResult.success ? "text-indigo-900" : "text-red-900"
                  }`}>
                    {contactsSyncResult.success ? "Contacts Sync Completed" : "Contacts Sync Failed"}
                  </span>
                </div>
                {contactsSyncResult.success && (
                  <div className="text-sm space-y-1 mt-2">
                    <div>Contacts Synced: {contactsSyncResult.synced || 0}</div>
                    <div>Created: {contactsSyncResult.created || 0}</div>
                    <div>Updated: {contactsSyncResult.updated || 0}</div>
                    {contactsSyncResult.errors > 0 && (
                      <div className="text-red-600">Errors: {contactsSyncResult.errors}</div>
                    )}
                  </div>
                )}
                {contactsSyncResult.error && (
                  <div className="text-sm text-red-600 mt-2">{contactsSyncResult.error}</div>
                )}
                {contactsSyncResult.errorMessages && contactsSyncResult.errorMessages.length > 0 && (
                  <div className="text-sm text-red-600 mt-2">
                    <div className="font-medium mb-1">Error Details:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {contactsSyncResult.errorMessages.slice(0, 5).map((msg: string, i: number) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recurring Sync Card */}
        <Card>
          <CardHeader>
            <CardTitle>Recurring Sync</CardTitle>
            <CardDescription>
              Automatically sync data from HubSpot on a schedule
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Recurring Sync</div>
                <div className="text-sm text-muted-foreground">
                  {recurringSyncEnabled
                    ? "Syncs every 24 hours"
                    : "Currently disabled"}
                </div>
              </div>
              <Button
                onClick={handleToggleRecurringSync}
                variant={recurringSyncEnabled ? "destructive" : "default"}
                size="sm"
              >
                {recurringSyncEnabled ? "Disable" : "Enable"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* HubSpot Portal Link */}
        <Card>
          <CardHeader>
            <CardTitle>HubSpot Portal</CardTitle>
            <CardDescription>
              Access your HubSpot account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href="https://app.hubspot.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary hover:underline"
            >
              <ExternalLink className="size-4" />
              Open HubSpot Portal
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

