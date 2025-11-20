'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Building2,
  RefreshCw,
  Download,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { Id } from '../../../convex/_generated/dataModel';

const TARGET_SIC_CODES = [
  '41100',
  '41202',
  '43390',
  '64203',
  '64209',
  '64305',
  '64306',
  '68100',
];

interface CompanyWithCharges {
  _id: Id<'companiesHouseCompanies'>;
  companyNumber: string;
  companyName: string;
  sicCodes: string[];
  address?: string;
  incorporationDate?: string;
  companyStatus?: string;
  hasNewCharges?: boolean;
  lastCheckedAt?: string;
  chargeCount: number;
  newChargeCount: number;
}

export default function CompaniesHouseTestPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'new'>('all');
  const [maxCompanies, setMaxCompanies] = useState(10);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<CompanyWithCharges | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const allCompanies = (useQuery(
    api.companiesHouse.listCompanies, 
    {}
  ) as any) || [];
  const companiesWithNewCharges = useQuery(
    api.companiesHouse.getCompaniesWithNewCharges
  ) || [];

  const getCompany = useQuery(
    api.companiesHouse.getCompany,
    selectedCompany ? { companyId: selectedCompany._id } : 'skip'
  );

  const prospect = useQuery(
    api.prospects.getProspectByCompanyNumber,
    selectedCompany ? { companyNumber: selectedCompany.companyNumber } : 'skip'
  );

  const planningApps = useQuery(
    api.planning.getPlanningApplicationsForCompany,
    selectedCompany ? { companyNumber: selectedCompany.companyNumber } : 'skip'
  );

  const properties = useQuery(
    api.property.getPropertiesForCompany,
    selectedCompany ? { companyNumber: selectedCompany.companyNumber } : 'skip'
  );

  const markChargesAsSeen = useMutation(api.companiesHouse.markChargesAsSeen);

  const displayedCompanies =
    activeTab === 'new' ? companiesWithNewCharges : allCompanies;

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncStatus('Starting sync...');

    try {
      const response = await fetch('/api/companies-house/sync-companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sicCodes: TARGET_SIC_CODES,
          maxCompanies,
        }),
      });

      const result = await response.json();

      if (result.success) {
        const message = result.message || `Sync completed! ${result.stats.companiesSynced} companies synced, ${result.stats.chargesSynced} charges found.`;
        setSyncStatus(message);
        
        // If no companies found, provide helpful message
        if (result.companiesToSync === 0) {
          setSyncStatus(
            `No companies found matching the specified SIC codes. The search may be too restrictive. Try increasing maxCompanies or check the console logs for details.`
          );
        }
      } else {
        setSyncStatus(`Sync failed: ${result.error}`);
      }
    } catch (error: any) {
      setSyncStatus(`Error: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleViewDetails = async (company: CompanyWithCharges) => {
    setSelectedCompany(company);
    setIsDetailsOpen(true);
  };

  const handleMarkAsSeen = async (companyId: Id<'companiesHouseCompanies'>) => {
    try {
      await markChargesAsSeen({ companyId });
    } catch (error) {
      console.error('Error marking charges as seen:', error);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Building2 className="size-6" />
          Companies House Test Page
        </h1>
        <p className="text-muted-foreground">
          Search and monitor companies by SIC codes, track charges (loans)
        </p>
      </div>

      {/* Sync Controls */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Sync Companies</CardTitle>
          <CardDescription>
            Search Companies House for companies matching target SIC codes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="sic-codes">Target SIC Codes</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {TARGET_SIC_CODES.map((code) => (
                  <Badge key={code} variant="outline">
                    {code}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="w-full sm:w-48">
              <Label htmlFor="max-companies">Max Companies (max 50)</Label>
              <Input
                id="max-companies"
                type="number"
                min="1"
                max="50"
                value={maxCompanies}
                onChange={(e) => setMaxCompanies(Math.min(parseInt(e.target.value) || 10, 50))}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Limited to 50 per batch for rate limiting
              </p>
            </div>
            <Button
              onClick={handleSync}
              disabled={isSyncing}
              className="w-full sm:w-auto"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="size-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="size-4 mr-2" />
                  Sync Companies
                </>
              )}
            </Button>
          </div>
          {syncStatus && (
            <div
              className={`p-3 rounded-md text-sm ${
                syncStatus.includes('failed') || syncStatus.includes('Error')
                  ? 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                  : 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400'
              }`}
            >
              {syncStatus}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Companies Table */}
      <Card>
        <CardHeader>
          <CardTitle>Companies</CardTitle>
          <CardDescription>
            {displayedCompanies.length} company
            {displayedCompanies.length !== 1 ? 'ies' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'new')}>
            <TabsList>
              <TabsTrigger value="all">
                All Companies ({allCompanies.length})
              </TabsTrigger>
              <TabsTrigger value="new">
                New Charges ({companiesWithNewCharges.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              <CompaniesTable
                companies={allCompanies}
                onViewDetails={handleViewDetails}
                onMarkAsSeen={handleMarkAsSeen}
                formatDate={formatDate}
                formatDateTime={formatDateTime}
              />
            </TabsContent>

            <TabsContent value="new" className="mt-4">
              <CompaniesTable
                companies={companiesWithNewCharges}
                onViewDetails={handleViewDetails}
                onMarkAsSeen={handleMarkAsSeen}
                formatDate={formatDate}
                formatDateTime={formatDateTime}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Company Details Drawer */}
      {selectedCompany && (
        <CompanyDetailsDrawer
          isOpen={isDetailsOpen}
          onClose={() => {
            setIsDetailsOpen(false);
            setSelectedCompany(null);
          }}
          company={selectedCompany}
        companyData={getCompany}
        prospect={prospect}
        planningApps={planningApps}
        properties={properties}
        onMarkAsSeen={handleMarkAsSeen}
        onRunGauntlet={async (companyNumber) => {
          const response = await fetch('/api/prospects/run-gauntlet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyNumber }),
          });
          if (!response.ok) {
            throw new Error('Failed to run gauntlet');
          }
          return response.json();
        }}
        formatDate={formatDate}
        formatDateTime={formatDateTime}
        />
      )}
    </div>
  );
}

interface CompaniesTableProps {
  companies: CompanyWithCharges[];
  onViewDetails: (company: CompanyWithCharges) => void;
  onMarkAsSeen: (companyId: Id<'companiesHouseCompanies'>) => void;
  formatDate: (date?: string) => string;
  formatDateTime: (date?: string) => string;
}

function CompaniesTable({
  companies,
  onViewDetails,
  onMarkAsSeen,
  formatDate,
  formatDateTime,
}: CompaniesTableProps) {
  if (companies.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No companies found. Use the sync button above to search for companies.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company Name</TableHead>
            <TableHead>Company Number</TableHead>
            <TableHead>SIC Codes</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Charges</TableHead>
            <TableHead>Last Checked</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => (
            <TableRow key={company._id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {company.companyName}
                  {company.hasNewCharges && (
                    <Badge variant="destructive" className="text-xs">
                      New
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="font-mono text-sm">
                {company.companyNumber}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {company.sicCodes.slice(0, 3).map((code) => (
                    <Badge key={code} variant="outline" className="text-xs">
                      {code}
                    </Badge>
                  ))}
                  {company.sicCodes.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{company.sicCodes.length - 3}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    company.companyStatus === 'active' ? 'default' : 'secondary'
                  }
                >
                  {company.companyStatus || '—'}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span>{company.chargeCount}</span>
                  {company.newChargeCount > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {company.newChargeCount} new
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDateTime(company.lastCheckedAt)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewDetails(company)}
                  >
                    View
                  </Button>
                  {company.hasNewCharges && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onMarkAsSeen(company._id)}
                    >
                      <CheckCircle2 className="size-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface CompanyDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  company: CompanyWithCharges;
  companyData: any;
  prospect: any;
  planningApps: any;
  properties: any;
  onMarkAsSeen: (companyId: Id<'companiesHouseCompanies'>) => void;
  onRunGauntlet: (companyNumber: string) => Promise<void>;
  formatDate: (date?: string) => string;
  formatDateTime: (date?: string) => string;
}

function CompanyDetailsDrawer({
  isOpen,
  onClose,
  company,
  companyData,
  prospect,
  planningApps,
  properties,
  onMarkAsSeen,
  onRunGauntlet,
  formatDate,
  formatDateTime,
}: CompanyDetailsDrawerProps) {
  const [selectedPdfUrl, setSelectedPdfUrl] = useState<string | null>(null);
  const [selectedChargeName, setSelectedChargeName] = useState<string>('');
  const [isRunningGauntlet, setIsRunningGauntlet] = useState(false);

  if (!company) return null;

  const charges = companyData?.charges || [];
  const psc = companyData?.psc || [];
  const officers = companyData?.officers || [];
  const relationships = companyData?.relationships || [];
  const registeredOfficeAddress = companyData?.registeredOfficeAddress;

  const handleRunGauntlet = async () => {
    setIsRunningGauntlet(true);
    try {
      await onRunGauntlet(company.companyNumber);
      alert('Gauntlet triggered successfully! Check back in a few moments.');
    } catch (error) {
      console.error('Error running gauntlet:', error);
      alert('Failed to run gauntlet. Please try again.');
    } finally {
      setIsRunningGauntlet(false);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose} direction="right">
      <DrawerContent className="!w-[70vw] !max-w-[70vw] h-full !transform-none will-change-auto">
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle className="flex items-center gap-2 text-xl">
                {company.companyName}
                {company.hasNewCharges && (
                  <Badge variant="destructive">New Charges</Badge>
                )}
              </DrawerTitle>
              <DrawerDescription className="mt-1">
                Company Number: {company.companyNumber}
              </DrawerDescription>
            </div>
            {company.hasNewCharges && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onMarkAsSeen(company._id)}
              >
                <CheckCircle2 className="size-4 mr-2" />
                Mark as Seen
              </Button>
            )}
          </div>
        </DrawerHeader>
        
        <div className="overflow-y-auto flex-1 p-8" style={{ 
          transform: 'translateZ(0)',
          WebkitFontSmoothing: 'antialiased',
          textRendering: 'optimizeLegibility',
        }}>
          <div className="space-y-8 max-w-5xl">
          {/* Company Information */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Company Information</h3>
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                <Badge variant="outline">{company.companyStatus || '—'}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Incorporated:</span>{' '}
                {formatDate(company.incorporationDate)}
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Companies House Profile:</span>{' '}
                <a
                  href={`https://find-and-update.company-information.service.gov.uk/company/${company.companyNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  View on Companies House →
                </a>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Address:</span>{' '}
                {company.address || '—'}
              </div>
              {registeredOfficeAddress && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Registered Office:</span>
                  <div className="mt-1 text-sm">
                    {registeredOfficeAddress.premises && `${registeredOfficeAddress.premises}, `}
                    {registeredOfficeAddress.address_line_1 && `${registeredOfficeAddress.address_line_1}, `}
                    {registeredOfficeAddress.address_line_2 && `${registeredOfficeAddress.address_line_2}, `}
                    {registeredOfficeAddress.locality && `${registeredOfficeAddress.locality}, `}
                    {registeredOfficeAddress.region && `${registeredOfficeAddress.region}, `}
                    {registeredOfficeAddress.postal_code && `${registeredOfficeAddress.postal_code}, `}
                    {registeredOfficeAddress.country && registeredOfficeAddress.country}
                  </div>
                </div>
              )}
              <div className="col-span-2">
                <span className="text-muted-foreground">SIC Codes:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {company.sicCodes.map((code) => (
                    <Badge key={code} variant="outline">
                      {code}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Charges */}
          <div>
            <h3 className="font-semibold text-lg mb-4">
              Charges ({charges.length})
            </h3>
            {charges.length === 0 ? (
              <p className="text-sm text-muted-foreground">No charges found</p>
            ) : (
              <div className="space-y-4">
                {charges.map((charge: any) => (
                  <Card key={charge._id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">
                              Charge #{charge.chargeNumber || charge.chargeId}
                            </span>
                            {charge.chargeStatus && (
                              <Badge 
                                variant={
                                  charge.chargeStatus.toLowerCase() === 'outstanding' 
                                    ? 'default' 
                                    : charge.chargeStatus.toLowerCase().includes('satisfied')
                                    ? 'secondary'
                                    : 'outline'
                                } 
                                className="text-xs"
                              >
                                {charge.chargeStatus}
                              </Badge>
                            )}
                            {charge.chargeDate && (() => {
                              const chargeDate = new Date(charge.chargeDate);
                              const twelveMonthsAgo = new Date();
                              twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
                              const isRecent = chargeDate >= twelveMonthsAgo;
                              return isRecent ? (
                                <Badge variant="default" className="text-xs bg-green-600">
                                  Recent (within 12 months)
                                </Badge>
                              ) : null;
                            })()}
                            {charge.isNew && (
                              <Badge variant="destructive" className="text-xs">
                                New Charge
                              </Badge>
                            )}
                          </div>
                          {charge.chargeDescription && (
                            <p className="text-sm text-muted-foreground">
                              {charge.chargeDescription}
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {charge.chargeDate && (
                              <div>
                                <span className="text-muted-foreground">Date:</span>{' '}
                                {formatDate(charge.chargeDate)}
                              </div>
                            )}
                            {charge.chargeeName && (
                              <div>
                                <span className="text-muted-foreground">Chargee:</span>{' '}
                                {charge.chargeeName}
                              </div>
                            )}
                            {charge.chargeAmount && (
                              <div>
                                <span className="text-muted-foreground">Amount:</span>{' '}
                                £{charge.chargeAmount.toLocaleString()}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {charge.pdfDocumentId && (
                            <ChargePdfButton 
                              storageId={charge.pdfDocumentId}
                              chargeName={`Charge #${charge.chargeNumber || charge.chargeId}`}
                              onViewPdf={(url) => {
                                setSelectedPdfUrl(url);
                                setSelectedChargeName(`Charge #${charge.chargeNumber || charge.chargeId}`);
                              }}
                            />
                          )}
                          {charge.pdfUrl && !charge.pdfDocumentId && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedPdfUrl(charge.pdfUrl);
                                setSelectedChargeName(`Charge #${charge.chargeNumber || charge.chargeId}`);
                              }}
                            >
                              <FileText className="size-4 mr-2" />
                              View PDF
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Persons with Significant Control */}
          <div>
            <h3 className="font-semibold text-lg mb-4">
              Persons with Significant Control ({psc.length})
            </h3>
            {psc.length === 0 ? (
              <p className="text-sm text-muted-foreground">No PSC data available</p>
            ) : (
              <div className="space-y-4">
                {psc.map((p: any) => (
                  <div key={p._id} className="border rounded-lg p-4 text-sm">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-muted-foreground mt-1">
                      <Badge variant="outline" className="mr-2">{p.pscType}</Badge>
                      {p.nationality && <span>Nationality: {p.nationality}</span>}
                    </div>
                    {p.naturesOfControl && p.naturesOfControl.length > 0 && (
                      <div className="mt-2">
                        <span className="text-muted-foreground">Control:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.naturesOfControl.map((nature: string, idx: number) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {nature}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {p.notifiableOn && (
                      <div className="text-muted-foreground mt-1">
                        Notified: {formatDate(p.notifiableOn)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Officers */}
          <div>
            <h3 className="font-semibold text-lg mb-4">
              Officers ({officers.length})
            </h3>
            {officers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No officers data available</p>
            ) : (
              <div className="space-y-4">
                {officers.map((officer: any) => (
                  <div key={officer._id} className="border rounded-lg p-4 text-sm">
                    <div className="font-medium">{officer.name}</div>
                    <div className="text-muted-foreground mt-1">
                      <Badge variant="outline" className="mr-2">{officer.officerRole}</Badge>
                      {officer.nationality && <span>Nationality: {officer.nationality}</span>}
                    </div>
                    {officer.appointedOn && (
                      <div className="text-muted-foreground mt-1">
                        Appointed: {formatDate(officer.appointedOn)}
                      </div>
                    )}
                    {officer.resignedOn && (
                      <div className="text-muted-foreground mt-1">
                        Resigned: {formatDate(officer.resignedOn)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Related Companies */}
          <div>
            <h3 className="font-semibold text-lg mb-4">
              Related Companies ({relationships.length})
            </h3>
            {relationships.length === 0 ? (
              <p className="text-sm text-muted-foreground">No relationships found</p>
            ) : (
              <div className="space-y-4">
                {relationships.map((rel: any) => {
                  const relatedCompany = rel.companyId1 === company._id ? rel.company2 : rel.company1;
                  if (!relatedCompany) return null;
                  
                  return (
                    <div key={rel._id} className="border rounded-lg p-4 text-sm">
                      <div className="font-medium">{relatedCompany.companyName}</div>
                      <div className="text-muted-foreground mt-1">
                        <Badge variant="outline" className="mr-2">
                          {rel.relationshipType.replace('_', ' ')}
                        </Badge>
                        <Badge variant="secondary">
                          Strength: {rel.strength}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Company Number: {relatedCompany.companyNumber}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </div>
        <DrawerFooter className="border-t">
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
      
      {/* PDF Viewer Modal */}
      <Dialog open={!!selectedPdfUrl} onOpenChange={(open) => !open && setSelectedPdfUrl(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>{selectedChargeName} - PDF Viewer</DialogTitle>
          </DialogHeader>
          <div className="p-6">
            {selectedPdfUrl && (
              <iframe
                src={selectedPdfUrl}
                className="w-full h-[80vh] border border-gray-200 rounded"
                title={selectedChargeName}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Drawer>
  );
}

// Component to handle PDF viewing from Convex storage
function ChargePdfButton({ 
  storageId, 
  chargeName,
  onViewPdf 
}: { 
  storageId: Id<"_storage">;
  chargeName: string;
  onViewPdf: (url: string) => void;
}) {
  const pdfUrl = useQuery(api.companiesHouse.getChargePdfUrl, { storageId });

  if (!pdfUrl) {
    return (
      <Button variant="outline" size="sm" disabled>
        <FileText className="size-4 mr-2" />
        Loading...
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onViewPdf(pdfUrl)}
    >
      <FileText className="size-4 mr-2" />
      View PDF
    </Button>
  );
}

