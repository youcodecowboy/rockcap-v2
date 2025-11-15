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
  Mail, Building2,
  TrendingUp,
  UserPlus,
  Search,
  Filter,
  X, Download,
  ArrowUpDown,
  Users,
  RefreshCw,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import MetricCard from '@/components/MetricCard';
import { HubSpotLink } from '@/components/HubSpotLink';

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  qualified: 'bg-green-100 text-green-800',
  nurturing: 'bg-purple-100 text-purple-800',
  converted: 'bg-green-100 text-green-800',
  lost: 'bg-gray-100 text-gray-800',
};

const lifecycleStageLabels: Record<string, string> = {
  lead: 'Lead',
  opportunity: 'Opportunity',
  marketingqualifiedlead: 'MQL',
  salesqualifiedlead: 'SQL',
};

export default function LeadsPage() {
  const router = useRouter();
  // Use deals instead of leads for prospecting
  const deals = useQuery(api.deals.getAllDeals) || [];
  const leads = []; // Keep for backward compatibility but don't use
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [lifecycleFilter, setLifecycleFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date-newest' | 'date-oldest' | 'name'>('date-newest');
  const [isSyncingLeads, setIsSyncingLeads] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);

  const filteredDeals = useMemo(() => {
    let filtered = deals;

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(deal => {
        const contacts = deal.contacts || [];
        const companies = deal.companies || [];
        return (
          deal.name?.toLowerCase().includes(query) ||
          contacts.some(c => c?.name?.toLowerCase().includes(query)) ||
          contacts.some(c => c?.email?.toLowerCase().includes(query)) ||
          companies.some(c => c?.name?.toLowerCase().includes(query))
        );
      });
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(d => d.status === statusFilter);
    }

    // Apply stage filter (reusing lifecycleFilter for stage)
    if (lifecycleFilter !== 'all') {
      filtered = filtered.filter(d => d.stage === lifecycleFilter);
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'date-newest') {
        const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return dateB - dateA; // Newest first
      } else if (sortBy === 'date-oldest') {
        const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return dateA - dateB; // Oldest first
      } else if (sortBy === 'name') {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB);
      }
      return 0;
    });

    return filtered;
  }, [deals, searchQuery, statusFilter, lifecycleFilter, sortBy]);

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setLifecycleFilter('all');
    setSortBy('date-newest');
  };

  const hasActiveFilters = statusFilter !== 'all' || lifecycleFilter !== 'all' || searchQuery.trim() !== '';

  const handleSyncLeads = async () => {
    setIsSyncingLeads(true);
    setSyncResult(null);

    try {
      const response = await fetch("/api/hubspot/sync-leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          maxRecords: 1000, // Sync all leads
        }),
      });

      const result = await response.json();
      setSyncResult(result);
      
      // Refresh the page after successful sync to show new leads
      if (result.success) {
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (error: any) {
      setSyncResult({
        success: false,
        error: error.message || "Leads sync failed",
      });
    } finally {
      setIsSyncingLeads(false);
    }
  };

  // Calculate metrics
  const metrics = useMemo(() => {
    return {
      total: deals.length,
      new: deals.filter(d => d.status === 'new' || !d.status).length,
      contacted: deals.filter(d => d.status === 'contacted').length,
      qualified: deals.filter(d => d.status === 'qualified').length,
      converted: deals.filter(d => d.status === 'closed-won').length,
    };
  }, [deals]);

  // Get oldest deal creation date (for display)
  const oldestDealDate = useMemo(() => {
    if (deals.length === 0) return null;
    const dates = deals
      .map(d => d.createdAt ? new Date(d.createdAt).getTime() : 0)
      .filter(d => d > 0);
    if (dates.length === 0) return null;
    const oldest = new Date(Math.min(...dates));
    return oldest.toLocaleDateString();
  }, [deals]);

  if (deals === undefined) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading deals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Deals</h1>
              <p className="mt-2 text-gray-600">
                Manage and track your HubSpot deals and prospects
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSyncLeads}
                disabled={isSyncingLeads}
                variant="default"
                size="sm"
              >
                {isSyncingLeads ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Sync Deals
                  </>
                )}
              </Button>
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
              <Button variant="outline" size="sm">
                <ArrowUpDown className="w-4 h-4 mr-2" />
                Sort
              </Button>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
          {oldestDealDate && (
            <p className="text-sm text-gray-500">Deals from: {oldestDealDate} to present</p>
          )}
          
          {/* Sync Result Message */}
          {syncResult && (
            <div className={`mt-4 p-4 rounded-lg border ${
              syncResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
            }`}>
              <div className="flex items-center gap-2">
                {syncResult.success ? (
                  <>
                    <CheckCircle2 className="size-5 text-green-600" />
                    <span className="font-medium text-green-900">
                      Sync Completed: {syncResult.synced || syncResult.stats?.dealsSynced || 0} deals synced
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="size-5 text-red-600" />
                    <span className="font-medium text-red-900">
                      Sync Failed: {syncResult.error || 'Unknown error'}
                    </span>
                  </>
                )}
              </div>
              {syncResult.stats?.errorDetails && syncResult.stats.errorDetails.length > 0 && (
                <div className="text-sm text-red-600 mt-2">
                  <div className="font-medium mb-1">Error Details:</div>
                  <ul className="list-disc list-inside space-y-1">
                    {syncResult.stats.errorDetails.slice(0, 3).map((msg: string, i: number) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <MetricCard
            label="Total Leads"
            value={metrics.total}
            icon={Users}
            iconColor="blue"
            trend={{ value: 0, isPositive: true, period: 'from HubSpot' }}
          />
          <MetricCard
            label="New"
            value={metrics.new}
            icon={UserPlus}
            iconColor="blue"
            trend={{ value: 0, isPositive: true, period: 'from HubSpot' }}
          />
          <MetricCard
            label="Contacted"
            value={metrics.contacted}
            icon={Mail}
            iconColor="yellow"
            trend={{ value: 0, isPositive: true, period: 'from HubSpot' }}
          />
          <MetricCard
            label="Qualified"
            value={metrics.qualified}
            icon={TrendingUp}
            iconColor="green"
            trend={{ value: 0, isPositive: true, period: 'from HubSpot' }}
          />
          <MetricCard
            label="Converted"
            value={metrics.converted}
            icon={Building2}
            iconColor="purple"
            trend={{ value: 0, isPositive: true, period: 'from HubSpot' }}
          />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search leads..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="nurturing">Nurturing</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>

            {/* Lifecycle Stage Filter */}
            <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Lifecycle Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="opportunity">Opportunity</SelectItem>
                <SelectItem value="marketingqualifiedlead">MQL</SelectItem>
                <SelectItem value="salesqualifiedlead">SQL</SelectItem>
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

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {filteredDeals.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-900 font-medium mb-1">No deals found</p>
              <p className="text-sm text-gray-500 mb-4">
                {hasActiveFilters 
                  ? 'Try adjusting your filters.' 
                  : 'Deals will appear here after syncing from HubSpot.'}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    {filteredDeals.length} {filteredDeals.length === 1 ? 'Deal' : 'Deals'}
                  </h2>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Deal Name</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Pipeline</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Stage</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Amount</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Close Date</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Created</TableHead>
                      <TableHead className="text-right text-xs font-semibold text-gray-700 uppercase">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeals.map((deal) => {
                      const contacts = deal.contacts || [];
                      const companies = deal.companies || [];
                      return (
                        <TableRow
                          key={deal._id}
                          className="hover:bg-gray-50"
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <div>
                                <div className="text-gray-900 flex items-center gap-2">
                                  {deal.name}
                                  {deal.hubspotUrl && (
                                    <HubSpotLink url={deal.hubspotUrl} />
                                  )}
                                </div>
                                {contacts.length > 0 && (
                                  <div className="text-sm text-gray-500">
                                    {contacts.map(c => c?.name).filter(Boolean).join(', ')}
                                  </div>
                                )}
                                {companies.length > 0 && (
                                  <div className="text-sm text-gray-500 flex items-center gap-1">
                                    <Building2 className="w-3 h-3" />
                                    {companies.map(c => c?.name).filter(Boolean).join(', ')}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {deal.pipelineName || deal.pipeline || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {deal.stageName || deal.stage || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {deal.amount 
                              ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(deal.amount)
                              : '—'}
                          </TableCell>
                          <TableCell>
                            {deal.closeDate
                              ? new Date(deal.closeDate).toLocaleDateString()
                              : '—'}
                          </TableCell>
                          <TableCell>
                            {deal.createdAt
                              ? new Date(deal.createdAt).toLocaleDateString()
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push(`/deals/${deal._id}`)}
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
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
