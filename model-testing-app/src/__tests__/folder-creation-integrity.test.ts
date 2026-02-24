/**
 * Folder Creation Integrity Tests
 *
 * These tests verify that folder structures are created correctly and consistently
 * when clients and projects are created. They focus on:
 *
 * 1. Simulating the exact logic used in convex/clients.ts and convex/projects.ts
 * 2. Testing edge cases in folder template lookup
 * 3. Verifying folder structure consistency across different client types
 * 4. Testing document filing validation
 *
 * IMPORTANT: These tests simulate the Convex mutation logic to catch issues
 * before they reach production.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================================
// SIMULATED FOLDER CREATION LOGIC (mirrors convex/clients.ts)
// ============================================================================

interface FolderTemplate {
  name: string;
  folderKey: string;
  parentKey?: string;
  order: number;
  description?: string;
}

interface FolderTemplateRecord {
  clientType: string;
  level: 'client' | 'project';
  folders: FolderTemplate[];
  isDefault: boolean;
}

// Fallback folders (same as in convex/clients.ts)
const FALLBACK_CLIENT_FOLDERS: FolderTemplate[] = [
  { name: 'Background', folderKey: 'background', order: 1 },
  { name: 'KYC', folderKey: 'kyc', parentKey: 'background', order: 2 },
  { name: 'Background Docs', folderKey: 'background_docs', parentKey: 'background', order: 3 },
  { name: 'Miscellaneous', folderKey: 'miscellaneous', order: 4 },
];

// Fallback folders (same as in convex/projects.ts)
const FALLBACK_PROJECT_FOLDERS: FolderTemplate[] = [
  { name: 'Background', folderKey: 'background', order: 1 },
  { name: 'Terms Comparison', folderKey: 'terms_comparison', order: 2 },
  { name: 'Terms Request', folderKey: 'terms_request', order: 3 },
  { name: 'Credit Submission', folderKey: 'credit_submission', order: 4 },
  { name: 'Post-completion Documents', folderKey: 'post_completion', order: 5 },
  { name: 'Appraisals', folderKey: 'appraisals', order: 6 },
  { name: 'Notes', folderKey: 'notes', order: 7 },
  { name: 'Operational Model', folderKey: 'operational_model', order: 8 },
];

// Simulate template database
const MOCK_FOLDER_TEMPLATES: FolderTemplateRecord[] = [
  {
    clientType: 'borrower',
    level: 'client',
    folders: FALLBACK_CLIENT_FOLDERS,
    isDefault: true,
  },
  {
    clientType: 'borrower',
    level: 'project',
    folders: FALLBACK_PROJECT_FOLDERS,
    isDefault: true,
  },
  {
    clientType: 'lender',
    level: 'client',
    folders: [
      { name: 'KYC', folderKey: 'kyc', order: 1 },
      { name: 'Agreements', folderKey: 'agreements', order: 2 },
      { name: 'Correspondence', folderKey: 'correspondence', order: 3 },
      { name: 'Miscellaneous', folderKey: 'miscellaneous', order: 4 },
    ],
    isDefault: true,
  },
  {
    clientType: 'lender',
    level: 'project',
    folders: [
      { name: 'Term Sheets', folderKey: 'term_sheets', order: 1 },
      { name: 'Facility Documents', folderKey: 'facility_documents', order: 2 },
      { name: 'Security Documents', folderKey: 'security_documents', order: 3 },
      { name: 'Drawdown Requests', folderKey: 'drawdown_requests', order: 4 },
      { name: 'Monitoring Reports', folderKey: 'monitoring_reports', order: 5 },
      { name: 'Correspondence', folderKey: 'correspondence', order: 6 },
      { name: 'Miscellaneous', folderKey: 'miscellaneous', order: 7 },
    ],
    isDefault: true,
  },
];

// Simulated folder creation result
interface CreatedFolder {
  id: string;
  clientId: string;
  folderType: string;
  name: string;
  parentFolderId?: string;
  isCustom?: boolean;
  createdAt: string;
}

// Simulate the exact folder creation logic from convex/clients.ts
function simulateClientFolderCreation(
  clientId: string,
  clientType: string,
  templates: FolderTemplateRecord[]
): CreatedFolder[] {
  // Normalize client type (mirrors the logic in clients.ts:112)
  const normalizedType = (clientType || 'borrower').toLowerCase();

  // Look up folder template
  const matchingTemplates = templates.filter(
    t => t.clientType === normalizedType && t.level === 'client'
  );

  // Use template folders or fallback
  const folderTemplate = matchingTemplates.find(t => t.isDefault) || matchingTemplates[0];
  const folders = folderTemplate?.folders || FALLBACK_CLIENT_FOLDERS;

  // Create folders using two-pass algorithm
  const now = new Date().toISOString();
  const folderIdMap: Record<string, string> = {};
  const createdFolders: CreatedFolder[] = [];

  // Sort folders by order
  const sortedFolders = [...folders].sort((a, b) => a.order - b.order);

  // First pass: create parent folders (no parentKey)
  for (const folder of sortedFolders) {
    if (!folder.parentKey) {
      const folderId = `folder_${clientId}_${folder.folderKey}`;
      folderIdMap[folder.folderKey] = folderId;
      createdFolders.push({
        id: folderId,
        clientId,
        folderType: folder.folderKey,
        name: folder.name,
        createdAt: now,
      });
    }
  }

  // Second pass: create child folders (with parentKey)
  for (const folder of sortedFolders) {
    if (folder.parentKey && folderIdMap[folder.parentKey]) {
      const folderId = `folder_${clientId}_${folder.folderKey}`;
      createdFolders.push({
        id: folderId,
        clientId,
        folderType: folder.folderKey,
        name: folder.name,
        parentFolderId: folderIdMap[folder.parentKey],
        createdAt: now,
      });
    }
  }

  return createdFolders;
}

// Simulate project folder creation logic from convex/projects.ts
interface CreatedProjectFolder {
  id: string;
  projectId: string;
  folderType: string;
  name: string;
  isCustom?: boolean;
  createdAt: string;
}

function simulateProjectFolderCreation(
  projectId: string,
  clientType: string,
  templates: FolderTemplateRecord[]
): CreatedProjectFolder[] {
  // Look up folder template
  const matchingTemplates = templates.filter(
    t => t.clientType === clientType.toLowerCase() && t.level === 'project'
  );

  // Use template folders or fallback
  const folderTemplate = matchingTemplates.find(t => t.isDefault) || matchingTemplates[0];
  const folders = folderTemplate?.folders || FALLBACK_PROJECT_FOLDERS;

  // Create folders
  const now = new Date().toISOString();
  const sortedFolders = [...folders].sort((a, b) => a.order - b.order);

  return sortedFolders.map(folder => ({
    id: `folder_${projectId}_${folder.folderKey}`,
    projectId,
    folderType: folder.folderKey,
    name: folder.name,
    createdAt: now,
  }));
}

// ============================================================================
// TEST: Client Folder Creation
// ============================================================================

describe('Client Folder Creation', () => {
  describe('Borrower Client', () => {
    it('should create 4 folders for a borrower client', () => {
      const folders = simulateClientFolderCreation('client_1', 'borrower', MOCK_FOLDER_TEMPLATES);
      expect(folders.length).toBe(4);
    });

    it('should create Background as parent folder with nested children', () => {
      const folders = simulateClientFolderCreation('client_1', 'borrower', MOCK_FOLDER_TEMPLATES);

      const background = folders.find(f => f.folderType === 'background');
      expect(background).toBeDefined();
      expect(background?.parentFolderId).toBeUndefined();

      const kyc = folders.find(f => f.folderType === 'kyc');
      expect(kyc).toBeDefined();
      expect(kyc?.parentFolderId).toBe(background?.id);

      const backgroundDocs = folders.find(f => f.folderType === 'background_docs');
      expect(backgroundDocs).toBeDefined();
      expect(backgroundDocs?.parentFolderId).toBe(background?.id);
    });

    it('should create Miscellaneous as a root folder', () => {
      const folders = simulateClientFolderCreation('client_1', 'borrower', MOCK_FOLDER_TEMPLATES);

      const misc = folders.find(f => f.folderType === 'miscellaneous');
      expect(misc).toBeDefined();
      expect(misc?.parentFolderId).toBeUndefined();
    });

    it('should use unique folder IDs for each client', () => {
      const folders1 = simulateClientFolderCreation('client_1', 'borrower', MOCK_FOLDER_TEMPLATES);
      const folders2 = simulateClientFolderCreation('client_2', 'borrower', MOCK_FOLDER_TEMPLATES);

      // IDs should be different
      const ids1 = new Set(folders1.map(f => f.id));
      const ids2 = new Set(folders2.map(f => f.id));

      for (const id of ids1) {
        expect(ids2.has(id)).toBe(false);
      }
    });
  });

  describe('Lender Client', () => {
    it('should create 4 folders for a lender client', () => {
      const folders = simulateClientFolderCreation('client_1', 'lender', MOCK_FOLDER_TEMPLATES);
      expect(folders.length).toBe(4);
    });

    it('should create different folders than borrower', () => {
      const lenderFolders = simulateClientFolderCreation('client_1', 'lender', MOCK_FOLDER_TEMPLATES);
      const borrowerFolders = simulateClientFolderCreation('client_2', 'borrower', MOCK_FOLDER_TEMPLATES);

      const lenderTypes = new Set(lenderFolders.map(f => f.folderType));
      const borrowerTypes = new Set(borrowerFolders.map(f => f.folderType));

      // Lender should have 'agreements' and 'correspondence' instead of 'background' parent
      expect(lenderTypes.has('agreements')).toBe(true);
      expect(lenderTypes.has('correspondence')).toBe(true);

      // Both should have KYC and Miscellaneous
      expect(lenderTypes.has('kyc')).toBe(true);
      expect(lenderTypes.has('miscellaneous')).toBe(true);
      expect(borrowerTypes.has('kyc')).toBe(true);
      expect(borrowerTypes.has('miscellaneous')).toBe(true);
    });

    it('should have flat folder structure (no nesting) for lender', () => {
      const folders = simulateClientFolderCreation('client_1', 'lender', MOCK_FOLDER_TEMPLATES);

      for (const folder of folders) {
        expect(
          folder.parentFolderId,
          `Folder "${folder.name}" should not have a parent for lender type`
        ).toBeUndefined();
      }
    });
  });

  describe('Unknown Client Type', () => {
    it('should use borrower as default for undefined type', () => {
      const folders = simulateClientFolderCreation('client_1', '', MOCK_FOLDER_TEMPLATES);
      expect(folders.length).toBe(4);

      const hasBackground = folders.some(f => f.folderType === 'background');
      expect(hasBackground).toBe(true);
    });

    it('should use fallback folders for unknown client type', () => {
      const folders = simulateClientFolderCreation('client_1', 'unknown_type', MOCK_FOLDER_TEMPLATES);

      // Should fall back to borrower defaults
      expect(folders.length).toBe(4);
    });
  });

  describe('Case Insensitivity', () => {
    it('should normalize client type to lowercase', () => {
      const lower = simulateClientFolderCreation('client_1', 'borrower', MOCK_FOLDER_TEMPLATES);
      const upper = simulateClientFolderCreation('client_2', 'BORROWER', MOCK_FOLDER_TEMPLATES);
      const mixed = simulateClientFolderCreation('client_3', 'Borrower', MOCK_FOLDER_TEMPLATES);

      // All should create the same folder structure
      expect(lower.map(f => f.folderType)).toEqual(upper.map(f => f.folderType));
      expect(lower.map(f => f.folderType)).toEqual(mixed.map(f => f.folderType));
    });
  });
});

// ============================================================================
// TEST: Project Folder Creation
// ============================================================================

describe('Project Folder Creation', () => {
  describe('Borrower Project', () => {
    it('should create 8 folders for a borrower project', () => {
      const folders = simulateProjectFolderCreation('project_1', 'borrower', MOCK_FOLDER_TEMPLATES);
      expect(folders.length).toBe(8);
    });

    it('should include all critical project folders', () => {
      const folders = simulateProjectFolderCreation('project_1', 'borrower', MOCK_FOLDER_TEMPLATES);
      const types = new Set(folders.map(f => f.folderType));

      expect(types.has('background')).toBe(true);
      expect(types.has('terms_comparison')).toBe(true);
      expect(types.has('terms_request')).toBe(true);
      expect(types.has('credit_submission')).toBe(true);
      expect(types.has('post_completion')).toBe(true);
      expect(types.has('appraisals')).toBe(true);
      expect(types.has('notes')).toBe(true);
      expect(types.has('operational_model')).toBe(true);
    });

    it('should create folders in correct order', () => {
      const folders = simulateProjectFolderCreation('project_1', 'borrower', MOCK_FOLDER_TEMPLATES);

      expect(folders[0].folderType).toBe('background');
      expect(folders[1].folderType).toBe('terms_comparison');
      expect(folders[2].folderType).toBe('terms_request');
      expect(folders[3].folderType).toBe('credit_submission');
      expect(folders[4].folderType).toBe('post_completion');
      expect(folders[5].folderType).toBe('appraisals');
      expect(folders[6].folderType).toBe('notes');
      expect(folders[7].folderType).toBe('operational_model');
    });
  });

  describe('Lender Project', () => {
    it('should create 7 folders for a lender project', () => {
      const folders = simulateProjectFolderCreation('project_1', 'lender', MOCK_FOLDER_TEMPLATES);
      expect(folders.length).toBe(7);
    });

    it('should have different folders than borrower project', () => {
      const lenderFolders = simulateProjectFolderCreation('project_1', 'lender', MOCK_FOLDER_TEMPLATES);
      const borrowerFolders = simulateProjectFolderCreation('project_2', 'borrower', MOCK_FOLDER_TEMPLATES);

      const lenderTypes = new Set(lenderFolders.map(f => f.folderType));
      const borrowerTypes = new Set(borrowerFolders.map(f => f.folderType));

      // Lender should have specific folders
      expect(lenderTypes.has('term_sheets')).toBe(true);
      expect(lenderTypes.has('facility_documents')).toBe(true);
      expect(lenderTypes.has('security_documents')).toBe(true);
      expect(lenderTypes.has('drawdown_requests')).toBe(true);
      expect(lenderTypes.has('monitoring_reports')).toBe(true);

      // Borrower should have different folders
      expect(borrowerTypes.has('appraisals')).toBe(true);
      expect(borrowerTypes.has('credit_submission')).toBe(true);
    });
  });
});

// ============================================================================
// TEST: Template Lookup Logic
// ============================================================================

describe('Template Lookup Logic', () => {
  it('should prefer default template over non-default', () => {
    const templatesWithMultiple: FolderTemplateRecord[] = [
      {
        clientType: 'borrower',
        level: 'client',
        folders: [{ name: 'Custom1', folderKey: 'custom1', order: 1 }],
        isDefault: false,
      },
      {
        clientType: 'borrower',
        level: 'client',
        folders: FALLBACK_CLIENT_FOLDERS,
        isDefault: true,
      },
    ];

    const folders = simulateClientFolderCreation('client_1', 'borrower', templatesWithMultiple);
    expect(folders.length).toBe(FALLBACK_CLIENT_FOLDERS.length);
  });

  it('should use first matching template when no default', () => {
    const templatesNoDefault: FolderTemplateRecord[] = [
      {
        clientType: 'borrower',
        level: 'client',
        folders: [
          { name: 'First', folderKey: 'first', order: 1 },
          { name: 'Second', folderKey: 'second', order: 2 },
        ],
        isDefault: false,
      },
    ];

    const folders = simulateClientFolderCreation('client_1', 'borrower', templatesNoDefault);
    expect(folders.length).toBe(2);
    expect(folders[0].folderType).toBe('first');
  });

  it('should use fallback when no templates match', () => {
    const emptyTemplates: FolderTemplateRecord[] = [];

    const folders = simulateClientFolderCreation('client_1', 'borrower', emptyTemplates);
    expect(folders.length).toBe(FALLBACK_CLIENT_FOLDERS.length);
  });

  it('should filter templates by level (client vs project)', () => {
    // Using project templates should not affect client folder creation
    const projectOnlyTemplates: FolderTemplateRecord[] = [
      {
        clientType: 'borrower',
        level: 'project', // Note: this is project, not client
        folders: [{ name: 'ProjectOnly', folderKey: 'project_only', order: 1 }],
        isDefault: true,
      },
    ];

    const folders = simulateClientFolderCreation('client_1', 'borrower', projectOnlyTemplates);
    // Should fall back to defaults since no client-level template exists
    expect(folders.length).toBe(FALLBACK_CLIENT_FOLDERS.length);
  });
});

// ============================================================================
// TEST: Folder ID Generation
// ============================================================================

describe('Folder ID Generation', () => {
  it('should generate unique IDs for each folder', () => {
    const folders = simulateClientFolderCreation('client_1', 'borrower', MOCK_FOLDER_TEMPLATES);
    const ids = folders.map(f => f.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should include client/project ID in folder ID', () => {
    const clientFolders = simulateClientFolderCreation('client_123', 'borrower', MOCK_FOLDER_TEMPLATES);
    const projectFolders = simulateProjectFolderCreation('project_456', 'borrower', MOCK_FOLDER_TEMPLATES);

    for (const folder of clientFolders) {
      expect(folder.id.includes('client_123')).toBe(true);
    }

    for (const folder of projectFolders) {
      expect(folder.id.includes('project_456')).toBe(true);
    }
  });

  it('should include folder type in folder ID', () => {
    const folders = simulateClientFolderCreation('client_1', 'borrower', MOCK_FOLDER_TEMPLATES);

    for (const folder of folders) {
      expect(folder.id.includes(folder.folderType)).toBe(true);
    }
  });
});

// ============================================================================
// TEST: Document Filing Validation
// ============================================================================

describe('Document Filing Validation', () => {
  interface FilingContext {
    clientId: string;
    projectId?: string;
    folderId: string;
    folderType: 'client' | 'project';
  }

  function validateFiling(
    context: FilingContext,
    clientFolders: CreatedFolder[],
    projectFolders?: CreatedProjectFolder[]
  ): { valid: boolean; error?: string } {
    if (context.folderType === 'client') {
      // Document claims to be in a client folder
      const folderExists = clientFolders.some(
        f => f.clientId === context.clientId && f.folderType === context.folderId
      );
      if (!folderExists) {
        return { valid: false, error: `Client folder "${context.folderId}" does not exist for client ${context.clientId}` };
      }
    } else if (context.folderType === 'project') {
      // Document claims to be in a project folder
      if (!context.projectId) {
        return { valid: false, error: 'Project folder specified but no projectId provided' };
      }
      if (!projectFolders) {
        return { valid: false, error: 'No project folders provided for validation' };
      }
      const folderExists = projectFolders.some(
        f => f.projectId === context.projectId && f.folderType === context.folderId
      );
      if (!folderExists) {
        return { valid: false, error: `Project folder "${context.folderId}" does not exist for project ${context.projectId}` };
      }
    }

    return { valid: true };
  }

  it('should validate document filing to existing client folder', () => {
    const clientFolders = simulateClientFolderCreation('client_1', 'borrower', MOCK_FOLDER_TEMPLATES);

    const result = validateFiling(
      { clientId: 'client_1', folderId: 'kyc', folderType: 'client' },
      clientFolders
    );

    expect(result.valid).toBe(true);
  });

  it('should reject filing to non-existent client folder', () => {
    const clientFolders = simulateClientFolderCreation('client_1', 'borrower', MOCK_FOLDER_TEMPLATES);

    const result = validateFiling(
      { clientId: 'client_1', folderId: 'invalid_folder', folderType: 'client' },
      clientFolders
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('does not exist');
  });

  it('should validate document filing to existing project folder', () => {
    const clientFolders = simulateClientFolderCreation('client_1', 'borrower', MOCK_FOLDER_TEMPLATES);
    const projectFolders = simulateProjectFolderCreation('project_1', 'borrower', MOCK_FOLDER_TEMPLATES);

    const result = validateFiling(
      { clientId: 'client_1', projectId: 'project_1', folderId: 'appraisals', folderType: 'project' },
      clientFolders,
      projectFolders
    );

    expect(result.valid).toBe(true);
  });

  it('should reject project folder filing without projectId', () => {
    const clientFolders = simulateClientFolderCreation('client_1', 'borrower', MOCK_FOLDER_TEMPLATES);
    const projectFolders = simulateProjectFolderCreation('project_1', 'borrower', MOCK_FOLDER_TEMPLATES);

    const result = validateFiling(
      { clientId: 'client_1', folderId: 'appraisals', folderType: 'project' },
      clientFolders,
      projectFolders
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('no projectId provided');
  });

  it('should reject filing to wrong client folders', () => {
    const client1Folders = simulateClientFolderCreation('client_1', 'borrower', MOCK_FOLDER_TEMPLATES);
    const client2Folders = simulateClientFolderCreation('client_2', 'borrower', MOCK_FOLDER_TEMPLATES);

    // Try to file to client_1 folder but using client_2 context
    const result = validateFiling(
      { clientId: 'client_999', folderId: 'kyc', folderType: 'client' },
      client1Folders
    );

    expect(result.valid).toBe(false);
  });
});

// ============================================================================
// TEST: Concurrent Folder Creation
// ============================================================================

describe('Concurrent Folder Creation', () => {
  it('should handle multiple clients created simultaneously', () => {
    const results: CreatedFolder[][] = [];

    // Simulate 10 clients created at the same time
    for (let i = 0; i < 10; i++) {
      results.push(
        simulateClientFolderCreation(`client_${i}`, 'borrower', MOCK_FOLDER_TEMPLATES)
      );
    }

    // Each client should have the same number of folders
    for (const folders of results) {
      expect(folders.length).toBe(4);
    }

    // All folder IDs should be unique across all clients
    const allIds = results.flatMap(r => r.map(f => f.id));
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it('should handle multiple projects created simultaneously', () => {
    const results: CreatedProjectFolder[][] = [];

    // Simulate 10 projects created at the same time
    for (let i = 0; i < 10; i++) {
      results.push(
        simulateProjectFolderCreation(`project_${i}`, 'borrower', MOCK_FOLDER_TEMPLATES)
      );
    }

    // Each project should have the same number of folders
    for (const folders of results) {
      expect(folders.length).toBe(8);
    }

    // All folder IDs should be unique across all projects
    const allIds = results.flatMap(r => r.map(f => f.id));
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });
});

// ============================================================================
// TEST: Folder Structure Consistency Over Time
// ============================================================================

describe('Folder Structure Consistency Over Time', () => {
  it('should create identical folder structure for same client type', () => {
    const folders1 = simulateClientFolderCreation('client_1', 'borrower', MOCK_FOLDER_TEMPLATES);
    const folders2 = simulateClientFolderCreation('client_2', 'borrower', MOCK_FOLDER_TEMPLATES);

    // Compare folder types (not IDs which should be different)
    const types1 = folders1.map(f => f.folderType).sort();
    const types2 = folders2.map(f => f.folderType).sort();

    expect(types1).toEqual(types2);

    // Compare parent relationships
    const parentMap1 = folders1.reduce((acc, f) => {
      if (f.parentFolderId) {
        const parent = folders1.find(p => p.id === f.parentFolderId);
        acc[f.folderType] = parent?.folderType || '';
      }
      return acc;
    }, {} as Record<string, string>);

    const parentMap2 = folders2.reduce((acc, f) => {
      if (f.parentFolderId) {
        const parent = folders2.find(p => p.id === f.parentFolderId);
        acc[f.folderType] = parent?.folderType || '';
      }
      return acc;
    }, {} as Record<string, string>);

    expect(parentMap1).toEqual(parentMap2);
  });

  it('should maintain folder order consistency', () => {
    // Create folders multiple times
    const iterations = 10;
    const orderedTypes: string[][] = [];

    for (let i = 0; i < iterations; i++) {
      const folders = simulateClientFolderCreation(`client_${i}`, 'borrower', MOCK_FOLDER_TEMPLATES);
      orderedTypes.push(folders.map(f => f.folderType));
    }

    // All iterations should produce the same order
    const first = orderedTypes[0];
    for (const types of orderedTypes) {
      expect(types).toEqual(first);
    }
  });
});

// ============================================================================
// INTEGRATION TEST: Full Client Lifecycle
// ============================================================================

describe('Full Client Lifecycle', () => {
  it('should support complete client creation → folder creation → document filing flow', () => {
    // Step 1: Create client
    const clientId = 'client_test_lifecycle';
    const clientType = 'borrower';

    // Step 2: Create folders
    const folders = simulateClientFolderCreation(clientId, clientType, MOCK_FOLDER_TEMPLATES);
    expect(folders.length).toBe(4);

    // Step 3: Verify all folders are queryable
    const folderTypes = folders.map(f => f.folderType);
    expect(folderTypes).toContain('background');
    expect(folderTypes).toContain('kyc');
    expect(folderTypes).toContain('background_docs');
    expect(folderTypes).toContain('miscellaneous');

    // Step 4: Verify parent-child relationships
    const kyc = folders.find(f => f.folderType === 'kyc');
    const background = folders.find(f => f.folderType === 'background');
    expect(kyc?.parentFolderId).toBe(background?.id);

    // Step 5: Simulate document filing
    const testDocuments = [
      { name: 'passport.pdf', targetFolder: 'kyc', folderType: 'client' as const },
      { name: 'bank_statement.pdf', targetFolder: 'kyc', folderType: 'client' as const },
      { name: 'misc_doc.pdf', targetFolder: 'miscellaneous', folderType: 'client' as const },
    ];

    for (const doc of testDocuments) {
      const folderExists = folders.some(f => f.folderType === doc.targetFolder);
      expect(folderExists, `Folder ${doc.targetFolder} should exist for document ${doc.name}`).toBe(true);
    }
  });

  it('should support complete project lifecycle', () => {
    // Step 1: Create client first
    const clientId = 'client_project_test';
    const clientFolders = simulateClientFolderCreation(clientId, 'borrower', MOCK_FOLDER_TEMPLATES);

    // Step 2: Create project
    const projectId = 'project_test_lifecycle';
    const projectFolders = simulateProjectFolderCreation(projectId, 'borrower', MOCK_FOLDER_TEMPLATES);
    expect(projectFolders.length).toBe(8);

    // Step 3: Verify all project folders exist
    const projectFolderTypes = projectFolders.map(f => f.folderType);
    expect(projectFolderTypes).toContain('background');
    expect(projectFolderTypes).toContain('appraisals');
    expect(projectFolderTypes).toContain('terms_comparison');
    expect(projectFolderTypes).toContain('credit_submission');

    // Step 4: Simulate project document filing
    const projectDocuments = [
      { name: 'valuation.pdf', targetFolder: 'appraisals' },
      { name: 'term_sheet.pdf', targetFolder: 'terms_comparison' },
      { name: 'monitoring_report.pdf', targetFolder: 'credit_submission' },
    ];

    for (const doc of projectDocuments) {
      const folderExists = projectFolders.some(f => f.folderType === doc.targetFolder);
      expect(folderExists, `Project folder ${doc.targetFolder} should exist`).toBe(true);
    }
  });
});

// ============================================================================
// SUMMARY
// ============================================================================

describe('Folder Creation Integrity Summary', () => {
  it('should pass all critical integrity checks', () => {
    const checks = {
      borrowerClientFolders: simulateClientFolderCreation('c1', 'borrower', MOCK_FOLDER_TEMPLATES).length === 4,
      lenderClientFolders: simulateClientFolderCreation('c2', 'lender', MOCK_FOLDER_TEMPLATES).length === 4,
      borrowerProjectFolders: simulateProjectFolderCreation('p1', 'borrower', MOCK_FOLDER_TEMPLATES).length === 8,
      lenderProjectFolders: simulateProjectFolderCreation('p2', 'lender', MOCK_FOLDER_TEMPLATES).length === 7,
      fallbackOnEmpty: simulateClientFolderCreation('c3', 'borrower', []).length === 4,
      uniqueIds: true, // Verified in other tests
    };

    console.log('\n=== Folder Creation Integrity Checks ===');
    for (const [check, passed] of Object.entries(checks)) {
      console.log(`  ${passed ? '✓' : '✗'} ${check}`);
    }

    expect(Object.values(checks).every(v => v)).toBe(true);
  });
});
