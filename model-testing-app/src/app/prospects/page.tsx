'use client';

import React, { useState, useMemo } from 'react';
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
import { Card, CardContent } from '@/components/ui/card';
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
  const [sortBy, setSortBy] = useState<'date-newest' | 'date-oldest' | 'name' | 'amount'>('date-newest');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;
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
      if (sortBy === 'date-newest' || sortBy === 'date-oldest') {
        const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return sortBy === 'date-newest' ? dateB - dateA : dateA - dateB;
      } else if (sortBy === 'name') {
        const nameA = a.name || '';
        const nameB = b.name || '';
        const comparison = nameA.localeCompare(nameB);
        return sortOrder === 'asc' ? comparison : -comparison;
      } else if (sortBy === 'amount') {
        const amountA = a.amount || 0;
        const amountB = b.amount || 0;
        return sortOrder === 'asc' ? amountA - amountB : amountB - amountA;
      }
      return 0;
    });

    return filtered;
  }, [deals, searchQuery, statusFilter, lifecycleFilter, sortBy, sortOrder]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredDeals.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedDeals = filteredDeals.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, lifecycleFilter, sortBy, sortOrder]);

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

  const formatLastActivity = (date: string | null | undefined) => {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'new':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">New</Badge>;
      case 'contacted':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Contacted</Badge>;
      case 'qualified':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Qualified</Badge>;
      case 'closed-won':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Won</Badge>;
      case 'closed-lost':
        return <Badge className="bg-red-100 text-red-800 border-red-200">Lost</Badge>;
      case 'negotiation':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Negotiation</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Coming Soon Disclaimer */}
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-sm text-yellow-800 font-medium">
              Prospecting section incomplete. Coming soon...
            </p>
          </div>
        </div>
        
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl text-gray-900" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', fontWeight: 700 }}>
              Deals
            </h1>
            <p className="mt-2 text-gray-600" style={{ fontWeight: 400 }}>
              Manage and track your HubSpot deals and prospects
            </p>
          </div>
          <Button
            onClick={handleSyncLeads}
            disabled={isSyncingLeads}
            className="bg-black text-white hover:bg-gray-800 flex items-center gap-2"
          >
            {isSyncingLeads ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Sync Deals
              </>
            )}
          </Button>
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

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <MetricCard
            label="Total Deals"
            value={metrics.total}
            icon={Users}
            iconColor="blue"
            trend={{ value: 0, isPositive: true, period: 'from HubSpot' }}
            className="bg-black text-white border-black"
          />
          <MetricCard
            label="New"
            value={metrics.new}
            icon={UserPlus}
            iconColor="blue"
            trend={{ value: 0, isPositive: true, period: 'from HubSpot' }}
            className="bg-black text-white border-black"
          />
          <MetricCard
            label="Contacted"
            value={metrics.contacted}
            icon={Mail}
            iconColor="yellow"
            trend={{ value: 0, isPositive: true, period: 'from HubSpot' }}
            className="bg-black text-white border-black"
          />
          <MetricCard
            label="Qualified"
            value={metrics.qualified}
            icon={TrendingUp}
            iconColor="green"
            trend={{ value: 0, isPositive: true, period: 'from HubSpot' }}
            className="bg-black text-white border-black"
          />
          <MetricCard
            label="Converted"
            value={metrics.converted}
            icon={Building2}
            iconColor="purple"
            trend={{ value: 0, isPositive: true, period: 'from HubSpot' }}
            className="bg-black text-white border-black"
          />
        </div>


        {/* Table Section */}
        <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
          <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-white" />
              <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                Deals
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                {filteredDeals.length} {filteredDeals.length === 1 ? 'Deal' : 'Deals'}
              </span>
            </div>
          </div>
          <CardContent className="pt-0 pb-6">
            {filteredDeals.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-900 font-medium mb-1">No deals found</p>
                <p className="text-sm text-gray-500 mb-4">
                  {hasActiveFilters 
                    ? 'Try adjusting your search or filters' 
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
                {/* Filter and Sort Controls */}
                <div className="px-2 py-3 border-b border-gray-200 flex items-center justify-between gap-4">
                  {/* Search Bar - Left Side */}
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <Input
                      placeholder="Search deals..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="text-sm pl-10"
                    />
                  </div>
                  
                  {/* Filters and Sort - Right Side */}
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-black"
                    >
                      <option value="all">All Status</option>
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="negotiation">Negotiation</option>
                      <option value="closed-won">Won</option>
                      <option value="closed-lost">Lost</option>
                    </select>
                    <select
                      value={lifecycleFilter}
                      onChange={(e) => setLifecycleFilter(e.target.value)}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-black"
                    >
                      <option value="all">All Stages</option>
                      <option value="lead">Lead</option>
                      <option value="opportunity">Opportunity</option>
                      <option value="marketingqualifiedlead">MQL</option>
                      <option value="salesqualifiedlead">SQL</option>
                    </select>
                    <ArrowUpDown className="w-4 h-4 text-gray-500 ml-2" />
                    <select
                      value={`${sortBy}-${sortOrder}`}
                      onChange={(e) => {
                        const [newSortBy, newSortOrder] = e.target.value.split('-');
                        if (newSortBy === 'date-newest' || newSortBy === 'date-oldest') {
                          setSortBy(newSortBy as any);
                        } else {
                          setSortBy(newSortBy as any);
                          setSortOrder(newSortOrder as any);
                        }
                      }}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-black"
                    >
                      <option value="date-newest-desc">Newest First</option>
                      <option value="date-oldest-asc">Oldest First</option>
                      <option value="name-asc">Name (A-Z)</option>
                      <option value="name-desc">Name (Z-A)</option>
                      <option value="amount-desc">Amount (Highest)</option>
                      <option value="amount-asc">Amount (Lowest)</option>
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
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Deal Name</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Pipeline</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Stage</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Amount</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Last Activity</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-700 uppercase">Tags</TableHead>
                      <TableHead className="text-right text-xs font-semibold text-gray-700 uppercase">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedDeals.map((deal) => {
                      const contacts = deal.contacts || [];
                      const companies = deal.companies || [];
                      return (
                        <TableRow
                          key={deal._id}
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => router.push(`/deals/${deal._id}`)}
                        >
                          <TableCell>
                            <div>
                              <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                {deal.name}
                                {deal.hubspotUrl && (
                                  <HubSpotLink url={deal.hubspotUrl} />
                                )}
                              </div>
                              {contacts.length > 0 && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {contacts.map(c => c?.name).filter(Boolean).join(', ')}
                                </div>
                              )}
                              {companies.length > 0 && (
                                <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                  <Building2 className="w-3 h-3" />
                                  {companies.map(c => c?.name).filter(Boolean).join(', ')}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {deal.pipelineName || deal.pipeline ? (
                              <Badge variant="outline" className="text-xs">
                                {deal.pipelineName || deal.pipeline}
                              </Badge>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {deal.stageName || deal.stage ? (
                              <Badge variant="outline" className="text-xs">
                                {deal.stageName || deal.stage}
                              </Badge>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-900">
                              {deal.amount 
                                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(deal.amount)
                                : <span className="text-gray-400">—</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-600">
                              {formatLastActivity(deal.lastActivityDate)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {getStatusBadge(deal.status)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/deals/${deal._id}`);
                              }}
                              className="text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                
                {/* Pagination */}
                {filteredDeals.length > ITEMS_PER_PAGE && (
                  <div className="px-2 py-4 border-t border-gray-200 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Showing {startIndex + 1}-{Math.min(endIndex, filteredDeals.length)} of {filteredDeals.length} deals
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="h-8 px-3 text-xs"
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-gray-600 px-2">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="h-8 px-3 text-xs"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
