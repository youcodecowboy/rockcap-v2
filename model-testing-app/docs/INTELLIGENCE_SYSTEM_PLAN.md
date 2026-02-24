# Intelligence System Overhaul - Planning Document

## Vision

The Intelligence System is a **structured knowledge base** with flexibility for edge cases. It uses **canonical fields** for predictable document generation while allowing custom fields for anything that doesn't fit the standard taxonomy.

```
                    ┌─────────────────────┐
                    │    INTELLIGENCE     │
                    │   (Central Hub)     │
                    └─────────┬───────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   Documents   │    │   Checklist   │    │  Data Library │
│  (Source)     │    │  (Progress)   │    │  (Financials) │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │  Document Generation│
                    │  {{client.name}}    │
                    └─────────────────────┘
```

---

## Core Architecture: Canonical Fields + Normalization

### The Problem
If every client has different labels (`companyAddress` vs `registeredAddress` vs `businessAddress`), document generation templates can't reliably retrieve data.

### The Solution
1. **Canonical Fields** - A fixed taxonomy of ~50-60 fields that document templates use
2. **Alias Mapping** - Maps variations ("Email Address", "Contact Email", "Primary Email") → `contact.email`
3. **Normalization Layer** - Extraction is flexible, storage is normalized
4. **Custom Overflow** - Anything unmapped goes to `custom.{label}`

```
Extraction (flexible)     →    Normalization (mapping)    →    Storage (canonical)
"Company Reg Number"      →    maps to                    →    company.registrationNumber
"Reg No."                 →    maps to                    →    company.registrationNumber
"Companies House #"       →    maps to                    →    company.registrationNumber
"Favorite color"          →    no match                   →    custom.favoriteColor
```

### Integration Points

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DOCUMENT UPLOAD                               │
├─────────────────────────────────────────────────────────────────────┤
│  1. Filing Agent categorizes document                                │
│     └─ Maps to checklist item (e.g., "Company Search")              │
│     └─ Checklist item → canonical field hints                       │
│                                                                      │
│  2. Extraction Agent pulls data                                      │
│     └─ Uses field hints from filing                                 │
│     └─ Extracts freely, normalized at storage                       │
│                                                                      │
│  3. Normalization Layer                                              │
│     └─ Maps extracted labels → canonical fields                     │
│     └─ Unmapped → custom fields                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Canonical Field Library

**Goal**: Define the master taxonomy of fields for clients and projects

### 1.1 Client Canonical Fields (~35 fields)

