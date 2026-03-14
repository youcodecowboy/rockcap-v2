import { describe, it, expect } from 'vitest';
import {
  getConfidenceColor,
  getConfidenceLabel,
  getRelativeTimeString,
  detectConflicts,
  getCategoryIcon,
  getCategoryForField,
} from '@/components/intelligence/intelligenceUtils';

describe('getConfidenceColor', () => {
  it('returns green for high confidence (>= 0.85)', () => {
    expect(getConfidenceColor(0.95)).toBe('green');
    expect(getConfidenceColor(0.85)).toBe('green');
  });
  it('returns amber for medium confidence (0.60 - 0.84)', () => {
    expect(getConfidenceColor(0.72)).toBe('amber');
    expect(getConfidenceColor(0.60)).toBe('amber');
  });
  it('returns red for low confidence (< 0.60)', () => {
    expect(getConfidenceColor(0.45)).toBe('red');
    expect(getConfidenceColor(0)).toBe('red');
  });
});

describe('getConfidenceLabel', () => {
  it('formats confidence as percentage string', () => {
    expect(getConfidenceLabel(0.95)).toBe('95%');
    expect(getConfidenceLabel(0.721)).toBe('72%');
    expect(getConfidenceLabel(1)).toBe('100%');
  });
});

describe('getCategoryIcon', () => {
  it('returns correct icons for known categories', () => {
    expect(getCategoryIcon('Contact Info')).toBeTruthy();
    expect(getCategoryIcon('Loan Terms')).toBeTruthy();
    expect(getCategoryIcon('Other')).toBeTruthy();
  });
});

describe('getCategoryForField', () => {
  it('maps canonical field keys to categories', () => {
    expect(getCategoryForField('kyc.idVerificationStatus')).toBe('KYC / Due Diligence');
    expect(getCategoryForField('loanTerms.interestRate')).toBe('Loan Terms');
    expect(getCategoryForField('exit.strategy')).toBe('Sales / Exit');
    expect(getCategoryForField('contact.email')).toBe('Contact Info');
  });
});

describe('detectConflicts', () => {
  it('returns empty array when no conflicts', () => {
    const trail = [
      { fieldPath: 'contact.email', value: 'a@b.com', confidence: 0.95 },
    ];
    expect(detectConflicts(trail, 'contact.email')).toEqual([]);
  });
  it('returns conflicting entries when values differ', () => {
    const trail = [
      { fieldPath: 'contact.email', value: 'a@b.com', confidence: 0.95 },
      { fieldPath: 'contact.email', value: 'x@y.com', confidence: 0.80 },
    ];
    const conflicts = detectConflicts(trail, 'contact.email');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].value).toBe('x@y.com');
  });
});
