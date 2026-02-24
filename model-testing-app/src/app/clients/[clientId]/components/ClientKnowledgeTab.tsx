'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Building2,
  FolderKanban,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Link as LinkIcon,
  Unlink,
  Plus,
  Mail,
  Sparkles,
  ChevronRight,
  AlertCircle,
  FileCheck,
  Search,
  Filter,
  Brain,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Import sub-components (will create these next)
import KnowledgeChecklistPanel from './KnowledgeChecklistPanel';
import EmailRequestModal from './EmailRequestModal';
import DynamicChecklistInput from './DynamicChecklistInput';

interface ClientKnowledgeTabProps {
  clientId: Id<"clients">;
  clientName: string;
  clientType?: string;
  projects: Array<{
    _id: Id<"projects">;
    name: string;
    status?: string;
    dealPhase?: string;
  }>;
}

type ViewScope = 'client' | { projectId: Id<"projects">; projectName: string };

// Small component to fetch and display project intelligence count
function ProjectIntelligenceCount({ projectId }: { projectId: Id<"projects"> }) {
  const stats = useQuery(api.knowledgeLibrary.getKnowledgeStats, { projectId });

  if (!stats || stats.total === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-purple-100 text-purple-700">
            <Brain className="w-2.5 h-2.5 mr-0.5" />
            {stats.total}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {stats.total} intelligence item{stats.total !== 1 ? 's' : ''} extracted
            {stats.canonical > 0 && ` (${stats.canonical} canonical)`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function ClientKnowledgeTab({
  clientId,
  clientName,
  clientType = 'borrower',
  projects,
}: ClientKnowledgeTabProps) {
  const router = useRouter();
  const [viewScope, setViewScope] = useState<ViewScope>('client');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showDynamicInput, setShowDynamicInput] = useState(false);

  // Get client-level intelligence stats
  const clientIntelligenceStats = useQuery(
    api.knowledgeLibrary.getKnowledgeStats,
    { clientId }
  );

  // Get intelligence stats for all projects
  const projectIntelligenceStats = useMemo(() => {
    const stats: Record<string, { total: number; canonical: number; flagged: number }> = {};
    return stats;
  }, []);

  // Queries
  const clientChecklist = useQuery(
    api.knowledgeLibrary.getClientLevelChecklist,
    { clientId }
  );
  
  const hasChecklist = useQuery(
    api.knowledgeLibrary.hasChecklist,
    { clientId }
  );

  const checklistSummary = useQuery(
    api.knowledgeLibrary.getChecklistSummary,
    { clientId }
  );

  const lastEmailGeneration = useQuery(
    api.knowledgeLibrary.getLastEmailGeneration,
    { clientId }
  );

  // Get project checklist if viewing a project
  const projectChecklist = useQuery(
    api.knowledgeLibrary.getChecklistByProject,
    viewScope !== 'client' ? { projectId: viewScope.projectId } : 'skip'
  );

  // Mutations
  const initializeClient = useMutation(api.knowledgeLibrary.initializeChecklistForClient);
  const initializeProject = useMutation(api.knowledgeLibrary.initializeChecklistForProject);

  // Initialize checklist if needed
  useEffect(() => {
    if (hasChecklist === false && clientType) {
      initializeClient({ clientId, clientType }).catch(console.error);
    }
  }, [hasChecklist, clientId, clientType, initializeClient]);

  // Get current checklist based on view scope
  const currentChecklist = useMemo(() => {
    if (viewScope === 'client') {
      return clientChecklist || [];
    }
    return projectChecklist || [];
  }, [viewScope, clientChecklist, projectChecklist]);

  // Get categories from current checklist
  const categories = useMemo(() => {
    const categoryMap = new Map<string, { total: number; fulfilled: number; missing: number; pendingReview: number }>();
    
    for (const item of currentChecklist) {
      const existing = categoryMap.get(item.category) || { total: 0, fulfilled: 0, missing: 0, pendingReview: 0 };
      existing.total++;
      if (item.status === 'fulfilled') existing.fulfilled++;
      if (item.status === 'missing') existing.missing++;
      if (item.status === 'pending_review') existing.pendingReview++;
      categoryMap.set(item.category, existing);
    }

    return Array.from(categoryMap.entries()).map(([name, stats]) => ({
      name,
      ...stats,
      percentage: stats.total > 0 ? Math.round((stats.fulfilled / stats.total) * 100) : 0,
    }));
  }, [currentChecklist]);

  // Filter items by selected category
  const filteredItems = useMemo(() => {
    if (!selectedCategory) return currentChecklist;
    return currentChecklist.filter(item => item.category === selectedCategory);
  }, [currentChecklist, selectedCategory]);

  // Handle project initialization
  const handleProjectClick = async (project: { _id: Id<"projects">; name: string }) => {
    setViewScope({ projectId: project._id, projectName: project.name });
    setSelectedCategory(null);

    // Check if project checklist exists, initialize if not
    const projectItems = await initializeProject({
      clientId,
      projectId: project._id,
      clientType,
    });
    
    if (projectItems.created > 0) {
      console.log(`Initialized ${projectItems.created} checklist items for project`);
    }
  };

  // Loading state
  if (hasChecklist === undefined || clientChecklist === undefined) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-50 overflow-hidden">
      {/* Column 1: Client/Projects Navigation */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-medium text-gray-900 text-sm">Knowledge Library</h3>
          <p className="text-xs text-gray-500 mt-1">Document requirements checklist</p>
        </div>

        {/* Client Section */}
        <div className="flex-1 overflow-y-auto">
          <button
            onClick={() => {
              setViewScope('client');
              setSelectedCategory(null);
            }}
            className={cn(
              "w-full px-4 py-3 flex items-center gap-3 text-left transition-colors",
              viewScope === 'client'
                ? "bg-blue-50 border-l-2 border-blue-600"
                : "hover:bg-gray-50 border-l-2 border-transparent"
            )}
          >
            <Building2 className="w-5 h-5 text-gray-500" />
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-medium truncate",
                viewScope === 'client' ? "text-blue-700" : "text-gray-900"
              )}>
                {clientName}
              </p>
              <p className="text-xs text-gray-500">Client Documents (KYC)</p>
            </div>
            {checklistSummary?.client && (
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-green-600">
                  {checklistSummary.client.fulfilled}
                </span>
                <span className="text-xs text-gray-400">/</span>
                <span className="text-xs text-gray-500">
                  {checklistSummary.client.total}
                </span>
              </div>
            )}
          </button>

          {/* Projects Section */}
          {projects.length > 0 && (
            <div className="border-t border-gray-100 mt-2 pt-2">
              <div className="px-4 py-2 flex items-center justify-between">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Projects</h4>
              </div>
              {projects.map(project => {
                const isSelected = viewScope !== 'client' && viewScope.projectId === project._id;
                return (
                  <div key={project._id} className="group">
                    <button
                      onClick={() => handleProjectClick(project)}
                      className={cn(
                        "w-full px-4 py-3 flex items-center gap-3 text-left transition-colors",
                        isSelected
                          ? "bg-purple-50 border-l-2 border-purple-600"
                          : "hover:bg-gray-50 border-l-2 border-transparent"
                      )}
                    >
                      <FolderKanban className="w-5 h-5 text-gray-500" />
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm font-medium truncate",
                          isSelected ? "text-purple-700" : "text-gray-900"
                        )}>
                          {project.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {project.dealPhase && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1">
                              {project.dealPhase.replace('_', ' ')}
                            </Badge>
                          )}
                          <ProjectIntelligenceCount projectId={project._id} />
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>
                    {/* Quick link to project intelligence */}
                    <div className="px-4 pb-2 -mt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/clients/${clientId}/projects/${project._id}?tab=knowledge`);
                        }}
                        className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-purple-600 transition-colors"
                      >
                        <Brain className="w-3 h-3" />
                        <span>View extracted intelligence</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-gray-100 space-y-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-xs"
            onClick={() => setShowEmailModal(true)}
          >
            <Mail className="w-3 h-3 mr-2" />
            Request Missing Docs
          </Button>
          {lastEmailGeneration && (
            <p className="text-[10px] text-gray-400 px-2">
              Last sent: {new Date(lastEmailGeneration).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Column 2: Categories */}
      <div className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100 flex-shrink-0">
          <h4 className="font-medium text-gray-900 text-sm">Categories</h4>
          <p className="text-xs text-gray-500 mt-1">
            {viewScope === 'client' ? 'Client-level' : viewScope.projectName}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* All Items Option */}
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              "w-full px-4 py-3 flex items-center justify-between text-left transition-colors",
              selectedCategory === null
                ? "bg-gray-100 font-medium"
                : "hover:bg-gray-50"
            )}
          >
            <span className="text-sm text-gray-700">All Items</span>
            <Badge variant="secondary" className="text-xs">
              {currentChecklist.length}
            </Badge>
          </button>

          {/* Category List */}
          {categories.map(category => (
            <button
              key={category.name}
              onClick={() => setSelectedCategory(category.name)}
              className={cn(
                "w-full px-4 py-3 text-left transition-colors border-b border-gray-50",
                selectedCategory === category.name
                  ? "bg-gray-100"
                  : "hover:bg-gray-50"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={cn(
                  "text-sm truncate",
                  selectedCategory === category.name ? "font-medium text-gray-900" : "text-gray-700"
                )}>
                  {category.name}
                </span>
                <span className="text-xs text-gray-500">
                  {category.fulfilled}/{category.total}
                </span>
              </div>
              <Progress 
                value={category.percentage} 
                className="h-1"
              />
              {category.pendingReview > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3 text-amber-500" />
                  <span className="text-[10px] text-amber-600">
                    {category.pendingReview} pending review
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Add Dynamic Requirement */}
        <div className="p-3 border-t border-gray-100 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-xs"
            onClick={() => setShowDynamicInput(true)}
          >
            <Plus className="w-3 h-3 mr-2" />
            Add Requirement
          </Button>
        </div>
      </div>

      {/* Column 3: Checklist Items */}
      <div className="flex-1 bg-white flex flex-col overflow-hidden">
        <KnowledgeChecklistPanel
          items={filteredItems}
          clientId={clientId}
          projectId={viewScope !== 'client' ? viewScope.projectId : undefined}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />
      </div>

      {/* Modals */}
      {showEmailModal && (
        <EmailRequestModal
          clientId={clientId}
          clientName={clientName}
          projectId={viewScope !== 'client' ? viewScope.projectId : undefined}
          projectName={viewScope !== 'client' ? viewScope.projectName : undefined}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      {showDynamicInput && (
        <DynamicChecklistInput
          clientId={clientId}
          projectId={viewScope !== 'client' ? viewScope.projectId : undefined}
          onClose={() => setShowDynamicInput(false)}
        />
      )}
    </div>
  );
}
