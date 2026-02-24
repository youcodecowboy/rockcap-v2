'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  FolderKanban,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Plus,
  Mail,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Import shared components
import KnowledgeChecklistPanel from '../../../components/KnowledgeChecklistPanel';
import EmailRequestModal from '../../../components/EmailRequestModal';
import DynamicChecklistInput from '../../../components/DynamicChecklistInput';

interface ProjectKnowledgeTabProps {
  projectId: Id<"projects">;
  projectName: string;
  clientId: Id<"clients">;
  clientName: string;
  clientType?: string;
  dealPhase?: string;
}

export default function ProjectKnowledgeTab({
  projectId,
  projectName,
  clientId,
  clientName,
  clientType = 'borrower',
  dealPhase,
}: ProjectKnowledgeTabProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showDynamicInput, setShowDynamicInput] = useState(false);

  // Queries
  const projectChecklist = useQuery(
    api.knowledgeLibrary.getChecklistByProject,
    { projectId }
  );

  const lastEmailGeneration = useQuery(
    api.knowledgeLibrary.getLastEmailGeneration,
    { clientId, projectId }
  );

  // Mutations
  const initializeProject = useMutation(api.knowledgeLibrary.initializeChecklistForProject);

  // Initialize checklist if needed
  useEffect(() => {
    if (projectChecklist !== undefined && projectChecklist.length === 0) {
      initializeProject({ clientId, projectId, clientType }).catch(console.error);
    }
  }, [projectChecklist, clientId, projectId, clientType, initializeProject]);

  // Get categories from checklist
  const categories = useMemo(() => {
    if (!projectChecklist) return [];
    
    const categoryMap = new Map<string, { total: number; fulfilled: number; missing: number; pendingReview: number }>();
    
    for (const item of projectChecklist) {
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
  }, [projectChecklist]);

  // Filter items by selected category
  const filteredItems = useMemo(() => {
    if (!projectChecklist) return [];
    if (!selectedCategory) return projectChecklist;
    return projectChecklist.filter((item: { category: string }) => item.category === selectedCategory);
  }, [projectChecklist, selectedCategory]);

  // Calculate overall stats
  const stats = useMemo(() => {
    if (!projectChecklist) return { total: 0, fulfilled: 0, missing: 0, pendingReview: 0, percentage: 0 };
    
    const total = projectChecklist.length;
    const fulfilled = projectChecklist.filter((i: { status: string }) => i.status === 'fulfilled').length;
    const missing = projectChecklist.filter((i: { status: string }) => i.status === 'missing').length;
    const pendingReview = projectChecklist.filter((i: { status: string }) => i.status === 'pending_review').length;
    
    return {
      total,
      fulfilled,
      missing,
      pendingReview,
      percentage: total > 0 ? Math.round((fulfilled / total) * 100) : 0,
    };
  }, [projectChecklist]);

  // Loading state
  if (projectChecklist === undefined) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-50 overflow-hidden">
      {/* Column 1: Project Info & Stats */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-medium text-gray-900 text-sm">Project Checklist</h3>
          <p className="text-xs text-gray-500 mt-1">Document requirements</p>
        </div>

        {/* Project Section */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <FolderKanban className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{projectName}</p>
              {dealPhase && (
                <Badge variant="outline" className="text-[10px] mt-0.5">
                  {dealPhase.replace('_', ' ')}
                </Badge>
              )}
            </div>
          </div>

          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Completion</span>
              <span className="font-medium text-gray-900">{stats.percentage}%</span>
            </div>
            <Progress value={stats.percentage} className="h-2" />
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{stats.fulfilled} of {stats.total}</span>
              {stats.pendingReview > 0 && (
                <span className="text-amber-600">{stats.pendingReview} pending</span>
              )}
            </div>
          </div>
        </div>

        {/* Status Summary */}
        <div className="p-4 border-b border-gray-100 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-gray-600">Fulfilled</span>
            </div>
            <span className="text-sm font-medium text-green-700">{stats.fulfilled}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-gray-600">Pending Review</span>
            </div>
            <span className="text-sm font-medium text-amber-700">{stats.pendingReview}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Circle className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">Missing</span>
            </div>
            <span className="text-sm font-medium text-gray-700">{stats.missing}</span>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="mt-auto p-3 border-t border-gray-100 space-y-2 flex-shrink-0">
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
          <p className="text-xs text-gray-500 mt-1">Filter by type</p>
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
              {projectChecklist?.length || 0}
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
          projectId={projectId}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />
      </div>

      {/* Modals */}
      {showEmailModal && (
        <EmailRequestModal
          clientId={clientId}
          clientName={clientName}
          projectId={projectId}
          projectName={projectName}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      {showDynamicInput && (
        <DynamicChecklistInput
          clientId={clientId}
          projectId={projectId}
          onClose={() => setShowDynamicInput(false)}
        />
      )}
    </div>
  );
}
