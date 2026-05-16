/*
File: /supabase/functions/_shared/cors.ts
Purpose: Provide consistent CORS headers for all Edge Function responses.
*/

// Section: Static CORS defaults.
const DEFAULT_ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';
const DEFAULT_ALLOWED_METHODS = 'GET, POST, OPTIONS';
const DEFAULT_MAX_AGE_SECONDS = '86400';

// Section: Origin helpers.
function getConfiguredOrigins() {
    return String(Deno.env.get('CORS_ALLOW_ORIGIN') || '*')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}

function resolveAllowedOrigin(requestOrigin: string | null) {
    const configuredOrigins = getConfiguredOrigins();

    if (configuredOrigins.includes('*')) {
        return '*';
    }

    if (!requestOrigin) {
        return configuredOrigins[0] || '*';
    }

    return configuredOrigins.includes(requestOrigin) ? requestOrigin : configuredOrigins[0] || '*';
}

// Section: Public CORS API.
export function createCorsHeaders(request: Request, extraHeaders: HeadersInit = {}) {
    const origin = request.headers.get('origin');
    const allowedOrigin = resolveAllowedOrigin(origin);

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': DEFAULT_ALLOWED_HEADERS,
        'Access-Control-Allow-Methods': DEFAULT_ALLOWED_METHODS,
        'Access-Control-Max-Age': DEFAULT_MAX_AGE_SECONDS,
        'Vary': 'Origin',
        ...extraHeaders
    };
}
