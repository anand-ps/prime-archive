/*
File: /assets/js/backend/session.js
Purpose: Initialize anonymous client context, manage active sessions, and keep activity heartbeats current.
*/

import { initializeClient, sendHeartbeat } from './client.js';
import { SESSION_CONFIG } from './config.js';
import { clearActiveSession, clearCachedMessages, ensureClientId, getActiveSession, getConversationId, setActiveSession, setConversationId } from './storage.js';

const sessionState = {
    clientId: '',
    internalClientDbId: '',
    sessionId: '',
    conversationId: '',
    lastActivityAt: '',
    initialized: false,
    initPromise: null,
    heartbeatTimerId: 0,
    lastHeartbeatRequestAt: 0,
    hasBoundActivityListeners: false,
    listeners: new Set()
};

// Section: Environment helpers.
function getCurrentPage() {
    return window.location.pathname || '/';
}

function detectBrowser() {
    const userAgent = navigator.userAgent;

    if (/edg/i.test(userAgent)) {
        return 'Edge';
    }

    if (/chrome|crios/i.test(userAgent)) {
        return 'Chrome';
    }

    if (/firefox|fxios/i.test(userAgent)) {
        return 'Firefox';
    }

    if (/safari/i.test(userAgent) && !/chrome|crios|edg/i.test(userAgent)) {
        return 'Safari';
    }

    return 'Unknown';
}

function detectDeviceType() {
    if (/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)) {
        return 'mobile';
    }

    if (window.matchMedia('(max-width: 860px)').matches) {
        return 'tablet';
    }

    return 'desktop';
}

function buildInitPayload() {
    return {
        clientId: sessionState.clientId,
        browser: detectBrowser(),
        deviceType: detectDeviceType(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        screenWidth: window.screen?.width || window.innerWidth || 0,
        screenHeight: window.screen?.height || window.innerHeight || 0,
        referrer: document.referrer || '',
        currentPage: getCurrentPage()
    };
}

function isSessionExpired(lastActivityAt) {
    const lastActivityTimestamp = Date.parse(String(lastActivityAt || ''));
    if (!Number.isFinite(lastActivityTimestamp)) {
        return true;
    }

    return (Date.now() - lastActivityTimestamp) > SESSION_CONFIG.TIMEOUT_MS;
}

function notifyListeners() {
    const snapshot = getSessionContext();

    sessionState.listeners.forEach((listener) => {
        try {
            listener(snapshot);
        } catch (error) {
            console.error('Unable to notify a session listener.', error);
        }
    });
}

function applySessionSnapshot(snapshot) {
    const previousConversationId = sessionState.conversationId || getConversationId();

    if (snapshot?.internalClientDbId) {
        sessionState.internalClientDbId = String(snapshot.internalClientDbId);
    }

    if (snapshot?.sessionId) {
        sessionState.sessionId = String(snapshot.sessionId);
    }

    if (snapshot?.conversationId) {
        sessionState.conversationId = String(snapshot.conversationId);
        setConversationId(sessionState.conversationId);
    }

    if (
        previousConversationId &&
        sessionState.conversationId &&
        previousConversationId !== sessionState.conversationId
    ) {
        clearCachedMessages();
    }

    sessionState.lastActivityAt = String(snapshot?.lastActivityAt || new Date().toISOString());

    if (sessionState.sessionId) {
        setActiveSession({
            sessionId: sessionState.sessionId,
            lastActivityAt: sessionState.lastActivityAt
        });
    } else {
        clearActiveSession();
    }

    notifyListeners();
    return getSessionContext();
}

function updateLocalActivityTimestamp() {
    sessionState.lastActivityAt = new Date().toISOString();

    if (sessionState.sessionId) {
        setActiveSession({
            sessionId: sessionState.sessionId,
            lastActivityAt: sessionState.lastActivityAt
        });
    }
}

function startHeartbeatTimer() {
    if (sessionState.heartbeatTimerId) {
        window.clearInterval(sessionState.heartbeatTimerId);
    }

    sessionState.heartbeatTimerId = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
            void heartbeat('interval', true);
        }
    }, SESSION_CONFIG.HEARTBEAT_INTERVAL_MS);
}

