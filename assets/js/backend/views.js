/*
File: /assets/js/backend/views.js
Purpose: Track page views through Edge Functions and display the current aggregated count in the existing badge UI.
*/

import { trackPageView } from './analytics.js';

// Section: Badge constants.
const PAGE_VIEW_BADGE_ID = 'portfolio-page-view-badge';

// Section: View badge UI.
function ensureViewBadge() {
    const metaContainer = document.querySelector('.post-meta');
    
    if (!metaContainer) {
        return null;
    }

    let inlineNode = document.getElementById(PAGE_VIEW_BADGE_ID);
    if (!inlineNode) {
        const dot = document.createElement('span');
        dot.className = 'meta-dot';
        dot.textContent = '|';
        
        inlineNode = document.createElement('span');
        inlineNode.className = 'meta-text';
        inlineNode.id = PAGE_VIEW_BADGE_ID;
        inlineNode.textContent = 'Loading...';
        
        metaContainer.appendChild(dot);
        metaContainer.appendChild(inlineNode);
    }
    
    return inlineNode;
}

function updateViewBadge({ value, isError = false }) {
    const valueNode = ensureViewBadge();
    
    if (!valueNode) {
        return;
    }

    if (isError) {
        valueNode.textContent = 'Views Unavailable';
    } else {
        valueNode.textContent = `${value} VIEWS`;
    }
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
