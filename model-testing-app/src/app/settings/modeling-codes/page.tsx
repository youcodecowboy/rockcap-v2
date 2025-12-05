'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit, Trash2, Search, ChevronDown, ChevronRight, ArrowLeft, FolderOpen, Lock, MoveRight } from 'lucide-react';
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

interface ItemCategory {
  _id: Id<'itemCategories'>;
  name: string;
  normalizedName: string;
  description: string;
  examples: string[];
  isSystem: boolean;
  displayOrder?: number;
  createdAt: string;
  updatedAt: string;
}

// Category group component for Item Codes
const CategoryGroup: React.FC<{
  category: string;
  codes: ItemCode[];
  allCategories: string[];
  onEdit: (code: ItemCode) => void;
  onDelete: (id: Id<'extractedItemCodes'>) => void;
  onMoveToCategory: (codeId: Id<'extractedItemCodes'>, newCategory: string) => void;
}> = ({ category, codes, allCategories, onEdit, onDelete, onMoveToCategory }) => {
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
              <div className="flex gap-2 items-center">
                <Select
                  value=""
                  onValueChange={(newCat) => {
                    if (newCat && newCat !== category) {
                      onMoveToCategory(code._id, newCat);
                    }
                  }}
                >
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <MoveRight className="w-3 h-3 mr-1" />
                    <span className="text-gray-500">Move to...</span>
                  </SelectTrigger>
                  <SelectContent>
                    {allCategories.filter(c => c !== category).map(cat => (
                      <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
  const [deleteCategoryId, setDeleteCategoryId] = useState<Id<'itemCategories'> | null>(null);

  // Create Alias Dialog state
  const [isAliasDialogOpen, setIsAliasDialogOpen] = useState(false);
  const [aliasForm, setAliasForm] = useState({
    alias: '',
    canonicalCodeId: '' as string,
  });

  // Create/Edit Category Dialog state
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ItemCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    examples: '',
  });

  // Queries
  const itemCodes = useQuery(api.extractedItemCodes.list, {}) as ItemCode[] | undefined;
  const codesGroupedByCategory = useQuery(api.extractedItemCodes.getGroupedByCategory, {});
  const aliasesGroupedByCode = useQuery(api.itemCodeAliases.getGroupedByCode, {});
  const categories = useQuery(api.extractedItemCodes.getCategories, {});
  const itemCategories = useQuery(api.itemCategories.list, {}) as ItemCategory[] | undefined;

  // Mutations
  const createCode = useMutation(api.extractedItemCodes.create);
  const updateCode = useMutation(api.extractedItemCodes.update);
  const removeCode = useMutation(api.extractedItemCodes.remove);
  const changeCodeCategory = useMutation(api.extractedItemCodes.changeCategory);
  const createAlias = useMutation(api.itemCodeAliases.create);
  const removeAlias = useMutation(api.itemCodeAliases.remove);
  const createCategory = useMutation(api.itemCategories.create);
  const updateCategory = useMutation(api.itemCategories.update);
  const removeCategory = useMutation(api.itemCategories.remove);
  const seedCategories = useMutation(api.itemCategories.checkAndSeed);

  // Seed categories on first load if empty
  useEffect(() => {
    if (itemCategories && itemCategories.length === 0) {
      seedCategories();
    }
  }, [itemCategories, seedCategories]);

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

  // Category handlers
  const handleCreateCategory = () => {
    setEditingCategory(null);
    setCategoryForm({
      name: '',
      description: '',
      examples: '',
    });
    setIsCategoryDialogOpen(true);
  };

  const handleEditCategory = (category: ItemCategory) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description,
      examples: category.examples.join(', '),
    });
    setIsCategoryDialogOpen(true);
  };

  const handleSubmitCategory = async () => {
    if (!categoryForm.name.trim() || !categoryForm.description.trim()) {
      alert('Please fill in name and description');
      return;
    }

    try {
      const examples = categoryForm.examples
        .split(',')
        .map(e => e.trim())
        .filter(Boolean);

      if (editingCategory) {
        await updateCategory({
          id: editingCategory._id,
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim(),
          examples,
        });
      } else {
        await createCategory({
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim(),
          examples,
        });
      }
      setIsCategoryDialogOpen(false);
    } catch (error: any) {
      alert(`Failed to save category: ${error.message}`);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteCategoryId) return;
    try {
      await removeCategory({ id: deleteCategoryId });
      setDeleteCategoryId(null);
    } catch (error: any) {
      alert(`Failed to delete category: ${error.message}`);
    }
  };

  const handleMoveCodeToCategory = async (codeId: Id<'extractedItemCodes'>, newCategory: string) => {
    try {
      await changeCodeCategory({ id: codeId, newCategory });
    } catch (error: any) {
      alert(`Failed to move code: ${error.message}`);
    }
  };

  // Get all category names for dropdown
  const allCategoryNames = useMemo(() => {
    if (itemCategories) {
      return itemCategories.map(c => c.name);
    }
    return categories || [];
  }, [itemCategories, categories]);

  const totalCodes = itemCodes?.length || 0;
  const totalAliases = aliasesGroupedByCode 
    ? Object.values(aliasesGroupedByCode).reduce((sum, aliases) => sum + aliases.length, 0) 
    : 0;
  const totalCategories = itemCategories?.length || 0;

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
            <span>•</span>
            <span>{totalCategories} categories</span>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-6">
            <TabsList>
              <TabsTrigger value="codes">Item Codes</TabsTrigger>
              <TabsTrigger value="aliases">Alias Dictionary</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="instructions">Instructions</TabsTrigger>
            </TabsList>
            
            {activeTab === 'codes' && (
              <Button onClick={handleCreateCode}>
                <Plus className="w-4 h-4 mr-2" />
                New Code
              </Button>
            )}
            {activeTab === 'aliases' && (
              <Button onClick={handleCreateAlias}>
                <Plus className="w-4 h-4 mr-2" />
                New Alias
              </Button>
            )}
            {activeTab === 'categories' && (
              <Button onClick={handleCreateCategory}>
                <Plus className="w-4 h-4 mr-2" />
                New Category
              </Button>
            )}
          </div>

          {/* Filters - hide for instructions tab */}
          {activeTab !== 'instructions' && (
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
          )}

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
                  allCategories={allCategoryNames}
                  onEdit={handleEditCode}
                  onDelete={setDeleteCodeId}
                  onMoveToCategory={handleMoveCodeToCategory}
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

          {/* Categories Tab */}
          <TabsContent value="categories">
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                Categories help organize item codes and improve LLM codification accuracy. 
                Add descriptions and examples to teach the AI what types of items belong in each category.
              </p>
            </div>
            
            {!itemCategories || itemCategories.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-gray-600 mb-4">No categories found. Click below to seed default categories.</p>
                  <Button onClick={() => seedCategories()}>
                    <Plus className="w-4 h-4 mr-2" />
                    Seed Default Categories
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {itemCategories.map((category) => (
                  <Card key={category._id} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <FolderOpen className="w-5 h-5 text-blue-600" />
                          <CardTitle className="text-lg">{category.name}</CardTitle>
                          {category.isSystem && (
                            <Badge variant="outline" className="text-xs flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              System
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEditCategory(category)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          {!category.isSystem && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteCategoryId(category._id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <CardDescription className="mt-2">{category.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Examples:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {category.examples.map((example, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {example}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-gray-400">
                        Normalized: <code className="bg-gray-100 px-1 rounded">{category.normalizedName}</code>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Instructions Tab */}
          <TabsContent value="instructions">
            <div className="space-y-6">
              {/* Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-2xl">📚</span>
                    Codification System Overview
                  </CardTitle>
                  <CardDescription>
                    Learn how the extraction and codification system works to standardize financial data across your projects.
                  </CardDescription>
                </CardHeader>
                <CardContent className="prose prose-sm max-w-none">
                  <p className="text-gray-700">
                    The codification system automatically extracts financial data from uploaded documents (Excel files, PDFs) 
                    and maps them to standardized item codes. This enables consistent data aggregation across multiple 
                    sources and seamless export to financial models.
                  </p>
                  <h4 className="font-semibold text-gray-900 mt-4 mb-2">How It Works</h4>
                  <ol className="list-decimal list-inside space-y-2 text-gray-700">
                    <li><strong>Upload:</strong> Drop an Excel or PDF containing financial data</li>
                    <li><strong>Extract:</strong> AI analyzes the document and extracts line items</li>
                    <li><strong>Codify:</strong> Items are matched to standard codes using Fast Pass (aliases) and Smart Pass (AI)</li>
                    <li><strong>Review:</strong> Unmatched items are flagged for manual confirmation</li>
                    <li><strong>Aggregate:</strong> Confirmed items are added to the project&apos;s unified Data Library</li>
                    <li><strong>Export:</strong> Run models using the aggregated data</li>
                  </ol>
                </CardContent>
              </Card>

              {/* Item Codes */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-xl">🏷️</span>
                    Item Codes
                  </CardTitle>
                </CardHeader>
                <CardContent className="prose prose-sm max-w-none">
                  <p className="text-gray-700">
                    Item codes are standardized identifiers for financial line items. They follow the format{' '}
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">&lt;category.item&gt;</code>
                  </p>
                  <h4 className="font-semibold text-gray-900 mt-4 mb-2">Examples</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-gray-50 p-2 rounded"><code className="text-green-700">&lt;stamp.duty&gt;</code> - Stamp Duty Land Tax</div>
                    <div className="bg-gray-50 p-2 rounded"><code className="text-green-700">&lt;groundworks&gt;</code> - Groundworks costs</div>
                    <div className="bg-gray-50 p-2 rounded"><code className="text-green-700">&lt;professional.fees&gt;</code> - Professional fees</div>
                    <div className="bg-gray-50 p-2 rounded"><code className="text-green-700">&lt;site.labour&gt;</code> - Site labour and prelims</div>
                  </div>
                </CardContent>
              </Card>

              {/* Category Totals */}
              <Card className="border-blue-200 bg-blue-50/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-xl">📊</span>
                    Category Totals (Auto-Computed)
                  </CardTitle>
                </CardHeader>
                <CardContent className="prose prose-sm max-w-none">
                  <p className="text-gray-700">
                    The system automatically computes totals for each category. These totals are available as exportable 
                    item codes and can be used in your models.
                  </p>
                  <h4 className="font-semibold text-gray-900 mt-4 mb-2">Auto-Generated Total Codes</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                    <div className="bg-blue-100/50 p-2 rounded border border-blue-200">
                      <code className="text-blue-700">&lt;total.construction.costs&gt;</code>
                    </div>
                    <div className="bg-blue-100/50 p-2 rounded border border-blue-200">
                      <code className="text-blue-700">&lt;total.professional.fees&gt;</code>
                    </div>
                    <div className="bg-blue-100/50 p-2 rounded border border-blue-200">
                      <code className="text-blue-700">&lt;total.development.costs&gt;</code>
                    </div>
                    <div className="bg-blue-100/50 p-2 rounded border border-blue-200">
                      <code className="text-blue-700">&lt;total.revenue&gt;</code>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-blue-200">
                    <h5 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <span>✏️</span> Overriding Totals
                    </h5>
                    <p className="text-gray-700 text-sm">
                      You can manually override any auto-computed total by clicking the edit icon next to it in the Data Library. 
                      This is useful when you need to adjust a total without modifying individual line items. 
                      To revert to the computed value, click &quot;Use Computed&quot; in the override dialog.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Aliases */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-xl">🔗</span>
                    Alias Dictionary (Fast Pass)
                  </CardTitle>
                </CardHeader>
                <CardContent className="prose prose-sm max-w-none">
                  <p className="text-gray-700">
                    Aliases are alternative names that map to standard item codes. The Fast Pass system uses exact string 
                    matching for instant codification without AI inference.
                  </p>
                  <h4 className="font-semibold text-gray-900 mt-4 mb-2">Example Aliases</h4>
                  <div className="space-y-1 text-sm text-gray-600">
                    <div>&quot;SDLT&quot; → <code className="text-green-700">&lt;stamp.duty&gt;</code></div>
                    <div>&quot;Land Tax&quot; → <code className="text-green-700">&lt;stamp.duty&gt;</code></div>
                    <div>&quot;Architect Fees&quot; → <code className="text-green-700">&lt;professional.fees&gt;</code></div>
                    <div>&quot;Build Cost&quot; → <code className="text-green-700">&lt;construction.costs&gt;</code></div>
                  </div>
                  <p className="text-gray-700 mt-3">
                    Adding common aliases for your organization&apos;s terminology improves matching accuracy and speed.
                  </p>
                </CardContent>
              </Card>

              {/* Categories */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-xl">📁</span>
                    Categories
                  </CardTitle>
                </CardHeader>
                <CardContent className="prose prose-sm max-w-none">
                  <p className="text-gray-700">
                    Categories group related item codes together. They help the AI understand context and improve 
                    Smart Pass accuracy by providing descriptions and examples.
                  </p>
                  <h4 className="font-semibold text-gray-900 mt-4 mb-2">Standard Categories</h4>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="bg-gray-50 p-2 rounded">Construction Costs</div>
                    <div className="bg-gray-50 p-2 rounded">Professional Fees</div>
                    <div className="bg-gray-50 p-2 rounded">Development Costs</div>
                    <div className="bg-gray-50 p-2 rounded">Site Costs</div>
                    <div className="bg-gray-50 p-2 rounded">Financing</div>
                    <div className="bg-gray-50 p-2 rounded">Revenue</div>
                  </div>
                </CardContent>
              </Card>

              {/* Tips */}
              <Card className="border-amber-200 bg-amber-50/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-xl">💡</span>
                    Tips for Better Extraction
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-gray-700">
                    <li className="flex items-start gap-2">
                      <span className="text-amber-600 mt-0.5">•</span>
                      <span><strong>Use the &quot;Extract Financial Data&quot; toggle</strong> when uploading to ensure extraction runs on all documents.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-600 mt-0.5">•</span>
                      <span><strong>Add aliases for common terms</strong> used in your documents to improve Fast Pass matching.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-600 mt-0.5">•</span>
                      <span><strong>Review unmatched items</strong> and create new codes if needed - this improves future extractions.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-600 mt-0.5">•</span>
                      <span><strong>Category totals auto-update</strong> when you add or modify items in that category.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-600 mt-0.5">•</span>
                      <span><strong>Multi-document projects</strong> aggregate data automatically - the Data Library shows all sources.</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
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

        {/* Create/Edit Category Dialog */}
        <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingCategory ? 'Edit Category' : 'Create Category'}</DialogTitle>
              <DialogDescription>
                {editingCategory 
                  ? 'Update the category details. Changes will improve LLM codification accuracy.'
                  : 'Add a new category to organize item codes. Include a description and examples to help the AI.'
                }
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="cat-name">Category Name *</Label>
                <Input
                  id="cat-name"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  placeholder="e.g., Professional Fees"
                  disabled={editingCategory?.isSystem}
                />
                {editingCategory?.isSystem && (
                  <p className="text-xs text-amber-600 mt-1">System category names cannot be changed</p>
                )}
              </div>
              <div>
                <Label htmlFor="cat-description">Description *</Label>
                <Textarea
                  id="cat-description"
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  placeholder="Describe what types of items belong in this category..."
                  rows={3}
                />
                <p className="text-xs text-gray-500 mt-1">
                  This description helps the AI understand what items to categorize here
                </p>
              </div>
              <div>
                <Label htmlFor="cat-examples">Examples (comma-separated)</Label>
                <Input
                  id="cat-examples"
                  value={categoryForm.examples}
                  onChange={(e) => setCategoryForm({ ...categoryForm, examples: e.target.value })}
                  placeholder="e.g., Engineers, Architects, Solicitors"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Provide example items that would fall into this category
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitCategory}>
                {editingCategory ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Category Confirmation */}
        <AlertDialog open={!!deleteCategoryId} onOpenChange={(open) => !open && setDeleteCategoryId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Category?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this category. Make sure no item codes are using it first.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCategory} className="bg-red-600 hover:bg-red-700">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
