import { describe, it, expect } from 'vitest';
import {
  parseStandardName,
  parseDocumentName,
} from '@/lib/documentNaming';

// V1.2 file-naming-standard parser
// (docs/classification/RockCap_FileNamingStandard_RC_INTERNAL_V1.2_20260708.md).
// The positive cases below are the standard's own §3 examples, verbatim.

describe('parseStandardName — §3 examples verbatim', () => {
  it('RockCap-authored INTERNAL: LintonLane_LenderBrief_RC_INTERNAL_V1.3_20260608.docx', () => {
    expect(
      parseStandardName('LintonLane_LenderBrief_RC_INTERNAL_V1.3_20260608.docx'),
    ).toEqual({
      scheme: 'LintonLane',
      docType: 'LenderBrief',
      origin: { role: 'RC' },
      status: 'INTERNAL',
      version: 'V1.3',
      filingDate: '20260608',
      confidence: 'full',
    });
  });

  it('RockCap-authored EXTERNAL: LintonLane_LenderBrief_RC_EXTERNAL_V1.4_20260608.docx', () => {
    expect(
      parseStandardName('LintonLane_LenderBrief_RC_EXTERNAL_V1.4_20260608.docx'),
    ).toEqual({
      scheme: 'LintonLane',
      docType: 'LenderBrief',
      origin: { role: 'RC' },
      status: 'EXTERNAL',
      version: 'V1.4',
      filingDate: '20260608',
      confidence: 'full',
    });
  });

  it('client-supplied working doc (filing date only): LintonLane_DeveloperBuildCosts_CLIENT-WSD_20260608.xlsx', () => {
    expect(
      parseStandardName('LintonLane_DeveloperBuildCosts_CLIENT-WSD_20260608.xlsx'),
    ).toEqual({
      scheme: 'LintonLane',
      docType: 'DeveloperBuildCosts',
      origin: { role: 'CLIENT', party: 'WSD' },
      filingDate: '20260608',
      confidence: 'full',
    });
  });

  it('lender terms first issue: LintonLane_Terms_LENDER-Avamore_20260612.pdf', () => {
    expect(
      parseStandardName('LintonLane_Terms_LENDER-Avamore_20260612.pdf'),
    ).toEqual({
      scheme: 'LintonLane',
      docType: 'Terms',
      origin: { role: 'LENDER', party: 'Avamore' },
      filingDate: '20260612',
      confidence: 'full',
    });
  });

  it('terms reissue R2: LintonLane_Terms_LENDER-Avamore_R2_20260612.pdf', () => {
    expect(
      parseStandardName('LintonLane_Terms_LENDER-Avamore_R2_20260612.pdf'),
    ).toEqual({
      scheme: 'LintonLane',
      docType: 'Terms',
      origin: { role: 'LENDER', party: 'Avamore' },
      reissue: 2,
      filingDate: '20260612',
      confidence: 'full',
    });
  });

  it('dual-date planning permission: LintonLane_PlanningPermission_20240115_CLIENT-WSD_20260608.pdf', () => {
    expect(
      parseStandardName(
        'LintonLane_PlanningPermission_20240115_CLIENT-WSD_20260608.pdf',
      ),
    ).toEqual({
      scheme: 'LintonLane',
      docType: 'PlanningPermission',
      documentDate: '20240115',
      origin: { role: 'CLIENT', party: 'WSD' },
      filingDate: '20260608',
      confidence: 'full',
    });
  });

  it('dual-date draft valuation: LintonLane_Valuation_20260620_VALUER-Savills_DRAFT_V1.0_20260622.pdf', () => {
    expect(
      parseStandardName(
        'LintonLane_Valuation_20260620_VALUER-Savills_DRAFT_V1.0_20260622.pdf',
      ),
    ).toEqual({
      scheme: 'LintonLane',
      docType: 'Valuation',
      documentDate: '20260620',
      origin: { role: 'VALUER', party: 'Savills' },
      status: 'DRAFT',
      version: 'V1.0',
      filingDate: '20260622',
      confidence: 'full',
    });
  });

  it('dual-date final valuation: LintonLane_Valuation_20260625_VALUER-Savills_FINAL_V2.0_20260626.pdf', () => {
    expect(
      parseStandardName(
        'LintonLane_Valuation_20260625_VALUER-Savills_FINAL_V2.0_20260626.pdf',
      ),
    ).toEqual({
      scheme: 'LintonLane',
      docType: 'Valuation',
      documentDate: '20260625',
      origin: { role: 'VALUER', party: 'Savills' },
      status: 'FINAL',
      version: 'V2.0',
      filingDate: '20260626',
      confidence: 'full',
    });
  });

  it('numbered interim monitoring report, dual date: LintonLane_InterimMonitoringReport-No2_20260901_QS-Stace_20260903.pdf', () => {
    expect(
      parseStandardName(
        'LintonLane_InterimMonitoringReport-No2_20260901_QS-Stace_20260903.pdf',
      ),
    ).toEqual({
      scheme: 'LintonLane',
      docType: 'InterimMonitoringReport',
      docTypeQualifier: 'No2',
      documentDate: '20260901',
      origin: { role: 'QS', party: 'Stace' },
      filingDate: '20260903',
      confidence: 'full',
    });
  });

  it('executed facility agreement, dual date: LintonLane_FacilityAgreement_20260704_LENDER-Avamore_EXECUTED_20260705.pdf', () => {
    expect(
      parseStandardName(
        'LintonLane_FacilityAgreement_20260704_LENDER-Avamore_EXECUTED_20260705.pdf',
      ),
    ).toEqual({
      scheme: 'LintonLane',
      docType: 'FacilityAgreement',
      documentDate: '20260704',
      origin: { role: 'LENDER', party: 'Avamore' },
      status: 'EXECUTED',
      filingDate: '20260705',
      confidence: 'full',
    });
  });

  it('dual-date A&L statement: LintonLane_AssetsLiabilitiesStatement_20260601_CLIENT-WSD_20260608.pdf', () => {
    expect(
      parseStandardName(
        'LintonLane_AssetsLiabilitiesStatement_20260601_CLIENT-WSD_20260608.pdf',
      ),
    ).toEqual({
      scheme: 'LintonLane',
      docType: 'AssetsLiabilitiesStatement',
      documentDate: '20260601',
      origin: { role: 'CLIENT', party: 'WSD' },
      filingDate: '20260608',
      confidence: 'full',
    });
  });
});

