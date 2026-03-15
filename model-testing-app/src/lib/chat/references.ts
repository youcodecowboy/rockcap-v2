// src/lib/chat/references.ts

export interface KnowledgeItem {
  fieldPath: string;
  label: string;
  value: any;
  valueType: string;
  normalizationConfidence?: number;
  status: string;
  category: string;
}

/**
 * Build a lookup map from knowledge items: fieldPath → value.
 * Only includes active items. When multiple exist for the same field,
 * picks the one with highest confidence.
 */
function buildKnowledgeLookup(items: KnowledgeItem[]): Map<string, { value: any; label: string; confidence: number }> {
  const lookup = new Map<string, { value: any; label: string; confidence: number }>();
  for (const item of items) {
    if (item.status !== 'active') continue;
    const existing = lookup.get(item.fieldPath);
    const conf = item.normalizationConfidence ?? 0.9;
    if (!existing || conf > existing.confidence) {
      lookup.set(item.fieldPath, { value: item.value, label: item.label, confidence: conf });
    }
  }
  return lookup;
}

/**
 * Format a client intelligence record into a compact reference block.
 * Uses knowledge items as primary data source (the actual source of truth),
 * falling back to canonical intel fields.
 * Target: ~300 tokens.
 */
export function formatClientReference(
  client: { name: string; status: string; type: string },
  intel: any | null,
  knowledgeItems?: KnowledgeItem[]
): string {
  const ki = knowledgeItems ? buildKnowledgeLookup(knowledgeItems) : new Map();

  if (!intel && ki.size === 0) {
    return `### ${client.name} (Client)\nStatus: ${client.status} | Type: ${client.type}\nNo intelligence data extracted yet.`;
  }

  const lines: string[] = [`### ${client.name} (Client)`];
  lines.push(`Status: ${client.status} | Type: ${client.type}`);

  // Helper: get value from knowledge items first, then fall back to intel field
  const kv = (fieldPath: string, intelValue?: any) => {
    const item = ki.get(fieldPath);
    return item?.value ?? intelValue ?? null;
  };

  // Identity
  const id = intel?.identity || {};
  const idParts: string[] = [];
  const legalName = kv('company.legalName', id.legalName);
  const companyNumber = kv('company.registrationNumber', id.companyNumber);
  const vatNumber = kv('company.vatNumber', id.vatNumber);
  if (legalName) idParts.push(`Legal: ${legalName}`);
  if (companyNumber) idParts.push(`Co #: ${companyNumber}`);
  if (vatNumber) idParts.push(`VAT: ${vatNumber}`);
  if (idParts.length > 0) lines.push(idParts.join(' | '));

  // Address — knowledge items use company.registeredAddress
  const addr = intel?.addresses || {};
  const registeredAddress = kv('company.registeredAddress', addr.registered);
  if (registeredAddress) lines.push(`Registered: ${registeredAddress}`);
  const tradingAddress = kv('company.tradingAddress', addr.trading);
  if (tradingAddress) lines.push(`Trading Address: ${tradingAddress}`);

  // Contact
  const contact = intel?.primaryContact || {};
  const contactName = kv('contact.primaryName', contact.name);
  if (contactName) {
    const contactParts = [contactName];
    const contactEmail = kv('contact.primaryEmail', contact.email);
    const contactPhone = kv('contact.primaryPhone', contact.phone);
    if (contactEmail) contactParts.push(contactEmail);
    if (contactPhone) contactParts.push(contactPhone);
    lines.push(`Primary Contact: ${contactParts.join(' | ')}`);
  }

  // Key people
  const people = intel?.keyPeople || [];
  if (people.length > 0) {
    const names = people.slice(0, 5).map((p: any) => `${p.name}${p.role ? ` (${p.role})` : ''}`);
    lines.push(`Key People: ${names.join(', ')}`);
  }

  // Borrower/Lender profile summary
  if (intel?.borrowerProfile) {
    const bp = intel.borrowerProfile;
    const parts: string[] = [];
    if (bp.experienceLevel) parts.push(`Experience: ${bp.experienceLevel}`);
    if (bp.completedProjects) parts.push(`Projects: ${bp.completedProjects}`);
    if (parts.length > 0) lines.push(parts.join(' | '));
  }
  if (intel?.lenderProfile) {
    const lp = intel.lenderProfile;
    const parts: string[] = [];
    if (lp.dealSizeMin && lp.dealSizeMax) parts.push(`Deals: £${formatNum(lp.dealSizeMin)}-£${formatNum(lp.dealSizeMax)}`);
    if (lp.typicalLTV) parts.push(`LTV: ${lp.typicalLTV}%`);
    if (parts.length > 0) lines.push(parts.join(' | '));
  }

  // Knowledge items summary — include all active items not already covered
  const coveredPaths = new Set([
    'company.legalName', 'company.registrationNumber', 'company.vatNumber',
    'company.registeredAddress', 'company.tradingAddress',
    'contact.primaryName', 'contact.primaryEmail', 'contact.primaryPhone',
  ]);
  const extraItems: string[] = [];
  for (const [fieldPath, entry] of ki) {
    if (coveredPaths.has(fieldPath)) continue;
    const displayValue = typeof entry.value === 'object' ? JSON.stringify(entry.value) : String(entry.value);
    if (displayValue.length > 200) continue; // skip very long values
    extraItems.push(`${entry.label}: ${displayValue}`);
  }
  if (extraItems.length > 0) {
    lines.push(`Knowledge (${ki.size} items):`);
    for (const item of extraItems.slice(0, 15)) {
      lines.push(`  ${item}`);
    }
    if (extraItems.length > 15) lines.push(`  ... and ${extraItems.length - 15} more`);
  } else {
    // Fallback to intel stats if no knowledge items
    if (intel) {
      const filledCount = countFilledFields(intel);
      lines.push(`Intelligence: ${filledCount}/48 fields filled`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a project intelligence record into a compact reference block.
 * Uses knowledge items as primary data source, falling back to canonical intel fields.
 * Target: ~300 tokens.
 */
export function formatProjectReference(
  project: { name: string; status: string },
  intel: any | null,
  knowledgeItems?: KnowledgeItem[]
): string {
  const ki = knowledgeItems ? buildKnowledgeLookup(knowledgeItems) : new Map();

  if (!intel && ki.size === 0) {
    return `### ${project.name} (Project)\nStatus: ${project.status}\nNo intelligence data extracted yet.`;
  }

  const lines: string[] = [`### ${project.name} (Project)`];
  lines.push(`Status: ${project.status}`);

  const kv = (fieldPath: string, intelValue?: any) => {
    const item = ki.get(fieldPath);
    return item?.value ?? intelValue ?? null;
  };

  // Overview
  const ov = intel?.overview || {};
  const ovParts: string[] = [];
  const projectType = kv('project.type', ov.projectType);
  const assetClass = kv('project.assetClass', ov.assetClass);
  const currentPhase = kv('project.currentPhase', ov.currentPhase);
  if (projectType) ovParts.push(`Type: ${projectType}`);
  if (assetClass) ovParts.push(`Class: ${assetClass}`);
  if (currentPhase) ovParts.push(`Phase: ${currentPhase}`);
  if (ovParts.length > 0) lines.push(ovParts.join(' | '));

  // Location
  const loc = intel?.location || {};
  const siteAddress = kv('site.address', loc.siteAddress);
  if (siteAddress) lines.push(`Site: ${siteAddress}${loc.postcode ? `, ${loc.postcode}` : ''}`);

  // Financials
  const fin = intel?.financials || {};
  const finParts: string[] = [];
  const loanAmount = kv('loan.amount', fin.loanAmount);
  const ltv = kv('loan.ltv', fin.ltv);
  const gdv = kv('project.gdv', fin.grossDevelopmentValue);
  const tdc = kv('project.totalDevelopmentCost', fin.totalDevelopmentCost);
  const rate = kv('loan.interestRate', fin.interestRate);
  if (loanAmount) finParts.push(`Loan: £${formatNum(Number(loanAmount))}`);
  if (ltv) finParts.push(`LTV: ${ltv}%`);
  if (gdv) finParts.push(`GDV: £${formatNum(Number(gdv))}`);
  if (tdc) finParts.push(`TDC: £${formatNum(Number(tdc))}`);
  if (rate) finParts.push(`Rate: ${rate}%`);
  if (finParts.length > 0) lines.push(finParts.join(' | '));

  // Development
  const dev = intel?.development || {};
  const devParts: string[] = [];
  const totalUnits = kv('development.totalUnits', dev.totalUnits);
  const totalSqFt = kv('development.totalSqFt', dev.totalSqFt);
  const planningStatus = kv('planning.status', dev.planningStatus);
  if (totalUnits) devParts.push(`Units: ${totalUnits}`);
  if (totalSqFt) devParts.push(`${formatNum(Number(totalSqFt))} sq ft`);
  if (planningStatus) devParts.push(`Planning: ${planningStatus}`);
  if (devParts.length > 0) lines.push(devParts.join(' | '));

  // Timeline
  const tl = intel?.timeline || {};
  const tlParts: string[] = [];
  const startDate = kv('timeline.constructionStart', tl.constructionStartDate);
  const completionDate = kv('timeline.practicalCompletion', tl.practicalCompletionDate);
  const maturityDate = kv('timeline.loanMaturity', tl.loanMaturityDate);
  if (startDate) tlParts.push(`Start: ${startDate}`);
  if (completionDate) tlParts.push(`Completion: ${completionDate}`);
  if (maturityDate) tlParts.push(`Maturity: ${maturityDate}`);
  if (tlParts.length > 0) lines.push(tlParts.join(' | '));

  // Key parties
  const kp = intel?.keyParties || {};
  const partyParts: string[] = [];
  const borrower = kv('parties.borrower', kp.borrower);
  const contractor = kv('parties.contractor', kp.contractor);
  const solicitor = kv('parties.solicitor', kp.solicitor);
  if (borrower) partyParts.push(`Borrower: ${borrower}`);
  if (contractor) partyParts.push(`Contractor: ${contractor}`);
  if (solicitor) partyParts.push(`Solicitor: ${solicitor}`);
  if (partyParts.length > 0) lines.push(partyParts.join(' | '));

  // Knowledge items summary — include all active items not already covered
  const coveredPaths = new Set([
    'project.type', 'project.assetClass', 'project.currentPhase',
    'site.address', 'loan.amount', 'loan.ltv', 'project.gdv',
    'project.totalDevelopmentCost', 'loan.interestRate',
    'development.totalUnits', 'development.totalSqFt', 'planning.status',
    'timeline.constructionStart', 'timeline.practicalCompletion', 'timeline.loanMaturity',
    'parties.borrower', 'parties.contractor', 'parties.solicitor',
  ]);
  const extraItems: string[] = [];
  for (const [fieldPath, entry] of ki) {
    if (coveredPaths.has(fieldPath)) continue;
    const displayValue = typeof entry.value === 'object' ? JSON.stringify(entry.value) : String(entry.value);
    if (displayValue.length > 200) continue;
    extraItems.push(`${entry.label}: ${displayValue}`);
  }
  if (extraItems.length > 0) {
    lines.push(`Knowledge (${ki.size} items):`);
    for (const item of extraItems.slice(0, 15)) {
      lines.push(`  ${item}`);
    }
    if (extraItems.length > 15) lines.push(`  ... and ${extraItems.length - 15} more`);
  } else if (intel) {
    const filledCount = countFilledFields(intel);
    lines.push(`Intelligence: ${filledCount}/105 fields filled`);
  }

  return lines.join('\n');
}

/**
 * Format a document list as a compact reference.
 */
export function formatDocumentListReference(
  docs: Array<{ _id: string; fileName: string; category?: string; status?: string; summary?: string }>
): string {
  if (docs.length === 0) return 'No documents found.';
  const lines = [`${docs.length} documents:`];
  for (const doc of docs) {
    const parts = [doc.fileName];
    if (doc.category) parts.push(`[${doc.category}]`);
    if (doc.status) parts.push(`(${doc.status})`);
    lines.push(`- ${parts.join(' ')} — ID: ${doc._id}`);
    if (doc.summary) {
      lines.push(`  Summary: ${doc.summary.slice(0, 150)}${doc.summary.length > 150 ? '...' : ''}`);
    }
  }
  return lines.join('\n');
}

/**
 * Format a contact list as a compact reference.
 */
export function formatContactListReference(
  contacts: Array<{ name: string; role?: string; email?: string; phone?: string }>
): string {
  if (contacts.length === 0) return 'No contacts found.';
  const lines = [`${contacts.length} contacts:`];
  for (const c of contacts) {
    const parts = [c.name];
    if (c.role) parts.push(`(${c.role})`);
    if (c.email) parts.push(c.email);
    if (c.phone) parts.push(c.phone);
    lines.push(`- ${parts.join(' | ')}`);
  }
  return lines.join('\n');
}

/**
 * Format a note list as a compact reference.
 */
export function formatNoteListReference(
  notes: Array<{ title?: string; content: string; createdAt: string }>
): string {
  if (notes.length === 0) return 'No notes found.';
  const lines = [`${notes.length} notes:`];
  for (const n of notes.slice(0, 10)) {
    const date = n.createdAt.split('T')[0];
    const preview = n.content.slice(0, 100) + (n.content.length > 100 ? '...' : '');
    lines.push(`- [${date}] ${n.title || 'Untitled'}: ${preview}`);
  }
  return lines.join('\n');
}

// --- Helpers ---

function formatNum(n: number): string {
  return n.toLocaleString('en-GB');
}

function countFilledFields(intel: any): number {
  let count = 0;
  const skip = new Set(['_id', '_creationTime', 'clientId', 'projectId', 'clientType', 'lastUpdated', 'lastUpdatedBy', 'version', 'extractedAttributes']);
  for (const [key, value] of Object.entries(intel)) {
    if (skip.has(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      count += Object.values(value).filter((v) => v != null && v !== '').length;
    } else if (Array.isArray(value)) {
      count += value.length > 0 ? 1 : 0;
    }
  }
  return count;
}
