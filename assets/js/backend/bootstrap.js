/*
File: /assets/js/backend/bootstrap.js
Purpose: Initialize the Edge Function-backed frontend managers in the existing static site architecture.
*/

import { initAnalytics } from './analytics.js';
import { initChatWidget } from './chat.js';
import { getBackendSetupMessage, isBackendConfigured } from './client.js';
import { initSession } from './session.js';
import { initPageViews } from './views.js';

let hasInitializedBackend = false;

// Section: Shared bootstrap flow.
export async function initBackend() {
    if (hasInitializedBackend) {
        return;
    }

    hasInitializedBackend = true;

    if (!isBackendConfigured()) {
        console.warn(getBackendSetupMessage());
        return;
    }

    try {
        await initSession();
        initAnalytics();

        await Promise.allSettled([
            initPageViews(),
            initChatWidget()
        ]);
    } catch (error) {
        console.error('Unable to initialize backend features.', error);
    }
}
