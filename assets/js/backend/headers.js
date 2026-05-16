/*
File: /assets/js/backend/headers.js
Purpose: Build shared request headers for Edge Function fetch calls.
*/

// Section: Header factories.
export function createFunctionHeaders(publicKey, { includeJson = true, extraHeaders = {} } = {}) {
    const headers = {
        Accept: 'application/json',
        apikey: publicKey,
        Authorization: `Bearer ${publicKey}`,
        'X-Client-Info': 'prime-archive-frontend',
        ...extraHeaders
    };

    if (includeJson) {
        headers['Content-Type'] = 'application/json';
    }

    return headers;
}
