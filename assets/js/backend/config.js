/*
File: /assets/js/backend/config.js
Purpose: Centralize Edge Function endpoints, storage keys, and frontend runtime constants.
*/

// Section: Edge Function routing.
export const BACKEND_FUNCTIONS = Object.freeze({
    CLIENT_INIT: 'client-init',
    TRACK_EVENT: 'track-event',
    SEND_MESSAGE: 'send-message',
    GET_MESSAGES: 'get-messages',
    HEARTBEAT: 'heartbeat'
});

// Section: Browser storage keys.
export const STORAGE_KEYS = Object.freeze({
    CLIENT_ID: 'client_id',
    ACTIVE_SESSION: 'active_session',
    CLIENT_NAME: 'client_name',
    CACHED_MESSAGES: 'cached_messages',
    CONVERSATION_ID: 'conversation_id'
});

// Section: Fetch request configuration.
export const FUNCTION_REQUEST_CONFIG = Object.freeze({
    TIMEOUT_MS: 12000
});

// Section: Shared responsive breakpoints.
export const BACKEND_BREAKPOINTS = Object.freeze({
    CHAT_MOBILE: 720
});

// Section: Session timing configuration.
export const SESSION_CONFIG = Object.freeze({
    TIMEOUT_MS: 60 * 60 * 1000,
    HEARTBEAT_INTERVAL_MS: 4 * 60 * 1000,
    HEARTBEAT_THROTTLE_MS: 30 * 1000
});

// Section: Chat and sync configuration.
export const CHAT_CONFIG = Object.freeze({
    MAX_NAME_LENGTH: 80,
    MAX_MESSAGE_LENGTH: 1000,
    SEND_COOLDOWN_MS: 2500,
    MAX_CACHED_MESSAGES: 100
});

export const SYNC_CONFIG = Object.freeze({
    OPEN_INTERVAL_MS: 6000,
    IDLE_INTERVAL_MS: 15000
});

// Section: Analytics event names.
export const ANALYTICS_EVENTS = Object.freeze({
    PAGE_VIEW: 'page_view',
    PROJECT_OPEN: 'project_open',
    GITHUB_CLICK: 'github_click',
    LINKEDIN_CLICK: 'linkedin_click',
    RESUME_DOWNLOAD: 'resume_download',
    CONTACT_OPEN: 'contact_open',
    CHAT_OPEN: 'chat_open',
    MESSAGE_SEND: 'message_send'
});

// Section: Message payload constants.
export const MESSAGE_TYPES = Object.freeze({
    TEXT: 'text'
});

export const SENDER_TYPES = Object.freeze({
    CLIENT: 'client',
    ADMIN: 'admin',
    SYSTEM: 'system'
});
