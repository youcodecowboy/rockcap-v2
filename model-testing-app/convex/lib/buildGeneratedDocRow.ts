// convex/lib/buildGeneratedDocRow.ts
// Pure mapper: one rendered file + approval metadata -> the object inserted
// into the `documents` table. Kept free of Convex imports so it is
// unit-testable under vitest (this repo has no convex-test). The insert site
// in documentPublish.recordPublishedDocs casts the result to satisfy the
// Convex Id types (storageId / clientId / uploadedBy arrive as strings here).

export interface GeneratedFile {
  format: "pdf" | "docx";
  storageId: string;
  fileName: string;
  fileSize: number;
  mime: string;
}

export interface BuildDocRowInput {
  file: GeneratedFile;
  docType: string;
  category: string;
  title: string;
  clientId?: string;
  clientName?: string;
  isBaseDocument: boolean;
  uploadedBy: string;
  now: string;
}

export function buildGeneratedDocRow(input: BuildDocRowInput) {
  return {
    fileStorageId: input.file.storageId,
    fileName: input.file.fileName,
    fileSize: input.file.fileSize,
    fileType: input.file.mime,
    uploadedAt: input.now,
    summary: input.title,
    fileTypeDetected: input.docType,
    category: input.category,
    reasoning: "Generated document, operator-approved.",
    confidence: 1,
    tokensUsed: 0,
    clientId: input.clientId,
    clientName: input.clientName,
    scope: "client" as const,
    isBaseDocument: input.isBaseDocument,
    status: "completed" as const,
    savedAt: input.now,
    uploadedBy: input.uploadedBy,
  };
}
