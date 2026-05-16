/*
File: /assets/js/backend/analytics.js
Purpose: Track analytics events through Edge Functions and bind lightweight DOM event instrumentation.
*/

import { trackBackendEvent } from './client.js';
import { ANALYTICS_EVENTS } from './config.js';
import { ensureSession, getSessionContext, recordActivity, syncSessionSnapshot } from './session.js';

let hasInitializedAnalytics = false;

// Section: Event payload helpers.
function getPageContext() {
    return {
        pagePath: window.location.pathname || '/',
        pageTitle: document.title || ''
    };
}

function getProjectSlugFromPathname(pathname) {
    const match = String(pathname || '').match(/^\/projects\/([^/]+)\/?$/i);
    return match ? match[1] : '';
}

async function sendEvent(eventType, metadata = {}) {
    await ensureSession();
    await recordActivity(`event:${eventType}`);

    const context = getSessionContext();
    const pageContext = getPageContext();

    const response = await trackBackendEvent({
        clientId: context.clientId,
        sessionId: context.sessionId,
        eventType,
        pagePath: pageContext.pagePath,
        pageTitle: pageContext.pageTitle,
        metadata
    });

    syncSessionSnapshot(response);
    return response;
}

function classifyAnchorEvent(anchor) {
    if (!anchor) {
        return null;
    }

    const href = anchor.getAttribute('href') || '';

    if (!href) {
        return null;
    }

    const resolvedUrl = new URL(href, window.location.origin);
    const pathname = resolvedUrl.pathname || '';

    if (resolvedUrl.hostname.includes('github.com')) {
        return {
            eventType: ANALYTICS_EVENTS.GITHUB_CLICK,
            metadata: {
                href: resolvedUrl.href
            }
        };
    }

    if (resolvedUrl.hostname.includes('linkedin.com')) {
        return {
            eventType: ANALYTICS_EVENTS.LINKEDIN_CLICK,
            metadata: {
                href: resolvedUrl.href
            }
        };
    }

    if (/\/downloads\/anand_resume\.pdf$/i.test(pathname)) {
        return {
            eventType: ANALYTICS_EVENTS.RESUME_DOWNLOAD,
            metadata: {
                href: resolvedUrl.href
            }
        };
    }

    if (resolvedUrl.hash === '#contact' || href === '#contact' || href === '/#contact') {
        return {
            eventType: ANALYTICS_EVENTS.CONTACT_OPEN,
            metadata: {
                href: resolvedUrl.href
            }
        };
    }

    const projectSlug = getProjectSlugFromPathname(pathname);
    if (projectSlug && !/\/contributors\/?$/i.test(pathname)) {
        return {
            eventType: ANALYTICS_EVENTS.PROJECT_OPEN,
            metadata: {
                href: resolvedUrl.href,
                projectSlug
            }
        };
    }

    return null;
}

// Section: Public analytics API.
export async function trackEvent(eventType, metadata = {}) {
    try {
        return await sendEvent(eventType, metadata);
    } catch (error) {
        console.error(`Unable to track analytics event "${eventType}".`, error);
        return null;
    }
}

export async function trackPageView() {
    return trackEvent(ANALYTICS_EVENTS.PAGE_VIEW, {
        referrer: document.referrer || ''
    });
}

export async function trackChatOpen() {
    return trackEvent(ANALYTICS_EVENTS.CHAT_OPEN, {});
}

export async function trackMessageSend(messageText) {
    return trackEvent(ANALYTICS_EVENTS.MESSAGE_SEND, {
        messageLength: String(messageText || '').trim().length
    });
}

export function initAnalytics() {
    if (hasInitializedAnalytics) {
        return;
    }

    document.addEventListener('click', (event) => {
        const anchor = event.target.closest('a');
        const trackingEvent = classifyAnchorEvent(anchor);

        if (!trackingEvent) {
            return;
        }

        void trackEvent(trackingEvent.eventType, trackingEvent.metadata);
    }, true);

    hasInitializedAnalytics = true;
}
