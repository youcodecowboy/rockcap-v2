"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Power, PowerOff, AlertTriangle } from "lucide-react";
import CategorySettingsDrawer from "@/components/CategorySettingsDrawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  prospecting_stage: "Manage prospecting stages. ⚠️ These sync with HubSpot - be careful with changes.",
};

export default function CategorySettingsPage() {
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
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Category Settings</h1>
        <p className="text-gray-600">
          Manage customizable categories for clients, including statuses, types, tags, and prospecting stages.
        </p>
      </div>

      {/* Seed defaults prompt */}
      {allCategories && allCategories.length === 0 && (
        <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-400 text-blue-800 rounded-lg flex items-center justify-between">
          <p>No category settings found. Seed default settings to get started.</p>
          <Button onClick={handleSeedDefaults} disabled={isSeeding}>
            {isSeeding ? "Seeding..." : "Seed Default Settings"}
          </Button>
        </div>
      )}

      {/* Category Type Tabs */}
      <div className="mb-6 flex gap-2 flex-wrap">
        {(Object.keys(CATEGORY_TYPE_LABELS) as CategoryType[]).map((type) => (
          <Button
            key={type}
            variant={selectedCategoryType === type ? "default" : "outline"}
            onClick={() => setSelectedCategoryType(type)}
            className="capitalize"
          >
            {CATEGORY_TYPE_LABELS[type]}
          </Button>
        ))}
      </div>

      {/* Warning for prospecting stages */}
      {selectedCategoryType === "prospecting_stage" && (
        <div className="mb-6 p-4 bg-amber-50 border-l-4 border-amber-400 text-amber-800 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">HubSpot Sync Warning</p>
            <p className="text-sm mt-1">
              Prospecting stages are synced from HubSpot. Adding custom stages may cause sync conflicts.
              Only modify if you understand the implications.
            </p>
          </div>
        </div>
      )}

      {/* Category List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{CATEGORY_TYPE_LABELS[selectedCategoryType]}</CardTitle>
              <CardDescription>{CATEGORY_TYPE_DESCRIPTIONS[selectedCategoryType]}</CardDescription>
            </div>
            <Button onClick={handleAdd}>
              <Plus className="w-4 h-4 mr-2" />
              Add {CATEGORY_TYPE_LABELS[selectedCategoryType].slice(0, -1)}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {allCategories === undefined ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : categoriesByType.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No {CATEGORY_TYPE_LABELS[selectedCategoryType].toLowerCase()} found. Click "Add" to create one.
            </div>
          ) : (
            <div className="space-y-2">
              {categoriesByType.map((category) => (
                <div
                  key={category._id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{category.displayName || category.name}</span>
                      {category.isSystemDefault && (
                        <Badge variant="secondary" className="text-xs">
                          System Default
                        </Badge>
                      )}
                      {!category.isActive && (
                        <Badge variant="outline" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                      {category.hubspotMapping && (
                        <Badge variant="outline" className="text-xs">
                          HubSpot: {category.hubspotMapping}
                        </Badge>
                      )}
                    </div>
                    {category.description && (
                      <p className="text-sm text-gray-600 mt-1">{category.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span>Name: {category.name}</span>
                      <span>Order: {category.displayOrder}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleActive(category._id)}
                      title={category.isActive ? "Deactivate" : "Activate"}
                    >
                      {category.isActive ? (
                        <Power className="w-4 h-4" />
                      ) : (
                        <PowerOff className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(category._id)}
                      disabled={category.isSystemDefault}
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(category._id)}
                      disabled={category.isSystemDefault}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
      <AlertDialog open={!!deleteCategoryId} onOpenChange={() => setDeleteCategoryId(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this category. This action cannot be undone.
              {selectedCategoryType === "prospecting_stage" && (
                <span className="block mt-2 text-amber-600 font-medium">
                  ⚠️ Warning: Deleting a prospecting stage may cause sync issues with HubSpot.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

