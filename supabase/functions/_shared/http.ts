/*
File: /supabase/functions/_shared/http.ts
Purpose: Standardize JSON responses, request validation failures, and error handling.
*/

import { createCorsHeaders } from './cors.ts';

// Section: Structured error type.
export class HttpError extends Error {
    status: number;
    code: string;
    details: unknown;

    constructor(status: number, code: string, message: string, details: unknown = null) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

// Section: Request helpers.
export function assertMethod(request: Request, allowedMethods: string[]) {
    if (!allowedMethods.includes(request.method)) {
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', `Use one of: ${allowedMethods.join(', ')}.`);
    }
}

export async function readJsonBody<T>(request: Request): Promise<T> {
    try {
        return await request.json();
    } catch (_error) {
        throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
    }
}

// Section: Response helpers.
export function jsonResponse(request: Request, status: number, payload: unknown, extraHeaders: HeadersInit = {}) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: createCorsHeaders(request, {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json; charset=utf-8',
            ...extraHeaders
        })
    });
}

export function successResponse(request: Request, data: unknown, status = 200) {
    return jsonResponse(request, status, {
        ok: true,
        data
    });
}

export function errorResponse(request: Request, error: HttpError) {
    return jsonResponse(request, error.status, {
        ok: false,
        error: {
            code: error.code,
            message: error.message,
            details: error.details
        }
    });
}

export function optionsResponse(request: Request) {
    return new Response('ok', {
        status: 200,
        headers: createCorsHeaders(request, {
            'Cache-Control': 'no-store'
        })
    });
}

export function handleUnexpectedError(request: Request, error: unknown) {
    if (error instanceof HttpError) {
        return errorResponse(request, error);
    }

    console.error('Unexpected Edge Function failure.', error);

    return jsonResponse(request, 500, {
        ok: false,
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected backend error occurred.'
        }
    });
}
