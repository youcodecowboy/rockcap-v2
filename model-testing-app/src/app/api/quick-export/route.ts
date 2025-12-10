import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { populateXlsmFromUrl, CodifiedItem } from '@/lib/xlsmPopulator';
import { mergeComputedTotals, ProjectDataItem } from '@/lib/codifiedTemplatePopulator';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds max for large files

// Initialize Convex client
function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is not set');
  }
  return new ConvexHttpClient(convexUrl);
}

// Types for template data
interface LegacyTemplateInfo {
  name: string;
  fileStorageId: string;
}

interface OptimizedTemplateInfo {
  name: string;
  originalFileStorageId?: string;
}

/**
 * POST /api/quick-export
 * 
 * Performs server-side template population and returns the populated XLSM file.
 * This preserves all macros, formatting, images, and charts in the original template.
 * 
 * Request body:
 * - templateId: ID of the template to use
 * - templateType: 'legacy' | 'optimized' - which template system to use
 * - codifiedItems: Array of codified items to insert
 * - projectId: Optional project ID to include computed category totals
 * - documentName: Optional name for the output file
 * - templateName: Optional template name for the output file
 * 
 * Returns: Binary XLSM file as a blob
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { templateId, templateType = 'legacy', codifiedItems, projectId, documentName, templateName } = body;
    
    // Validate required fields
    if (!templateId) {
      return NextResponse.json(
        { error: 'templateId is required' },
        { status: 400 }
      );
    }
    
    if (!codifiedItems || !Array.isArray(codifiedItems)) {
      return NextResponse.json(
        { error: 'codifiedItems array is required' },
        { status: 400 }
      );
    }
    
    console.log('[QuickExport] Starting export for template:', templateId, 'type:', templateType);
    console.log('[QuickExport] Codified items count:', codifiedItems.length);
    
    const client = getConvexClient();
    
    // Dynamically import API to avoid type instantiation issues at compile time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { api } = require('../../../../convex/_generated/api');
    
    let templateUrl: string | null = null;
    let resolvedTemplateName: string = templateName || 'model';
    
    if (templateType === 'optimized') {
      // Get optimized template info
      const template: OptimizedTemplateInfo | null = await client.query(
        api.templateDefinitions.getById,
        { templateId }
      );
      
      if (!template) {
        return NextResponse.json(
          { error: 'Template not found' },
          { status: 404 }
        );
      }
      
      resolvedTemplateName = templateName || template.name;
      
      // Get the original file URL for optimized templates
      templateUrl = await client.query(
        api.templateDefinitions.getOriginalFileUrl,
        { templateId }
      );
      
      if (!templateUrl) {
        return NextResponse.json(
          { error: 'Original template file not found. This template may have been created without preserving the original file.' },
          { status: 404 }
        );
      }
    } else {
      // Get legacy template info
      const template: LegacyTemplateInfo | null = await client.query(
        api.modelingTemplates.get,
        { id: templateId }
      );
      
      if (!template) {
        return NextResponse.json(
          { error: 'Template not found' },
          { status: 404 }
        );
      }
      
      resolvedTemplateName = templateName || template.name;
      
      templateUrl = await client.query(
        api.modelingTemplates.getTemplateUrl,
        { id: templateId }
      );
    }
    
    if (!templateUrl) {
      return NextResponse.json(
        { error: 'Template file URL not found' },
        { status: 404 }
      );
    }
    
    console.log('[QuickExport] Template URL retrieved:', templateUrl.substring(0, 50) + '...');
    
    // Filter to only confirmed/matched items
    const usableItems = (codifiedItems as CodifiedItem[]).filter(
      item => item.mappingStatus === 'confirmed' || item.mappingStatus === 'matched'
    );
    
    console.log('[QuickExport] Usable items (confirmed/matched):', usableItems.length);
    
    if (usableItems.length === 0) {
      return NextResponse.json(
        { error: 'No confirmed or matched items to populate. Please confirm item mappings first.' },
        { status: 400 }
      );
    }
    
    // Merge computed category totals from project data library if projectId provided
    let itemsToPopulate = usableItems;
    
    if (projectId) {
      console.log('[QuickExport] Fetching computed totals for project:', projectId);
      try {
        const projectDataItems: ProjectDataItem[] = await client.query(
          api.projectDataLibrary.getProjectLibrary,
          { projectId }
        );
        
        if (projectDataItems && projectDataItems.length > 0) {
          itemsToPopulate = mergeComputedTotals(usableItems, projectDataItems);
          console.log('[QuickExport] Items after merging computed totals:', itemsToPopulate.length);
        }
      } catch (error) {
        console.warn('[QuickExport] Could not fetch computed totals:', error);
        // Continue without computed totals
      }
    }
    
    // Populate the template
    const result = await populateXlsmFromUrl(templateUrl, itemsToPopulate);
    
    console.log('[QuickExport] Population complete:', result.stats);
    
    // Generate filename
    const date = new Date().toISOString().split('T')[0];
    const safeName = (name: string) => name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const docPart = documentName ? safeName(documentName) : 'export';
    const templatePart = safeName(resolvedTemplateName);
    const filename = `${docPart}_${templatePart}_${date}.xlsm`;
    
    // Return the populated file as a downloadable blob
    // Convert Buffer to Uint8Array for NextResponse compatibility
    const uint8Array = new Uint8Array(result.buffer);
    
    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.ms-excel.sheet.macroEnabled.12',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Population-Stats': JSON.stringify(result.stats),
        'X-Matched-Count': String(result.matchedPlaceholders.length),
        'X-Unmatched-Count': String(result.unmatchedPlaceholders.length),
      },
    });
  } catch (error) {
    console.error('[QuickExport] Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Internal server error',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/quick-export
 * 
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'quick-export',
    description: 'Server-side XLSM template population with macro preservation',
    supportedTypes: ['legacy', 'optimized'],
  });
}
