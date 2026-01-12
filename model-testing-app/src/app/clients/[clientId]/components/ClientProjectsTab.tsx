'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FolderKanban,
  Plus,
  Search,
  Calendar,
  ChevronRight,
  Briefcase,
  FileText,
  Building2,
} from 'lucide-react';
import { useDocumentsByProject } from '@/lib/documentStorage';

interface ClientProjectsTabProps {
  clientId: Id<"clients">;
  clientName: string;
  projects: any[];
}

export default function ClientProjectsTab({
  clientId,
  clientName,
  projects,
}: ClientProjectsTabProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectShortcode, setNewProjectShortcode] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const createProject = useMutation(api.projects.create);

  // Filter projects
  const filteredProjects = projects.filter((project: any) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      project.name?.toLowerCase().includes(query) ||
      project.projectShortcode?.toLowerCase().includes(query) ||
      project.description?.toLowerCase().includes(query)
    );
  });

  // Separate active and other projects
  const activeProjects = filteredProjects.filter((p: any) => p.status === 'active');
  const otherProjects = filteredProjects.filter((p: any) => p.status !== 'active');

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    setIsCreating(true);
    try {
      const projectId = await createProject({
        name: newProjectName.trim(),
        projectShortcode: newProjectShortcode.trim() || undefined,
        clientRoles: [{ clientId: clientId, role: 'primary' }],
      });
      
      setShowCreateDialog(false);
      setNewProjectName('');
      setNewProjectShortcode('');
      
      // Navigate to the new project
      router.push(`/clients/${clientId}/projects/${projectId}`);
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>;
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Completed</Badge>;
      case 'on-hold':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">On Hold</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 border-red-200">Cancelled</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Inactive</Badge>;
      default:
        return <Badge variant="outline">{status || 'Unknown'}</Badge>;
    }
  };

  const ProjectCard = ({ project }: { project: any }) => {
    const documents = useDocumentsByProject(project._id) || [];
    
    return (
      <Card 
        className="hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => router.push(`/clients/${clientId}/projects/${project._id}`)}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
              project.status === 'active' ? 'bg-purple-100' : 'bg-gray-100'
            }`}>
              <Briefcase className={`w-6 h-6 ${
                project.status === 'active' ? 'text-purple-600' : 'text-gray-500'
              }`} />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
                {getStatusBadge(project.status)}
              </div>
              
              {project.projectShortcode && (
                <p className="text-sm text-gray-500 font-mono mt-0.5">{project.projectShortcode}</p>
              )}
              
              {project.description && (
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{project.description}</p>
              )}
              
              <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <FileText className="w-4 h-4" />
                  {documents.length} documents
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(project.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </div>

      {/* Projects */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchQuery ? 'No projects found' : 'No projects yet'}
          </h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            {searchQuery
              ? 'Try adjusting your search terms'
              : `Create your first project for ${clientName} to get started.`}
          </p>
          {!searchQuery && (
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Create Project
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Projects */}
          {activeProjects.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Active Projects ({activeProjects.length})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {activeProjects.map((project: any) => (
                  <ProjectCard key={project._id} project={project} />
                ))}
              </div>
            </div>
          )}

          {/* Other Projects */}
          {otherProjects.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Other Projects ({otherProjects.length})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {otherProjects.map((project: any) => (
                  <ProjectCard key={project._id} project={project} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Project Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderKanban className="w-5 h-5" />
              Create New Project
            </DialogTitle>
            <DialogDescription>
              Create a new project for {clientName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Project Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g., Wimbledon Development Phase 2"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Project Shortcode
              </label>
              <Input
                value={newProjectShortcode}
                onChange={(e) => setNewProjectShortcode(e.target.value.toUpperCase().slice(0, 10))}
                placeholder="e.g., WIMBDEV2"
                maxLength={10}
              />
              <p className="text-xs text-gray-500 mt-1">
                Max 10 characters. Used for document naming.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setNewProjectName('');
                setNewProjectShortcode('');
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={!newProjectName.trim() || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
