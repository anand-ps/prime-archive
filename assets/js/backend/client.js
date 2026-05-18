/*
File: /assets/js/backend/client.js
Purpose: Provide a fetch-only API layer for calling Supabase Edge Functions from the static frontend.
*/

import { BACKEND_FUNCTIONS } from './config.js';
import { FUNCTION_REQUEST_CONFIG } from './config.js';
import { createFunctionHeaders } from './headers.js';

// Section: Backend runtime configuration.
const BACKEND_URL = 'https://lpepcjskxtbcmclcqxie.supabase.co';
const BACKEND_PUBLIC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwZXBjanNreHRiY21jbGNxeGllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjQ5MDUsImV4cCI6MjA5NDQ0MDkwNX0.bgxKbkkyW69pz_Ls5kxSfwOsxyW94gHDomdV0aynRko';
const BACKEND_FUNCTIONS_BASE_URL = `${BACKEND_URL}/functions/v1`;

const BACKEND_PLACEHOLDERS = new Set([
    '',
    'PASTE_BACKEND_URL_HERE',
    'PASTE_BACKEND_PUBLIC_KEY_HERE'
]);

// Section: Configuration helpers.
function isPlaceholderValue(value) {
    return BACKEND_PLACEHOLDERS.has(String(value || '').trim());
}

function buildQueryString(query = {}) {
    const searchParams = new URLSearchParams();

    Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
            return;
        }

        searchParams.set(key, String(value));
    });

    const serializedQuery = searchParams.toString();
    return serializedQuery ? `?${serializedQuery}` : '';
}

function buildFunctionUrl(functionName, query) {
    return `${BACKEND_FUNCTIONS_BASE_URL}/${functionName}${buildQueryString(query)}`;
}

function createTimeoutController(timeoutMs) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
        controller.abort(new Error('Backend request timed out.'));
    }, timeoutMs);

    return {
        controller,
        cleanup() {
            window.clearTimeout(timeoutId);
        }
    };
}

async function parseFunctionResponse(response) {
    const responseText = await response.text();

    if (!responseText) {
        return {};
    }

    try {
        return JSON.parse(responseText);
    } catch (error) {
        throw new Error('Backend function returned a non-JSON response.');
    }
}

async function requestFunction(functionName, {
    method = 'POST',
    body,
    query,
    signal,
    keepalive = false
} = {}) {
    const includeJson = body !== undefined;
    const timeoutManager = createTimeoutController(FUNCTION_REQUEST_CONFIG.TIMEOUT_MS);
    const requestSignal = signal || timeoutManager.controller.signal;

    try {
        const response = await fetch(buildFunctionUrl(functionName, query), {
            method,
            headers: createFunctionHeaders(BACKEND_PUBLIC_KEY, { includeJson }),
            body: includeJson ? JSON.stringify(body) : undefined,
            mode: 'cors',
            signal: requestSignal,
            keepalive
        });

        const payload = await parseFunctionResponse(response);

        if (!response.ok || payload?.ok === false) {
            const message = payload?.error?.message || payload?.message || `Backend request failed with status ${response.status}.`;
            throw new Error(message);
        }

        return payload?.data ?? payload;
    } finally {
        timeoutManager.cleanup();
    }
}

export function isBackendConfigured() {
    return !isPlaceholderValue(BACKEND_URL) && !isPlaceholderValue(BACKEND_PUBLIC_KEY);
}

export function getBackendSetupMessage() {
    return 'Backend features are unavailable until BACKEND_URL and BACKEND_PUBLIC_KEY are configured.';
}

// Section: Edge Function wrappers.
export async function initializeClient(payload, signal) {
    return requestFunction(BACKEND_FUNCTIONS.CLIENT_INIT, {
        method: 'POST',
        body: payload,
        signal
    });
}

export async function sendHeartbeat(payload, signal) {
    return requestFunction(BACKEND_FUNCTIONS.HEARTBEAT, {
        method: 'POST',
        body: payload,
        signal,
        keepalive: true
    });
}

export async function trackBackendEvent(payload, signal) {
    return requestFunction(BACKEND_FUNCTIONS.TRACK_EVENT, {
        method: 'POST',
        body: payload,
        signal
    });
}

export async function sendBackendMessage(payload, signal) {
    return requestFunction(BACKEND_FUNCTIONS.SEND_MESSAGE, {
        method: 'POST',
        body: payload,
        signal
    });
}

export async function getBackendMessages(query, signal) {
    return requestFunction(BACKEND_FUNCTIONS.GET_MESSAGES, {
        method: 'GET',
        query,
        signal
    });
}
