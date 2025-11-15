'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
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
} from 'lucide-react';
import MetricCard from '@/components/MetricCard';
import { HubSpotLink } from '@/components/HubSpotLink';

export default function RolodexPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'companies' | 'contacts'>('companies');
  
  // Fetch data
  const companies = useQuery(api.companies.getAll) || [];
  const contacts = useQuery(api.contacts.getAll) || [];
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date-newest' | 'date-oldest' | 'name'>('date-newest');

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
  }, [contacts, searchQuery, lifecycleFilter, sortBy]);

  const clearFilters = () => {
    setSearchQuery('');
    setLifecycleFilter('all');
    setSortBy('date-newest');
  };

  const hasActiveFilters = lifecycleFilter !== 'all' || searchQuery.trim() !== '';

  // Calculate metrics for companies
  const companyMetrics = useMemo(() => {
    const lifecycleStages = companies.reduce((acc: Record<string, number>, company) => {
      const stage = company.hubspotLifecycleStageName || company.hubspotLifecycleStage || 'unknown';
      acc[stage] = (acc[stage] || 0) + 1;
      return acc;
    }, {});
    
    return {
      total: companies.length,
      ...lifecycleStages,
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
      withEmail: contacts.filter(c => c.email).length,
      withPhone: contacts.filter(c => c.phone).length,
      ...lifecycleStages,
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
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'companies' | 'contacts')} className="space-y-6">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Rolodex</h1>
                <p className="mt-2 text-gray-600">
                  Manage your contacts and companies database
                </p>
              </div>
              {/* Tabs */}
              <TabsList className="grid grid-cols-2 bg-gray-100 p-1 w-auto">
                <TabsTrigger 
                  value="companies" 
                  className="flex items-center gap-2 px-8 py-2 text-sm font-medium data-[state=active]:bg-black data-[state=active]:text-white data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-600 hover:data-[state=inactive]:bg-gray-200 transition-colors"
                >
                  <Building2 className="w-4 h-4" />
                  Companies ({companies.length})
                </TabsTrigger>
                <TabsTrigger 
                  value="contacts" 
                  className="flex items-center gap-2 px-8 py-2 text-sm font-medium data-[state=active]:bg-black data-[state=active]:text-white data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-600 hover:data-[state=inactive]:bg-gray-200 transition-colors"
                >
                  <User className="w-4 h-4" />
                  Contacts ({contacts.length})
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          {/* Companies Tab */}
          <TabsContent value="companies" className="space-y-6">
            {/* Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard
                label="Total Companies"
                value={companyMetrics.total}
                icon={Building2}
                iconColor="blue"
              />
              {Object.entries(companyMetrics).filter(([key]) => key !== 'total').slice(0, 3).map(([stage, count]) => (
                <MetricCard
                  key={stage}
                  label={stage}
                  value={count as number}
                  icon={Building2}
                  iconColor="gray"
                />
              ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-4 flex-wrap">
                {/* Search */}
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search companies..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {/* Lifecycle Stage Filter */}
                <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Lifecycle Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="opportunity">Opportunity</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="evangelist">Evangelist</SelectItem>
                  </SelectContent>
                </Select>

                {/* Sort By */}
                <Select value={sortBy} onValueChange={(value: 'date-newest' | 'date-oldest' | 'name') => setSortBy(value)}>
                  <SelectTrigger className="w-[180px]">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="w-4 h-4" />
                      <SelectValue placeholder="Sort by" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date-newest">Newest First</SelectItem>
                    <SelectItem value="date-oldest">Oldest First</SelectItem>
                    <SelectItem value="name">Name (A-Z)</SelectItem>
                  </SelectContent>
                </Select>

                {/* Clear Filters */}
                {hasActiveFilters && (
                  <Button variant="outline" onClick={clearFilters} size="sm">
                    <X className="w-4 h-4 mr-2" />
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Companies Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {filteredCompanies.length === 0 ? (
                <div className="p-12 text-center">
                  <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-900 font-medium mb-1">No companies found</p>
                  <p className="text-sm text-gray-500 mb-4">
                    {hasActiveFilters 
                      ? 'Try adjusting your filters.' 
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
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-sm font-semibold text-gray-900">
                      {filteredCompanies.length} {filteredCompanies.length === 1 ? 'Company' : 'Companies'}
                    </h2>
                  </div>
                  <div className="overflow-hidden">
                    <Table className="table-fixed w-full">
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase" style={{ width: '20%' }}>Company Name</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase" style={{ width: '15%' }}>Website</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase" style={{ width: '12%' }}>Type</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase" style={{ width: '15%' }}>Lifecycle Stage</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase" style={{ width: '15%' }}>Location</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase" style={{ width: '13%' }}>Created</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-gray-700 uppercase" style={{ width: '10%' }}>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCompanies.map((company) => {
                          // Truncate website URL for display
                          const truncateUrl = (url: string, maxLength: number = 20) => {
                            if (url.length <= maxLength) return url;
                            return url.substring(0, maxLength - 3) + '...';
                          };
                          const displayWebsite = company.website ? truncateUrl(company.website.replace(/^https?:\/\//, '')) : null;
                          
                          return (
                            <TableRow
                              key={company._id}
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => router.push(`/companies/${company._id}`)}
                            >
                              <TableCell className="font-medium text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="truncate">{company.name}</span>
                                  {company.hubspotUrl && <HubSpotLink url={company.hubspotUrl} />}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {company.website ? (
                                  <a
                                    href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline flex items-center gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                    title={company.website}
                                  >
                                    <span className="truncate">{displayWebsite}</span>
                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                  </a>
                                ) : (
                                  '—'
                                )}
                              </TableCell>
                              <TableCell className="text-sm">{company.type || '—'}</TableCell>
                              <TableCell className="text-sm">
                                {company.hubspotLifecycleStageName && (
                                  <Badge variant="outline" className="text-xs">{company.hubspotLifecycleStageName}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">
                                <span className="truncate block">
                                  {[company.city, company.state].filter(Boolean).join(', ') || '—'}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm whitespace-nowrap">
                                {company.createdAt
                                  ? new Date(company.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-3 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/companies/${company._id}`);
                                  }}
                                >
                                  View
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="contacts" className="space-y-6">
            {/* Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard
                label="Total Contacts"
                value={contactMetrics.total}
                icon={User}
                iconColor="blue"
              />
              <MetricCard
                label="With Email"
                value={contactMetrics.withEmail}
                icon={Mail}
                iconColor="green"
              />
              <MetricCard
                label="With Phone"
                value={contactMetrics.withPhone}
                icon={Phone}
                iconColor="purple"
              />
              {Object.entries(contactMetrics).filter(([key]) => !['total', 'withEmail', 'withPhone'].includes(key)).slice(0, 1).map(([stage, count]) => (
                <MetricCard
                  key={stage}
                  label={stage}
                  value={count as number}
                  icon={User}
                  iconColor="gray"
                />
              ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-4 flex-wrap">
                {/* Search */}
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search contacts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {/* Lifecycle Stage Filter */}
                <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Lifecycle Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="opportunity">Opportunity</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="evangelist">Evangelist</SelectItem>
                  </SelectContent>
                </Select>

                {/* Sort By */}
                <Select value={sortBy} onValueChange={(value: 'date-newest' | 'date-oldest' | 'name') => setSortBy(value)}>
                  <SelectTrigger className="w-[180px]">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="w-4 h-4" />
                      <SelectValue placeholder="Sort by" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date-newest">Newest First</SelectItem>
                    <SelectItem value="date-oldest">Oldest First</SelectItem>
                    <SelectItem value="name">Name (A-Z)</SelectItem>
                  </SelectContent>
                </Select>

                {/* Clear Filters */}
                {hasActiveFilters && (
                  <Button variant="outline" onClick={clearFilters} size="sm">
                    <X className="w-4 h-4 mr-2" />
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Contacts Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {filteredContacts.length === 0 ? (
                <div className="p-12 text-center">
                  <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-900 font-medium mb-1">No contacts found</p>
                  <p className="text-sm text-gray-500 mb-4">
                    {hasActiveFilters 
                      ? 'Try adjusting your filters.' 
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
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-sm font-semibold text-gray-900">
                      {filteredContacts.length} {filteredContacts.length === 1 ? 'Contact' : 'Contacts'}
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Name</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Email</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Phone</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Company</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Role</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Lifecycle Stage</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Created</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-gray-700 uppercase">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredContacts.map((contact) => (
                          <TableRow
                            key={contact._id}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => router.push(`/contacts/${contact._id}`)}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {contact.name}
                                {contact.hubspotUrl && <HubSpotLink url={contact.hubspotUrl} />}
                              </div>
                            </TableCell>
                            <TableCell>
                              {contact.email ? (
                                <a
                                  href={`mailto:${contact.email}`}
                                  className="text-primary hover:underline flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {contact.email}
                                  <Mail className="w-3 h-3" />
                                </a>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell>
                              {contact.phone ? (
                                <a
                                  href={`tel:${contact.phone}`}
                                  className="text-primary hover:underline flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {contact.phone}
                                  <Phone className="w-3 h-3" />
                                </a>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell>
                              {contact.company || '—'}
                            </TableCell>
                            <TableCell>
                              {contact.role ? (
                                <div className="flex items-center gap-1">
                                  <Briefcase className="w-3 h-3 text-gray-400" />
                                  {contact.role}
                                </div>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell>
                              {contact.hubspotLifecycleStageName && (
                                <Badge variant="outline">{contact.hubspotLifecycleStageName}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {contact.createdAt
                                ? new Date(contact.createdAt).toLocaleDateString()
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
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
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

