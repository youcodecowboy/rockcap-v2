import { internalMutation } from "../_generated/server";

/**
 * Migration script to add documentCode to existing documents
 * Run this once to backfill document codes for existing documents
 */
export const addDocumentCodesToExistingDocuments = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allDocs = await ctx.db.query("documents").collect();
    let updated = 0;
    let skipped = 0;

    // Helper functions (same as in documents.ts)
    function abbreviateText(text: string, maxLength: number): string {
      if (!text) return '';
      const cleaned = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return cleaned.slice(0, maxLength);
    }

    function abbreviateCategory(category: string): string {
      if (!category) return 'DOC';
      
      const categoryMap: Record<string, string> = {
        'valuation': 'VAL',
        'operating': 'OPR',
        'operating statement': 'OPR',
        'appraisal': 'APP',
        'financial': 'FIN',
        'contract': 'CNT',
        'agreement': 'AGR',
        'invoice': 'INV',
        'report': 'RPT',
        'letter': 'LTR',
        'email': 'EML',
        'note': 'NTE',
        'memo': 'MEM',
        'proposal': 'PRP',
        'quote': 'QTE',
        'receipt': 'RCP',
      };
      
      const categoryLower = category.toLowerCase();
      for (const [key, value] of Object.entries(categoryMap)) {
        if (categoryLower.includes(key)) {
          return value;
        }
      }
      
      return abbreviateText(category, 3);
    }

    function formatDateDDMMYY(dateString: string | Date): string {
      const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      return `${day}${month}${year}`;
    }

    function generateDocumentCode(
      clientName: string,
      category: string,
      projectName: string | undefined,
      uploadedAt: string | Date
    ): string {
      const clientCode = abbreviateText(clientName, 8);
      const typeCode = abbreviateCategory(category);
      const projectCode = projectName ? abbreviateText(projectName, 10) : '';
      const dateCode = formatDateDDMMYY(uploadedAt);
      
      if (projectCode) {
        return `${clientCode}-${typeCode}-${projectCode}-${dateCode}`;
      } else {
        return `${clientCode}-${typeCode}-${dateCode}`;
      }
    }

    for (const doc of allDocs) {
      // Skip if document code already exists
      if (doc.documentCode) {
        skipped++;
        continue;
      }

      // Skip if no client name (can't generate code)
      if (!doc.clientName) {
        skipped++;
        continue;
      }

      try {
        // Generate document code
        const documentCode = generateDocumentCode(
          doc.clientName,
          doc.category,
          doc.projectName,
          doc.uploadedAt
        );

        // Ensure uniqueness
        const existingDocs = await ctx.db.query("documents").collect();
        let finalCode = documentCode;
        let counter = 1;
        while (existingDocs.some(d => d._id !== doc._id && d.documentCode === finalCode)) {
          finalCode = `${documentCode}-${counter}`;
          counter++;
        }

        // Update document
        await ctx.db.patch(doc._id, { documentCode: finalCode });
        updated++;
      } catch (error) {
        console.error(`Failed to update document ${doc._id}:`, error);
        skipped++;
      }
    }

    return {
      total: allDocs.length,
      updated,
      skipped,
    };
  },
});

