'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../convex/_generated/dataModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Building2,
  FileText,
  Calendar,
  ExternalLink,
  Briefcase,
  MapPin,
  CheckSquare,
  CheckCircle2,
  Clock,
  Circle,
  AlertCircle,
  Pencil,
} from 'lucide-react';

interface ProjectOverviewTabProps {
  project: any;
  projectId: Id<"projects">;
  clientId: Id<"clients">;
  client: any;
  documents: any[];
  clientRoles: any[];
  onOpenSettings?: () => void;
}

export default function ProjectOverviewTab({
  project,
  projectId,
  clientId,
  client,
  documents,
  clientRoles,
  onOpenSettings,
}: ProjectOverviewTabProps) {
  const router = useRouter();

  // Get all clients associated with this project
  const allClients = useQuery(api.clients.list, {}) || [];
  
  // Get project checklist
  const projectChecklist = useQuery(api.knowledgeLibrary.getChecklistByProject, { projectId }) || [];
  
  // Calculate checklist stats
  const checklistStats = useMemo(() => {
    const total = projectChecklist.length;
    const fulfilled = projectChecklist.filter((i: any) => i.status === 'fulfilled').length;
    const pendingReview = projectChecklist.filter((i: any) => i.status === 'pending_review').length;
    const missing = projectChecklist.filter((i: any) => i.status === 'missing').length;
    const percentage = total > 0 ? Math.round((fulfilled / total) * 100) : 0;
    
    // Group by category
    const byCategory: Record<string, { fulfilled: number; total: number }> = {};
    projectChecklist.forEach((item: any) => {
      if (!byCategory[item.category]) {
        byCategory[item.category] = { fulfilled: 0, total: 0 };
      }
      byCategory[item.category].total++;
      if (item.status === 'fulfilled') {
        byCategory[item.category].fulfilled++;
      }
    });
    
    return { total, fulfilled, pendingReview, missing, percentage, byCategory };
  }, [projectChecklist]);
  
  // Map client roles to full client data
  const clientsWithRoles = useMemo(() => {
    return clientRoles.map((role: any) => {
      const roleClientId = (role.clientId as any)?._id || role.clientId;
      const clientData = allClients.find((c: any) => c._id === roleClientId);
      return {
        ...role,
        client: clientData,
      };
    }).filter((r: any) => r.client);
  }, [clientRoles, allClients]);

  // Calculate recent documents
  const recentDocuments = useMemo(() => {
    return documents
      .sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .slice(0, 5);
  }, [documents]);

  // Calculate documents per client role
  const docsByClient = useMemo(() => {
    const counts: Record<string, number> = {};
    documents.forEach((doc: any) => {
      const cId = doc.clientId;
      if (cId) {
        counts[cId] = (counts[cId] || 0) + 1;
      }
    });
    return counts;
  }, [documents]);

  // Format currency
  const formatCurrency = (amount?: number) => {
    if (!amount) return null;
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Project Information */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Briefcase className="w-4 h-4" />
            Project Information
          </CardTitle>
          {onOpenSettings && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={onOpenSettings}
            >
              <Pencil className="w-3 h-3 mr-1" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-gray-500">Project Name</p>
            <p className="text-sm font-medium">{project.name}</p>
          </div>

          {project.projectShortcode && (
            <div>
              <p className="text-xs text-gray-500">Shortcode</p>
              <Badge variant="outline" className="font-mono text-xs">{project.projectShortcode}</Badge>
            </div>
          )}

          {project.description && (
            <div>
              <p className="text-xs text-gray-500">Description</p>
              <p className="text-sm text-gray-700">{project.description}</p>
            </div>
          )}

          {project.address && (
            <div>
              <p className="text-xs text-gray-500">Address</p>
              <p className="text-sm font-medium flex items-start gap-1.5">
                <MapPin className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                {[project.address, project.city, project.state, project.zip]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            </div>
          )}

          {project.startDate && (
            <div>
              <p className="text-xs text-gray-500">Start Date</p>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-gray-400" />
                {new Date(project.startDate).toLocaleDateString()}
              </p>
            </div>
          )}

          {project.expectedCompletionDate && (
            <div>
              <p className="text-xs text-gray-500">Expected Completion</p>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-gray-400" />
                {new Date(project.expectedCompletionDate).toLocaleDateString()}
              </p>
            </div>
          )}

          {project.loanAmount && (
            <div>
              <p className="text-xs text-gray-500">Loan Amount</p>
              <p className="text-sm font-medium">{formatCurrency(project.loanAmount)}</p>
            </div>
          )}

          {project.interestRate && (
            <div>
              <p className="text-xs text-gray-500">Interest Rate</p>
              <p className="text-sm font-medium">{project.interestRate}%</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Checklist Progress */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckSquare className="w-4 h-4" />
            Document Checklist
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            className="text-xs"
            onClick={() => router.push(`/clients/${clientId}/projects/${projectId}?tab=checklist`)}
          >
            View All
          </Button>
        </CardHeader>
        <CardContent>
          {checklistStats.total === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No checklist items yet</p>
          ) : (
            <div className="space-y-4">
              {/* Overall Progress */}
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">Overall Completion</span>
                  <span className="font-medium">{checklistStats.percentage}%</span>
                </div>
                <Progress value={checklistStats.percentage} className="h-2" />
                <p className="text-xs text-gray-500 mt-1">
                  {checklistStats.fulfilled} of {checklistStats.total} documents
                </p>
              </div>

              {/* Status Breakdown */}
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-lg font-semibold text-green-700">{checklistStats.fulfilled}</span>
                  </div>
                  <p className="text-[10px] text-gray-500">Fulfilled</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span className="text-lg font-semibold text-amber-700">{checklistStats.pendingReview}</span>
                  </div>
                  <p className="text-[10px] text-gray-500">Pending</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Circle className="w-4 h-4 text-gray-400" />
                    <span className="text-lg font-semibold text-gray-700">{checklistStats.missing}</span>
                  </div>
                  <p className="text-[10px] text-gray-500">Missing</p>
                </div>
              </div>

              {/* Top Categories */}
              {Object.keys(checklistStats.byCategory).length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 mb-2">By Category</p>
                  <div className="space-y-1.5">
                    {Object.entries(checklistStats.byCategory).slice(0, 4).map(([category, stats]) => (
                      <div key={category} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 truncate flex-1">{category}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {stats.fulfilled}/{stats.total}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Alert if many missing */}
              {checklistStats.missing > 3 && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-100">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    {checklistStats.missing} documents still missing. Use the checklist tab to request them.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Associated Clients */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="w-4 h-4" />
            Associated Clients
          </CardTitle>
        </CardHeader>
        <CardContent>
          {clientsWithRoles.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No clients associated</p>
          ) : (
            <div className="space-y-2">
              {clientsWithRoles.map((roleData: any, index: number) => (
                <div
                  key={index}
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/clients/${roleData.client._id}`)}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    roleData.client.type?.toLowerCase() === 'lender' 
                      ? 'bg-blue-100' 
                      : 'bg-green-100'
                  }`}>
                    <Building2 className={`w-4 h-4 ${
                      roleData.client.type?.toLowerCase() === 'lender'
                        ? 'text-blue-600'
                        : 'text-green-600'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{roleData.client.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge 
                        variant="outline" 
                        className={`text-[10px] px-1.5 py-0 ${
                          roleData.role === 'lender' || roleData.client.type?.toLowerCase() === 'lender'
                            ? 'bg-blue-50 text-blue-700 border-blue-200' 
                            : 'bg-green-50 text-green-700 border-green-200'
                        }`}
                      >
                        {roleData.role || roleData.client.type || 'Client'}
                      </Badge>
                      <span className="text-[10px] text-gray-500">
                        {docsByClient[roleData.client._id] || 0} docs
                      </span>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Documents */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" />
            Recent Documents
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            className="text-xs"
            onClick={() => router.push(`/clients/${clientId}/projects/${projectId}?tab=documents`)}
          >
            View All
          </Button>
        </CardHeader>
        <CardContent>
          {recentDocuments.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No documents yet</p>
          ) : (
            <div className="space-y-2">
              {recentDocuments.map((doc: any) => (
                <div
                  key={doc._id}
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {doc.documentCode || doc.fileName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{doc.summary}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {doc.category}
                      </Badge>
                      <span className="text-[10px] text-gray-400">
                        {new Date(doc.uploadedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
