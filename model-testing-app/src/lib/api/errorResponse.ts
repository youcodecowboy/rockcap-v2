import { NextResponse } from 'next/server';

/**
 * Standardized API error response format
 */
export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Standardized API success response format
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * Create a standardized error response
 * 
 * @param error - Error message or Error object
 * @param status - HTTP status code (default: 500)
 * @param code - Optional error code for client-side handling
 * @param details - Optional additional error details (will be filtered in production)
 * @returns NextResponse with standardized error format
 */
export function createErrorResponse(
  error: string | Error,
  status: number = 500,
  code?: string,
  details?: Record<string, unknown>
): NextResponse<ApiErrorResponse> {
  const errorMessage = error instanceof Error ? error.message : error;
  
  const response: ApiErrorResponse = {
    error: errorMessage,
  };
  
  if (code) {
    response.code = code;
  }
  
  // Only include details in development (never expose stack traces in production)
  if (details && process.env.NODE_ENV === 'development') {
    response.details = details;
  }
  
  return NextResponse.json(response, { status });
}

/**
 * Create a standardized success response
 * 
 * @param data - Response data
 * @param status - HTTP status code (default: 200)
 * @returns NextResponse with standardized success format
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({
    success: true,
    data,
  }, { status });
}

/**
 * Common error response creators for specific scenarios
 */
export const ErrorResponses = {
  /**
   * Unauthenticated (401)
   */
  unauthenticated: (message: string = 'Unauthenticated') =>
    createErrorResponse(message, 401, 'UNAUTHENTICATED'),
  
  /**
   * Unauthorized (403)
   */
  unauthorized: (message: string = 'Unauthorized') =>
    createErrorResponse(message, 403, 'UNAUTHORIZED'),
  
  /**
   * Bad Request (400)
   */
  badRequest: (message: string, details?: Record<string, unknown>) =>
    createErrorResponse(message, 400, 'BAD_REQUEST', details),
  
  /**
   * Not Found (404)
   */
  notFound: (message: string = 'Resource not found') =>
    createErrorResponse(message, 404, 'NOT_FOUND'),
  
  /**
   * Internal Server Error (500)
   */
  internalError: (error: string | Error, details?: Record<string, unknown>) =>
    createErrorResponse(error, 500, 'INTERNAL_ERROR', details),
  
  /**
   * Validation Error (422)
   */
  validationError: (message: string, details?: Record<string, unknown>) =>
    createErrorResponse(message, 422, 'VALIDATION_ERROR', details),
};