```typescript
// CLIENT_CANONICAL_FIELDS - The master list for client intelligence
export const CLIENT_CANONICAL_FIELDS = {
  // === CONTACT (10 fields) ===
  'contact.primaryName': {
    label: 'Primary Contact Name',
    type: 'string',
    description: 'Main point of contact for this client',
    aliases: ['name', 'contact name', 'primary name', 'main contact', 'key contact']
  },
  'contact.email': {
    label: 'Email Address',
    type: 'string',
    description: 'Primary email for correspondence',
    aliases: ['email', 'email address', 'contact email', 'primary email', 'e-mail']
  },
  'contact.phone': {
    label: 'Phone Number',
    type: 'string',
    description: 'Primary phone number',
    aliases: ['phone', 'telephone', 'mobile', 'cell', 'contact number', 'tel']
  },
  'contact.secondaryName': {
    label: 'Secondary Contact',
    type: 'string',
    description: 'Alternative contact person',
    aliases: ['secondary contact', 'alternate contact', 'other contact']
  },
  'contact.secondaryEmail': {
    label: 'Secondary Email',
    type: 'string',
    aliases: ['alternate email', 'other email', 'secondary email']
  },
  'contact.secondaryPhone': {
    label: 'Secondary Phone',
    type: 'string',
    aliases: ['alternate phone', 'other phone', 'secondary phone']
  },
  'contact.role': {
    label: 'Role/Title',
    type: 'string',
    description: 'Job title or role of primary contact',
    aliases: ['title', 'job title', 'position', 'role']
  },
  'contact.preferredContactMethod': {
    label: 'Preferred Contact Method',
    type: 'string',
    aliases: ['contact preference', 'best way to reach', 'preferred method']
  },
  'contact.personalAddress': {
    label: 'Personal Address',
    type: 'string',
    aliases: ['home address', 'residential address', 'personal address']
  },
  'contact.nationality': {
    label: 'Nationality',
    type: 'string',
    aliases: ['citizenship', 'country of origin', 'nationality']
  },

  // === COMPANY (12 fields) ===
  'company.name': {
    label: 'Company Name',
    type: 'string',
    description: 'Legal registered company name',
    aliases: ['company', 'business name', 'entity name', 'legal name', 'registered name']
  },
  'company.tradingName': {
    label: 'Trading Name',
    type: 'string',
    aliases: ['trading as', 'dba', 'doing business as', 't/a']
  },
  'company.registrationNumber': {
    label: 'Company Registration Number',
    type: 'string',
    description: 'Companies House registration number',
    aliases: ['company number', 'reg number', 'registration no', 'companies house number', 'crn']
  },
  'company.registeredAddress': {
    label: 'Registered Office Address',
    type: 'string',
    description: 'Official registered address',
    aliases: ['registered address', 'office address', 'company address', 'business address']
  },
  'company.incorporationDate': {
    label: 'Date of Incorporation',
    type: 'date',
    aliases: ['incorporation date', 'date incorporated', 'formed date', 'established']
  },
  'company.companyType': {
    label: 'Company Type',
    type: 'string',
    description: 'Ltd, LLP, PLC, etc.',
    aliases: ['entity type', 'business type', 'legal structure', 'company structure']
  },
  'company.sicCode': {
    label: 'SIC Code',
    type: 'string',
    aliases: ['sic', 'industry code', 'sector code']
  },
  'company.vatNumber': {
    label: 'VAT Number',
    type: 'string',
    aliases: ['vat', 'vat registration', 'vat no']
  },
  'company.directors': {
    label: 'Directors',
    type: 'array',
    description: 'List of company directors',
    aliases: ['director names', 'board members', 'company directors']
  },
  'company.shareholders': {
    label: 'Shareholders',
    type: 'array',
    description: 'List of shareholders with ownership %',
    aliases: ['owners', 'ownership', 'shareholder structure', 'equity holders']
  },
  'company.ultimateBeneficialOwner': {
    label: 'Ultimate Beneficial Owner',
    type: 'string',
    aliases: ['ubo', 'beneficial owner', 'ultimate owner', 'controlling party']
  },
  'company.parentCompany': {
    label: 'Parent Company',
    type: 'string',
    aliases: ['holding company', 'parent entity', 'group company']
  },

  // === FINANCIAL (8 fields) ===
  'financial.netWorth': {
    label: 'Net Worth',
    type: 'currency',
    description: 'Total net worth of client/principals',
    aliases: ['net worth', 'total worth', 'wealth', 'assets minus liabilities']
  },
  'financial.liquidAssets': {
    label: 'Liquid Assets',
    type: 'currency',
    aliases: ['liquid assets', 'cash available', 'available funds', 'liquidity']
  },
  'financial.annualIncome': {
    label: 'Annual Income',
    type: 'currency',
    aliases: ['income', 'yearly income', 'annual earnings', 'salary']
  },
  'financial.propertyPortfolioValue': {
    label: 'Property Portfolio Value',
    type: 'currency',
    aliases: ['portfolio value', 'property holdings', 'real estate value', 'total property value']
  },
  'financial.existingDebt': {
    label: 'Existing Debt/Borrowing',
    type: 'currency',
    aliases: ['current debt', 'existing loans', 'borrowings', 'liabilities']
  },
  'financial.creditScore': {
    label: 'Credit Score',
    type: 'number',
    aliases: ['credit rating', 'credit history', 'credit score']
  },
  'financial.bankName': {
    label: 'Primary Bank',
    type: 'string',
    aliases: ['bank', 'banking relationship', 'main bank']
  },
  'financial.accountantContact': {
    label: 'Accountant/Financial Advisor',
    type: 'string',
    aliases: ['accountant', 'financial advisor', 'cpa', 'tax advisor']
  },

  // === EXPERIENCE (5 fields) ===
  'experience.developmentHistory': {
    label: 'Development Experience',
    type: 'text',
    description: 'Summary of past development projects',
    aliases: ['track record', 'past projects', 'development history', 'experience']
  },
  'experience.projectsCompleted': {
    label: 'Number of Projects Completed',
    type: 'number',
    aliases: ['projects completed', 'deals done', 'completed developments']
  },
  'experience.totalGDV': {
    label: 'Total GDV Delivered',
    type: 'currency',
    description: 'Cumulative GDV of completed projects',
    aliases: ['total gdv', 'cumulative gdv', 'gdv track record']
  },
  'experience.specializations': {
    label: 'Specializations',
    type: 'array',
    description: 'Types of projects they specialize in',
    aliases: ['specialty', 'focus areas', 'expertise', 'specialization']
  },
  'experience.geographicFocus': {
    label: 'Geographic Focus',
    type: 'string',
    aliases: ['locations', 'markets', 'regions', 'geographic area']
  },
} as const;
```

