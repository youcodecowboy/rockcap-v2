/**
 * Shared Convex function types
 */

import { Id } from '../../convex/_generated/dataModel';

/**
 * Pagination arguments for Convex queries
 */
export interface ConvexPaginationArgs {
  limit?: number;
  offset?: number;
}

/**
 * Common filter arguments
 */
export interface ConvexFilterArgs {
  searchTerm?: string;
  status?: string;
  clientId?: Id<'clients'>;
  projectId?: Id<'projects'>;
}

/**
 * Common Convex mutation result (typically returns an ID)
 * Note: Use specific table names like Id<'clients'> instead of generic types
 */

/**
 * Common Convex query result
 */
export type ConvexQueryResult<T> = T | T[] | null;

