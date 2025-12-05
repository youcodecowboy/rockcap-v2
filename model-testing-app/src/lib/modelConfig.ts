/**
 * Centralized Model Configuration
 * 
 * This file contains all AI model configuration for the extraction pipeline.
 * Using Llama 4 Maverick which supports up to 1M token context window.
 */

export const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';

export const MODELS = {
  // Primary model for all extraction and analysis
  // Llama 4 Maverick: 17B active params, 128 experts, 400B total params
  // Supports 1M token context window
  primary: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
  
  // Future: specialized models for routing
  // router: 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
} as const;

export const MODEL_CONFIG = {
  extraction: {
    model: MODELS.primary,
    temperature: 0.2,
    maxTokens: 65000,  // Large workbooks can be 50k+ tokens
  },
  normalization: {
    model: MODELS.primary,
    temperature: 0.1,
    maxTokens: 65000,  // Must handle full extraction output
  },
  verification: {
    model: MODELS.primary,
    temperature: 0.1,
    maxTokens: 65000,  // Needs normalized data + source markdown
  },
  analysis: {
    model: MODELS.primary,
    temperature: 0.3,
    maxTokens: 8000,   // File summarization - doesn't need as much
  },
  codification: {
    model: MODELS.primary,
    temperature: 0.3,
    maxTokens: 32000,  // For large numbers of items to codify
  },
  chat: {
    model: MODELS.primary,
    temperature: 0.7,
    maxTokens: 4000,   // Chat responses - concise
  },
} as const;

// Note: Maverick 4 supports 1M context window, these limits are well within range

export type ModelConfigKey = keyof typeof MODEL_CONFIG;

