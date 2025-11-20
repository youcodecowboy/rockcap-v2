'use client';

import { useUser } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import MetricCard from '@/components/MetricCard';
import { FileText, Mail, Building2, UserSearch, PoundSterling, Calendar } from 'lucide-react';

export default function Dashboard() {
  const { user, isLoaded } = useUser();
  const firstName = user?.firstName || 'there';
  
  // Fetch dashboard data
  const recentDocuments = useQuery(api.documents.getRecent, { limit: 10 });
  const recentEmails = useQuery(api.emails.getRecent, { limit: 10 });
  const recentClients = useQuery(api.clients.getRecent, { limit: 4 });
  const pipelineTotal = useQuery(api.deals.getPipelineTotal);
  const prospectsCount = useQuery(api.prospects.getRecentCount);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Hello {isLoaded ? firstName : '...'}
          </h1>
          <p className="mt-2 text-gray-600">
            Welcome to your dashboard. Here's what's happening today.
          </p>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <MetricCard
            label="Recent Prospects"
            value={prospectsCount ?? 0}
            icon={UserSearch}
            iconColor="blue"
          />
          <MetricCard
            label="Pipeline Total"
            value={pipelineTotal !== undefined ? formatCurrency(pipelineTotal) : '£0'}
            icon={PoundSterling}
            iconColor="green"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Recent Files */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Recent Files
                </CardTitle>
                <CardDescription>Your most recently uploaded documents</CardDescription>
              </CardHeader>
              <CardContent>
                {recentDocuments === undefined ? (
                  <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : recentDocuments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No files yet</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File Name</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentDocuments.map((doc) => (
                        <TableRow key={doc._id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/docs/${doc._id}`}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {doc.fileName}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {doc.clientName ? (
                              doc.clientId ? (
                                <Link
                                  href={`/clients/${doc.clientId}`}
                                  className="text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  {doc.clientName}
                                </Link>
                              ) : (
                                doc.clientName
                              )
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-gray-600">{doc.category}</span>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {formatDate(doc.uploadedAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Messages */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Recent Messages
                </CardTitle>
                <CardDescription>Coming soon</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <Mail className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-sm">Email integration coming soon</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick Links & Calendar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Links - Recent Clients */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Recent Clients
                </CardTitle>
                <CardDescription>Quick access to your recently added clients</CardDescription>
              </CardHeader>
              <CardContent>
                {recentClients === undefined ? (
                  <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : recentClients.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No clients yet</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {recentClients.map((client) => (
                      <Link
                        key={client._id}
                        href={`/clients/${client._id}`}
                        className="block p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <h3 className="font-semibold text-gray-900">{client.name}</h3>
                        {client.companyName && (
                          <p className="text-sm text-gray-600 mt-1">{client.companyName}</p>
                        )}
                        {client.status && (
                          <span className="inline-block mt-2 px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                            {client.status}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Calendar */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Calendar
                </CardTitle>
                <CardDescription>Google Calendar integration coming soon</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-sm">Calendar sync coming soon</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
