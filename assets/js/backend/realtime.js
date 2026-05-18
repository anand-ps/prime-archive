/*
File: /assets/js/backend/realtime.js
Purpose: Keep the chat thread near-real-time using lightweight polling through Edge Functions.
*/

import { SYNC_CONFIG } from './config.js';

const syncState = {
    timerId: 0,
    running: false,
    fetchMessages: null,
    onMessages: null,
    onError: null,
    isPanelOpen: null,
    visibilityHandler: null
};

// Section: Sync scheduling helpers.
function getSyncInterval() {
    if (document.visibilityState === 'hidden') {
        return SYNC_CONFIG.IDLE_INTERVAL_MS;
    }

    return syncState.isPanelOpen?.() ? SYNC_CONFIG.OPEN_INTERVAL_MS : SYNC_CONFIG.IDLE_INTERVAL_MS;
}

function clearSyncTimer() {
    if (!syncState.timerId) {
        return;
    }

    window.clearTimeout(syncState.timerId);
    syncState.timerId = 0;
}

function scheduleNextSync() {
    clearSyncTimer();

    if (!syncState.fetchMessages || !syncState.onMessages) {
        return;
    }

    syncState.timerId = window.setTimeout(() => {
        void syncNow();
    }, getSyncInterval());
}

// Section: Public sync API.
export async function syncNow() {
    if (syncState.running || !syncState.fetchMessages || !syncState.onMessages) {
        return;
    }

    syncState.running = true;

    try {
        const messages = await syncState.fetchMessages();
        syncState.onMessages(messages);
    } catch (error) {
        syncState.onError?.(error);
    } finally {
        syncState.running = false;
        scheduleNextSync();
    }
}

export function stopMessageSync() {
    clearSyncTimer();

    if (syncState.visibilityHandler) {
        document.removeEventListener('visibilitychange', syncState.visibilityHandler);
    }

    syncState.fetchMessages = null;
    syncState.onMessages = null;
    syncState.onError = null;
    syncState.isPanelOpen = null;
    syncState.visibilityHandler = null;
    syncState.running = false;
}

export function startMessageSync(options) {
    stopMessageSync();

    syncState.fetchMessages = options.fetchMessages;
    syncState.onMessages = options.onMessages;
    syncState.onError = options.onError || null;
    syncState.isPanelOpen = options.isPanelOpen || (() => false);
    syncState.visibilityHandler = () => {
        scheduleNextSync();
    };

    document.addEventListener('visibilitychange', syncState.visibilityHandler);
    void syncNow();

    return {
        syncNow,
        stop: stopMessageSync
    };
}
