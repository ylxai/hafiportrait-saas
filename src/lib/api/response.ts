import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma';

// Error codes for consistent error handling
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
} as const;

type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

interface ErrorResponse {
  success: false;
  error: string; // Keep backward compatibility
  errorCode?: ErrorCode;
  details?: unknown;
  timestamp?: string;
}

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function errorResponse(
  message: string, 
  status = 400, 
  code?: ErrorCode,
  details?: unknown
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    { 
      success: false, 
      error: message, // Keep as string for backward compatibility
      errorCode: code,
      details,
      timestamp: new Date().toISOString(),
    }, 
    { status }
  );
}

export function notFoundResponse(message = 'Resource not found') {
  return errorResponse(message, 404, ERROR_CODES.NOT_FOUND);
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return errorResponse(message, 401, ERROR_CODES.UNAUTHORIZED);
}

export function forbiddenResponse(message = 'Forbidden') {
  return errorResponse(message, 403, ERROR_CODES.FORBIDDEN);
}

export function serverErrorResponse(message = 'Internal server error') {
  return errorResponse(message, 500, ERROR_CODES.INTERNAL_ERROR);
}

export function validationError(errors: z.ZodError) {
  return errorResponse(
    'Validation failed',
    422,
    ERROR_CODES.VALIDATION_ERROR,
    errors.flatten().fieldErrors
  );
}

export function conflictResponse(message = 'Resource already exists') {
  return errorResponse(message, 409, ERROR_CODES.CONFLICT);
}

export function rateLimitResponse(
  message: string,
  retryAfterSeconds: number
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: message,
      errorCode: ERROR_CODES.BAD_REQUEST,
      timestamp: new Date().toISOString(),
    },
    {
      status: 429,
      headers: {
        'Retry-After': retryAfterSeconds.toString(),
      },
    }
  );
}

// Handle Prisma errors with specific messages
export function handlePrismaError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        // Unique constraint violation
        const field = (error.meta?.target as string[])?.join(', ') || 'field';
        return conflictResponse(`${field} already exists`);
      
      case 'P2025':
        // Record not found
        return notFoundResponse('Record not found');
      
      case 'P2003':
        // Foreign key constraint failed
        return errorResponse('Related record not found', 400);
      
      case 'P2014':
        // Required relation violation
        return errorResponse('Cannot delete record with related data', 400);
      
      default:
        console.error('[API] Prisma error:', error);
        return serverErrorResponse('Database operation failed');
    }
  }
  
  console.error('[API] Unknown error:', error);
  return serverErrorResponse();
}

export function paginatedResponse<T>(items: T[], total: number, page: number, limit: number) {
  return NextResponse.json({
    success: true,
    data: items,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}
