'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit, Trash2, Search, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type DataType = 'currency' | 'number' | 'percentage' | 'string';

interface ItemCode {
  _id: Id<'extractedItemCodes'>;
  code: string;
  displayName: string;
  category: string;
  dataType: DataType;
  isSystemDefault?: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ItemCodeAlias {
  _id: Id<'itemCodeAliases'>;
  alias: string;
  aliasNormalized: string;
  canonicalCodeId: Id<'extractedItemCodes'>;
  canonicalCode: string;
  confidence: number;
  source: 'system_seed' | 'llm_suggested' | 'user_confirmed' | 'manual';
  usageCount?: number;
  createdAt: string;
}

// Category group component for Item Codes
const CategoryGroup: React.FC<{
  category: string;
  codes: ItemCode[];
  onEdit: (code: ItemCode) => void;
  onDelete: (id: Id<'extractedItemCodes'>) => void;
}> = ({ category, codes, onEdit, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white mb-4">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <span className="font-medium text-gray-900">{category}</span>
          <span className="text-sm text-gray-500">({codes.length} codes)</span>
        </div>
      </button>

      {isExpanded && (
        <div className="divide-y divide-gray-200">
          {codes.map((code) => (
            <div key={code._id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <code className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-sm font-mono">
                    {code.code}
                  </code>
                  <span className="text-gray-900 font-medium">{code.displayName}</span>
                  <Badge variant="secondary" className="text-xs">{code.dataType}</Badge>
                  {code.isSystemDefault && (
                    <Badge variant="outline" className="text-xs">System</Badge>
                  )}
                  {!code.isActive && (
                    <Badge variant="destructive" className="text-xs">Inactive</Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => onEdit(code)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => onDelete(code._id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Alias group component
const AliasGroup: React.FC<{
  canonicalCode: string;
  aliases: ItemCodeAlias[];
  onDelete: (id: Id<'itemCodeAliases'>) => void;
}> = ({ canonicalCode, aliases, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'system_seed': return <Badge variant="outline" className="text-xs">System</Badge>;
      case 'llm_suggested': return <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">LLM</Badge>;
      case 'user_confirmed': return <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">Confirmed</Badge>;
      case 'manual': return <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">Manual</Badge>;
      default: return null;
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white mb-4">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <code className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-sm font-mono">
            {canonicalCode}
          </code>
          <span className="text-sm text-gray-500">({aliases.length} aliases)</span>
        </div>
      </button>

      {isExpanded && (
        <div className="divide-y divide-gray-200">
          {aliases.map((alias) => (
            <div key={alias._id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 pl-12">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="text-gray-900">&quot;{alias.alias}&quot;</span>
                  {getSourceBadge(alias.source)}
                  <span className="text-xs text-gray-500">
                    Confidence: {Math.round(alias.confidence * 100)}%
                  </span>
                  {alias.usageCount !== undefined && alias.usageCount > 0 && (
                    <span className="text-xs text-gray-500">
                      Used {alias.usageCount}x
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => onDelete(alias._id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function ModelingCodesPage() {
  const [activeTab, setActiveTab] = useState('codes');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  // Create/Edit Item Code Dialog state
  const [isCodeDialogOpen, setIsCodeDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<ItemCode | null>(null);
  const [codeForm, setCodeForm] = useState({
    code: '',
    displayName: '',
    category: '',
    dataType: 'currency' as DataType,
  });
  
  // Delete confirmation
  const [deleteCodeId, setDeleteCodeId] = useState<Id<'extractedItemCodes'> | null>(null);
  const [deleteAliasId, setDeleteAliasId] = useState<Id<'itemCodeAliases'> | null>(null);

  // Create Alias Dialog state
  const [isAliasDialogOpen, setIsAliasDialogOpen] = useState(false);
  const [aliasForm, setAliasForm] = useState({
    alias: '',
    canonicalCodeId: '' as string,
  });

  // Queries
  const itemCodes = useQuery(api.extractedItemCodes.list, {}) as ItemCode[] | undefined;
  const codesGroupedByCategory = useQuery(api.extractedItemCodes.getGroupedByCategory, {});
  const aliasesGroupedByCode = useQuery(api.itemCodeAliases.getGroupedByCode, {});
  const categories = useQuery(api.extractedItemCodes.getCategories, {});

  // Mutations
  const createCode = useMutation(api.extractedItemCodes.create);
  const updateCode = useMutation(api.extractedItemCodes.update);
  const removeCode = useMutation(api.extractedItemCodes.remove);
  const createAlias = useMutation(api.itemCodeAliases.create);
  const removeAlias = useMutation(api.itemCodeAliases.remove);

  // Filtered codes
  const filteredCodes = useMemo(() => {
    if (!codesGroupedByCategory) return {};
    
    const filtered: Record<string, ItemCode[]> = {};
    
    Object.entries(codesGroupedByCategory).forEach(([category, codes]) => {
      if (categoryFilter !== 'all' && category !== categoryFilter) {
        return;
      }
      
      const matchingCodes = (codes as ItemCode[]).filter(code => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          code.code.toLowerCase().includes(query) ||
          code.displayName.toLowerCase().includes(query)
        );
      });
      
      if (matchingCodes.length > 0) {
        filtered[category] = matchingCodes;
      }
    });
    
    return filtered;
  }, [codesGroupedByCategory, searchQuery, categoryFilter]);

  // Filtered aliases
  const filteredAliases = useMemo(() => {
    if (!aliasesGroupedByCode) return {};
    
    if (!searchQuery) return aliasesGroupedByCode;
    
    const filtered: Record<string, ItemCodeAlias[]> = {};
    const query = searchQuery.toLowerCase();
    
    Object.entries(aliasesGroupedByCode).forEach(([code, aliases]) => {
      const matchingAliases = (aliases as ItemCodeAlias[]).filter(alias => 
        alias.alias.toLowerCase().includes(query) ||
        code.toLowerCase().includes(query)
      );
      
      if (matchingAliases.length > 0) {
        filtered[code] = matchingAliases;
      }
    });
    
    return filtered;
  }, [aliasesGroupedByCode, searchQuery]);

  // Handlers
  const handleCreateCode = () => {
    setEditingCode(null);
    setCodeForm({
      code: '',
      displayName: '',
      category: '',
      dataType: 'currency',
    });
    setIsCodeDialogOpen(true);
  };

  const handleEditCode = (code: ItemCode) => {
    setEditingCode(code);
    setCodeForm({
      code: code.code,
      displayName: code.displayName,
      category: code.category,
      dataType: code.dataType,
    });
    setIsCodeDialogOpen(true);
  };

  const handleSubmitCode = async () => {
    if (!codeForm.code.trim() || !codeForm.displayName.trim() || !codeForm.category.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      if (editingCode) {
        await updateCode({
          id: editingCode._id,
          code: codeForm.code.trim(),
          displayName: codeForm.displayName.trim(),
          category: codeForm.category.trim(),
          dataType: codeForm.dataType,
        });
      } else {
        await createCode({
          code: codeForm.code.trim(),
          displayName: codeForm.displayName.trim(),
          category: codeForm.category.trim(),
          dataType: codeForm.dataType,
        });
      }
      setIsCodeDialogOpen(false);
    } catch (error: any) {
      alert(`Failed to save code: ${error.message}`);
    }
  };

  const handleDeleteCode = async () => {
    if (!deleteCodeId) return;
    try {
      await removeCode({ id: deleteCodeId });
      setDeleteCodeId(null);
    } catch (error: any) {
      alert(`Failed to delete code: ${error.message}`);
    }
  };

  const handleCreateAlias = () => {
    setAliasForm({
      alias: '',
      canonicalCodeId: '',
    });
    setIsAliasDialogOpen(true);
  };

  const handleSubmitAlias = async () => {
    if (!aliasForm.alias.trim() || !aliasForm.canonicalCodeId) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      await createAlias({
        alias: aliasForm.alias.trim(),
        canonicalCodeId: aliasForm.canonicalCodeId as Id<'extractedItemCodes'>,
        confidence: 1.0,
        source: 'manual',
      });
      setIsAliasDialogOpen(false);
    } catch (error: any) {
      alert(`Failed to create alias: ${error.message}`);
    }
  };

  const handleDeleteAlias = async () => {
    if (!deleteAliasId) return;
    try {
      await removeAlias({ id: deleteAliasId });
      setDeleteAliasId(null);
    } catch (error: any) {
      alert(`Failed to delete alias: ${error.message}`);
    }
  };

  const totalCodes = itemCodes?.length || 0;
  const totalAliases = aliasesGroupedByCode 
    ? Object.values(aliasesGroupedByCode).reduce((sum, aliases) => sum + aliases.length, 0) 
    : 0;

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back link */}
        <Link href="/settings" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </Link>

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Item Code Library</h1>
          <p className="mt-2 text-gray-600">
            Manage canonical item codes and their aliases for data codification
          </p>
          <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
            <span>{totalCodes} codes</span>
            <span>•</span>
            <span>{totalAliases} aliases</span>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-6">
            <TabsList>
              <TabsTrigger value="codes">Item Codes</TabsTrigger>
              <TabsTrigger value="aliases">Alias Dictionary</TabsTrigger>
            </TabsList>
            
            {activeTab === 'codes' ? (
              <Button onClick={handleCreateCode}>
                <Plus className="w-4 h-4 mr-2" />
                New Code
              </Button>
            ) : (
              <Button onClick={handleCreateAlias}>
                <Plus className="w-4 h-4 mr-2" />
                New Alias
              </Button>
            )}
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="search">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      id="search"
                      placeholder={activeTab === 'codes' ? "Search codes..." : "Search aliases..."}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                {activeTab === 'codes' && (
                  <div>
                    <Label htmlFor="filter-category">Category</Label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger id="filter-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories?.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Item Codes Tab */}
          <TabsContent value="codes">
            {Object.keys(filteredCodes).length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-gray-600 mb-4">
                    {totalCodes === 0 
                      ? 'No item codes created yet'
                      : 'No codes match your filters'}
                  </p>
                  {totalCodes === 0 && (
                    <Button onClick={handleCreateCode}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Code
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              Object.entries(filteredCodes).sort(([a], [b]) => a.localeCompare(b)).map(([category, codes]) => (
                <CategoryGroup
                  key={category}
                  category={category}
                  codes={codes}
                  onEdit={handleEditCode}
                  onDelete={setDeleteCodeId}
                />
              ))
            )}
          </TabsContent>

          {/* Alias Dictionary Tab */}
          <TabsContent value="aliases">
            {Object.keys(filteredAliases).length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-gray-600 mb-4">
                    {totalAliases === 0 
                      ? 'No aliases created yet. Aliases are automatically created when you confirm code mappings.'
                      : 'No aliases match your search'}
                  </p>
                  {totalAliases === 0 && totalCodes > 0 && (
                    <Button onClick={handleCreateAlias}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Alias Manually
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              Object.entries(filteredAliases).sort(([a], [b]) => a.localeCompare(b)).map(([code, aliases]) => (
                <AliasGroup
                  key={code}
                  canonicalCode={code}
                  aliases={aliases as ItemCodeAlias[]}
                  onDelete={setDeleteAliasId}
                />
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Create/Edit Code Dialog */}
        <Dialog open={isCodeDialogOpen} onOpenChange={setIsCodeDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingCode ? 'Edit Item Code' : 'Create Item Code'}</DialogTitle>
              <DialogDescription>
                {editingCode ? 'Update the item code details' : 'Add a new canonical item code to the library'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={codeForm.code}
                  onChange={(e) => setCodeForm({ ...codeForm, code: e.target.value })}
                  placeholder="e.g., <stamp.duty>"
                  className="font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">Format: &lt;category.item&gt; or &lt;item&gt;</p>
              </div>
              <div>
                <Label htmlFor="displayName">Display Name *</Label>
                <Input
                  id="displayName"
                  value={codeForm.displayName}
                  onChange={(e) => setCodeForm({ ...codeForm, displayName: e.target.value })}
                  placeholder="e.g., Stamp Duty"
                />
              </div>
              <div>
                <Label htmlFor="category">Category *</Label>
                <Input
                  id="category"
                  value={codeForm.category}
                  onChange={(e) => setCodeForm({ ...codeForm, category: e.target.value })}
                  placeholder="e.g., Purchase Costs"
                  list="category-suggestions"
                />
                <datalist id="category-suggestions">
                  {categories?.map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
              <div>
                <Label htmlFor="dataType">Data Type *</Label>
                <Select 
                  value={codeForm.dataType} 
                  onValueChange={(v) => setCodeForm({ ...codeForm, dataType: v as DataType })}
                >
                  <SelectTrigger id="dataType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="currency">Currency (£)</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="string">Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCodeDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitCode}>
                {editingCode ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Alias Dialog */}
        <Dialog open={isAliasDialogOpen} onOpenChange={setIsAliasDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Alias</DialogTitle>
              <DialogDescription>
                Add a new alias that will map to an existing item code
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="alias">Alias Text *</Label>
                <Input
                  id="alias"
                  value={aliasForm.alias}
                  onChange={(e) => setAliasForm({ ...aliasForm, alias: e.target.value })}
                  placeholder="e.g., SDLT, Site Purchase Price"
                />
                <p className="text-xs text-gray-500 mt-1">The term that will be matched during extraction</p>
              </div>
              <div>
                <Label htmlFor="canonicalCode">Maps To Code *</Label>
                <Select 
                  value={aliasForm.canonicalCodeId} 
                  onValueChange={(v) => setAliasForm({ ...aliasForm, canonicalCodeId: v })}
                >
                  <SelectTrigger id="canonicalCode">
                    <SelectValue placeholder="Select a code..." />
                  </SelectTrigger>
                  <SelectContent>
                    {itemCodes?.map(code => (
                      <SelectItem key={code._id} value={code._id}>
                        <span className="font-mono">{code.code}</span>
                        <span className="text-gray-500 ml-2">({code.displayName})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAliasDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitAlias}>Create Alias</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Code Confirmation */}
        <AlertDialog open={!!deleteCodeId} onOpenChange={(open) => !open && setDeleteCodeId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Item Code?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this code. Any aliases pointing to this code must be deleted first.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCode} className="bg-red-600 hover:bg-red-700">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Alias Confirmation */}
        <AlertDialog open={!!deleteAliasId} onOpenChange={(open) => !open && setDeleteAliasId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Alias?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this alias. It will no longer be used for automatic matching.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteAlias} className="bg-red-600 hover:bg-red-700">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
