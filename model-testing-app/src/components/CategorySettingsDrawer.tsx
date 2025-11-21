"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

type CategoryType = "client_status" | "client_type" | "client_tag" | "prospecting_stage";

interface CategorySettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  categoryType: CategoryType;
  categoryId?: Id<"categorySettings">;
}

export default function CategorySettingsDrawer({
  isOpen,
  onClose,
  mode,
  categoryType,
  categoryId,
}: CategorySettingsDrawerProps) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [hubspotMapping, setHubspotMapping] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const category = useQuery(
    api.categorySettings.getById,
    categoryId ? { id: categoryId } : "skip"
  );
  const createCategory = useMutation(api.categorySettings.create);
  const updateCategory = useMutation(api.categorySettings.update);

  // Load existing category data when editing
  useEffect(() => {
    if (mode === "edit" && category) {
      setName(category.name);
      setDisplayName(category.displayName || category.name);
      setDescription(category.description || "");
      setDisplayOrder(category.displayOrder);
      setHubspotMapping(category.hubspotMapping || "");
    } else if (mode === "create") {
      // Reset form for create mode
      setName("");
      setDisplayName("");
      setDescription("");
      setDisplayOrder(0);
      setHubspotMapping("");
    }
  }, [mode, category]);

  // Get next display order for new items
  const allCategories = useQuery(api.categorySettings.getAllByType, {
    categoryType,
  });
  useEffect(() => {
    if (mode === "create" && allCategories && allCategories.length > 0) {
      const maxOrder = Math.max(...allCategories.map((c) => c.displayOrder));
      setDisplayOrder(maxOrder + 1);
    }
  }, [mode, allCategories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !name.trim()) return;

    setIsSubmitting(true);
    try {
      if (mode === "create") {
        await createCategory({
          categoryType,
          name: name.trim(),
          displayName: displayName.trim() || name.trim(),
          description: description.trim() || undefined,
          displayOrder,
          hubspotMapping: hubspotMapping.trim() || undefined,
        });
      } else if (categoryId) {
        await updateCategory({
          id: categoryId,
          name: name.trim(),
          displayName: displayName.trim() || name.trim(),
          description: description.trim() || undefined,
          displayOrder,
          hubspotMapping: hubspotMapping.trim() || undefined,
        });
      }
      onClose();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCategoryTypeLabel = () => {
    switch (categoryType) {
      case "client_status":
        return "Client Status";
      case "client_type":
        return "Client Type";
      case "client_tag":
        return "Client Tag";
      case "prospecting_stage":
        return "Prospecting Stage";
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 backdrop-blur-sm bg-black/20 z-40 transition-opacity duration-300 ease-in-out ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full md:w-[50%] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        } flex flex-col`}
      >
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <h2 className="text-xl font-semibold">
            {mode === "create" ? `Add New ${getCategoryTypeLabel()}` : `Edit ${getCategoryTypeLabel()}`}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
          <div className="p-6 space-y-6 flex-1 overflow-y-auto">
            {/* Name */}
            <div>
              <Label htmlFor="name" className="text-sm font-medium">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., active, lender, prospect"
                className="mt-2"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Internal identifier (lowercase, no spaces recommended)
              </p>
            </div>

            {/* Display Name */}
            <div>
              <Label htmlFor="displayName" className="text-sm font-medium">
                Display Name
              </Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g., Active Client, Lender, Prospect"
                className="mt-2"
              />
              <p className="text-xs text-gray-500 mt-1">
                Human-readable name shown in the UI (defaults to Name if empty)
              </p>
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description" className="text-sm font-medium">
                Description
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of this category..."
                className="mt-2"
                rows={3}
              />
            </div>

            {/* Display Order */}
            <div>
              <Label htmlFor="displayOrder" className="text-sm font-medium">
                Display Order
              </Label>
              <Input
                id="displayOrder"
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                className="mt-2"
                min={0}
              />
              <p className="text-xs text-gray-500 mt-1">
                Lower numbers appear first in dropdowns and lists
              </p>
            </div>

            {/* HubSpot Mapping (only for prospecting stages) */}
            {categoryType === "prospecting_stage" && (
              <div>
                <Label htmlFor="hubspotMapping" className="text-sm font-medium">
                  HubSpot Stage ID (Optional)
                </Label>
                <Input
                  id="hubspotMapping"
                  value={hubspotMapping}
                  onChange={(e) => setHubspotMapping(e.target.value)}
                  placeholder="HubSpot stage ID this maps to"
                  className="mt-2"
                />
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ Warning: Changing HubSpot mappings may cause sync issues. Only modify if you know what you're doing.
                </p>
              </div>
            )}

            {/* System Default Warning */}
            {category && category.isSystemDefault && (
              <div className="p-4 bg-amber-50 border-l-4 border-amber-400 text-amber-800 rounded-lg">
                <p className="text-sm font-medium">System Default Category</p>
                <p className="text-xs mt-1">
                  This is a system default category. Some fields cannot be modified.
                </p>
              </div>
            )}
          </div>

          {/* Footer with buttons */}
          <div className="border-t pt-4 px-6 pb-6 flex-shrink-0">
            <div className="flex justify-end gap-3 w-full">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !name.trim()} className="min-w-[140px]">
                {isSubmitting ? "Saving..." : mode === "create" ? "Create" : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

