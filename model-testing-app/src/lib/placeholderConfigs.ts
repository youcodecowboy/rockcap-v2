import { PlaceholderMapping, ArrayPlaceholderMapping, PlaceholderConfig } from './placeholderMapper';

/**
 * Standardized placeholder definitions mapped to normalized database fields
 * 
 * Priority Guidelines:
 * - Specific field names (e.g., <professional.fees.amount>) → priority 8-10
 * - Generic placeholders (e.g., <expense.amount>) → priority 5-7
 * - Fallback mappings → priority 1-4
 */
export const STANDARD_PLACEHOLDERS: PlaceholderConfig = {
  // Property info - specific mappings, high priority
  '<property.name>': { 
    source: 'summary.property_name', 
    type: 'string', 
    priority: 10 
  },
  '<property.address>': { 
    source: 'summary.property_address', 
    type: 'string', 
    priority: 10 
  },
  
  // Financial - specific mappings, high priority
  '<interest.rate>': { 
    source: 'financing.interestRate', 
    type: 'number', 
    format: 'percentage', 
    priority: 10 
  },
  '<interest.percentage>': { 
    source: 'financing.interestPercentage', 
    type: 'number', 
    format: 'percentage', 
    priority: 10 
  },
  '<loan.amount>': { 
    source: 'financing.loanAmount', 
    type: 'number', 
    format: 'currency', 
    priority: 10 
  },
  '<total.cost>': { 
    source: 'costsTotal.amount', 
    type: 'number', 
    format: 'currency', 
    priority: 10 
  },
  '<total.revenue>': { 
    source: 'revenue.totalSales', 
    type: 'number', 
    format: 'currency', 
    priority: 10 
  },
  '<profit.total>': { 
    source: 'profit.total', 
    type: 'number', 
    format: 'currency', 
    priority: 10 
  },
  '<profit.percentage>': { 
    source: 'profit.percentage', 
    type: 'number', 
    format: 'percentage', 
    priority: 10 
  },
  
  // Multiple mappings with priorities - array format for ambiguous matches
  '<expense.amount>': [
    { 
      source: 'costCategories.professionalFees.subtotal', 
      type: 'number', 
      format: 'currency', 
      priority: 8 
    },  // Specific - high priority
    { 
      source: 'costCategories.netConstructionCosts.subtotal', 
      type: 'number', 
      format: 'currency', 
      priority: 8 
    },  // Same priority, second choice
    { 
      source: 'costs[].amount', 
      type: 'number', 
      format: 'currency', 
      priority: 5 
    }   // Generic fallback
  ],
  
  // Array placeholders with priorities
  '<costs>': {
    source: 'costs',
    priority: 5,  // Generic - lower priority
    startMarker: '<costs.start>',
    endMarker: '<costs.end>',
    rowTemplate: '<costs.type> | <costs.amount> | <costs.category>',
    fields: {
      '<costs.type>': 'type',
      '<costs.amount>': 'amount',
      '<costs.category>': 'category',
    },
  },
  
  '<professional.fees>': {
    source: 'costCategories.professionalFees.items',
    priority: 8,  // More specific - higher priority
    startMarker: '<professional.fees.start>',
    endMarker: '<professional.fees.end>',
    rowTemplate: '<professional.fees.type> | <professional.fees.amount>',
    fields: {
      '<professional.fees.type>': 'type',
      '<professional.fees.amount>': 'amount',
    },
  },
  
  '<site.costs>': {
    source: 'costCategories.siteCosts.items',
    priority: 8,
    startMarker: '<site.costs.start>',
    endMarker: '<site.costs.end>',
    rowTemplate: '<site.costs.type> | <site.costs.amount>',
    fields: {
      '<site.costs.type>': 'type',
      '<site.costs.amount>': 'amount',
    },
  },
  
  '<construction.costs>': {
    source: 'costCategories.netConstructionCosts.items',
    priority: 8,
    startMarker: '<construction.costs.start>',
    endMarker: '<construction.costs.end>',
    rowTemplate: '<construction.costs.type> | <construction.costs.amount>',
    fields: {
      '<construction.costs.type>': 'type',
      '<construction.costs.amount>': 'amount',
    },
  },
  
  '<disposal.fees>': {
    source: 'costCategories.disposalFees.items',
    priority: 8,
    startMarker: '<disposal.fees.start>',
    endMarker: '<disposal.fees.end>',
    rowTemplate: '<disposal.fees.type> | <disposal.fees.amount>',
    fields: {
      '<disposal.fees.type>': 'type',
      '<disposal.fees.amount>': 'amount',
    },
  },
  
  '<financing.legal.fees>': {
    source: 'costCategories.financingLegalFees.items',
    priority: 8,
    startMarker: '<financing.legal.fees.start>',
    endMarker: '<financing.legal.fees.end>',
    rowTemplate: '<financing.legal.fees.type> | <financing.legal.fees.amount>',
    fields: {
      '<financing.legal.fees.type>': 'type',
      '<financing.legal.fees.amount>': 'amount',
    },
  },
  
  // Category subtotals
  '<site.costs.subtotal>': {
    source: 'costCategories.siteCosts.subtotal',
    type: 'number',
    format: 'currency',
    priority: 9,
  },
  
  '<construction.costs.subtotal>': {
    source: 'costCategories.netConstructionCosts.subtotal',
    type: 'number',
    format: 'currency',
    priority: 9,
  },
  
  '<professional.fees.subtotal>': {
    source: 'costCategories.professionalFees.subtotal',
    type: 'number',
    format: 'currency',
    priority: 9,
  },
  
  '<disposal.fees.subtotal>': {
    source: 'costCategories.disposalFees.subtotal',
    type: 'number',
    format: 'currency',
    priority: 9,
  },
  
  '<financing.legal.fees.subtotal>': {
    source: 'costCategories.financingLegalFees.subtotal',
    type: 'number',
    format: 'currency',
    priority: 9,
  },
  
  '<plots>': {
    source: 'plots',
    priority: 7,
    startMarker: '<plots.start>',
    endMarker: '<plots.end>',
    rowTemplate: '<plots.name> | <plots.cost> | <plots.squareFeet>',
    fields: {
      '<plots.name>': 'name',
      '<plots.cost>': 'cost',
      '<plots.squareFeet>': 'squareFeet',
    },
  },
  
  '<units.count>': {
    source: 'units.count',
    type: 'number',
    priority: 9,
  },
  
  '<units.type>': {
    source: 'units.type',
    type: 'string',
    priority: 9,
  },
};

/**
 * Appraisal model-specific placeholder configurations
 */
export const APPRAISAL_MODEL_PLACEHOLDERS: PlaceholderConfig = {
  ...STANDARD_PLACEHOLDERS,
  // Add appraisal-specific placeholders here
  '<appraisal.value>': {
    source: 'summary.appraisal_value',
    type: 'number',
    format: 'currency',
    priority: 10,
  },
};

/**
 * Operating model-specific placeholder configurations
 */
export const OPERATING_MODEL_PLACEHOLDERS: PlaceholderConfig = {
  ...STANDARD_PLACEHOLDERS,
  // Add operating-specific placeholders here
  '<operating.expenses>': {
    source: 'operating.expenses',
    type: 'number',
    format: 'currency',
    priority: 8,
  },
};

/**
 * Get placeholder config for a specific model type
 */
export function getPlaceholderConfig(modelType?: string): PlaceholderConfig {
  switch (modelType) {
    case 'appraisal':
      return APPRAISAL_MODEL_PLACEHOLDERS;
    case 'operating':
      return OPERATING_MODEL_PLACEHOLDERS;
    default:
      return STANDARD_PLACEHOLDERS;
  }
}

