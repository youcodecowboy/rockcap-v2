"use client";

import { useState, useEffect } from "react";
import { Button, IconButton, Field, Input, Textarea } from "@/components/layouts";
import { useColors } from "@/lib/useColors";
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
  const colors = useColors();
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
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backdropFilter: "blur(2px)",
          background: "rgba(0,0,0,0.2)",
          zIndex: 40,
          transition: "opacity 300ms ease-in-out",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
        }}
      />

      {/* Drawer */}
      <div
        className="w-full md:w-[50%]"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100%",
          background: colors.bg.card,
          borderLeft: `1px solid ${colors.border.default}`,
          zIndex: 50,
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 300ms ease-in-out",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: `1px solid ${colors.border.default}`,
            flexShrink: 0,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, color: colors.text.primary }}>
            {mode === "create" ? `Add New ${getCategoryTypeLabel()}` : `Edit ${getCategoryTypeLabel()}`}
          </h2>
          <IconButton label="Close" onClick={onClose}>
            <X style={{ width: 18, height: 18 }} />
          </IconButton>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, flex: 1, overflowY: "auto" }}>
            {/* Name */}
            <Field label="Name *" hint="Internal identifier (lowercase, no spaces recommended)">
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., active, lender, prospect"
                required
              />
            </Field>

            {/* Display Name */}
            <Field label="Display Name" hint="Human-readable name shown in the UI (defaults to Name if empty)">
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g., Active Client, Lender, Prospect"
              />
            </Field>

            {/* Description */}
            <Field label="Description">
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of this category..."
                rows={3}
              />
            </Field>

            {/* Display Order */}
            <Field label="Display Order" hint="Lower numbers appear first in dropdowns and lists">
              <Input
                id="displayOrder"
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                min={0}
              />
            </Field>

            {/* HubSpot Mapping (only for prospecting stages) */}
            {categoryType === "prospecting_stage" && (
              <Field label="HubSpot Stage ID (Optional)">
                <Input
                  id="hubspotMapping"
                  value={hubspotMapping}
                  onChange={(e) => setHubspotMapping(e.target.value)}
                  placeholder="HubSpot stage ID this maps to"
                />
                <p style={{ fontSize: 11, color: colors.accent.orange, marginTop: 4 }}>
                  Warning: Changing HubSpot mappings may cause sync issues. Only modify if you know what you&apos;re doing.
                </p>
              </Field>
            )}

            {/* System Default Warning */}
            {category && category.isSystemDefault && (
              <div
                style={{
                  padding: 16,
                  background: `${colors.accent.orange}15`,
                  borderLeft: `4px solid ${colors.accent.orange}`,
                  borderRadius: 4,
                  color: colors.accent.orange,
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 500 }}>System Default Category</p>
                <p style={{ fontSize: 11, marginTop: 4 }}>
                  This is a system default category. Some fields cannot be modified.
                </p>
              </div>
            )}
          </div>

          {/* Footer with buttons */}
          <div style={{ borderTop: `1px solid ${colors.border.default}`, padding: "16px 24px 24px", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, width: "100%" }}>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting || !name.trim()} style={{ minWidth: 140, justifyContent: "center" }}>
                {isSubmitting ? "Saving..." : mode === "create" ? "Create" : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
