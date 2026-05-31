"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useColors } from "@/lib/useColors";
import {
  Panel,
  Button,
  IconButton,
  StatusPill,
  FlagChip,
  EmptyState,
  Modal,
  Skeleton,
} from "@/components/layouts";
import { Plus, Edit, Trash2, Power, PowerOff, AlertTriangle, Tag } from "lucide-react";
import CategorySettingsDrawer from "@/components/CategorySettingsDrawer";

type CategoryType = "client_status" | "client_type" | "client_tag" | "prospecting_stage";

const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  client_status: "Client Statuses",
  client_type: "Client Types",
  client_tag: "Client Tags",
  prospecting_stage: "Prospecting Stages",
};

const CATEGORY_TYPE_DESCRIPTIONS: Record<CategoryType, string> = {
  client_status: "Manage the status options for clients (e.g., Active, Archived, Prospect)",
  client_type: "Manage the type options for clients (e.g., Lender, Borrower, Broker)",
  client_tag: "Manage tag options that can be applied to clients",
  prospecting_stage: "Manage prospecting stages. These sync with HubSpot - be careful with changes.",
};

export default function CategorySettingsPage() {
  const colors = useColors();
  const [selectedCategoryType, setSelectedCategoryType] = useState<CategoryType>("client_status");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [selectedCategoryId, setSelectedCategoryId] = useState<Id<"categorySettings"> | undefined>();
  const [deleteCategoryId, setDeleteCategoryId] = useState<Id<"categorySettings"> | undefined>();
  const [isSeeding, setIsSeeding] = useState(false);

  const allCategories = useQuery(api.categorySettings.getAll);
  const removeCategory = useMutation(api.categorySettings.remove);
  const toggleActive = useMutation(api.categorySettings.toggleActive);
  const seedDefaults = useMutation(api.categorySettings.seedDefaults);

  const categoriesByType = allCategories
    ? allCategories.filter((cat) => cat.categoryType === selectedCategoryType)
    : [];

  const handleAdd = () => {
    setDrawerMode("create");
    setSelectedCategoryId(undefined);
    setIsDrawerOpen(true);
  };

  const handleEdit = (id: Id<"categorySettings">) => {
    setDrawerMode("edit");
    setSelectedCategoryId(id);
    setIsDrawerOpen(true);
  };

  const handleDelete = (id: Id<"categorySettings">) => {
    setDeleteCategoryId(id);
  };

  const confirmDelete = async () => {
    if (!deleteCategoryId) return;
    try {
      await removeCategory({ id: deleteCategoryId });
      setDeleteCategoryId(undefined);
    } catch (error: any) {
      alert(`Failed to delete category: ${error.message}`);
    }
  };

  const handleToggleActive = async (id: Id<"categorySettings">) => {
    try {
      await toggleActive({ id });
    } catch (error: any) {
      alert(`Failed to toggle category: ${error.message}`);
    }
  };

  const handleSeedDefaults = async () => {
    setIsSeeding(true);
    try {
      const result = await seedDefaults({});
      alert(result.message);
    } catch (error: any) {
      alert(`Failed to seed defaults: ${error.message}`);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div style={{ background: colors.bg.light, minHeight: "100vh" }}>
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="mb-8 flex items-center gap-3">
          <Tag style={{ width: 22, height: 22, color: colors.text.muted }} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 300, color: colors.text.primary }}>Category Settings</h1>
            <p style={{ marginTop: 4, fontSize: 12, color: colors.text.muted }}>
              Manage customizable categories for clients, including statuses, types, tags, and prospecting stages.
            </p>
          </div>
        </div>

        {/* Seed defaults prompt */}
        {allCategories && allCategories.length === 0 && (
          <div
            style={{
              marginBottom: 24,
              padding: 16,
              borderRadius: 4,
              background: `${colors.accent.blue}15`,
              borderLeft: `2px solid ${colors.accent.blue}`,
              border: `1px solid ${colors.accent.blue}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <p style={{ fontSize: 12, color: colors.text.secondary }}>No category settings found. Seed default settings to get started.</p>
            <Button variant="primary" onClick={handleSeedDefaults} disabled={isSeeding}>
              {isSeeding ? "Seeding..." : "Seed Default Settings"}
            </Button>
          </div>
        )}

        {/* Category Type Tabs */}
        <div className="mb-6 flex gap-2 flex-wrap">
          {(Object.keys(CATEGORY_TYPE_LABELS) as CategoryType[]).map((type) => (
            <Button
              key={type}
              variant={selectedCategoryType === type ? "primary" : "secondary"}
              accent={colors.accent.blue}
              onClick={() => setSelectedCategoryType(type)}
            >
              {CATEGORY_TYPE_LABELS[type]}
            </Button>
          ))}
        </div>

        {/* Warning for prospecting stages */}
        {selectedCategoryType === "prospecting_stage" && (
          <div
            style={{
              marginBottom: 24,
              padding: 16,
              borderRadius: 4,
              color: colors.accent.orange,
              background: `${colors.accent.orange}15`,
              borderLeft: `2px solid ${colors.accent.orange}`,
              border: `1px solid ${colors.accent.orange}40`,
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <AlertTriangle style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 500 }}>HubSpot Sync Warning</p>
              <p style={{ fontSize: 11, marginTop: 4, color: colors.text.secondary }}>
                Prospecting stages are synced from HubSpot. Adding custom stages may cause sync conflicts.
                Only modify if you understand the implications.
              </p>
            </div>
          </div>
        )}

        {/* Category List */}
        <Panel
          title={CATEGORY_TYPE_LABELS[selectedCategoryType]}
          actions={
            <Button variant="primary" accent={colors.accent.blue} onClick={handleAdd}>
              <Plus style={{ width: 14, height: 14 }} />
              Add {CATEGORY_TYPE_LABELS[selectedCategoryType].slice(0, -1)}
            </Button>
          }
        >
          <p style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>
            {CATEGORY_TYPE_DESCRIPTIONS[selectedCategoryType]}
          </p>
          {allCategories === undefined ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Skeleton height={56} />
              <Skeleton height={56} />
              <Skeleton height={56} />
            </div>
          ) : categoriesByType.length === 0 ? (
            <EmptyState
              icon={<Tag size={20} />}
              title={`No ${CATEGORY_TYPE_LABELS[selectedCategoryType].toLowerCase()} found`}
              body='Click "Add" to create one.'
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {categoriesByType.map((category) => (
                <div
                  key={category._id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: 14,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: 4,
                    background: colors.bg.card,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                        {category.displayName || category.name}
                      </span>
                      {category.isSystemDefault && <FlagChip severity="info" label="System Default" />}
                      {!category.isActive && <StatusPill label="Inactive" tone={colors.text.dim} />}
                      {category.hubspotMapping && (
                        <FlagChip severity="info" label={`HubSpot: ${category.hubspotMapping}`} />
                      )}
                    </div>
                    {category.description && (
                      <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>{category.description}</p>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8, fontSize: 10, color: colors.text.dim, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      <span>Name: {category.name}</span>
                      <span>Order: {category.displayOrder}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <IconButton
                      label={category.isActive ? "Deactivate" : "Activate"}
                      onClick={() => handleToggleActive(category._id)}
                    >
                      {category.isActive ? <Power style={{ width: 14, height: 14 }} /> : <PowerOff style={{ width: 14, height: 14 }} />}
                    </IconButton>
                    <IconButton
                      label="Edit"
                      onClick={() => handleEdit(category._id)}
                      disabled={category.isSystemDefault}
                    >
                      <Edit style={{ width: 14, height: 14 }} />
                    </IconButton>
                    <IconButton
                      label="Delete"
                      onClick={() => handleDelete(category._id)}
                      disabled={category.isSystemDefault}
                      style={{ color: colors.accent.red }}
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Drawer */}
        <CategorySettingsDrawer
          isOpen={isDrawerOpen}
          onClose={() => {
            setIsDrawerOpen(false);
            setSelectedCategoryId(undefined);
          }}
          mode={drawerMode}
          categoryType={selectedCategoryType}
          categoryId={selectedCategoryId}
        />

        {/* Delete Confirmation Dialog */}
        <Modal
          open={!!deleteCategoryId}
          onClose={() => setDeleteCategoryId(undefined)}
          title="Delete Category?"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteCategoryId(undefined)}>Cancel</Button>
              <Button variant="danger" onClick={confirmDelete}>Delete</Button>
            </>
          }
        >
          <p style={{ fontSize: 12, color: colors.text.secondary }}>
            This will permanently delete this category. This action cannot be undone.
          </p>
          {selectedCategoryType === "prospecting_stage" && (
            <p style={{ display: "block", marginTop: 8, fontSize: 12, color: colors.accent.orange, fontWeight: 500 }}>
              Warning: Deleting a prospecting stage may cause sync issues with HubSpot.
            </p>
          )}
        </Modal>
      </div>
    </div>
  );
}
