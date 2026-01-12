'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Trash2,
  Edit2,
  FileText,
  Folder,
  ArrowRight,
} from 'lucide-react';

interface FolderItem {
  name: string;
  folderKey: string;
  parentKey?: string;
  description?: string;
  order: number;
}

interface PlacementRule {
  _id: Id<"documentPlacementRules">;
  clientType: string;
  documentType: string;
  category: string;
  targetFolderKey: string;
  targetLevel: 'client' | 'project';
  priority: number;
  description?: string;
}

interface PlacementRulesTableProps {
  clientType: string;
  rules: PlacementRule[];
  clientFolders: FolderItem[];
  projectFolders: FolderItem[];
}

// Common document types for dropdown
const DOCUMENT_TYPES = [
  'Red Book Valuation',
  'RICS Valuation',
  'Term Sheet',
  'Credit Memo',
  'Operating Statement',
  'Financial Model',
  'Contract',
  'Agreement',
  'Invoice',
  'Correspondence',
  'KYC Document',
  'Note',
  'Report',
  'Other',
];

// Common categories for dropdown
const CATEGORIES = [
  'Appraisals',
  'Terms',
  'Credit',
  'Financial',
  'Legal',
  'Correspondence',
  'KYC',
  'Notes',
  'Other',
];

export default function PlacementRulesTable({
  clientType,
  rules,
  clientFolders,
  projectFolders,
}: PlacementRulesTableProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<PlacementRule | null>(null);
  
  // Form state
  const [formDocType, setFormDocType] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formTargetFolder, setFormTargetFolder] = useState('');
  const [formTargetLevel, setFormTargetLevel] = useState<'client' | 'project'>('project');
  const [formPriority, setFormPriority] = useState('50');
  const [formDescription, setFormDescription] = useState('');

  // Mutations
  const createRule = useMutation(api.placementRules.create);
  const updateRule = useMutation(api.placementRules.update);
  const deleteRule = useMutation(api.placementRules.remove);

  const resetForm = () => {
    setFormDocType('');
    setFormCategory('');
    setFormTargetFolder('');
    setFormTargetLevel('project');
    setFormPriority('50');
    setFormDescription('');
  };

  const openEditDialog = (rule: PlacementRule) => {
    setEditingRule(rule);
    setFormDocType(rule.documentType);
    setFormCategory(rule.category);
    setFormTargetFolder(rule.targetFolderKey);
    setFormTargetLevel(rule.targetLevel);
    setFormPriority(String(rule.priority));
    setFormDescription(rule.description || '');
  };

  const closeDialog = () => {
    setShowAddDialog(false);
    setEditingRule(null);
    resetForm();
  };

  const handleSubmit = async () => {
    if (!formDocType || !formCategory || !formTargetFolder) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      if (editingRule) {
        await updateRule({
          id: editingRule._id,
          documentType: formDocType,
          category: formCategory,
          targetFolderKey: formTargetFolder,
          targetLevel: formTargetLevel,
          priority: parseInt(formPriority) || 50,
          description: formDescription || undefined,
        });
      } else {
        await createRule({
          clientType,
          documentType: formDocType,
          category: formCategory,
          targetFolderKey: formTargetFolder,
          targetLevel: formTargetLevel,
          priority: parseInt(formPriority) || 50,
          description: formDescription || undefined,
        });
      }
      closeDialog();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save rule');
    }
  };

  const handleDelete = async (rule: PlacementRule) => {
    if (!confirm(`Delete rule for "${rule.documentType}"?`)) {
      return;
    }
    
    try {
      await deleteRule({ id: rule._id });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete rule');
    }
  };

  const getFolderName = (folderKey: string, level: 'client' | 'project') => {
    const folders = level === 'client' ? clientFolders : projectFolders;
    const folder = folders.find(f => f.folderKey === folderKey);
    return folder?.name || folderKey;
  };

  const availableFolders = formTargetLevel === 'client' ? clientFolders : projectFolders;

  // Sort rules by priority descending
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Document Type</TableHead>
              <TableHead className="w-[120px]">Category</TableHead>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead className="w-[180px]">Target Folder</TableHead>
              <TableHead className="w-[80px]">Level</TableHead>
              <TableHead className="w-[60px]">Priority</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No placement rules defined</p>
                  <p className="text-xs">Click "Add Rule" to create one</p>
                </TableCell>
              </TableRow>
            ) : (
              sortedRules.map((rule) => (
                <TableRow key={rule._id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{rule.documentType}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{rule.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Folder className="w-4 h-4 text-amber-500" />
                      <span>{getFolderName(rule.targetFolderKey, rule.targetLevel)}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        ({rule.targetFolderKey})
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.targetLevel === 'client' ? 'default' : 'outline'}>
                      {rule.targetLevel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{rule.priority}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => openEditDialog(rule)}
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-600"
                        onClick={() => handleDelete(rule)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Button */}
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setShowAddDialog(true)}
      >
        <Plus className="w-4 h-4" />
        Add Rule
      </Button>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog || !!editingRule} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Edit Placement Rule' : 'Add Placement Rule'}
            </DialogTitle>
            <DialogDescription>
              Define which folder a document type should be filed into for {clientType} clients
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="doc-type">Document Type *</Label>
                <Select value={formDocType} onValueChange={setFormDocType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Target Level *</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="targetLevel"
                    value="project"
                    checked={formTargetLevel === 'project'}
                    onChange={() => {
                      setFormTargetLevel('project');
                      setFormTargetFolder('');
                    }}
                    className="w-4 h-4"
                  />
                  <span>Project-level folder</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="targetLevel"
                    value="client"
                    checked={formTargetLevel === 'client'}
                    onChange={() => {
                      setFormTargetLevel('client');
                      setFormTargetFolder('');
                    }}
                    className="w-4 h-4"
                  />
                  <span>Client-level folder</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="target-folder">Target Folder *</Label>
              <Select value={formTargetFolder} onValueChange={setFormTargetFolder}>
                <SelectTrigger>
                  <SelectValue placeholder="Select folder..." />
                </SelectTrigger>
                <SelectContent>
                  {availableFolders.length === 0 ? (
                    <SelectItem value="" disabled>
                      No {formTargetLevel}-level folders available
                    </SelectItem>
                  ) : (
                    availableFolders.map(folder => (
                      <SelectItem key={folder.folderKey} value={folder.folderKey}>
                        <div className="flex items-center gap-2">
                          <Folder className="w-4 h-4 text-amber-500" />
                          {folder.name}
                          <span className="text-xs text-muted-foreground">
                            ({folder.folderKey})
                          </span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  min="1"
                  max="100"
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Higher priority rules take precedence (1-100)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Optional note..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={!formDocType || !formCategory || !formTargetFolder}
            >
              {editingRule ? 'Save Changes' : 'Add Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