function bindActivityListeners() {
    if (sessionState.hasBoundActivityListeners) {
        return;
    }

    const activityHandler = () => {
        void recordActivity('interaction');
    };

    document.addEventListener('pointerdown', activityHandler, { passive: true });
    document.addEventListener('keydown', activityHandler);
    window.addEventListener('focus', activityHandler);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            void recordActivity('visibility');
        }
    });

    sessionState.hasBoundActivityListeners = true;
}

// Section: Public session API.
export function getSessionContext() {
    const storedSession = getActiveSession();

    return {
        clientId: sessionState.clientId || ensureClientId(),
        internalClientDbId: sessionState.internalClientDbId,
        sessionId: sessionState.sessionId || String(storedSession?.sessionId || ''),
        conversationId: sessionState.conversationId || getConversationId(),
        lastActivityAt: sessionState.lastActivityAt || String(storedSession?.lastActivityAt || '')
    };
}

export function onSessionChange(listener) {
    sessionState.listeners.add(listener);

    return () => {
        sessionState.listeners.delete(listener);
    };
}

export function syncSessionSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
        return getSessionContext();
    }

    return applySessionSnapshot(snapshot);
}

export function resetSession() {
    sessionState.clientId = '';
    sessionState.internalClientDbId = '';
    sessionState.sessionId = '';
    sessionState.conversationId = '';
    sessionState.initialized = false;
    sessionState.initPromise = null;
    
    if (sessionState.heartbeatTimerId) {
        window.clearInterval(sessionState.heartbeatTimerId);
        sessionState.heartbeatTimerId = 0;
    }
    
    // Wipe local cache so new IDs generate
    window.localStorage.removeItem('client_id');
    window.localStorage.removeItem('client_name');
    clearActiveSession();
    clearConversationId();
    clearCachedMessages();
}

export async function initSession() {
    if (sessionState.initialized) {
        return getSessionContext();
    }

    if (sessionState.initPromise) {
        return sessionState.initPromise;
    }

    sessionState.initPromise = (async () => {
        sessionState.clientId = ensureClientId();
        sessionState.conversationId = getConversationId();

        const snapshot = await initializeClient(buildInitPayload());

        sessionState.initialized = true;
        bindActivityListeners();
        startHeartbeatTimer();

        return applySessionSnapshot(snapshot);
    })().catch((error) => {
        sessionState.initPromise = null;
        throw error;
    });

    const context = await sessionState.initPromise;
    sessionState.initPromise = Promise.resolve(context);
    return context;
}

export async function ensureSession() {
    if (sessionState.initialized) {
        return getSessionContext();
    }

    return initSession();
}

export async function heartbeat(reason = 'activity', force = false) {
    const context = await ensureSession();
    const now = Date.now();
    const locallyExpired = isSessionExpired(context.lastActivityAt);
    const recentlySent = (now - sessionState.lastHeartbeatRequestAt) < SESSION_CONFIG.HEARTBEAT_THROTTLE_MS;

    if (!force && !locallyExpired && recentlySent) {
        return context;
    }

    sessionState.lastHeartbeatRequestAt = now;

    const snapshot = await sendHeartbeat({
        clientId: context.clientId,
        sessionId: context.sessionId,
        currentPage: getCurrentPage(),
        reason
    });

    return applySessionSnapshot(snapshot);
}

export async function recordActivity(reason = 'interaction') {
    updateLocalActivityTimestamp();

    try {
        return await heartbeat(reason, isSessionExpired(sessionState.lastActivityAt));
    } catch (error) {
        console.error('Unable to update session activity.', error);
        return getSessionContext();
    }
}
