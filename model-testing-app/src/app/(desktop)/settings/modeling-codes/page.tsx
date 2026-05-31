'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import {
  Panel,
  TabStrip,
  StatusPill,
  Button,
  IconButton,
  Field,
  Input,
  Textarea,
  Select,
  Modal,
  EmptyState,
  SkeletonCard,
} from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Plus, Edit, Trash2, Search, ChevronDown, ChevronRight, ArrowLeft, FolderOpen, Lock, MoveRight } from 'lucide-react';
import Link from 'next/link';
import type { ColorPalette } from '@/lib/colors';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

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

// Mono code chip — canon replacement for the blue <code> pills.
function CodeChip({ children, colors }: { children: React.ReactNode; colors: ColorPalette }) {
  return (
    <code
      style={{
        padding: '2px 6px',
        background: `${colors.accent.blue}15`,
        color: colors.accent.blue,
        border: `1px solid ${colors.accent.blue}40`,
        borderRadius: 2,
        fontSize: 11,
        fontFamily: MONO,
      }}
    >
      {children}
    </code>
  );
}

// Category group component for Item Codes
const CategoryGroup: React.FC<{
  category: string;
  codes: ItemCode[];
  allCategories: string[];
  colors: ColorPalette;
  onEdit: (code: ItemCode) => void;
  onDelete: (id: Id<'extractedItemCodes'>) => void;
  onMoveToCategory: (codeId: Id<'extractedItemCodes'>, newCategory: string) => void;
}> = ({ category, codes, allCategories, colors, onEdit, onDelete, onMoveToCategory }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div
      style={{
        border: `1px solid ${colors.border.default}`,
        borderRadius: 4,
        overflow: 'hidden',
        background: colors.bg.card,
        marginBottom: 16,
      }}
    >
      <button
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: colors.bg.light,
          border: 'none',
          cursor: 'pointer',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isExpanded ? (
            <ChevronDown size={16} style={{ color: colors.text.muted }} />
          ) : (
            <ChevronRight size={16} style={{ color: colors.text.muted }} />
          )}
          <span style={{ fontWeight: 500, color: colors.text.primary }}>{category}</span>
          <span style={{ fontSize: 12, color: colors.text.muted }}>({codes.length} codes)</span>
        </div>
      </button>

      {isExpanded && (
        <div>
          {codes.map((code, i) => (
            <div
              key={code._id}
              style={{
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTop: i === 0 ? 'none' : `1px solid ${colors.border.light}`,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <CodeChip colors={colors}>{code.code}</CodeChip>
                  <span style={{ color: colors.text.primary, fontWeight: 500 }}>{code.displayName}</span>
                  <StatusPill label={code.dataType} tone={colors.text.muted} />
                  {code.isSystemDefault && <StatusPill label="System" tone={colors.text.dim} />}
                  {!code.isActive && <StatusPill label="Inactive" tone={colors.accent.red} />}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Select
                  value=""
                  onChange={(e) => {
                    const newCat = e.target.value;
                    if (newCat && newCat !== category) {
                      onMoveToCategory(code._id, newCat);
                    }
                  }}
                  style={{ width: 150, padding: '4px 8px', fontSize: 11 }}
                >
                  <option value="">Move to...</option>
                  {allCategories.filter((c) => c !== category).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </Select>
                <IconButton label="Edit" onClick={() => onEdit(code)}>
                  <Edit size={14} />
                </IconButton>
                <IconButton label="Delete" onClick={() => onDelete(code._id)}>
                  <Trash2 size={14} style={{ color: colors.accent.red }} />
                </IconButton>
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
  colors: ColorPalette;
  onDelete: (id: Id<'itemCodeAliases'>) => void;
}> = ({ canonicalCode, aliases, colors, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getSourceTone = (source: string): { label: string; tone: string } => {
    switch (source) {
      case 'system_seed':
        return { label: 'System', tone: colors.text.dim };
      case 'llm_suggested':
        return { label: 'LLM', tone: colors.accent.yellow };
      case 'user_confirmed':
        return { label: 'Confirmed', tone: colors.accent.green };
      case 'manual':
        return { label: 'Manual', tone: colors.accent.blue };
      default:
        return { label: source, tone: colors.text.muted };
    }
  };

  return (
    <div
      style={{
        border: `1px solid ${colors.border.default}`,
        borderRadius: 4,
        overflow: 'hidden',
        background: colors.bg.card,
        marginBottom: 16,
      }}
    >
      <button
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: colors.bg.light,
          border: 'none',
          cursor: 'pointer',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isExpanded ? (
            <ChevronDown size={16} style={{ color: colors.text.muted }} />
          ) : (
            <ChevronRight size={16} style={{ color: colors.text.muted }} />
          )}
          <CodeChip colors={colors}>{canonicalCode}</CodeChip>
          <span style={{ fontSize: 12, color: colors.text.muted }}>({aliases.length} aliases)</span>
        </div>
      </button>

      {isExpanded && (
        <div>
          {aliases.map((alias, i) => {
            const src = getSourceTone(alias.source);
            return (
              <div
                key={alias._id}
                style={{
                  padding: '10px 14px 10px 48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: i === 0 ? 'none' : `1px solid ${colors.border.light}`,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ color: colors.text.primary }}>&quot;{alias.alias}&quot;</span>
                    <StatusPill label={src.label} tone={src.tone} />
                    <span style={{ fontSize: 11, color: colors.text.muted }}>
                      Confidence: {Math.round(alias.confidence * 100)}%
                    </span>
                    {alias.usageCount !== undefined && alias.usageCount > 0 && (
                      <span style={{ fontSize: 11, color: colors.text.muted }}>Used {alias.usageCount}x</span>
                    )}
                  </div>
                </div>
                <IconButton label="Delete" onClick={() => onDelete(alias._id)}>
                  <Trash2 size={14} style={{ color: colors.accent.red }} />
                </IconButton>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default function ModelingCodesPage() {
  const colors = useColors();
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

      const matchingCodes = (codes as ItemCode[]).filter((code) => {
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
      const matchingAliases = (aliases as ItemCodeAlias[]).filter((alias) =>
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
        .map((e) => e.trim())
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
      return itemCategories.map((c) => c.name);
    }
    return categories || [];
  }, [itemCategories, categories]);

  const totalCodes = itemCodes?.length || 0;
  const totalAliases = aliasesGroupedByCode
    ? Object.values(aliasesGroupedByCode).reduce((sum, aliases) => sum + aliases.length, 0)
    : 0;
  const totalCategories = itemCategories?.length || 0;

  const prose = { fontSize: 13, color: colors.text.secondary, lineHeight: 1.6 };
  const heading = { fontWeight: 600, fontSize: 13, color: colors.text.primary, marginTop: 16, marginBottom: 8 };

  return (
    <div style={{ background: colors.bg.light, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
        {/* Back link */}
        <Link
          href="/settings"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: colors.text.muted, marginBottom: 24 }}
        >
          <ArrowLeft size={14} />
          Back to Settings
        </Link>

        {/* Page Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.text.primary }}>Item Code Library</h1>
          <p style={{ marginTop: 8, fontSize: 13, color: colors.text.secondary }}>
            Manage canonical item codes and their aliases for data codification
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, fontSize: 12, color: colors.text.muted, fontFamily: MONO }}>
            <span>{totalCodes} codes</span>
            <span>·</span>
            <span>{totalAliases} aliases</span>
            <span>·</span>
            <span>{totalCategories} categories</span>
          </div>
        </div>

        {/* Tabs + action */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ marginLeft: -24 }}>
            <TabStrip
              entityType="dashboard"
              activeTab={activeTab}
              onChange={setActiveTab}
              tabs={[
                { id: 'codes', label: 'Item Codes' },
                { id: 'aliases', label: 'Alias Dictionary' },
                { id: 'categories', label: 'Categories' },
                { id: 'instructions', label: 'Instructions' },
              ]}
            />
          </div>
          {activeTab === 'codes' && (
            <Button variant="primary" onClick={handleCreateCode}>
              <Plus size={14} />
              New Code
            </Button>
          )}
          {activeTab === 'aliases' && (
            <Button variant="primary" onClick={handleCreateAlias}>
              <Plus size={14} />
              New Alias
            </Button>
          )}
          {activeTab === 'categories' && (
            <Button variant="primary" onClick={handleCreateCategory}>
              <Plus size={14} />
              New Category
            </Button>
          )}
        </div>

        {/* Filters - hide for instructions tab */}
        {activeTab !== 'instructions' && (
          <div style={{ marginBottom: 16 }}>
            <Panel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Search">
                  <div style={{ position: 'relative' }}>
                    <Search
                      size={14}
                      style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.text.dim }}
                    />
                    <Input
                      placeholder={activeTab === 'codes' ? 'Search codes...' : 'Search aliases...'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ paddingLeft: 32 }}
                    />
                  </div>
                </Field>
                {activeTab === 'codes' && (
                  <Field label="Category">
                    <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                      <option value="all">All Categories</option>
                      {categories?.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>
            </Panel>
          </div>
        )}

        {/* Item Codes Tab */}
        {activeTab === 'codes' && (
          Object.keys(filteredCodes).length === 0 ? (
            <EmptyState
              title={totalCodes === 0 ? 'No item codes created yet' : 'No codes match your filters'}
              action={
                totalCodes === 0 ? (
                  <Button variant="primary" onClick={handleCreateCode}>
                    <Plus size={14} />
                    Create Your First Code
                  </Button>
                ) : undefined
              }
            />
          ) : (
            Object.entries(filteredCodes).sort(([a], [b]) => a.localeCompare(b)).map(([category, codes]) => (
              <CategoryGroup
                key={category}
                category={category}
                codes={codes}
                allCategories={allCategoryNames}
                colors={colors}
                onEdit={handleEditCode}
                onDelete={setDeleteCodeId}
                onMoveToCategory={handleMoveCodeToCategory}
              />
            ))
          )
        )}

        {/* Alias Dictionary Tab */}
        {activeTab === 'aliases' && (
          Object.keys(filteredAliases).length === 0 ? (
            <EmptyState
              title={totalAliases === 0 ? 'No aliases created yet' : 'No aliases match your search'}
              body={
                totalAliases === 0
                  ? 'Aliases are automatically created when you confirm code mappings.'
                  : undefined
              }
              action={
                totalAliases === 0 && totalCodes > 0 ? (
                  <Button variant="primary" onClick={handleCreateAlias}>
                    <Plus size={14} />
                    Create Alias Manually
                  </Button>
                ) : undefined
              }
            />
          ) : (
            Object.entries(filteredAliases).sort(([a], [b]) => a.localeCompare(b)).map(([code, aliases]) => (
              <AliasGroup
                key={code}
                canonicalCode={code}
                aliases={aliases as ItemCodeAlias[]}
                colors={colors}
                onDelete={setDeleteAliasId}
              />
            ))
          )
        )}

        {/* Categories Tab */}
        {activeTab === 'categories' && (
          <div>
            <div
              style={{
                marginBottom: 16,
                padding: 14,
                background: `${colors.accent.blue}15`,
                border: `1px solid ${colors.accent.blue}40`,
                borderRadius: 4,
              }}
            >
              <p style={{ fontSize: 12, color: colors.text.secondary }}>
                Categories help organize item codes and improve LLM codification accuracy.
                Add descriptions and examples to teach the AI what types of items belong in each category.
              </p>
            </div>

            {!itemCategories ? (
              <SkeletonCard lines={3} />
            ) : itemCategories.length === 0 ? (
              <EmptyState
                icon={<FolderOpen size={40} />}
                title="No categories found"
                body="Seed the default categories to get started."
                action={
                  <Button variant="primary" onClick={() => seedCategories()}>
                    <Plus size={14} />
                    Seed Default Categories
                  </Button>
                }
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {itemCategories.map((category) => (
                  <Panel
                    key={category._id}
                    title={category.name}
                    actions={
                      <>
                        {category.isSystem && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Lock size={12} style={{ color: colors.text.dim }} />
                            <StatusPill label="System" tone={colors.text.dim} />
                          </span>
                        )}
                        <IconButton label="Edit" onClick={() => handleEditCategory(category)}>
                          <Edit size={14} />
                        </IconButton>
                        {!category.isSystem && (
                          <IconButton label="Delete" onClick={() => setDeleteCategoryId(category._id)}>
                            <Trash2 size={14} style={{ color: colors.accent.red }} />
                          </IconButton>
                        )}
                      </>
                    }
                  >
                    <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12 }}>
                      {category.description}
                    </p>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 9,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: colors.text.muted,
                        fontWeight: 500,
                        marginBottom: 6,
                      }}
                    >
                      Examples
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {category.examples.map((example, idx) => (
                        <StatusPill key={idx} label={example} tone={colors.text.muted} />
                      ))}
                    </div>
                    <div style={{ marginTop: 12, fontSize: 11, color: colors.text.dim }}>
                      Normalized: <CodeChip colors={colors}>{category.normalizedName}</CodeChip>
                    </div>
                  </Panel>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Instructions Tab */}
        {activeTab === 'instructions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Panel title="Codification System Overview">
              <p style={prose}>
                Learn how the extraction and codification system works to standardize financial data across your projects.
              </p>
              <p style={prose}>
                The codification system automatically extracts financial data from uploaded documents (Excel files, PDFs)
                and maps them to standardized item codes. This enables consistent data aggregation across multiple
                sources and seamless export to financial models.
              </p>
              <h4 style={heading}>How It Works</h4>
              <ol style={{ ...prose, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <li><strong>Upload:</strong> Drop an Excel or PDF containing financial data</li>
                <li><strong>Extract:</strong> AI analyzes the document and extracts line items</li>
                <li><strong>Codify:</strong> Items are matched to standard codes using Fast Pass (aliases) and Smart Pass (AI)</li>
                <li><strong>Review:</strong> Unmatched items are flagged for manual confirmation</li>
                <li><strong>Aggregate:</strong> Confirmed items are added to the project&apos;s unified Data Library</li>
                <li><strong>Export:</strong> Run models using the aggregated data</li>
              </ol>
            </Panel>

            <Panel title="Item Codes">
              <p style={prose}>
                Item codes are standardized identifiers for financial line items. They follow the format{' '}
                <CodeChip colors={colors}>&lt;category.item&gt;</CodeChip>
              </p>
              <h4 style={heading}>Examples</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: colors.text.secondary }}>
                <div><CodeChip colors={colors}>&lt;stamp.duty&gt;</CodeChip> Stamp Duty Land Tax</div>
                <div><CodeChip colors={colors}>&lt;groundworks&gt;</CodeChip> Groundworks costs</div>
                <div><CodeChip colors={colors}>&lt;professional.fees&gt;</CodeChip> Professional fees</div>
                <div><CodeChip colors={colors}>&lt;site.labour&gt;</CodeChip> Site labour and prelims</div>
              </div>
            </Panel>

            <Panel title="Category Totals (Auto-Computed)" accent={colors.accent.blue}>
              <p style={prose}>
                The system automatically computes totals for each category. These totals are available as exportable
                item codes and can be used in your models.
              </p>
              <h4 style={heading}>Auto-Generated Total Codes</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                <div><CodeChip colors={colors}>&lt;total.construction.costs&gt;</CodeChip></div>
                <div><CodeChip colors={colors}>&lt;total.professional.fees&gt;</CodeChip></div>
                <div><CodeChip colors={colors}>&lt;total.development.costs&gt;</CodeChip></div>
                <div><CodeChip colors={colors}>&lt;total.revenue&gt;</CodeChip></div>
              </div>
              <div style={{ background: colors.bg.card, padding: 12, borderRadius: 4, border: `1px solid ${colors.border.default}` }}>
                <h5 style={{ fontWeight: 600, fontSize: 12, color: colors.text.primary, marginBottom: 8 }}>
                  Overriding Totals
                </h5>
                <p style={{ ...prose, fontSize: 12 }}>
                  You can manually override any auto-computed total by clicking the edit icon next to it in the Data Library.
                  This is useful when you need to adjust a total without modifying individual line items.
                  To revert to the computed value, click &quot;Use Computed&quot; in the override dialog.
                </p>
              </div>
            </Panel>

            <Panel title="Alias Dictionary (Fast Pass)">
              <p style={prose}>
                Aliases are alternative names that map to standard item codes. The Fast Pass system uses exact string
                matching for instant codification without AI inference.
              </p>
              <h4 style={heading}>Example Aliases</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: colors.text.secondary }}>
                <div>&quot;SDLT&quot; → <CodeChip colors={colors}>&lt;stamp.duty&gt;</CodeChip></div>
                <div>&quot;Land Tax&quot; → <CodeChip colors={colors}>&lt;stamp.duty&gt;</CodeChip></div>
                <div>&quot;Architect Fees&quot; → <CodeChip colors={colors}>&lt;professional.fees&gt;</CodeChip></div>
                <div>&quot;Build Cost&quot; → <CodeChip colors={colors}>&lt;construction.costs&gt;</CodeChip></div>
              </div>
              <p style={{ ...prose, marginTop: 12 }}>
                Adding common aliases for your organization&apos;s terminology improves matching accuracy and speed.
              </p>
            </Panel>

            <Panel title="Categories">
              <p style={prose}>
                Categories group related item codes together. They help the AI understand context and improve
                Smart Pass accuracy by providing descriptions and examples.
              </p>
              <h4 style={heading}>Standard Categories</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 12, color: colors.text.secondary }}>
                <div>Construction Costs</div>
                <div>Professional Fees</div>
                <div>Development Costs</div>
                <div>Site Costs</div>
                <div>Financing</div>
                <div>Revenue</div>
              </div>
            </Panel>

            <Panel title="Tips for Better Extraction" accent={colors.accent.yellow}>
              <ul style={{ ...prose, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18 }}>
                <li><strong>Use the &quot;Extract Financial Data&quot; toggle</strong> when uploading to ensure extraction runs on all documents.</li>
                <li><strong>Add aliases for common terms</strong> used in your documents to improve Fast Pass matching.</li>
                <li><strong>Review unmatched items</strong> and create new codes if needed - this improves future extractions.</li>
                <li><strong>Category totals auto-update</strong> when you add or modify items in that category.</li>
                <li><strong>Multi-document projects</strong> aggregate data automatically - the Data Library shows all sources.</li>
              </ul>
            </Panel>
          </div>
        )}

        {/* Create/Edit Code Dialog */}
        <Modal
          open={isCodeDialogOpen}
          onClose={() => setIsCodeDialogOpen(false)}
          title={editingCode ? 'Edit Item Code' : 'Create Item Code'}
          width={520}
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsCodeDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSubmitCode}>
                {editingCode ? 'Update' : 'Create'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Code *" hint="Format: <category.item> or <item>">
              <Input
                value={codeForm.code}
                onChange={(e) => setCodeForm({ ...codeForm, code: e.target.value })}
                placeholder="e.g., <stamp.duty>"
                style={{ fontFamily: MONO }}
              />
            </Field>
            <Field label="Display Name *">
              <Input
                value={codeForm.displayName}
                onChange={(e) => setCodeForm({ ...codeForm, displayName: e.target.value })}
                placeholder="e.g., Stamp Duty"
              />
            </Field>
            <Field label="Category *">
              <Input
                value={codeForm.category}
                onChange={(e) => setCodeForm({ ...codeForm, category: e.target.value })}
                placeholder="e.g., Purchase Costs"
                list="category-suggestions"
              />
              <datalist id="category-suggestions">
                {categories?.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </Field>
            <Field label="Data Type *">
              <Select
                value={codeForm.dataType}
                onChange={(e) => setCodeForm({ ...codeForm, dataType: e.target.value as DataType })}
              >
                <option value="currency">Currency (£)</option>
                <option value="number">Number</option>
                <option value="percentage">Percentage (%)</option>
                <option value="string">Text</option>
              </Select>
            </Field>
          </div>
        </Modal>

        {/* Create Alias Dialog */}
        <Modal
          open={isAliasDialogOpen}
          onClose={() => setIsAliasDialogOpen(false)}
          title="Create Alias"
          width={520}
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsAliasDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSubmitAlias}>
                Create Alias
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Alias Text *" hint="The term that will be matched during extraction">
              <Input
                value={aliasForm.alias}
                onChange={(e) => setAliasForm({ ...aliasForm, alias: e.target.value })}
                placeholder="e.g., SDLT, Site Purchase Price"
              />
            </Field>
            <Field label="Maps To Code *">
              <Select
                value={aliasForm.canonicalCodeId}
                onChange={(e) => setAliasForm({ ...aliasForm, canonicalCodeId: e.target.value })}
              >
                <option value="">Select a code...</option>
                {itemCodes?.map((code) => (
                  <option key={code._id} value={code._id}>
                    {code.code} ({code.displayName})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Modal>

        {/* Delete Code Confirmation */}
        <Modal
          open={!!deleteCodeId}
          onClose={() => setDeleteCodeId(null)}
          title="Delete Item Code?"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteCodeId(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteCode}>
                Delete
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 12, color: colors.text.secondary }}>
            This will permanently delete this code. Any aliases pointing to this code must be deleted first.
          </p>
        </Modal>

        {/* Delete Alias Confirmation */}
        <Modal
          open={!!deleteAliasId}
          onClose={() => setDeleteAliasId(null)}
          title="Delete Alias?"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteAliasId(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteAlias}>
                Delete
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 12, color: colors.text.secondary }}>
            This will permanently delete this alias. It will no longer be used for automatic matching.
          </p>
        </Modal>

        {/* Create/Edit Category Dialog */}
        <Modal
          open={isCategoryDialogOpen}
          onClose={() => setIsCategoryDialogOpen(false)}
          title={editingCategory ? 'Edit Category' : 'Create Category'}
          width={520}
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSubmitCategory}>
                {editingCategory ? 'Update' : 'Create'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field
              label="Category Name *"
              hint={editingCategory?.isSystem ? 'System category names cannot be changed' : undefined}
            >
              <Input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="e.g., Professional Fees"
                disabled={editingCategory?.isSystem}
              />
            </Field>
            <Field label="Description *" hint="This description helps the AI understand what items to categorize here">
              <Textarea
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                placeholder="Describe what types of items belong in this category..."
                rows={3}
              />
            </Field>
            <Field label="Examples (comma-separated)" hint="Provide example items that would fall into this category">
              <Input
                value={categoryForm.examples}
                onChange={(e) => setCategoryForm({ ...categoryForm, examples: e.target.value })}
                placeholder="e.g., Engineers, Architects, Solicitors"
              />
            </Field>
          </div>
        </Modal>

        {/* Delete Category Confirmation */}
        <Modal
          open={!!deleteCategoryId}
          onClose={() => setDeleteCategoryId(null)}
          title="Delete Category?"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteCategoryId(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteCategory}>
                Delete
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 12, color: colors.text.secondary }}>
            This will permanently delete this category. Make sure no item codes are using it first.
          </p>
        </Modal>
      </div>
    </div>
  );
}
