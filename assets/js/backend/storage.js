/*
File: /assets/js/backend/storage.js
Purpose: Centralize localStorage persistence for anonymous client, session, and chat state.
*/

import { CHAT_CONFIG, STORAGE_KEYS } from './config.js';

// Section: Generic storage helpers.
function parseJson(value, fallbackValue) {
    if (!value) {
        return fallbackValue;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return fallbackValue;
    }
}

function stringifyJson(value) {
    return JSON.stringify(value);
}

function normalizeText(value) {
    return String(value || '').trim();
}

function normalizeMessageId(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && value.trim()) {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : value.trim();
    }

    return '';
}

function normalizeCachedMessage(message) {
    return {
        id: normalizeMessageId(message?.id),
        senderType: normalizeText(message?.senderType || message?.sender_type),
        messageText: normalizeText(message?.messageText || message?.message_text),
        createdAt: normalizeText(message?.createdAt || message?.created_at)
    };
}

function compareMessages(left, right) {
    const leftTimestamp = Date.parse(left.createdAt || '') || 0;
    const rightTimestamp = Date.parse(right.createdAt || '') || 0;

    if (leftTimestamp !== rightTimestamp) {
        return leftTimestamp - rightTimestamp;
    }

    const leftId = typeof left.id === 'number' ? left.id : Number(left.id) || 0;
    const rightId = typeof right.id === 'number' ? right.id : Number(right.id) || 0;
    return leftId - rightId;
}

// Section: Anonymous client identity.
export function ensureClientId() {
    const existingClientId = normalizeText(window.localStorage.getItem(STORAGE_KEYS.CLIENT_ID));
    if (existingClientId) {
        return existingClientId;
    }

    const clientId = window.crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEYS.CLIENT_ID, clientId);
    return clientId;
}

export function getClientId() {
    return normalizeText(window.localStorage.getItem(STORAGE_KEYS.CLIENT_ID));
}

// Section: Session persistence.
export function getActiveSession() {
    return parseJson(window.localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION), {
        sessionId: '',
        lastActivityAt: ''
    });
}

export function setActiveSession(session) {
    const safeSession = {
        sessionId: normalizeText(session?.sessionId),
        lastActivityAt: normalizeText(session?.lastActivityAt)
    };

    window.localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, stringifyJson(safeSession));
    return safeSession;
}

export function clearActiveSession() {
    window.localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
}

// Section: Persistent chat identity.
export function getClientName() {
    return normalizeText(window.localStorage.getItem(STORAGE_KEYS.CLIENT_NAME));
}

export function setClientName(clientName) {
    const normalizedClientName = normalizeText(clientName);

    if (!normalizedClientName) {
        clearClientName();
        return '';
    }

    window.localStorage.setItem(STORAGE_KEYS.CLIENT_NAME, normalizedClientName);
    return normalizedClientName;
}

export function clearClientName() {
    window.localStorage.removeItem(STORAGE_KEYS.CLIENT_NAME);
}

// Section: Conversation persistence.
export function getConversationId() {
    return normalizeText(window.localStorage.getItem(STORAGE_KEYS.CONVERSATION_ID));
}

export function setConversationId(conversationId) {
    const normalizedConversationId = normalizeText(conversationId);

    if (!normalizedConversationId) {
        clearConversationId();
        return '';
    }

    window.localStorage.setItem(STORAGE_KEYS.CONVERSATION_ID, normalizedConversationId);
    return normalizedConversationId;
}

export function clearConversationId() {
    window.localStorage.removeItem(STORAGE_KEYS.CONVERSATION_ID);
}

// Section: Cached message persistence.
export function getCachedMessages() {
    const cachedMessages = parseJson(window.localStorage.getItem(STORAGE_KEYS.CACHED_MESSAGES), []);

    if (!Array.isArray(cachedMessages)) {
        return [];
    }

    return cachedMessages
        .map(normalizeCachedMessage)
        .filter((message) => message.id !== '' && message.senderType && message.messageText && message.createdAt)
        .sort(compareMessages);
}

export function setCachedMessages(messages) {
    const normalizedMessages = Array.isArray(messages)
        ? messages
            .map(normalizeCachedMessage)
            .filter((message) => message.id !== '' && message.senderType && message.messageText && message.createdAt)
            .sort(compareMessages)
            .slice(-CHAT_CONFIG.MAX_CACHED_MESSAGES)
        : [];

    window.localStorage.setItem(STORAGE_KEYS.CACHED_MESSAGES, stringifyJson(normalizedMessages));
    return normalizedMessages;
}

export function clearCachedMessages() {
    window.localStorage.removeItem(STORAGE_KEYS.CACHED_MESSAGES);
    return [];
}

export function mergeCachedMessages(...messageGroups) {
    const mergedMessages = new Map();

    messageGroups.flat().forEach((message) => {
        const normalizedMessage = normalizeCachedMessage(message);

        if (normalizedMessage.id === '' || !normalizedMessage.senderType || !normalizedMessage.messageText || !normalizedMessage.createdAt) {
            return;
        }

        mergedMessages.set(String(normalizedMessage.id), normalizedMessage);
    });

    return setCachedMessages(Array.from(mergedMessages.values()));
}
