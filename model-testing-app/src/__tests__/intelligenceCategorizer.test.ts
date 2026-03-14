// src/__tests__/intelligenceCategorizer.test.ts
import { describe, it, expect } from 'vitest';
import { categorizeAttribute } from '@/lib/intelligenceCategorizer';

describe('categorizeAttribute', () => {
  it('categorizes loan-related labels as Loan Terms', () => {
    expect(categorizeAttribute('Interest Rate')).toBe('Loan Terms');
    expect(categorizeAttribute('LTV Ratio')).toBe('Loan Terms');
    expect(categorizeAttribute('Facility Amount')).toBe('Loan Terms');
    expect(categorizeAttribute('Loan Covenant Details')).toBe('Loan Terms');
  });

  it('categorizes planning-related labels as Planning', () => {
    expect(categorizeAttribute('Planning Reference Number')).toBe('Planning');
    expect(categorizeAttribute('S106 Agreement')).toBe('Planning');
    expect(categorizeAttribute('Permitted Development Rights')).toBe('Planning');
  });

  it('categorizes valuation-related labels as Valuation', () => {
    expect(categorizeAttribute('GDV Estimate')).toBe('Valuation');
    expect(categorizeAttribute('Market Value Assessment')).toBe('Valuation');
    expect(categorizeAttribute('Comparable Sales Evidence')).toBe('Valuation');
  });

  it('categorizes construction-related labels as Construction', () => {
    expect(categorizeAttribute('Build Programme')).toBe('Construction');
    expect(categorizeAttribute('Contractor Name')).toBe('Construction');
    expect(categorizeAttribute('Retention Percentage')).toBe('Construction');
  });

  it('categorizes title-related labels as Legal / Title', () => {
    expect(categorizeAttribute('Title Number')).toBe('Legal / Title');
    expect(categorizeAttribute('Freehold/Leasehold')).toBe('Legal / Title');
    expect(categorizeAttribute('Solicitor Firm Name')).toBe('Legal / Title');
  });

  it('categorizes insurance-related labels as Insurance', () => {
    expect(categorizeAttribute('Building Works Policy')).toBe('Insurance');
    expect(categorizeAttribute('Professional Indemnity Cover')).toBe('Insurance');
  });

  it('categorizes exit-related labels as Sales / Exit', () => {
    expect(categorizeAttribute('Exit Strategy')).toBe('Sales / Exit');
    expect(categorizeAttribute('Units Reserved')).toBe('Sales / Exit');
  });

  it('categorizes KYC-related labels as KYC / Due Diligence', () => {
    expect(categorizeAttribute('AML Check Status')).toBe('KYC / Due Diligence');
    expect(categorizeAttribute('PEP Screening Result')).toBe('KYC / Due Diligence');
    expect(categorizeAttribute('Sanctions Check')).toBe('KYC / Due Diligence');
  });

  it('categorizes contact-related labels as Contact Info', () => {
    expect(categorizeAttribute('Email Address')).toBe('Contact Info');
    expect(categorizeAttribute('Phone Number')).toBe('Contact Info');
  });

  it('categorizes company-related labels as Company', () => {
    expect(categorizeAttribute('Company Registration Number')).toBe('Company');
    expect(categorizeAttribute('Director Names')).toBe('Company');
  });

  it('categorizes financial-related labels as Financial', () => {
    expect(categorizeAttribute('Net Worth Statement')).toBe('Financial');
    expect(categorizeAttribute('Annual Income')).toBe('Financial');
  });

  it('falls back to Other for unrecognized labels', () => {
    expect(categorizeAttribute('Random Miscellaneous Data')).toBe('Other');
    expect(categorizeAttribute('Some Unknown Field')).toBe('Other');
  });
});
