import { NextResponse } from 'next/server';
import { z } from 'zod';

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export function notFoundResponse(message = 'Resource not found') {
  return errorResponse(message, 404);
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return errorResponse(message, 401);
}

export function serverErrorResponse(message = 'Internal server error') {
  return errorResponse(message, 500);
}

export function validationError(errors: z.ZodError) {
  return NextResponse.json(
    {
      success: false,
      error: 'Validation failed',
      details: errors.flatten().fieldErrors,
    },
    { status: 400 }
  );
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