// =============================================================================
// PHOTOGRAPHS — DOCUMENT REFERENCES
// =============================================================================
// Rich reference data for the Photographs category:
//   - Site Photographs (property site, construction progress, and completion photos)
//
// Photographs are primarily visual documents used for monitoring, marketing,
// and record-keeping in UK property development finance. They provide evidence
// of site condition, construction progress, and completed works.

import type { DocumentReference } from '../types';

export const PHOTOGRAPH_REFERENCES: DocumentReference[] = [
  // ---------------------------------------------------------------------------
  // 1. SITE PHOTOGRAPHS
  // ---------------------------------------------------------------------------
  {
    id: 'site-photographs',
    fileType: 'Site Photographs',
    category: 'Photographs',

    filing: {
      targetFolder: 'Photographs',
      targetLevel: 'project',
    },

    description:
      'Site Photographs are visual records of a property development site captured at various stages ' +
      'of the project lifecycle — from pre-acquisition and pre-commencement through active construction ' +
      'to practical completion and final marketing. In UK development finance, site photographs serve ' +
      'multiple critical functions. They provide contemporaneous evidence of site condition at key ' +
      'milestones, support the monitoring surveyor\'s assessment of construction progress, and create ' +
      'an immutable visual audit trail that lenders rely upon when authorising drawdown releases.\n\n' +
      'Photo sets are typically organised as a schedule with date stamps, GPS metadata, and descriptive ' +
      'captions identifying the area of the site, the works depicted, and the direction of the shot. ' +
      'Professional photo schedules may include grid references or plot numbers to correlate images ' +
      'with the site plan. Pre-development photographs document the baseline condition — existing ' +
      'structures, ground conditions, boundaries, and access arrangements — which is essential for ' +
      'establishing the starting point against which progress is measured.\n\n' +
      'During construction, progress photographs are taken at each monitoring visit, typically monthly, ' +
      'and are often appended to interim monitoring reports. However, standalone photo sets are also ' +
      'common, particularly when the borrower or project manager submits additional visual evidence ' +
      'between formal monitoring visits. Drone photography is increasingly used on larger sites to ' +
      'capture aerial overviews of earthworks, structural frames, and roof completions that are ' +
      'difficult to document from ground level.\n\n' +
      'Post-completion, site photographs transition to a marketing function, with professional shoots ' +
      'used for sales brochures and CGI comparison shots demonstrating the realised scheme against ' +
      'original renders. For RockCap\'s lending operations, standalone photo sets are filed separately ' +
      'from the monitoring reports they may accompany, ensuring that the visual record is independently ' +
      'accessible for credit reviews, asset management, and potential dispute resolution.',

    identificationRules: [
      'PRIMARY: Document consists predominantly of photographs or images of a physical property site, construction works, or completed development.',
      'PRIMARY: Contains multiple images organised as a set, schedule, or collection with captions, dates, or location references.',
      'CRITICAL: Images depict real-world physical scenes — buildings, construction sites, land, scaffolding, machinery — NOT computer-generated renders, architectural drawings, or diagrams.',
      'Photographs may include date stamps, time stamps, or GPS/geolocation metadata embedded in the image or noted in captions.',
      'Photo captions reference specific areas of the site such as plot numbers, elevations (north, south, east, west), floor levels, or construction phases.',
      'May include drone or aerial photography showing site overviews, particularly for larger development schemes.',
      'Photo schedule format with numbered images arranged in a grid or sequential layout with corresponding descriptions.',
      'Images show construction progress indicators such as foundations, structural frame, brickwork, roofing, internal fit-out, or external landscaping.',
      'May include before-and-after comparison photographs showing site condition at different dates.',
      'Document title or filename references photographs, photos, photo schedule, site images, or progress photos.',
      'Standalone photo collection NOT embedded as a subsection within a monitoring report or valuation report.',
    ],

    disambiguation: [
      'These are Site Photographs, NOT CGI Renders or Computer-Generated Images — site photographs depict real physical scenes captured by a camera, whereas CGIs are digitally created visualisations of a proposed or completed scheme. Look for photographic artefacts (lighting, shadows, camera lens effects) versus the clean, idealised appearance of renders.',
      'These are Site Photographs, NOT Floor Plans or Architectural Drawings — photographs are camera-captured images of physical spaces, whereas floor plans are scaled technical drawings showing room layouts, dimensions, and annotations. Photographs have depth, perspective, and natural lighting; drawings are flat, schematic, and dimensioned.',
      'These are standalone Site Photographs, NOT a Monitoring Report containing photos — if the document is primarily a written monitoring report with photographs included as an appendix or supporting section, classify it as a Monitoring Report. Only classify as Site Photographs when the document is predominantly or exclusively a collection of images with minimal accompanying text beyond captions.',
      'These are Site Photographs, NOT a Marketing Brochure — while completed development photos may appear in marketing materials, a standalone photo set lacks the sales copy, pricing schedules, and branded layouts of a brochure.',
    ],

    terminology: {
      'Photo Schedule': 'An organised collection of photographs presented in a numbered or gridded layout with captions identifying the subject, date, and location of each image.',
      'Date Stamp': 'The date (and optionally time) embedded in a photograph\'s metadata or overlaid on the image, establishing when the photo was taken.',
      'GPS Metadata': 'Geolocation data embedded in the image file (EXIF data) recording the latitude and longitude where the photograph was captured.',
      'Drone Photography': 'Aerial photographs captured using an unmanned aerial vehicle (UAV/drone), commonly used to document larger sites from above.',
      'Progress Photos': 'Photographs taken at regular intervals during construction to visually document the state of works at each stage.',
      'Baseline Photographs': 'Pre-commencement images documenting the site\'s condition before any development works begin, establishing the starting point for progress comparison.',
      'Elevation': 'A directional face of a building (north, south, east, west) or a vertical view used to identify which side of the structure is being photographed.',
      'Practical Completion': 'The stage at which construction is substantially finished and the building is fit for occupation, often documented with a final set of completion photographs.',
      'CGI': 'Computer-Generated Imagery — a digitally created visualisation of a proposed development, NOT a real photograph.',
      'Snagging Photos': 'Photographs documenting minor defects or incomplete items identified during final inspections before or after practical completion.',
    },

    tags: [
      { namespace: 'type', value: 'site-photographs', weight: 3.0 },
      { namespace: 'signal', value: 'photographic-images', weight: 2.5 },
      { namespace: 'signal', value: 'construction-site-imagery', weight: 2.0 },
      { namespace: 'signal', value: 'date-stamped-photos', weight: 1.5 },
      { namespace: 'signal', value: 'photo-schedule-format', weight: 1.8 },
      { namespace: 'signal', value: 'drone-aerial-photography', weight: 1.3 },
      { namespace: 'domain', value: 'property-finance', weight: 1.0 },
      { namespace: 'domain', value: 'construction-monitoring', weight: 1.5 },
      { namespace: 'context', value: 'classification', weight: 1.0 },
      { namespace: 'context', value: 'filing', weight: 1.0 },
      { namespace: 'context', value: 'chat', weight: 1.0 },
      { namespace: 'trigger', value: 'photographs+construction-site', weight: 2.0 },
      { namespace: 'trigger', value: 'photo-schedule+date-stamps', weight: 1.8 },
    ],

    keywords: [
      'site photographs', 'site photos', 'progress photos', 'progress photographs',
      'photo schedule', 'photo report', 'construction photos', 'construction photographs',
      'drone photography', 'aerial photographs', 'aerial photos', 'site images',
      'date stamp', 'GPS metadata', 'baseline photographs', 'pre-commencement photos',
      'completion photos', 'completion photographs', 'snagging photos',
      'elevation photos', 'plot photographs', 'site condition',
      'before and after', 'photo set', 'image schedule',
    ],

    filenamePatterns: [
      'site[_\\s-]?photo',
      'photo[_\\s-]?schedule',
      'progress[_\\s-]?photo',
      'construction[_\\s-]?photo',
      'drone[_\\s-]?photo',
      'aerial[_\\s-]?photo',
      'site[_\\s-]?image',
      'photo[_\\s-]?report',
      'photo[_\\s-]?set',
      'completion[_\\s-]?photo',
      'snagging[_\\s-]?photo',
      'IMG_\\d+',
      'DJI_\\d+',
      'DSC[_\\s-]?\\d+',
    ],

    excludePatterns: [
      'monitoring[_\\s-]?report',
      'interim[_\\s-]?monitoring',
      'initial[_\\s-]?monitoring',
      'valuation[_\\s-]?report',
      'CGI',
      'render',
      'floor[_\\s-]?plan',
      'architectural[_\\s-]?drawing',
      'marketing[_\\s-]?brochure',
      'sales[_\\s-]?brochure',
    ],

    decisionRules: [
      {
        condition: 'Document consists predominantly of photographic images of a physical property or construction site',
        signals: ['photographic-images', 'construction-site-imagery'],
        priority: 9,
        action: 'require',
      },
      {
        condition: 'Photos are organised in a schedule format with numbered images, captions, and dates',
        signals: ['photo-schedule-format', 'date-stamped-photos'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Drone or aerial photography of a development site is present',
        signals: ['drone-aerial-photography', 'construction-site-imagery'],
        priority: 7,
        action: 'boost',
      },
      {
        condition: 'Standalone photo collection without substantial monitoring report text',
        signals: ['photographic-images', 'standalone-photo-set'],
        priority: 8,
        action: 'boost',
      },
      {
        condition: 'Filename matches common camera or drone naming conventions (IMG_, DJI_, DSC_)',
        signals: ['camera-filename-pattern', 'photographic-images'],
        priority: 6,
        action: 'include',
      },
      {
        condition: 'Images show construction progress with plot numbers or elevation references in captions',
        signals: ['construction-site-imagery', 'plot-reference', 'elevation-reference'],
        priority: 7,
        action: 'include',
      },
    ],

    applicableContexts: ['classification', 'filing', 'chat'],

    expectedFields: [
      'photographDate',
      'siteAddress',
      'photographerOrSource',
      'numberOfImages',
      'constructionStage',
    ],

    source: 'system',
    isActive: true,
    version: 1,
    updatedAt: '2026-02-24',
  },
];
