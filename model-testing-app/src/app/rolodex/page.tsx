'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Search,
  X,
  ArrowUpDown,
  Building2,
  User,
  Mail,
  Phone,
  Briefcase,
  ExternalLink,
  Plus,
  Sparkles,
  CheckCircle2,
  Filter,
  RefreshCw,
} from 'lucide-react';
import CompactMetricCard from '@/components/CompactMetricCard';
import { HubSpotLink } from '@/components/HubSpotLink';
import CreateRolodexModal from '@/components/CreateRolodexModal';
import { Card, CardContent } from '@/components/ui/card';

export default function RolodexPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'companies' | 'contacts'>('companies');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [promotingCompanyId, setPromotingCompanyId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  
  // Fetch data
  const companies = useQuery(api.companies.getAll) || [];
  const contacts = useQuery(api.contacts.getAll) || [];
  const promoteToClient = useMutation(api.companies.promoteToClient);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date-newest' | 'date-oldest' | 'name' | 'date-added'>('date-newest');

  // Filter and sort companies
  const filteredCompanies = useMemo(() => {
    let filtered = companies;

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(company => 
        company.name?.toLowerCase().includes(query) ||
        company.website?.toLowerCase().includes(query) ||
        company.domain?.toLowerCase().includes(query) ||
        company.type?.toLowerCase().includes(query) ||
        company.industry?.toLowerCase().includes(query) ||
        company.city?.toLowerCase().includes(query)
      );
    }

    // Apply lifecycle filter
    if (lifecycleFilter !== 'all') {
      filtered = filtered.filter(c => c.hubspotLifecycleStage === lifecycleFilter);
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'date-newest') {
        const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return dateB - dateA;
      } else if (sortBy === 'date-oldest') {
        const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return dateA - dateB;
      } else if (sortBy === 'name') {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB);
      }
      return 0;
    });

    return filtered;
  }, [companies, searchQuery, lifecycleFilter, sortBy]);

  // Filter and sort contacts
  const filteredContacts = useMemo(() => {
    let filtered = contacts;

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(contact => 
        contact.name?.toLowerCase().includes(query) ||
        contact.email?.toLowerCase().includes(query) ||
        contact.phone?.toLowerCase().includes(query) ||
        contact.company?.toLowerCase().includes(query) ||
        contact.role?.toLowerCase().includes(query)
      );
    }

    // Apply lifecycle filter
    if (lifecycleFilter !== 'all') {
      filtered = filtered.filter(c => c.hubspotLifecycleStage === lifecycleFilter);
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'date-newest' || sortBy === 'date-added') {
        const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return dateB - dateA;
      } else if (sortBy === 'date-oldest') {
        const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return dateA - dateB;
      } else if (sortBy === 'name') {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB);
      }
      return 0;
    });

    return filtered;
  }, [contacts, searchQuery, lifecycleFilter, sortBy]);

  const clearFilters = () => {
    setSearchQuery('');
    setLifecycleFilter('all');
    setSortBy('date-newest');
  };

  const hasActiveFilters = lifecycleFilter !== 'all' || searchQuery.trim() !== '';

  const handlePromoteToClient = async (companyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (promotingCompanyId) return;
    
    setPromotingCompanyId(companyId);
    try {
      const clientId = await promoteToClient({ id: companyId as any });
      // Redirect to client dashboard
      router.push(`/clients/${clientId}`);
    } catch (error) {
      console.error('Error promoting company to client:', error);
      alert('Failed to promote company to client. Please try again.');
      setPromotingCompanyId(null);
    }
  };

  const handleSyncHubSpot = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    
    try {
      // Sync both companies and contacts
      const [companiesResponse, contactsResponse] = await Promise.all([
        fetch("/api/hubspot/sync-companies", { method: "POST" }),
        fetch("/api/hubspot/sync-contacts", { method: "POST" })
      ]);
      
      const companiesResult = await companiesResponse.json();
      const contactsResult = await contactsResponse.json();
      
      setSyncResult({
        success: companiesResult.success && contactsResult.success,
        companiesSynced: companiesResult.synced || companiesResult.stats?.companiesSynced || 0,
        contactsSynced: contactsResult.synced || contactsResult.stats?.contactsSynced || 0,
        error: companiesResult.error || contactsResult.error || null,
      });
      
      // Refresh the page after successful sync
      if (companiesResult.success && contactsResult.success) {
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (error: any) {
      setSyncResult({
        success: false,
        error: error.message || "Sync failed",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Calculate metrics for companies
  const companyMetrics = useMemo(() => {
    const lifecycleStages = companies.reduce((acc: Record<string, number>, company) => {
      const stage = company.hubspotLifecycleStageName || company.hubspotLifecycleStage || 'unknown';
      acc[stage] = (acc[stage] || 0) + 1;
      return acc;
    }, {});
    
    return {
      total: companies.length,
      opportunity: lifecycleStages['opportunity'] || lifecycleStages['Opportunity'] || 0,
      customer: lifecycleStages['customer'] || lifecycleStages['Customer'] || 0,
    };
  }, [companies]);

  // Calculate metrics for contacts
  const contactMetrics = useMemo(() => {
    const lifecycleStages = contacts.reduce((acc: Record<string, number>, contact) => {
      const stage = contact.hubspotLifecycleStageName || contact.hubspotLifecycleStage || 'unknown';
      acc[stage] = (acc[stage] || 0) + 1;
      return acc;
    }, {});
    
    return {
      total: contacts.length,
      opportunity: lifecycleStages['opportunity'] || lifecycleStages['Opportunity'] || 0,
      customer: lifecycleStages['customer'] || lifecycleStages['Customer'] || 0,
    };
  }, [contacts]);

  if (companies === undefined || contacts === undefined) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading rolodex...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'companies' | 'contacts')} className="space-y-6">
          {/* Page Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl text-gray-900" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', fontWeight: 700 }}>
                Rolodex
              </h1>
              <p className="mt-2 text-gray-600" style={{ fontWeight: 400 }}>
                Manage your contacts and companies database
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-black text-white hover:bg-gray-800 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {activeTab === 'companies' ? 'Create Company' : 'Create Contact'}
              </Button>
              <Button
                onClick={handleSyncHubSpot}
                disabled={isSyncing}
                className="bg-black text-white hover:bg-gray-800 flex items-center gap-2"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Sync HubSpot
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Sync Result Message */}
          {syncResult && (
            <div className={`mb-6 p-4 rounded-lg border ${
              syncResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
            }`}>
              <div className="flex items-center gap-2">
                {syncResult.success ? (
                  <>
                    <CheckCircle2 className="size-5 text-green-600" />
                    <span className="font-medium text-green-900">
                      Sync Completed: {syncResult.companiesSynced || 0} companies, {syncResult.contactsSynced || 0} contacts synced
                    </span>
                  </>
                ) : (
                  <>
                    <X className="size-5 text-red-600" />
                    <span className="font-medium text-red-900">
                      Sync Failed: {syncResult.error || 'Unknown error'}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Companies Tab */}
          <TabsContent value="companies" className="space-y-6">
            {/* Tabs and Metric Cards - Inline */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {/* Tabs */}
              <div className="flex items-stretch">
                <TabsList className="inline-flex bg-gray-100 p-1 rounded-lg w-full h-full">
                  <TabsTrigger 
                    value="companies" 
                    className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium data-[state=active]:!bg-blue-600 data-[state=active]:!text-white data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-600 hover:data-[state=inactive]:bg-gray-200 transition-colors flex-1 h-full"
                  >
                    <Building2 className="w-5 h-5" />
                    <span>Companies</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="contacts" 
                    className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium data-[state=active]:!bg-blue-600 data-[state=active]:!text-white data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-600 hover:data-[state=inactive]:bg-gray-200 transition-colors flex-1 h-full"
                  >
                    <User className="w-5 h-5" />
                    <span>Contacts</span>
                  </TabsTrigger>
                </TabsList>
              </div>
              {/* Metric Cards */}
              <CompactMetricCard
                label="Total Companies"
                value={companyMetrics.total}
                icon={Building2}
                iconColor="blue"
                className="bg-black text-white"
              />
              <CompactMetricCard
                label="Opportunity"
                value={companyMetrics.opportunity}
                icon={Building2}
                iconColor="gray"
                className="bg-black text-white"
              />
              <CompactMetricCard
                label="Customer"
                value={companyMetrics.customer}
                icon={Building2}
                iconColor="gray"
                className="bg-black text-white"
              />
            </div>


            {/* Companies Table */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-white" />
                  <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                    Companies
                  </span>
                </div>
                <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                  {filteredCompanies.length} {filteredCompanies.length === 1 ? 'Company' : 'Companies'}
                </span>
              </div>
              <CardContent className="pt-0 pb-6">
                {filteredCompanies.length === 0 ? (
                  <div className="p-12 text-center">
                    <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-900 font-medium mb-1">No companies found</p>
                    <p className="text-sm text-gray-500 mb-4">
                      {hasActiveFilters 
                        ? 'Try adjusting your search or filters' 
                        : 'Companies will appear here after syncing from HubSpot.'}
                    </p>
                    {hasActiveFilters && (
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Clear Filters
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Filter and Sort Controls */}
                    <div className="px-2 py-3 border-b border-gray-200 flex items-center justify-between gap-4">
                      {/* Search Bar - Left Side */}
                      <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <Input
                          placeholder="Search companies..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="text-sm pl-10"
                        />
                      </div>
                      
                      {/* Filters and Sort - Right Side */}
                      <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <select
                          value={lifecycleFilter}
                          onChange={(e) => setLifecycleFilter(e.target.value)}
                          className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-black"
                        >
                          <option value="all">All Stages</option>
                          <option value="lead">Lead</option>
                          <option value="opportunity">Opportunity</option>
                          <option value="customer">Customer</option>
                          <option value="evangelist">Evangelist</option>
                        </select>
                        <ArrowUpDown className="w-4 h-4 text-gray-500 ml-2" />
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as any)}
                          className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-black"
                        >
                          <option value="date-added">Date Added (Newest)</option>
                          <option value="date-oldest">Date Added (Oldest)</option>
                          <option value="name">Name (A-Z)</option>
                        </select>
                        {hasActiveFilters && (
                          <Button variant="outline" onClick={clearFilters} size="sm" className="ml-2">
                            <X className="w-4 h-4 mr-1" />
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-gray-200">
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Company Name</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Website</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Type</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Lifecycle Stage</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Location</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Date Added</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-gray-700 uppercase">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCompanies.map((company) => {
                          const truncateUrl = (url: string, maxLength: number = 20) => {
                            if (url.length <= maxLength) return url;
                            return url.substring(0, maxLength - 3) + '...';
                          };
                          const displayWebsite = company.website ? truncateUrl(company.website.replace(/^https?:\/\//, '')) : null;
                          
                          return (
                            <TableRow
                              key={company._id}
                              className="cursor-pointer hover:bg-gray-50"
                              onClick={() => router.push(`/companies/${company._id}`)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900">{company.name}</span>
                                  {company.hubspotUrl && <HubSpotLink url={company.hubspotUrl} />}
                                </div>
                              </TableCell>
                              <TableCell>
                                {company.website ? (
                                  <a
                                    href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                    title={company.website}
                                  >
                                    <span className="truncate">{displayWebsite}</span>
                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                  </a>
                                ) : (
                                  <span className="text-sm text-gray-400">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <span className="text-sm text-gray-900">{company.type || '—'}</span>
                              </TableCell>
                              <TableCell>
                                {company.hubspotLifecycleStageName ? (
                                  <Badge variant="outline" className="text-xs">{company.hubspotLifecycleStageName}</Badge>
                                ) : (
                                  <span className="text-sm text-gray-400">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <span className="text-sm text-gray-600 truncate block">
                                  {[company.city, company.state].filter(Boolean).join(', ') || '—'}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm text-gray-600">
                                  {company.createdAt
                                    ? new Date(company.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                    : '—'}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {company.promotedToClientId ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-3 text-xs text-green-600"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/clients/${company.promotedToClientId}`);
                                      }}
                                    >
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                      Client
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-3 text-xs"
                                      onClick={(e) => handlePromoteToClient(company._id, e)}
                                      disabled={promotingCompanyId === company._id}
                                    >
                                      <Sparkles className="w-3 h-3 mr-1" />
                                      {promotingCompanyId === company._id ? 'Promoting...' : 'Promote'}
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-3 text-xs text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/companies/${company._id}`);
                                    }}
                                  >
                                    View
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="contacts" className="space-y-6">
            {/* Tabs and Metric Cards - Inline */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {/* Tabs */}
              <div className="flex items-stretch">
                <TabsList className="inline-flex bg-gray-100 p-1 rounded-lg w-full h-full">
                  <TabsTrigger 
                    value="companies" 
                    className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium data-[state=active]:!bg-blue-600 data-[state=active]:!text-white data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-600 hover:data-[state=inactive]:bg-gray-200 transition-colors flex-1 h-full"
                  >
                    <Building2 className="w-5 h-5" />
                    <span>Companies</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="contacts" 
                    className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium data-[state=active]:!bg-blue-600 data-[state=active]:!text-white data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-600 hover:data-[state=inactive]:bg-gray-200 transition-colors flex-1 h-full"
                  >
                    <User className="w-5 h-5" />
                    <span>Contacts</span>
                  </TabsTrigger>
                </TabsList>
              </div>
              {/* Metric Cards */}
              <CompactMetricCard
                label="Total Contacts"
                value={contactMetrics.total}
                icon={User}
                iconColor="blue"
                className="bg-black text-white"
              />
              <CompactMetricCard
                label="Opportunity"
                value={contactMetrics.opportunity}
                icon={User}
                iconColor="gray"
                className="bg-black text-white"
              />
              <CompactMetricCard
                label="Customer"
                value={contactMetrics.customer}
                icon={User}
                iconColor="gray"
                className="bg-black text-white"
              />
            </div>

            {/* Contacts Table */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-white" />
                  <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                    Contacts
                  </span>
                </div>
                <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                  {filteredContacts.length} {filteredContacts.length === 1 ? 'Contact' : 'Contacts'}
                </span>
              </div>
              <CardContent className="pt-0 pb-6">
                {filteredContacts.length === 0 ? (
                  <div className="p-12 text-center">
                    <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-900 font-medium mb-1">No contacts found</p>
                    <p className="text-sm text-gray-500 mb-4">
                      {hasActiveFilters 
                        ? 'Try adjusting your search or filters' 
                        : 'Contacts will appear here after syncing from HubSpot.'}
                    </p>
                    {hasActiveFilters && (
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Clear Filters
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Filter and Sort Controls */}
                    <div className="px-2 py-3 border-b border-gray-200 flex items-center justify-between gap-4">
                      {/* Search Bar - Left Side */}
                      <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <Input
                          placeholder="Search contacts..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="text-sm pl-10"
                        />
                      </div>
                      
                      {/* Filters and Sort - Right Side */}
                      <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <select
                          value={lifecycleFilter}
                          onChange={(e) => setLifecycleFilter(e.target.value)}
                          className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-black"
                        >
                          <option value="all">All Stages</option>
                          <option value="lead">Lead</option>
                          <option value="opportunity">Opportunity</option>
                          <option value="customer">Customer</option>
                          <option value="evangelist">Evangelist</option>
                        </select>
                        <ArrowUpDown className="w-4 h-4 text-gray-500 ml-2" />
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as any)}
                          className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-black"
                        >
                          <option value="date-added">Date Added (Newest)</option>
                          <option value="date-oldest">Date Added (Oldest)</option>
                          <option value="name">Name (A-Z)</option>
                        </select>
                        {hasActiveFilters && (
                          <Button variant="outline" onClick={clearFilters} size="sm" className="ml-2">
                            <X className="w-4 h-4 mr-1" />
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-gray-200">
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Name</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Email</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Phone</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Company</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Role</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Lifecycle Stage</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Date Added</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-gray-700 uppercase">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredContacts.map((contact) => (
                          <TableRow
                            key={contact._id}
                            className="cursor-pointer hover:bg-gray-50"
                            onClick={() => router.push(`/contacts/${contact._id}`)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">{contact.name}</span>
                                {contact.hubspotUrl && <HubSpotLink url={contact.hubspotUrl} />}
                              </div>
                            </TableCell>
                            <TableCell>
                              {contact.email ? (
                                <a
                                  href={`mailto:${contact.email}`}
                                  className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {contact.email}
                                  <Mail className="w-3 h-3" />
                                </a>
                              ) : (
                                <span className="text-sm text-gray-400">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {contact.phone ? (
                                <a
                                  href={`tel:${contact.phone}`}
                                  className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {contact.phone}
                                  <Phone className="w-3 h-3" />
                                </a>
                              ) : (
                                <span className="text-sm text-gray-400">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-gray-900">{contact.company || '—'}</span>
                            </TableCell>
                            <TableCell>
                              {contact.role ? (
                                <div className="flex items-center gap-1">
                                  <Briefcase className="w-3 h-3 text-gray-400" />
                                  <span className="text-sm text-gray-900">{contact.role}</span>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {contact.hubspotLifecycleStageName ? (
                                <Badge variant="outline" className="text-xs">{contact.hubspotLifecycleStageName}</Badge>
                              ) : (
                                <span className="text-sm text-gray-400">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-gray-600">
                                {contact.createdAt
                                  ? new Date(contact.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                  : '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-3 text-xs text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/contacts/${contact._id}`);
                                }}
                              >
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Create Modal */}
        <CreateRolodexModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            // Data will refresh automatically via useQuery
          }}
        />
      </div>
    </div>
  );
}