### 1.2 Project Canonical Fields (~25 fields)

```typescript
export const PROJECT_CANONICAL_FIELDS = {
  // === OVERVIEW (6 fields) ===
  'overview.projectName': {
    label: 'Project Name',
    type: 'string',
    aliases: ['project', 'development name', 'scheme name', 'site name']
  },
  'overview.projectType': {
    label: 'Project Type',
    type: 'string',
    description: 'new-build, refurbishment, conversion, etc.',
    aliases: ['type', 'development type', 'scheme type']
  },
  'overview.assetClass': {
    label: 'Asset Class',
    type: 'string',
    description: 'residential, commercial, mixed-use, etc.',
    aliases: ['asset type', 'property type', 'use class', 'sector']
  },
  'overview.description': {
    label: 'Project Description',
    type: 'text',
    aliases: ['description', 'summary', 'overview', 'scheme description']
  },
  'overview.unitCount': {
    label: 'Number of Units',
    type: 'number',
    aliases: ['units', 'unit count', 'number of homes', 'dwellings']
  },
  'overview.totalSqft': {
    label: 'Total Square Footage',
    type: 'number',
    aliases: ['sqft', 'square feet', 'area', 'floor area', 'nia', 'gia']
  },

  // === LOCATION (4 fields) ===
  'location.siteAddress': {
    label: 'Site Address',
    type: 'string',
    aliases: ['address', 'property address', 'site location', 'development address']
  },
  'location.postcode': {
    label: 'Postcode',
    type: 'string',
    aliases: ['post code', 'zip', 'postal code']
  },
  'location.localAuthority': {
    label: 'Local Authority',
    type: 'string',
    aliases: ['council', 'la', 'local council', 'planning authority']
  },
  'location.titleNumber': {
    label: 'Title Number',
    type: 'string',
    aliases: ['land registry title', 'title no', 'land registry number']
  },

  // === FINANCIALS (10 fields) ===
  'financials.purchasePrice': {
    label: 'Purchase Price',
    type: 'currency',
    aliases: ['acquisition price', 'land price', 'site cost', 'purchase cost']
  },
  'financials.currentValue': {
    label: 'Current Market Value',
    type: 'currency',
    aliases: ['cmv', 'market value', 'current value', 'valuation']
  },
  'financials.totalDevelopmentCost': {
    label: 'Total Development Cost',
    type: 'currency',
    aliases: ['tdc', 'total cost', 'development cost', 'all-in cost']
  },
  'financials.constructionCost': {
    label: 'Construction Cost',
    type: 'currency',
    aliases: ['build cost', 'construction budget', 'hard costs']
  },
  'financials.gdv': {
    label: 'Gross Development Value',
    type: 'currency',
    aliases: ['gdv', 'end value', 'completed value', 'gross value']
  },
  'financials.loanAmount': {
    label: 'Loan Amount Requested',
    type: 'currency',
    aliases: ['loan required', 'funding required', 'borrowing', 'debt amount', 'facility size']
  },
  'financials.ltv': {
    label: 'Loan to Value',
    type: 'percentage',
    aliases: ['ltv', 'loan to value', 'leverage']
  },
  'financials.ltc': {
    label: 'Loan to Cost',
    type: 'percentage',
    aliases: ['ltc', 'loan to cost']
  },
  'financials.equityContribution': {
    label: 'Equity Contribution',
    type: 'currency',
    aliases: ['equity', 'cash in', 'deposit', 'client contribution']
  },
  'financials.profitMargin': {
    label: 'Expected Profit Margin',
    type: 'percentage',
    aliases: ['profit', 'margin', 'profit on cost', 'poc', 'developer profit']
  },

  // === TIMELINE (5 fields) ===
  'timeline.acquisitionDate': {
    label: 'Acquisition Date',
    type: 'date',
    aliases: ['purchase date', 'completion date', 'exchange date']
  },
  'timeline.planningStatus': {
    label: 'Planning Status',
    type: 'string',
    aliases: ['planning', 'planning permission', 'consent status']
  },
  'timeline.constructionStart': {
    label: 'Construction Start Date',
    type: 'date',
    aliases: ['start date', 'build start', 'commencement']
  },
  'timeline.practicalCompletion': {
    label: 'Practical Completion Date',
    type: 'date',
    aliases: ['completion date', 'pc date', 'end date', 'finish date']
  },
  'timeline.projectDuration': {
    label: 'Project Duration (months)',
    type: 'number',
    aliases: ['duration', 'build period', 'construction period', 'term']
  },
} as const;
```

