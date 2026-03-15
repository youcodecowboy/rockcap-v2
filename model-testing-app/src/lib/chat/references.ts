// src/lib/chat/references.ts

/**
 * Format a client intelligence record into a compact reference block.
 * Target: ~300 tokens.
 */
export function formatClientReference(
  client: { name: string; status: string; type: string },
  intel: any | null
): string {
  if (!intel) {
    return `### ${client.name} (Client)\nStatus: ${client.status} | Type: ${client.type}\nNo intelligence data extracted yet.`;
  }

  const lines: string[] = [`### ${client.name} (Client)`];
  lines.push(`Status: ${client.status} | Type: ${client.type}`);

  // Identity
  const id = intel.identity || {};
  const idParts: string[] = [];
  if (id.legalName) idParts.push(`Legal: ${id.legalName}`);
  if (id.companyNumber) idParts.push(`Co #: ${id.companyNumber}`);
  if (id.vatNumber) idParts.push(`VAT: ${id.vatNumber}`);
  if (idParts.length > 0) lines.push(idParts.join(' | '));

  // Address
  const addr = intel.addresses || {};
  if (addr.registered) lines.push(`Registered: ${addr.registered}`);

  // Contact
  const contact = intel.primaryContact || {};
  if (contact.name) {
    const contactParts = [contact.name];
    if (contact.email) contactParts.push(contact.email);
    if (contact.phone) contactParts.push(contact.phone);
    lines.push(`Primary Contact: ${contactParts.join(' | ')}`);
  }

  // Key people
  const people = intel.keyPeople || [];
  if (people.length > 0) {
    const names = people.slice(0, 5).map((p: any) => `${p.name}${p.role ? ` (${p.role})` : ''}`);
    lines.push(`Key People: ${names.join(', ')}`);
  }

  // Borrower/Lender profile summary
  if (intel.borrowerProfile) {
    const bp = intel.borrowerProfile;
    const parts: string[] = [];
    if (bp.experienceLevel) parts.push(`Experience: ${bp.experienceLevel}`);
    if (bp.completedProjects) parts.push(`Projects: ${bp.completedProjects}`);
    if (parts.length > 0) lines.push(parts.join(' | '));
  }
  if (intel.lenderProfile) {
    const lp = intel.lenderProfile;
    const parts: string[] = [];
    if (lp.dealSizeMin && lp.dealSizeMax) parts.push(`Deals: £${formatNum(lp.dealSizeMin)}-£${formatNum(lp.dealSizeMax)}`);
    if (lp.typicalLTV) parts.push(`LTV: ${lp.typicalLTV}%`);
    if (parts.length > 0) lines.push(parts.join(' | '));
  }

  // Intelligence stats
  const filledCount = countFilledFields(intel);
  lines.push(`Intelligence: ${filledCount}/48 fields filled`);

  // Extracted attributes (custom fields)
  if (intel.extractedAttributes) {
    const attrs = Object.entries(intel.extractedAttributes).slice(0, 10);
    if (attrs.length > 0) {
      const attrStr = attrs.map(([k, v]: [string, any]) => `${k}: ${v}`).join(' | ');
      lines.push(`Custom: ${attrStr}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a project intelligence record into a compact reference block.
 * Target: ~300 tokens.
 */
export function formatProjectReference(
  project: { name: string; status: string },
  intel: any | null
): string {
  if (!intel) {
    return `### ${project.name} (Project)\nStatus: ${project.status}\nNo intelligence data extracted yet.`;
  }

  const lines: string[] = [`### ${project.name} (Project)`];
  lines.push(`Status: ${project.status}`);

  // Overview
  const ov = intel.overview || {};
  const ovParts: string[] = [];
  if (ov.projectType) ovParts.push(`Type: ${ov.projectType}`);
  if (ov.assetClass) ovParts.push(`Class: ${ov.assetClass}`);
  if (ov.currentPhase) ovParts.push(`Phase: ${ov.currentPhase}`);
  if (ovParts.length > 0) lines.push(ovParts.join(' | '));

  // Location
  const loc = intel.location || {};
  if (loc.siteAddress) lines.push(`Site: ${loc.siteAddress}${loc.postcode ? `, ${loc.postcode}` : ''}`);

  // Financials
  const fin = intel.financials || {};
  const finParts: string[] = [];
  if (fin.loanAmount) finParts.push(`Loan: £${formatNum(fin.loanAmount)}`);
  if (fin.ltv) finParts.push(`LTV: ${fin.ltv}%`);
  if (fin.grossDevelopmentValue) finParts.push(`GDV: £${formatNum(fin.grossDevelopmentValue)}`);
  if (fin.totalDevelopmentCost) finParts.push(`TDC: £${formatNum(fin.totalDevelopmentCost)}`);
  if (fin.interestRate) finParts.push(`Rate: ${fin.interestRate}%`);
  if (finParts.length > 0) lines.push(finParts.join(' | '));

  // Development
  const dev = intel.development || {};
  const devParts: string[] = [];
  if (dev.totalUnits) devParts.push(`Units: ${dev.totalUnits}`);
  if (dev.totalSqFt) devParts.push(`${formatNum(dev.totalSqFt)} sq ft`);
  if (dev.planningStatus) devParts.push(`Planning: ${dev.planningStatus}`);
  if (devParts.length > 0) lines.push(devParts.join(' | '));

  // Timeline
  const tl = intel.timeline || {};
  const tlParts: string[] = [];
  if (tl.constructionStartDate) tlParts.push(`Start: ${tl.constructionStartDate}`);
  if (tl.practicalCompletionDate) tlParts.push(`Completion: ${tl.practicalCompletionDate}`);
  if (tl.loanMaturityDate) tlParts.push(`Maturity: ${tl.loanMaturityDate}`);
  if (tlParts.length > 0) lines.push(tlParts.join(' | '));

  // Key parties
  const kp = intel.keyParties || {};
  const partyParts: string[] = [];
  if (kp.borrower) partyParts.push(`Borrower: ${kp.borrower}`);
  if (kp.contractor) partyParts.push(`Contractor: ${kp.contractor}`);
  if (kp.solicitor) partyParts.push(`Solicitor: ${kp.solicitor}`);
  if (partyParts.length > 0) lines.push(partyParts.join(' | '));

  // Intelligence stats
  const filledCount = countFilledFields(intel);
  lines.push(`Intelligence: ${filledCount}/105 fields filled`);

  // Extracted attributes
  if (intel.extractedAttributes) {
    const attrs = Object.entries(intel.extractedAttributes).slice(0, 10);
    if (attrs.length > 0) {
      const attrStr = attrs.map(([k, v]: [string, any]) => `${k}: ${v}`).join(' | ');
      lines.push(`Custom: ${attrStr}`);
    }
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
