import { Client, Project, EnrichmentSuggestion, ProspectingContext } from '@/types';
import { addClient, addProject, addEnrichmentSuggestion } from './clientStorage';
import { saveProspectingContext } from './prospectingStorage';
import { FileMetadata, AnalysisResult } from '@/types';

/**
 * Initialize demo data for showcasing the prospecting tool
 * Creates clients with documents and enrichment data, links prospects to them
 * Returns the client IDs created for linking to prospects
 */
export function initializeDemoData(): { client1Id: string; client2Id: string; client3Id: string } | null {
  if (typeof window === 'undefined') return null;

  // Check if demo data already initialized
  const demoInitialized = localStorage.getItem('demo_data_initialized');
  if (demoInitialized === 'true') {
    // Return existing client IDs from storage
    const clients = require('./clientStorage').getClients();
    const client1 = clients.find((c: any) => c.name === 'Pacific Coast Developers');
    const client2 = clients.find((c: any) => c.name === 'Metro Property Group');
    const client3 = clients.find((c: any) => c.name === 'Summit Real Estate Investments');
    return {
      client1Id: client1?.id || '',
      client2Id: client2?.id || '',
      client3Id: client3?.id || '',
    };
  }

  try {
    // Check if clients already exist before creating
    const { getClients } = require('./clientStorage');
    const existingClients = getClients();
    
    let client1 = existingClients.find((c: any) => c.name === 'Pacific Coast Developers');
    let client2 = existingClients.find((c: any) => c.name === 'Metro Property Group');
    let client3 = existingClients.find((c: any) => c.name === 'Summit Real Estate Investments');
    
    // Create demo client 1: Pacific Coast Developers
    if (!client1) {
      client1 = addClient('Pacific Coast Developers', {
        companyName: 'Pacific Coast Developers',
        email: 'info@pacificcoastdev.com',
        phone: '+1-415-555-0123',
        lifecycleStage: 'perspective',
        tags: ['high-value', 'multifamily'],
      });
    }

    const project1 = addProject(client1.id, 'Downtown San Francisco Mixed-Use Development');
    
    // Add enrichment suggestions for client1 (only if not already added)
    const { getEnrichmentSuggestions } = require('./clientStorage');
    const existingSuggestions1 = getEnrichmentSuggestions(client1.id);
    if (existingSuggestions1.length === 0) {
      addEnrichmentSuggestion(client1.id, {
        type: 'email',
        field: 'email',
        value: 'mchen@pacificcoastdev.com',
        source: 'Email signature from proposal',
        documentId: 'demo-doc-1',
        confidence: 0.95,
      });

      addEnrichmentSuggestion(client1.id, {
        type: 'phone',
        field: 'phone',
        value: '+1-415-555-0123',
        source: 'Contact section in proposal',
        documentId: 'demo-doc-1',
        confidence: 0.9,
      });

      addEnrichmentSuggestion(client1.id, {
        type: 'contactName',
        field: 'contactName',
        value: 'Michael Chen - CEO',
        source: 'Document header',
        documentId: 'demo-doc-1',
        confidence: 0.85,
      });
    }

    // Create prospecting context for client1 (only if not already exists)
    const { getProspectingContextByClient } = require('./prospectingStorage');
    const existingContexts1 = getProspectingContextByClient(client1.id);
    if (existingContexts1.length === 0) {
      const prospectingContext1: ProspectingContext = {
        documentId: 'demo-doc-1',
        clientId: client1.id,
        projectId: project1.id,
        extractedAt: new Date().toISOString(),
        keyPoints: [
          'Planning a $50M mixed-use development in downtown San Francisco',
          'Seeking financing for 200-unit residential tower with ground-floor retail',
          'Project timeline: 18-24 months construction phase',
          'Strong track record with 5 completed projects in the Bay Area',
        ],
        painPoints: [
          'Traditional lenders have been slow to approve financing',
          'Need flexible terms due to market volatility',
          'Concerned about interest rate increases affecting project viability',
        ],
        opportunities: [
          'Open to alternative financing structures',
          'Interested in bridge financing options',
          'May need additional capital for Phase 2 expansion',
        ],
        decisionMakers: [
          {
            name: 'Michael Chen',
            role: 'CEO',
            context: 'Primary decision maker, mentioned in all communications',
          },
          {
            name: 'Sarah Martinez',
            role: 'CFO',
            context: 'Handles all financing discussions',
          },
        ],
        businessContext: {
          industry: 'Real Estate Development',
          companySize: 'Mid-size',
          growthIndicators: ['Expanding portfolio', 'Multiple projects in pipeline'],
          challenges: ['Financing constraints', 'Market volatility'],
          goals: ['Complete downtown SF project', 'Expand to East Bay market'],
        },
        financialContext: {
          budgetMentioned: true,
          budgetRange: '$45M - $55M',
          investmentLevel: 'High',
          timeline: 'Q2 2025',
        },
        relationshipContext: {
          currentStage: 'prospect',
          relationshipStrength: 'developing',
          lastInteraction: 'Initial proposal sent 2 weeks ago',
          sentiment: 'positive',
        },
        templateSnippets: {
          opening: 'Based on your downtown San Francisco development project...',
          valueProposition: 'We specialize in flexible financing for mixed-use developments, with faster approval times than traditional lenders',
          callToAction: 'Let\'s schedule a call to discuss how we can help accelerate your project timeline',
        },
        confidence: 0.88,
        tokensUsed: 1200,
      };

      saveProspectingContext(prospectingContext1);
    }

    // Create demo client 2: Metro Property Group
    if (!client2) {
      client2 = addClient('Metro Property Group', {
        companyName: 'Metro Property Group',
        email: 'info@metropg.com',
        phone: '+1-212-555-0456',
        lifecycleStage: 'perspective',
        tags: ['commercial', 'high-value'],
      });
    }

    const project2 = addProject(client2.id, 'Manhattan Office Building Acquisition');

    const existingSuggestions2 = getEnrichmentSuggestions(client2.id);
    if (existingSuggestions2.length === 0) {
      addEnrichmentSuggestion(client2.id, {
        type: 'email',
        field: 'email',
        value: 'sjohnson@metropg.com',
        source: 'Email signature',
        documentId: 'demo-doc-2',
        confidence: 0.92,
      });

      addEnrichmentSuggestion(client2.id, {
        type: 'contactName',
        field: 'contactName',
        value: 'Sarah Johnson - Managing Director',
        source: 'Email header',
        documentId: 'demo-doc-2',
        confidence: 0.88,
      });
    }

    const existingContexts2 = getProspectingContextByClient(client2.id);
    if (existingContexts2.length === 0) {
      const prospectingContext2: ProspectingContext = {
        documentId: 'demo-doc-2',
        clientId: client2.id,
        projectId: project2.id,
        extractedAt: new Date().toISOString(),
        keyPoints: [
          'Acquiring a 150,000 sq ft office building in Midtown Manhattan',
          'Planning to renovate and lease to tech companies',
          'Seeking $25M acquisition financing',
        ],
        painPoints: [
          'Current lender terms are too restrictive',
          'Need faster closing timeline',
        ],
        opportunities: [
          'Multiple properties in acquisition pipeline',
          'Open to relationship-based financing',
        ],
        decisionMakers: [
          {
            name: 'Sarah Johnson',
            role: 'Managing Director',
            context: 'Leads all acquisition and financing decisions',
          },
        ],
        businessContext: {
          industry: 'Property Management',
          companySize: 'Mid-size',
          growthIndicators: ['Active acquisition strategy', 'Portfolio expansion'],
          challenges: ['Financing terms', 'Market timing'],
          goals: ['Complete Manhattan acquisition', 'Expand portfolio'],
        },
        financialContext: {
          budgetMentioned: true,
          budgetRange: '$20M - $30M',
          investmentLevel: 'High',
          timeline: 'Q1 2025',
        },
        relationshipContext: {
          currentStage: 'prospect',
          relationshipStrength: 'new',
          lastInteraction: 'Initial inquiry 1 week ago',
          sentiment: 'neutral',
        },
        templateSnippets: {
          opening: 'Regarding your Manhattan office building acquisition...',
          valueProposition: 'We offer competitive terms and faster closing timelines for commercial property acquisitions',
          callToAction: 'Would you be available for a brief call this week to discuss your financing needs?',
        },
        confidence: 0.85,
        tokensUsed: 1100,
      };

      saveProspectingContext(prospectingContext2);
    }

    // Create demo client 3: Summit Real Estate Investments
    if (!client3) {
      client3 = addClient('Summit Real Estate Investments', {
        companyName: 'Summit Real Estate Investments',
        email: 'info@summitrei.com',
        phone: '+1-310-555-0789',
        lifecycleStage: 'perspective',
        tags: ['residential', 'warm-lead'],
      });
    }

    const project3 = addProject(client3.id, 'Beverly Hills Luxury Residential Development');

    const existingSuggestions3 = getEnrichmentSuggestions(client3.id);
    if (existingSuggestions3.length === 0) {
      addEnrichmentSuggestion(client3.id, {
        type: 'email',
        field: 'email',
        value: 'drodriguez@summitrei.com',
        source: 'Email signature',
        documentId: 'demo-doc-3',
        confidence: 0.94,
      });

      addEnrichmentSuggestion(client3.id, {
        type: 'website',
        field: 'website',
        value: 'https://www.summitrei.com',
        source: 'Email signature',
        documentId: 'demo-doc-3',
        confidence: 0.98,
      });
    }

    const existingContexts3 = getProspectingContextByClient(client3.id);
    if (existingContexts3.length === 0) {
      const prospectingContext3: ProspectingContext = {
        documentId: 'demo-doc-3',
        clientId: client3.id,
        projectId: project3.id,
        extractedAt: new Date().toISOString(),
        keyPoints: [
          'Developing luxury residential properties in Beverly Hills',
          'Focus on high-end single-family homes and condos',
          'Seeking $15M construction financing',
        ],
        painPoints: [
          'Need flexible draw schedules',
          'Want to avoid prepayment penalties',
        ],
        opportunities: [
          'Multiple projects in planning stages',
          'Interested in long-term financing relationship',
        ],
        decisionMakers: [
          {
            name: 'David Rodriguez',
            role: 'Principal',
            context: 'Founder and primary decision maker',
          },
        ],
        businessContext: {
          industry: 'Real Estate Investment',
          companySize: 'Small',
          growthIndicators: ['Expanding into luxury market', 'Strong sales pipeline'],
          challenges: ['Financing flexibility', 'Market timing'],
          goals: ['Complete Beverly Hills project', 'Launch 2 additional projects'],
        },
        financialContext: {
          budgetMentioned: true,
          budgetRange: '$12M - $18M',
          investmentLevel: 'Medium-High',
          timeline: 'Q3 2025',
        },
        relationshipContext: {
          currentStage: 'prospect',
          relationshipStrength: 'developing',
          lastInteraction: 'Responded positively to initial outreach',
          sentiment: 'positive',
        },
        templateSnippets: {
          opening: 'Following up on your Beverly Hills luxury development...',
          valueProposition: 'We specialize in flexible construction financing with customizable draw schedules',
          callToAction: 'I\'d love to show you how we can structure financing to match your project timeline',
        },
        confidence: 0.87,
        tokensUsed: 1150,
      };

      saveProspectingContext(prospectingContext3);
    }

    // Mark demo data as initialized
    localStorage.setItem('demo_data_initialized', 'true');

    console.log('[Demo Data] Initialized demo clients with enrichment data');
    
    return {
      client1Id: client1.id,
      client2Id: client2.id,
      client3Id: client3.id,
    };
  } catch (error) {
    console.error('[Demo Data] Error initializing demo data:', error);
    return null;
  }
}