### 1.3 Checklist → Canonical Field Mapping

```typescript
// Maps checklist items to the canonical fields they typically provide
export const CHECKLIST_FIELD_HINTS = {
  'Company Search': ['company.name', 'company.registrationNumber', 'company.incorporationDate', 'company.registeredAddress', 'company.directors', 'company.shareholders'],
  'Proof of Address': ['contact.personalAddress', 'company.registeredAddress'],
  'Passport/ID': ['contact.primaryName', 'contact.nationality'],
  'Financial Statement': ['financial.netWorth', 'financial.liquidAssets', 'financial.annualIncome'],
  'Bank Statements': ['financial.bankName', 'financial.liquidAssets'],
  'Development Appraisal': ['financials.gdv', 'financials.totalDevelopmentCost', 'financials.constructionCost', 'financials.profitMargin'],
  'Valuation Report': ['financials.currentValue', 'financials.gdv'],
  'Title Documents': ['location.titleNumber', 'location.siteAddress'],
  'Planning Permission': ['timeline.planningStatus', 'overview.unitCount'],
  'Schedule of Works': ['financials.constructionCost', 'timeline.constructionStart', 'timeline.practicalCompletion'],
} as const;
```

### 1.4 Tasks

- [ ] Create `src/lib/canonicalFields.ts` with CLIENT_CANONICAL_FIELDS
- [ ] Add PROJECT_CANONICAL_FIELDS to the same file
- [ ] Create CHECKLIST_FIELD_HINTS mapping
- [ ] Build `normalizeFieldPath(extractedLabel)` function using aliases
- [ ] Add `getFieldByPath(path)` helper for retrieving field metadata
- [ ] Create type definitions for field types (string, currency, date, etc.)

---

## Phase 2: Extraction Pipeline with Normalization

**Goal**: Extract flexibly, normalize at storage

### 2.1 Updated Extraction Flow

