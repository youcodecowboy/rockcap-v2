import { describe, it, expect } from 'vitest';
import { parseVersionInfo, buildVersionCandidateGroups } from './versionDetection';

describe('parseVersionInfo', () => {
  it('strips dates in YYYY-MM-DD format', () => {
    const result = parseVersionInfo('Report 2024-03-01.pdf');
    expect(result.normalized).toBe('report');
    expect(result.extractedDate).toBe('2024-03-01');
  });

  it('strips dates in Month Year format', () => {
    const result = parseVersionInfo('Valuation Report - March 2024.pdf');
    expect(result.normalized).toBe('valuation report');
    expect(result.extractedDate).toBe('March 2024');
  });

  it('strips dates in Mon Year format', () => {
    const result = parseVersionInfo('BGR Valuation - Dec 2022.pdf');
    expect(result.normalized).toBe('bgr valuation');
    expect(result.extractedDate).toBe('Dec 2022');
  });

  it('strips dates in DD.MM.YY format', () => {
    const result = parseVersionInfo('Report 01.03.24.pdf');
    expect(result.normalized).toBe('report');
    expect(result.extractedDate).toBe('01.03.24');
  });

  it('strips dates in DD-MM-YYYY format', () => {
    const result = parseVersionInfo('Report 01-03-2024.pdf');
    expect(result.normalized).toBe('report');
    expect(result.extractedDate).toBe('01-03-2024');
  });

  it('strips compact dates YYYYMMDD', () => {
    const result = parseVersionInfo('Report_20240301.pdf');
    expect(result.normalized).toBe('report');
    expect(result.extractedDate).toBe('20240301');
  });

  it('strips version numbers like V1, V2', () => {
    const result = parseVersionInfo('Report V2.pdf');
    expect(result.normalized).toBe('report');
    expect(result.extractedVersion).toBe('V2');
  });

  it('strips version numbers like V1.0, V2.5', () => {
    const result = parseVersionInfo('Model V1.5.xlsx');
    expect(result.normalized).toBe('model');
    expect(result.extractedVersion).toBe('V1.5');
  });

  it('strips copy suffixes like (1), (2)', () => {
    const result = parseVersionInfo('Document (1).pdf');
    expect(result.normalized).toBe('document');
  });

  it('strips copy suffixes like [1]', () => {
    const result = parseVersionInfo('Document [2].pdf');
    expect(result.normalized).toBe('document');
  });

  it('strips "copy", "final", "revised", "updated", "draft"', () => {
    expect(parseVersionInfo('Report final.pdf').normalized).toBe('report');
    expect(parseVersionInfo('Report revised.pdf').normalized).toBe('report');
    expect(parseVersionInfo('Report copy.pdf').normalized).toBe('report');
    expect(parseVersionInfo('Report updated.pdf').normalized).toBe('report');
    expect(parseVersionInfo('Report draft.pdf').normalized).toBe('report');
  });

  it('strips file extensions', () => {
    const result = parseVersionInfo('Report.xlsx');
    expect(result.normalized).toBe('report');
  });

  it('handles complex real-world filenames', () => {
    const r1 = parseVersionInfo('42 Wolverhampton St Valuation - March 2024.pdf');
    const r2 = parseVersionInfo('42 Wolverhampton St Valuation - June 2024.pdf');
    expect(r1.normalized).toBe(r2.normalized);
  });

  it('handles underscores and hyphens as separators', () => {
    const r1 = parseVersionInfo('BGR_Model_2024-03-01.xlsx');
    const r2 = parseVersionInfo('BGR_Model_2024-03-15.xlsx');
    expect(r1.normalized).toBe(r2.normalized);
  });

  it('returns no date or version when none present', () => {
    const result = parseVersionInfo('Simple Document.pdf');
    expect(result.normalized).toBe('simple document');
    expect(result.extractedDate).toBeUndefined();
    expect(result.extractedVersion).toBeUndefined();
  });
});

describe('buildVersionCandidateGroups', () => {
  const makeItem = (id: string, fileName: string, projectId?: string) => ({
    _id: id as any,
    fileName,
    itemProjectId: projectId,
    status: 'ready_for_review' as const,
  });

  it('groups files with matching normalized names', () => {
    const items = [
      makeItem('1', 'Valuation Report - March 2024.pdf'),
      makeItem('2', 'Valuation Report - June 2024.pdf'),
      makeItem('3', 'Completely Different.pdf'),
    ];
    const groups = buildVersionCandidateGroups(items as any);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });

  it('does not group files in different projects', () => {
    const items = [
      makeItem('1', 'Report V1.pdf', 'projA'),
      makeItem('2', 'Report V2.pdf', 'projB'),
    ];
    const groups = buildVersionCandidateGroups(items as any);
    expect(groups).toHaveLength(0);
  });

  it('groups unassigned items together', () => {
    const items = [
      makeItem('1', 'Report V1.pdf'),
      makeItem('2', 'Report V2.pdf'),
    ];
    const groups = buildVersionCandidateGroups(items as any);
    expect(groups).toHaveLength(1);
  });

  it('returns empty array when no groups have 2+ items', () => {
    const items = [
      makeItem('1', 'Unique File A.pdf'),
      makeItem('2', 'Unique File B.pdf'),
    ];
    const groups = buildVersionCandidateGroups(items as any);
    expect(groups).toHaveLength(0);
  });
});
