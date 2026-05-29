// src/lib/docgen/rockcapCompany.ts
// RockCap company info for branded document headers/footers. registeredOffice
// and companyNo are optional — omitted from the footer until provided.
export interface CompanyInfo {
  wordmark: string;
  legalName: string;
  website: string;
  email: string;
  phone: string;
  registeredOffice?: string;
  companyNo?: string;
}

export const ROCKCAP_COMPANY: CompanyInfo = {
  wordmark: "RockCap",
  legalName: "RockCap Ltd",
  website: "rockcap.uk",
  email: "alex@rockcap.uk",
  phone: "07815 912 057",
  // registeredOffice: "…",  // fill when available
  // companyNo: "…",
};