```
Document Upload
        │
        ▼
┌─────────────────────────────────────┐
│  1. FILING AGENT                    │
│  • Categorizes document             │
│  • Maps to checklist item           │
│  • Returns field hints              │
└─────────────────────────────────────┘
        │ Field hints: ["company.name", "company.registrationNumber", ...]
        ▼
┌─────────────────────────────────────┐
│  2. EXTRACTION AGENT (GPT-4o)       │
│  • Receives field hints as guidance │
│  • Extracts all relevant data       │
│  • Uses natural language labels     │
└─────────────────────────────────────┘
        │ Raw: [{ label: "Company Reg", value: "12345678" }, ...]
        ▼
┌─────────────────────────────────────┐
│  3. NORMALIZATION LAYER             │
│  • Maps labels → canonical paths    │
│  • Uses alias dictionary            │
│  • Unmatched → custom.{label}       │
└─────────────────────────────────────┘
        │ Normalized: [{ path: "company.registrationNumber", value: "12345678" }, ...]
        ▼
┌─────────────────────────────────────┐
│  4. STORAGE                         │
│  • Stores with canonical paths      │
│  • Tracks source document           │
│  • Ready for template retrieval     │
└─────────────────────────────────────┘
```

### 2.2 Normalization Function

```typescript
import { CLIENT_CANONICAL_FIELDS, PROJECT_CANONICAL_FIELDS } from './canonicalFields';

interface NormalizationResult {
  canonicalPath: string | null;  // null if no match
  customPath: string | null;     // only if canonicalPath is null
  confidence: number;            // how confident we are in the mapping
}

function normalizeFieldLabel(
  label: string,
  targetType: 'client' | 'project'
): NormalizationResult {
  const fields = targetType === 'client' ? CLIENT_CANONICAL_FIELDS : PROJECT_CANONICAL_FIELDS;
  const normalizedLabel = label.toLowerCase().trim();

  // 1. Check for exact path match
  if (fields[normalizedLabel]) {
    return { canonicalPath: normalizedLabel, customPath: null, confidence: 1.0 };
  }

  // 2. Check aliases
  for (const [path, config] of Object.entries(fields)) {
    const aliases = config.aliases || [];
    for (const alias of aliases) {
      if (normalizedLabel.includes(alias) || alias.includes(normalizedLabel)) {
        return { canonicalPath: path, customPath: null, confidence: 0.9 };
      }
    }
  }

  // 3. Fuzzy match on label
  for (const [path, config] of Object.entries(fields)) {
    const fieldLabel = config.label.toLowerCase();
    if (
      normalizedLabel.includes(fieldLabel) ||
      fieldLabel.includes(normalizedLabel) ||
      levenshteinDistance(normalizedLabel, fieldLabel) < 3
    ) {
      return { canonicalPath: path, customPath: null, confidence: 0.7 };
    }
  }

  // 4. No match - create custom field
  const customKey = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);

  return {
    canonicalPath: null,
    customPath: `custom.${customKey}`,
    confidence: 0.5
  };
}
```

### 2.3 Updated Extraction Prompt

```typescript
const extractionPrompt = `
You are extracting intelligence from a ${documentType} document.

This document is categorized as "${checklistCategory}" which typically contains:
${fieldHints.map(f => `- ${f}: ${getFieldDescription(f)}`).join('\n')}

IMPORTANT: Extract data using natural language labels. Don't worry about exact field names.
Examples:
- "Company Registration Number" or "Reg No." or "Companies House #" - all fine
- "Primary Contact" or "Main Contact" or "Key Contact" - all fine
The system will normalize these automatically.

Extract ALL relevant information from the document, including:
1. Fields that match the hints above
2. Any OTHER useful data you find (will be stored as custom fields)

...
`;
```

### 2.4 Tasks

- [ ] Update `intelligence-extract/route.ts` to pass field hints
- [ ] Create `normalizeFieldLabel()` function in `src/lib/canonicalFields.ts`
- [ ] Update storage to use normalized paths
- [ ] Add logging for normalization results (matched vs custom)
- [ ] Update filing agent to return field hints based on document category

---

## Phase 3: Storage & Retrieval

**Goal**: Store normalized data, retrieve by canonical path

### 3.1 Knowledge Item Schema (Updated)

