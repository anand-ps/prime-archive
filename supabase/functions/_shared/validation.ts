/*
File: /supabase/functions/_shared/validation.ts
Purpose: Validate and sanitize Edge Function inputs before privileged database work runs.
*/

import { HttpError } from './http.ts';

// Section: Shared constants.
const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_DEVICE_TYPES = new Set(['desktop', 'tablet', 'mobile', 'unknown']);
const ALLOWED_EVENT_TYPES = new Set([
    'page_view',
    'project_open',
    'github_click',
    'linkedin_click',
    'resume_download',
    'contact_open',
    'chat_open',
    'message_send'
]);
const ALLOWED_SENDER_TYPES = new Set(['client']);
const ALLOWED_MESSAGE_TYPES = new Set(['text']);

// Section: Generic sanitizers.
function ensureObject(value: unknown, label: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new HttpError(400, 'INVALID_PAYLOAD', `${label} must be a JSON object.`);
    }

    return value as Record<string, unknown>;
}

function normalizeText(value: unknown, maxLength: number) {
    return String(value || '').trim().slice(0, maxLength);
}

function requireText(value: unknown, fieldName: string, maxLength: number) {
    const normalizedValue = normalizeText(value, maxLength);

    if (!normalizedValue) {
        throw new HttpError(400, 'VALIDATION_ERROR', `"${fieldName}" is required.`);
    }

    return normalizedValue;
}

function validateUuid(value: unknown, fieldName: string, { required = true } = {}) {
    const normalizedValue = normalizeText(value, 120);

    if (!normalizedValue) {
        if (required) {
            throw new HttpError(400, 'VALIDATION_ERROR', `"${fieldName}" is required.`);
        }

        return '';
    }

    if (!CLIENT_ID_PATTERN.test(normalizedValue)) {
        throw new HttpError(400, 'VALIDATION_ERROR', `"${fieldName}" must be a valid UUID.`);
    }

    return normalizedValue;
}

function normalizeDimension(value: unknown) {
    const numericValue = Number.parseInt(String(value || '0'), 10);

    if (!Number.isFinite(numericValue) || numericValue < 0) {
        return 0;
    }

    return Math.min(numericValue, 20000);
}

function normalizePath(value: unknown, fallbackValue = '/') {
    const normalizedValue = normalizeText(value, 500);

    if (!normalizedValue) {
        return fallbackValue;
    }

    return normalizedValue.startsWith('/') ? normalizedValue : `/${normalizedValue}`;
}

function sanitizeMetadata(value: unknown) {
    if (value === undefined || value === null || value === '') {
        return {};
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new HttpError(400, 'VALIDATION_ERROR', '"metadata" must be a plain JSON object.');
    }

    const serializedMetadata = JSON.stringify(value);
    if (serializedMetadata.length > 12000) {
        throw new HttpError(400, 'VALIDATION_ERROR', '"metadata" is too large.');
    }

    return value;
}

function validateDeviceType(value: unknown) {
    const normalizedValue = normalizeText(value, 30).toLowerCase() || 'unknown';

    if (!ALLOWED_DEVICE_TYPES.has(normalizedValue)) {
        return 'unknown';
    }

    return normalizedValue;
}

function validateEventType(value: unknown) {
    const normalizedValue = requireText(value, 'eventType', 80).toLowerCase();

    if (!ALLOWED_EVENT_TYPES.has(normalizedValue)) {
        throw new HttpError(400, 'VALIDATION_ERROR', `"eventType" is not supported.`);
    }

    return normalizedValue;
}

function validateSenderType(value: unknown) {
    const normalizedValue = requireText(value, 'senderType', 30).toLowerCase();

    if (!ALLOWED_SENDER_TYPES.has(normalizedValue)) {
        throw new HttpError(400, 'VALIDATION_ERROR', `"senderType" must be "client".`);
    }

    return normalizedValue;
}

function validateMessageType(value: unknown) {
    const normalizedValue = requireText(value, 'messageType', 30).toLowerCase();

    if (!ALLOWED_MESSAGE_TYPES.has(normalizedValue)) {
        throw new HttpError(400, 'VALIDATION_ERROR', `"messageType" must be "text".`);
    }

    return normalizedValue;
}

// Section: Payload validators.
export function parseClientInitPayload(body: unknown) {
    const payload = ensureObject(body, 'client-init payload');

    return {
        clientId: validateUuid(payload.clientId, 'clientId'),
        browser: normalizeText(payload.browser, 60),
        deviceType: validateDeviceType(payload.deviceType),
        timezone: normalizeText(payload.timezone, 80),
        screenWidth: normalizeDimension(payload.screenWidth),
        screenHeight: normalizeDimension(payload.screenHeight),
        referrer: normalizeText(payload.referrer, 500),
        currentPage: normalizePath(payload.currentPage)
    };
}

export function parseHeartbeatPayload(body: unknown) {
    const payload = ensureObject(body, 'heartbeat payload');

    return {
        clientId: validateUuid(payload.clientId, 'clientId'),
        sessionId: validateUuid(payload.sessionId, 'sessionId', { required: false }),
        currentPage: normalizePath(payload.currentPage),
        reason: normalizeText(payload.reason, 80) || 'heartbeat'
    };
}

export function parseTrackEventPayload(body: unknown) {
    const payload = ensureObject(body, 'track-event payload');

    return {
        clientId: validateUuid(payload.clientId, 'clientId'),
        sessionId: validateUuid(payload.sessionId, 'sessionId', { required: false }),
        eventType: validateEventType(payload.eventType),
        pagePath: normalizePath(payload.pagePath),
        pageTitle: normalizeText(payload.pageTitle, 200),
        metadata: sanitizeMetadata(payload.metadata)
    };
}

export function parseSendMessagePayload(body: unknown) {
    const payload = ensureObject(body, 'send-message payload');

    return {
        clientId: validateUuid(payload.clientId, 'clientId'),
        sessionId: validateUuid(payload.sessionId, 'sessionId', { required: false }),
        conversationId: validateUuid(payload.conversationId, 'conversationId', { required: false }),
        senderType: validateSenderType(payload.senderType),
        messageType: validateMessageType(payload.messageType),
        messageText: requireText(payload.messageText, 'messageText', 1000),
        clientName: normalizeText(payload.clientName, 80),
        persistOnboardingFlow: payload.persistOnboardingFlow === true
    };
}

export function parseGetMessagesRequest(request: Request) {
    const url = new URL(request.url);

    return {
        clientId: validateUuid(url.searchParams.get('clientId'), 'clientId'),
        sessionId: validateUuid(url.searchParams.get('sessionId'), 'sessionId', { required: false }),
        conversationId: validateUuid(url.searchParams.get('conversationId'), 'conversationId', { required: false })
    };
}