describe('parseStandardName — aliases', () => {
  it('resolves the DocType alias LenderNote → LenderBrief', () => {
    const parsed = parseStandardName(
      'LintonLane_LenderNote_RC_INTERNAL_V1.0_20260608.docx',
    );
    expect(parsed?.docType).toBe('LenderBrief');
    expect(parsed?.confidence).toBe('full');
  });

  it('resolves the lender alias F365 → Funding365 on the origin party', () => {
    const parsed = parseStandardName(
      'LintonLane_Terms_LENDER-F365_20260612.pdf',
    );
    expect(parsed?.origin).toEqual({ role: 'LENDER', party: 'Funding365' });
    expect(parsed?.confidence).toBe('full');
  });
});

describe('parseStandardName — partial parses', () => {
  it('DocType outside the enum → partial, other fields still parse', () => {
    const parsed = parseStandardName(
      'DarkMills_CreditChecklist_RC_INTERNAL_V1.0_20260707.pdf',
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.confidence).toBe('partial');
    expect(parsed?.scheme).toBe('DarkMills');
    expect(parsed?.docType).toBe('CreditChecklist');
    expect(parsed?.status).toBe('INTERNAL');
    expect(parsed?.version).toBe('V1.0');
    expect(parsed?.filingDate).toBe('20260707');
  });

  it('dual-date DocType MISSING its document date → partial', () => {
    const parsed = parseStandardName(
      'LintonLane_Valuation_VALUER-Savills_V1.0_20260622.pdf',
    );
    expect(parsed?.confidence).toBe('partial');
    expect(parsed?.documentDate).toBeUndefined();
    expect(parsed?.origin).toEqual({ role: 'VALUER', party: 'Savills' });
  });

  it('document date on a NON-dual-date DocType → partial, date not trusted', () => {
    const parsed = parseStandardName(
      'LintonLane_Terms_20260610_LENDER-Avamore_20260612.pdf',
    );
    expect(parsed?.confidence).toBe('partial');
    expect(parsed?.documentDate).toBeUndefined();
  });

  it('missing origin → partial', () => {
    const parsed = parseStandardName(
      'LintonLane_LenderBrief_INTERNAL_V1.3_20260608.docx',
    );
    expect(parsed?.confidence).toBe('partial');
    expect(parsed?.origin).toBeUndefined();
  });

  it('unrecognised legacy initials token (RS) → partial', () => {
    const parsed = parseStandardName(
      'DarkMills_LenderBrief_RS_INTERNAL_V1.0_20260707.docx',
    );
    expect(parsed?.confidence).toBe('partial');
    expect(parsed?.origin).toBeUndefined();
  });
});

describe('parseStandardName — non-matches return null', () => {
  it('freetext space-separated name', () => {
    expect(parseStandardName('Savills Valuation Report June 2026.pdf')).toBeNull();
  });

  it('no trailing filing date', () => {
    expect(
      parseStandardName('LintonLane_LenderBrief_RC_INTERNAL_V1.3.docx'),
    ).toBeNull();
  });

  it('invalid trailing date (month 13)', () => {
    expect(
      parseStandardName('LintonLane_LenderBrief_RC_20261308.docx'),
    ).toBeNull();
  });

  it('too few tokens', () => {
    expect(parseStandardName('IMG_20260101.jpg')).toBeNull();
  });

  it('empty input', () => {
    expect(parseStandardName('')).toBeNull();
  });
});

describe('parseDocumentName legacy contract untouched', () => {
  it('still parses the underscore convention', () => {
    const parsed = parseDocumentName(
      'DarkMills_CreditChecklist_RS_INTERNAL_V1.0_20260707',
    );
    expect(parsed?.format).toBe('underscore');
    expect(parsed?.project).toBe('DarkMills');
    expect(parsed?.type).toBe('CreditChecklist');
  });

  it('still returns null for non-convention names', () => {
    expect(parseDocumentName('Savills Valuation Report.pdf')).toBeNull();
  });
});
