import { describe, it, expect } from "vitest";
import { buildGeneratedDocRow } from "../../convex/lib/buildGeneratedDocRow";

const file = { format: "pdf" as const, storageId: "stor123", fileName: "MMH_One_Pager.pdf", fileSize: 5000, mime: "application/pdf" };

describe("buildGeneratedDocRow", () => {
  it("maps a rendered file into a client-scoped documents row", () => {
    const row = buildGeneratedDocRow({
      file, docType: "Company One-Pager", category: "Generated", title: "MMH one-pager",
      clientId: "client789", clientName: "Mackenzie Miller Homes", isBaseDocument: true,
      uploadedBy: "user42", now: "2026-05-29T10:00:00.000Z",
    });
    expect(row.fileStorageId).toBe("stor123");
    expect(row.fileType).toBe("application/pdf");
    expect(row.fileSize).toBe(5000);
    expect(row.fileTypeDetected).toBe("Company One-Pager");
    expect(row.category).toBe("Generated");
    expect(row.summary).toBe("MMH one-pager");
    expect(row.clientId).toBe("client789");
    expect(row.clientName).toBe("Mackenzie Miller Homes");
    expect(row.scope).toBe("client");
    expect(row.isBaseDocument).toBe(true);
    expect(row.status).toBe("completed");
    expect(row.uploadedBy).toBe("user42");
    expect(row.uploadedAt).toBe("2026-05-29T10:00:00.000Z");
    expect(row.savedAt).toBe("2026-05-29T10:00:00.000Z");
  });

  it("passes through an undefined client (unfiled)", () => {
    const row = buildGeneratedDocRow({
      file, docType: "X", category: "Generated", title: "t", isBaseDocument: true,
      uploadedBy: "user42", now: "2026-05-29T10:00:00.000Z",
    });
    expect(row.clientId).toBeUndefined();
    expect(row.clientName).toBeUndefined();
  });
});