```typescript
interface KnowledgeItem {
  id: string;

  // Canonical or custom path
  fieldPath: string;           // e.g., "company.registrationNumber" or "custom.favorite_broker"
  isCanonical: boolean;        // true if matched to canonical field

  // Display info
  category: string;            // Derived from fieldPath: "company", "contact", "custom"
  label: string;               // Human-readable: "Company Registration Number"

  // Value
  value: any;
  valueType: 'string' | 'number' | 'currency' | 'date' | 'percentage' | 'array' | 'text';

  // Source tracking
  sourceType: 'document' | 'manual' | 'ai_extraction' | 'data_library';
  sourceDocumentId?: string;
  sourceDocumentName?: string;

  // Status
  status: 'active' | 'flagged' | 'archived';
  flagReason?: string;

  // Timestamps
  addedAt: string;
  updatedAt: string;
}
```

### 3.2 Retrieval for Templates

```typescript
// Get a specific canonical field value
function getFieldValue(
  intelligence: KnowledgeItem[],
  fieldPath: string
): any | null {
  const item = intelligence.find(i => i.fieldPath === fieldPath && i.status === 'active');
  return item?.value ?? null;
}

// Get all fields in a category
function getCategoryFields(
  intelligence: KnowledgeItem[],
  category: string
): KnowledgeItem[] {
  return intelligence.filter(i =>
    i.fieldPath.startsWith(`${category}.`) &&
    i.status === 'active'
  );
}

// Template interpolation
function interpolateTemplate(
  template: string,
  clientIntelligence: KnowledgeItem[],
  projectIntelligence: KnowledgeItem[]
): string {
  return template.replace(/\{\{(client|project)\.([^}]+)\}\}/g, (match, type, path) => {
    const items = type === 'client' ? clientIntelligence : projectIntelligence;
    const value = getFieldValue(items, path);
    return value ?? `[MISSING: ${match}]`;
  });
}

// Example usage:
// "Dear {{client.contact.primaryName}}, regarding {{project.overview.projectName}}..."
// → "Dear John Smith, regarding 123 High Street Development..."
```

### 3.3 Tasks

- [ ] Update Convex schema with new KnowledgeItem structure
- [ ] Create `getFieldValue()` and `getCategoryFields()` queries
- [ ] Build template interpolation utility
- [ ] Add "missing fields" detection for templates
- [ ] Create migration for existing intelligence data

---

## Phase 4: Consolidation Button (Llama)

**Goal**: On-demand cleanup via "Consolidate" button

### 4.1 What Consolidation Does

1. **Detects duplicates** - Same canonical field, different sources
2. **Flags conflicts** - Same field, different values
3. **Suggests archives** - Outdated custom fields that might now match canonical

### 4.2 Consolidation Prompt

```typescript
const consolidationPrompt = `
Review this client's intelligence data and identify issues.

CANONICAL FIELDS (these are the standard fields):
${Object.keys(CLIENT_CANONICAL_FIELDS).join('\n')}

CURRENT INTELLIGENCE:
${items.map(i => `[${i.id}] ${i.fieldPath}: ${i.value} (source: ${i.sourceDocumentName || 'manual'}, canonical: ${i.isCanonical})`).join('\n')}

Identify:

1. DUPLICATES - Multiple items for the same field path
   → Recommend which to keep (prefer document source over manual, newer over older)

2. CONFLICTS - Same field, different values
   → Flag for human review

3. CUSTOM → CANONICAL MATCHES - Custom fields that should map to canonical
   → Example: custom.company_reg matches company.registrationNumber

Respond with JSON:
{
  "duplicates": [
    { "fieldPath": "...", "keepId": "...", "removeIds": ["..."], "reason": "..." }
  ],
  "conflicts": [
    { "fieldPath": "...", "itemIds": ["...", "..."], "description": "..." }
  ],
  "reclassify": [
    { "itemId": "...", "currentPath": "custom.x", "suggestedPath": "company.registrationNumber", "reason": "..." }
  ]
}
`;
```

