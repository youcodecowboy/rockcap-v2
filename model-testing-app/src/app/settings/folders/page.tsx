'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  FolderTree, 
  FileText, 
  RefreshCw, 
  AlertTriangle,
  Building2,
  Briefcase,
} from 'lucide-react';
import FolderTemplateEditor from '@/components/FolderTemplateEditor';
import PlacementRulesTable from '@/components/PlacementRulesTable';

export default function FolderSettingsPage() {
  const [selectedClientType, setSelectedClientType] = useState<string>('borrower');
  const [refreshKey, setRefreshKey] = useState(0);

  // Queries
  const clientTypes = useQuery(api.folderTemplates.getClientTypes);
  const clientTemplate = useQuery(
    api.folderTemplates.getByClientTypeAndLevel,
    { clientType: selectedClientType, level: 'client' }
  );
  const projectTemplate = useQuery(
    api.folderTemplates.getByClientTypeAndLevel,
    { clientType: selectedClientType, level: 'project' }
  );
  const placementRules = useQuery(
    api.placementRules.getByClientType,
    { clientType: selectedClientType }
  );

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Folder Structure Settings</h1>
            <p className="mt-2 text-gray-500">
              Configure folder templates and document placement rules for different client types
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>

        {/* Client Type Selector */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Client Type
            </CardTitle>
            <CardDescription>
              Select a client type to view and edit its folder structure and placement rules
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Select
                value={selectedClientType}
                onValueChange={setSelectedClientType}
              >
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Select client type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="borrower">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      Borrower
                    </div>
                  </SelectItem>
                  <SelectItem value="lender">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      Lender
                    </div>
                  </SelectItem>
                  {clientTypes?.filter(t => t !== 'borrower' && t !== 'lender').map(type => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">
                  {clientTemplate ? `${clientTemplate.folders.length} client folders` : 'No client template'}
                </Badge>
                <Badge variant="outline">
                  {projectTemplate ? `${projectTemplate.folders.length} project folders` : 'No project template'}
                </Badge>
                <Badge variant="outline">
                  {placementRules?.length ?? 0} placement rules
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Tabs */}
        <Tabs defaultValue="templates" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="templates" className="gap-2">
              <FolderTree className="w-4 h-4" />
              Folder Templates
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-2">
              <FileText className="w-4 h-4" />
              Placement Rules
            </TabsTrigger>
          </TabsList>

          {/* Folder Templates Tab */}
          <TabsContent value="templates" className="space-y-6">
            {/* Warning if no templates */}
            {!clientTemplate && !projectTemplate && (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 text-amber-800">
                    <AlertTriangle className="w-5 h-5" />
                    <div>
                      <p className="font-medium">No templates found for {selectedClientType}</p>
                      <p className="text-sm">Run the seed migration to create default templates.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Client-level Folders */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Client-level Folders
                </CardTitle>
                <CardDescription>
                  Folders created automatically when a new {selectedClientType} client is added
                </CardDescription>
              </CardHeader>
              <CardContent>
                {clientTemplate ? (
                  <FolderTemplateEditor
                    key={`client-${selectedClientType}-${refreshKey}`}
                    templateId={clientTemplate._id}
                    folders={clientTemplate.folders}
                    level="client"
                    clientType={selectedClientType}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm">No client-level template defined</p>
                )}
              </CardContent>
            </Card>

            {/* Project-level Folders */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="w-5 h-5" />
                  Project-level Folders
                </CardTitle>
                <CardDescription>
                  Folders created automatically when a new project is added for a {selectedClientType} client
                </CardDescription>
              </CardHeader>
              <CardContent>
                {projectTemplate ? (
                  <FolderTemplateEditor
                    key={`project-${selectedClientType}-${refreshKey}`}
                    templateId={projectTemplate._id}
                    folders={projectTemplate.folders}
                    level="project"
                    clientType={selectedClientType}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm">No project-level template defined</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Placement Rules Tab */}
          <TabsContent value="rules">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Document Placement Rules
                </CardTitle>
                <CardDescription>
                  Define which folders documents should be filed into based on their type and category.
                  Rules are specific to {selectedClientType} clients.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PlacementRulesTable
                  key={`rules-${selectedClientType}-${refreshKey}`}
                  clientType={selectedClientType}
                  rules={placementRules ?? []}
                  clientFolders={clientTemplate?.folders ?? []}
                  projectFolders={projectTemplate?.folders ?? []}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
