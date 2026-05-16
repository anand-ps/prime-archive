/*
File: /assets/js/backend/views.js
Purpose: Track page views through Edge Functions and display the current aggregated count in the existing badge UI.
*/

import { trackPageView } from './analytics.js';

// Section: Badge constants.
const PAGE_VIEW_BADGE_ID = 'portfolio-page-view-badge';

// Section: View badge UI.
function ensureViewBadge() {
    const existingBadge = document.getElementById(PAGE_VIEW_BADGE_ID);
    if (existingBadge) {
        return existingBadge;
    }

    const badge = document.createElement('aside');
    badge.id = PAGE_VIEW_BADGE_ID;
    badge.className = 'portfolio-view-badge';
    badge.setAttribute('aria-live', 'polite');
    badge.innerHTML = `
        <span class="portfolio-view-badge-label">Views</span>
        <strong class="portfolio-view-badge-value">Loading...</strong>
    `;

    document.body.appendChild(badge);
    return badge;
}

function updateViewBadge({ value, isError = false }) {
    const badge = ensureViewBadge();
    const valueNode = badge.querySelector('.portfolio-view-badge-value');

    if (!valueNode) {
        return;
    }

    badge.classList.toggle('is-error', isError);
    valueNode.textContent = value;
}

function formatViewCount(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return 'Tracked';
    }

    return numericValue.toLocaleString('en-US');
}

// Section: Public initializer.
export async function initPageViews() {
    updateViewBadge({ value: 'Loading...' });

    try {
        const response = await trackPageView();
        updateViewBadge({
            value: formatViewCount(response?.pageViewCount)
        });
    } catch (error) {
        console.error('Unable to initialize page view tracking.', error);
        updateViewBadge({
            value: 'Unavailable',
            isError: true
        });
    }
}