### 4.3 Tasks

- [ ] Create consolidation API endpoint using Llama
- [ ] Build consolidation results UI
- [ ] Implement merge/archive operations
- [ ] Implement reclassify operation (custom → canonical)
- [ ] Add conflict resolution UI

---

## Phase 5: Hub Integration

**Goal**: Connect Intelligence to Checklist, Documents, Data Library

### 5.1 Checklist Progress from Intelligence

```typescript
function calculateChecklistProgress(
  checklistItems: ChecklistItem[],
  intelligence: KnowledgeItem[]
): ChecklistProgress[] {
  return checklistItems.map(item => {
    const requiredFields = CHECKLIST_FIELD_HINTS[item.name] || [];
    const filledFields = requiredFields.filter(f => getFieldValue(intelligence, f) !== null);

    return {
      checklistItemId: item.id,
      requiredFields,
      filledFields,
      percentComplete: requiredFields.length > 0
        ? (filledFields.length / requiredFields.length) * 100
        : 0,
      missingFields: requiredFields.filter(f => !filledFields.includes(f)),
    };
  });
}
```

### 5.2 Document → Intelligence Link

When extraction completes:
- Store which document populated which fields
- Allow "re-extract" to refresh from document
- Show provenance in UI ("from: Company Search.pdf")

### 5.3 Data Library Sync

Financial data from Data Library → Intelligence:
- On confirmation, sync to `financials.*` canonical fields
- Keep Data Library as source of truth for detailed breakdowns
- Intelligence stores the summary figures

### 5.4 Tasks

- [ ] Build checklist progress calculation
- [ ] Create document → field provenance tracking
- [ ] Add "re-extract" functionality
- [ ] Create Data Library sync trigger
- [ ] Build "gaps" endpoint for missing checklist fields

---

## Implementation Priority

### Sprint 1: Canonical Fields & Normalization
1. Create `canonicalFields.ts` with all field definitions
2. Build normalization function with alias matching
3. Update extraction to use normalization
4. Test with a few documents

### Sprint 2: Storage Migration
1. Update Convex schema for KnowledgeItem
2. Create migration for existing data
3. Build CRUD operations for new schema
4. Update UI to display canonical vs custom

### Sprint 3: Filing Integration
1. Add field hints to filing agent
2. Pass hints through to extraction
3. Link documents to fields they populate
4. Update checklist with field-based progress

### Sprint 4: Consolidation & Polish
1. Build consolidation endpoint
2. Create consolidation review UI
3. Add conflict resolution
4. Template interpolation utility

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Canonical match rate | 80%+ of extracted fields map to canonical |
| Template readiness | Can generate proposal with 90%+ fields filled |
| Extraction coverage | 80%+ of uploaded documents processed |
| Duplicate rate | < 5% after consolidation |

---

## Appendix: Full Canonical Field List

### Client Fields (35)
- contact.* (10): primaryName, email, phone, secondaryName, secondaryEmail, secondaryPhone, role, preferredContactMethod, personalAddress, nationality
- company.* (12): name, tradingName, registrationNumber, registeredAddress, incorporationDate, companyType, sicCode, vatNumber, directors, shareholders, ultimateBeneficialOwner, parentCompany
- financial.* (8): netWorth, liquidAssets, annualIncome, propertyPortfolioValue, existingDebt, creditScore, bankName, accountantContact
- experience.* (5): developmentHistory, projectsCompleted, totalGDV, specializations, geographicFocus

### Project Fields (25)
- overview.* (6): projectName, projectType, assetClass, description, unitCount, totalSqft
- location.* (4): siteAddress, postcode, localAuthority, titleNumber
- financials.* (10): purchasePrice, currentValue, totalDevelopmentCost, constructionCost, gdv, loanAmount, ltv, ltc, equityContribution, profitMargin
- timeline.* (5): acquisitionDate, planningStatus, constructionStart, practicalCompletion, projectDuration

**Total: 60 canonical fields** (expandable as needed)
