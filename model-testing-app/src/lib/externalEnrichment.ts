/**
 * Mock external database enrichment data
 * Simulates data from external sources like Apollo.io, ZoomInfo, real estate databases, etc.
 */
export function getMockExternalEnrichment(prospectId: string, companyName?: string): Array<{
  id: string;
  type: 'loan' | 'project' | 'announcement' | 'news';
  title: string;
  description: string;
  source: string;
  date: string;
  snippet: string;
  confidence: number;
}> {
  const enrichments: Record<string, Array<{
    id: string;
    type: 'loan' | 'project' | 'announcement' | 'news';
    title: string;
    description: string;
    source: string;
    date: string;
    snippet: string;
    confidence: number;
  }>> = {
    'prospect-1': [
      {
        id: 'ext-1',
        type: 'loan',
        title: 'Recent Commercial Loan Activity',
        description: 'Pacific Coast Developers secured a $45M construction loan for mixed-use development in Q3 2024',
        source: 'Real Estate Finance Database',
        date: '2024-09-15',
        snippet: 'Secured $45M construction financing for downtown San Francisco mixed-use project',
        confidence: 0.92,
      },
      {
        id: 'ext-2',
        type: 'project',
        title: 'New Development Project Announced',
        description: 'Planning 200-unit residential tower with ground-floor retail in downtown SF',
        source: 'City Planning Records',
        date: '2024-10-01',
        snippet: '200-unit residential tower with ground-floor retail planned for downtown San Francisco',
        confidence: 0.88,
      },
      {
        id: 'ext-3',
        type: 'announcement',
        title: 'Company Expansion Plans',
        description: 'Expanding portfolio with focus on East Bay market, seeking additional financing partners',
        source: 'Industry News',
        date: '2024-09-20',
        snippet: 'Expanding portfolio with focus on East Bay market, seeking additional financing partners',
        confidence: 0.85,
      },
    ],
    'prospect-2': [
      {
        id: 'ext-4',
        type: 'loan',
        title: 'Manhattan Acquisition Financing',
        description: 'Metro Property Group seeking $25M acquisition financing for Midtown office building',
        source: 'Commercial Real Estate Database',
        date: '2024-10-10',
        snippet: 'Seeking $25M acquisition financing for 150,000 sq ft office building in Midtown Manhattan',
        confidence: 0.90,
      },
      {
        id: 'ext-5',
        type: 'project',
        title: 'Office Building Renovation',
        description: 'Planning major renovation to attract tech company tenants',
        source: 'Property Records',
        date: '2024-09-25',
        snippet: 'Planning major renovation to attract tech company tenants',
        confidence: 0.87,
      },
    ],
    'prospect-3': [
      {
        id: 'ext-6',
        type: 'loan',
        title: 'Luxury Development Financing',
        description: 'Summit Real Estate Investments secured $15M construction loan for Beverly Hills project',
        source: 'Real Estate Finance Database',
        date: '2024-08-15',
        snippet: 'Secured $15M construction financing for luxury residential development in Beverly Hills',
        confidence: 0.91,
      },
      {
        id: 'ext-7',
        type: 'project',
        title: 'High-End Residential Development',
        description: 'Focusing on luxury single-family homes and condos in Beverly Hills market',
        source: 'City Planning Records',
        date: '2024-09-05',
        snippet: 'Focusing on luxury single-family homes and condos in Beverly Hills market',
        confidence: 0.89,
      },
    ],
  };

  return enrichments[prospectId] || [];
}

