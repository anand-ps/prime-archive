/*
File: /admin/admin.js
Purpose: Drive administrative authentication and telemetry dashboard.
Description: Secure session controller connecting to Supabase auth service with JWT claims inspection.
*/

// Configuration Constants
const SUPABASE_URL = 'https://lpepcjskxtbcmclcqxie.supabase.co';
const PUBLIC_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwZXBjanNreHRiY21jbGNxeGllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjQ5MDUsImV4cCI6MjA5NDQ0MDkwNX0.bgxKbkkyW69pz_Ls5kxSfwOsxyW94gHDomdV0aynRko';
const FUNCTIONS_BASE_URL = `${SUPABASE_URL}/functions/v1`;
const SESSION_KEY = 'admin_session';
const adminPageType = document.body?.dataset?.adminPage || 'list';
const isAdminListPage = adminPageType === 'list';
const isAdminUserPage = adminPageType === 'user';

// DOM Elements
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('admin-login-form');
const emailInput = document.getElementById('admin-email');
const passwordInput = document.getElementById('admin-password');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const passwordToggleBtn = document.getElementById('password-toggle');
const alertContainer = document.getElementById('login-alert-container');

// Dashboard Elements
const welcomeName = document.getElementById('admin-welcome-name');
const profileEmail = document.getElementById('admin-profile-email');
const adminLastLogin = document.getElementById('admin-last-login');
const initialsAvatar = document.getElementById('admin-avatar-initials');
const tokenViewer = document.getElementById('admin-token-viewer');
const logoutBtn = document.getElementById('admin-logout-btn');
const dbStatusIndicator = document.getElementById('db-status-indicator');
const dbStatusText = document.getElementById('db-status-text');
const dbPingBtn = document.getElementById('db-ping-btn');
const dashboardClientId = document.getElementById('dashboard-client-id');
const adminSummaryStatus = document.getElementById('admin-summary-status');
const summaryTotalVisitors = document.getElementById('summary-total-visitors');
const summaryActiveSessions = document.getElementById('summary-active-sessions');
const summaryOpenConversations = document.getElementById('summary-open-conversations');
const summaryMessagesToday = document.getElementById('summary-messages-today');
const summaryCapturedMobiles = document.getElementById('summary-captured-mobiles');
const summaryPageViewsToday = document.getElementById('summary-page-views-today');
const adminVisitorsStatus = document.getElementById('admin-visitors-status');
const adminVisitorsList = document.getElementById('admin-visitors-list');
const adminConversationsStatus = document.getElementById('admin-conversations-status');
const adminConversationsList = document.getElementById('admin-conversations-list');
const adminClientDetailStatus = document.getElementById('admin-client-detail-status');
const adminClientDetailContent = document.getElementById('admin-client-detail-content');
const adminSessionsStatus = document.getElementById('admin-sessions-status');
const adminSessionsList = document.getElementById('admin-sessions-list');
const adminEventsStatus = document.getElementById('admin-events-status');
const adminEventsList = document.getElementById('admin-events-list');
const adminConversationDetailStatus = document.getElementById('admin-conversation-detail-status');
const adminConversationDetailContent = document.getElementById('admin-conversation-detail-content');
const adminUserPageTitle = document.getElementById('admin-user-page-title');
const adminUserPageSubtitle = document.getElementById('admin-user-page-subtitle');
const adminUserPageMeta = document.getElementById('admin-user-page-meta');

const adminState = {
    session: null,
    selectedClientId: null,
    selectedConversationId: null
};

// --- Helper Functions ---

// Base64Url Decoding for JWT payload
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

// Display Alerts inside Login View
function showAlert(message, type = 'error') {
    if (!alertContainer) {
        return;
    }

    alertContainer.innerHTML = `
        <div class="admin-alert admin-alert-${type}" role="alert">
            <svg class="admin-alert-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                ${type === 'error' 
                    ? '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"></path>' 
                    : '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0110.5 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0110.5 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"></path>'
                }
            </svg>
            <span>${message}</span>
        </div>
    `;
}

function clearAlert() {
    if (alertContainer) {
        alertContainer.innerHTML = '';
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDateTime(value) {
    if (!value) {
        return 'Not available';
    }

    const parsedValue = new Date(value);
    return Number.isNaN(parsedValue.getTime()) ? String(value) : parsedValue.toLocaleString();
}

function formatRelativeTime(value) {
    if (!value) {
        return 'Not available';
    }

    const parsedValue = new Date(value);
    const timestamp = parsedValue.getTime();

    if (Number.isNaN(timestamp)) {
        return String(value);
    }

    const seconds = Math.round((timestamp - Date.now()) / 1000);
    const absSeconds = Math.abs(seconds);

    if (absSeconds < 60) {
        return seconds >= 0 ? 'in a few seconds' : 'just now';
    }

    const units = [
        ['year', 31536000],
        ['month', 2592000],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60]
    ];

    const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    for (const [unit, unitSeconds] of units) {
        if (absSeconds >= unitSeconds) {
            return formatter.format(Math.round(seconds / unitSeconds), unit);
        }
    }

    return formatDateTime(value);
}

function getDisplayName(client) {
    const name = String(client?.clientName || '').trim();
    return name || 'Visitor';
}

function getLocationLabel(client) {
    const parts = [
        client?.cityName,
        client?.regionName,
        client?.countryName
    ].map((part) => String(part || '').trim()).filter(Boolean);

    if (parts.length > 0) {
        return parts.join(', ');
    }

    return client?.timezone ? String(client.timezone) : 'Location unavailable';
}

function getMobileLabel(client) {
    return String(client?.mobileNumber || '').trim() || 'Not captured';
}

function getReferrerLabel(client) {
    return String(client?.referrer || '').trim() || 'Direct / Unknown';
}

function getConversationStatusClass(status) {
    return status === 'open' ? 'admin-pill-success' : 'admin-pill-warning';
}

function getSenderClass(senderType) {
    if (senderType === 'client') return 'admin-message-client';
    if (senderType === 'system') return 'admin-message-system';
    return 'admin-message-admin';
}

function getSenderLabel(senderType) {
    if (senderType === 'client') return 'Visitor';
    if (senderType === 'system') return 'System';
    return 'Admin';
}

function formatMetricValue(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return '--';
    }

    return new Intl.NumberFormat('en-US').format(numericValue);
}

function getAdminDisplayName(user = {}) {
    const metadata = user?.user_metadata || {};
    const nameCandidates = [
        metadata.display_name,
        metadata.full_name,
        metadata.name,
        user?.display_name,
        user?.full_name
    ];

    for (const candidate of nameCandidates) {
        const normalized = String(candidate || '').trim();
        if (normalized) {
            return normalized;
        }
    }

    const email = String(user?.email || '').trim();
    if (email) {
        const emailLocalPart = email.split('@')[0] || 'admin';
        return emailLocalPart.charAt(0).toUpperCase() + emailLocalPart.slice(1);
    }

    return 'Admin';
}

function getInitialsFromName(name = '') {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
        return 'AD';
    }

    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function setSummaryValues(summary = {}) {
    summaryTotalVisitors.textContent = formatMetricValue(summary.totalVisitors);
    summaryActiveSessions.textContent = formatMetricValue(summary.activeSessions);
    summaryOpenConversations.textContent = formatMetricValue(summary.openConversations);
    summaryMessagesToday.textContent = formatMetricValue(summary.messagesToday);
    summaryCapturedMobiles.textContent = formatMetricValue(summary.capturedMobileNumbers);
    summaryPageViewsToday.textContent = formatMetricValue(summary.pageViewsToday);
}

function setSummaryStatus(message) {
    if (adminSummaryStatus) {
        adminSummaryStatus.textContent = message;
    }
}

function setActiveClientSelection(clientId) {
    if (!adminVisitorsList) {
        return;
    }

    adminVisitorsList.querySelectorAll('[data-client-id]').forEach((button) => {
        button.classList.toggle('is-active', Number(button.getAttribute('data-client-id')) === Number(clientId));
    });
}

function setActiveConversationSelection(conversationId) {
    if (!adminConversationsList) {
        return;
    }

    adminConversationsList.querySelectorAll('[data-conversation-id]').forEach((button) => {
        button.classList.toggle('is-active', String(button.getAttribute('data-conversation-id')) === String(conversationId));
    });
}

function renderClientDetailPlaceholder(message) {
    if (adminClientDetailContent) {
        adminClientDetailContent.innerHTML = `<p class="admin-empty-state">${escapeHtml(message)}</p>`;
    }
}

function renderConversationsPlaceholder(message) {
    if (adminConversationsList) {
        adminConversationsList.innerHTML = `<p class="admin-empty-state">${escapeHtml(message)}</p>`;
    }
}

function renderConversationDetailPlaceholder(message) {
    if (adminConversationDetailContent) {
        adminConversationDetailContent.innerHTML = `<p class="admin-empty-state">${escapeHtml(message)}</p>`;
    }
}

function renderSessionsPlaceholder(message) {
    if (adminSessionsList) {
        adminSessionsList.innerHTML = `<p class="admin-empty-state">${escapeHtml(message)}</p>`;
    }
}

function renderEventsPlaceholder(message) {
    if (adminEventsList) {
        adminEventsList.innerHTML = `<p class="admin-empty-state">${escapeHtml(message)}</p>`;
    }
}

function getConversationLabel(conversation) {
    const rawId = String(conversation?.id || '').trim();
    if (!rawId) {
        return 'Conversation';
    }

    return `Conversation ${rawId.slice(0, 8)}`;
}

function getAdminListUrl() {
    return new URL('/admin/', window.location.origin);
}

function getAdminUserUrl(clientId, conversationId = null) {
    const url = new URL('user/', getAdminListUrl());
    url.searchParams.set('clientId', String(clientId));

    if (conversationId) {
        url.searchParams.set('conversationId', String(conversationId));
    }

    return url;
}

function redirectToAdminList() {
    window.location.replace(getAdminListUrl().toString());
}

function navigateToUserDetail(clientId) {
    window.location.assign(getAdminUserUrl(clientId).toString());
}

function syncUserPageUrl(clientId, conversationId = null) {
    if (!isAdminUserPage || !clientId) {
        return;
    }

    const url = getAdminUserUrl(clientId, conversationId);
    window.history.replaceState({}, '', url.toString());
}

function parseAdminPageNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function sortClientsByRecentActivity(clients = []) {
    return [...clients].sort((left, right) => {
        const leftTime = new Date(left?.lastSeenAt || left?.createdAt || 0).getTime();
        const rightTime = new Date(right?.lastSeenAt || right?.createdAt || 0).getTime();
        return rightTime - leftTime;
    });
}

function updateUserPageHeading(client, conversations = []) {
    if (!isAdminUserPage) {
        return;
    }

    const clientName = client ? getDisplayName(client) : 'User detail';
    const locationLabel = client ? getLocationLabel(client) : 'Secure user profile';
    const conversationLabel = `${formatMetricValue(conversations.length)} conversations`;

    if (adminUserPageTitle) {
        adminUserPageTitle.textContent = clientName;
    }

    if (adminUserPageSubtitle) {
        adminUserPageSubtitle.textContent = locationLabel;
    }

    if (adminUserPageMeta) {
        adminUserPageMeta.textContent = client ? `${getMobileLabel(client)} | ${conversationLabel}` : 'Waiting for secure user data...';
    }
}

function clearSessionAndReturnToLogin(message) {
    localStorage.removeItem(SESSION_KEY);
    adminState.session = null;
    adminState.selectedClientId = null;
    adminState.selectedConversationId = null;

    if (isAdminUserPage || !loginView || !dashboardView) {
        redirectToAdminList();
        return;
    }

    transitionToView('login');

    window.setTimeout(() => {
        showAlert(message || 'Your admin session has expired. Please log in again.');
    }, 220);
}

async function fetchAdminData(session, scope, params = {}) {
    const query = new URLSearchParams({ scope });
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            query.set(key, String(value));
        }
    });

    const response = await fetch(`${FUNCTIONS_BASE_URL}/get-admin-dashboard-data?${query.toString()}`, {
        method: 'GET',
        headers: {
            'apikey': PUBLIC_ANON_KEY,
            'Authorization': `Bearer ${session.access_token}`
        }
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload?.ok) {
        const errorCode = payload?.error?.code || '';
        const errorMessage = payload?.error?.message || 'Unable to load secure admin data.';

        if (response.status === 401 || response.status === 403 || errorCode === 'INVALID_TOKEN' || errorCode === 'ADMIN_ACCESS_REQUIRED') {
            clearSessionAndReturnToLogin(errorMessage);
            return null;
        }

        throw new Error(errorMessage);
    }

    return payload.data || null;
}

// Manage UI View States with Transition Fades
function transitionToView(target) {
    if (!loginView || !dashboardView) {
        return;
    }

    if (target === 'dashboard') {
        loginView.style.transition = 'opacity 250ms ease, transform 250ms ease';
        loginView.style.opacity = '0';
        loginView.style.transform = 'translateY(-12px)';
        
        setTimeout(() => {
            loginView.style.display = 'none';
            dashboardView.style.display = 'flex';
            dashboardView.style.opacity = '0';
            dashboardView.style.transform = 'translateY(12px)';
            
            // Force redraw
            dashboardView.offsetHeight;
            
            dashboardView.style.transition = 'opacity 300ms ease, transform 300ms ease';
            dashboardView.style.opacity = '1';
            dashboardView.style.transform = 'translateY(0)';
        }, 250);
    } else {
        dashboardView.style.transition = 'opacity 200ms ease, transform 200ms ease';
        dashboardView.style.opacity = '0';
        dashboardView.style.transform = 'translateY(12px)';
        
        setTimeout(() => {
            dashboardView.style.display = 'none';
            loginView.style.display = 'grid';
            loginView.style.opacity = '0';
            loginView.style.transform = 'translateY(-12px)';
            
            // Force redraw
            loginView.offsetHeight;
            
            loginView.style.transition = 'opacity 250ms ease, transform 250ms ease';
            loginView.style.opacity = '1';
            loginView.style.transform = 'translateY(0)';
        }, 200);
    }
}

// Toggle Submission Button states
function setButtonLoading(loading, text = 'Verifying...') {
    if (!loginSubmitBtn) {
        return;
    }

    if (loading) {
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.classList.add('btn-loading');
        loginSubmitBtn.innerHTML = `<span class="spinner"></span>${text}`;
    } else {
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.classList.remove('btn-loading');
        loginSubmitBtn.textContent = 'Verify Identity';
    }
}

function populateAdminIdentity(session) {
    adminState.session = session;
    const user = session.user;
    const email = user.email || 'admin@anandps.in';
    const displayName = getAdminDisplayName(user);

    if (profileEmail) {
        profileEmail.textContent = email;
    }

    if (welcomeName) {
        welcomeName.textContent = `Welcome back, ${displayName}!`;
    }

    if (initialsAvatar) {
        initialsAvatar.textContent = getInitialsFromName(displayName);
    }

    if (adminLastLogin) {
        const lastSignInAt = user?.last_sign_in_at || session?.user?.last_sign_in_at;
        adminLastLogin.textContent = lastSignInAt
            ? `Most recent login: ${formatDateTime(lastSignInAt)}`
            : 'Most recent login unavailable';
    }

    const parsedClaims = parseJwt(session.access_token);
    if (tokenViewer && parsedClaims) {
        tokenViewer.textContent = JSON.stringify({
            header_algorithm: 'HS256',
            token_type: 'Bearer',
            expiration_timestamp: new Date(parsedClaims.exp * 1000).toLocaleString(),
            authenticated_role: parsedClaims.role || 'authenticated',
            user_id: parsedClaims.sub,
            issuer: parsedClaims.iss,
            user_identity: {
                email: parsedClaims.email,
                phone: parsedClaims.phone || 'not configured',
                provider: parsedClaims.app_metadata?.provider || 'email'
            }
        }, null, 4);
    } else if (tokenViewer) {
        tokenViewer.textContent = 'Unable to decode active session token claims.';
    }

    const localClientId = localStorage.getItem('client_id');
    if (dashboardClientId) {
        dashboardClientId.textContent = localClientId ? localClientId : 'No visitor tracking token present';
    }
}

function initAdminListPage(session) {
    populateAdminIdentity(session);

    pingDatabaseConnection();
    loadAdminSummary(session).then((shouldContinue) => {
        if (shouldContinue !== false) {
            loadAdminOverview(session);
        }
    });
}

function initAdminUserPage(session) {
    populateAdminIdentity(session);

    const searchParams = new URLSearchParams(window.location.search);
    const requestedClientId = parseAdminPageNumber(searchParams.get('clientId'));
    const requestedConversationId = searchParams.get('conversationId');

    if (!requestedClientId) {
        redirectToAdminList();
        return;
    }

    adminState.selectedClientId = requestedClientId;
    adminState.selectedConversationId = requestedConversationId ? String(requestedConversationId) : null;
    updateUserPageHeading(null, []);
    renderClientDetailPlaceholder('Loading secure user details...');
    renderSessionsPlaceholder('Loading recent sessions...');
    renderEventsPlaceholder('Loading recent events...');
    renderConversationsPlaceholder('Loading conversations for this user...');
    renderConversationDetailPlaceholder('Select a conversation to inspect the full chat transcript and user context.');
    loadAdminClientDetail(session, requestedClientId);
}

// Populate and Initialize the Active Dashboard UI
function initDashboard(session) {
    if (isAdminUserPage) {
        initAdminUserPage(session);
        return;
    }

    initAdminListPage(session);
}

async function loadAdminSummary(session) {
    if (!session?.access_token) {
        setSummaryStatus('No secure admin session is available.');
        setSummaryValues();
        return;
    }

    setSummaryStatus('Loading secure dashboard summary...');
    setSummaryValues();

    try {
        const response = await fetch(`${FUNCTIONS_BASE_URL}/get-admin-dashboard-data?scope=summary`, {
            method: 'GET',
            headers: {
                'apikey': PUBLIC_ANON_KEY,
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload?.ok) {
            const errorCode = payload?.error?.code || '';
            const errorMessage = payload?.error?.message || 'Unable to load the secure admin summary.';

            if (response.status === 401 || response.status === 403 || errorCode === 'INVALID_TOKEN' || errorCode === 'ADMIN_ACCESS_REQUIRED') {
                clearSessionAndReturnToLogin(errorMessage);
                return;
            }

            throw new Error(errorMessage);
        }

        const summary = payload.data?.summary || {};
        setSummaryValues(summary);

        const generatedAt = summary.generatedAt ? new Date(summary.generatedAt).toLocaleString() : '';
        setSummaryStatus(generatedAt ? `Secure summary loaded at ${generatedAt}` : 'Secure summary loaded.');
    } catch (error) {
        setSummaryStatus(error.message || 'Unable to load the secure admin summary.');
        return false;
    }

    return true;
}

function renderVisitorsList(clients = []) {
    if (!Array.isArray(clients) || clients.length === 0) {
        adminVisitorsList.innerHTML = '<p class="admin-empty-state">No user data has been recorded yet.</p>';
        return;
    }

    const sortedClients = sortClientsByRecentActivity(clients);

    adminVisitorsList.innerHTML = sortedClients.map((client) => `
        <button type="button" class="admin-entity-card ${Number(client.id) === Number(adminState.selectedClientId) ? 'is-active' : ''}" data-client-id="${escapeHtml(client.id)}">
            <div class="admin-entity-card-top">
                <div>
                    <div class="admin-entity-title">${escapeHtml(getDisplayName(client))}</div>
                    <div class="admin-entity-meta">${escapeHtml(getLocationLabel(client))}</div>
                </div>
                <span class="admin-pill ${client.mobileNumber ? 'admin-pill-success' : 'admin-pill-warning'}">${client.mobileNumber ? 'Mobile' : 'Anonymous'}</span>
            </div>
            <div class="admin-pill-row">
                <span class="admin-pill">${escapeHtml(client.deviceType || 'unknown')}</span>
                <span class="admin-pill">${escapeHtml(client.browser || 'browser')}</span>
                <span class="admin-pill">${formatMetricValue(client.conversationCount || 0)} chats</span>
            </div>
            <div class="admin-entity-meta">Last seen ${escapeHtml(formatRelativeTime(client.lastSeenAt))} on ${escapeHtml(client.lastSeenPage || '/')}</div>
        </button>
    `).join('');

    adminVisitorsList.querySelectorAll('[data-client-id]').forEach((button) => {
        button.addEventListener('click', () => {
            const clientId = Number(button.getAttribute('data-client-id'));
            if (Number.isFinite(clientId)) {
                navigateToUserDetail(clientId);
            }
        });
    });
}

function renderConversationsList(conversations = []) {
    if (!Array.isArray(conversations) || conversations.length === 0) {
        renderConversationsPlaceholder('No conversations are available for this user yet.');
        return;
    }

    adminConversationsList.innerHTML = conversations.map((conversation) => `
        <button type="button" class="admin-entity-card ${String(conversation.id) === String(adminState.selectedConversationId) ? 'is-active' : ''}" data-conversation-id="${escapeHtml(conversation.id)}">
            <div class="admin-entity-card-top">
                <div>
                    <div class="admin-entity-title">${escapeHtml(getConversationLabel(conversation))}</div>
                    <div class="admin-entity-meta">Updated ${escapeHtml(formatRelativeTime(conversation.updatedAt))}</div>
                </div>
                <span class="admin-pill ${getConversationStatusClass(conversation.status)}">${escapeHtml(conversation.status || 'open')}</span>
            </div>
            <div class="admin-entity-meta">${escapeHtml(conversation.latestMessagePreview || 'No messages yet')}</div>
            <div class="admin-pill-row">
                <span class="admin-pill">${formatMetricValue(conversation.messageCount || 0)} messages</span>
                <span class="admin-pill">${escapeHtml(formatDateTime(conversation.updatedAt))}</span>
            </div>
        </button>
    `).join('');

    adminConversationsList.querySelectorAll('[data-conversation-id]').forEach((button) => {
        button.addEventListener('click', () => {
            const conversationId = button.getAttribute('data-conversation-id');
            if (conversationId) {
                loadAdminConversationDetail(adminState.session, conversationId);
            }
        });
    });
}

function renderClientDetail(detail) {
    if (!detail?.client) {
        renderClientDetailPlaceholder('User detail is unavailable.');
        return;
    }

    const client = detail.client;

    adminClientDetailContent.innerHTML = `
        <div class="admin-detail-stack">
            <div class="admin-detail-head">
                <div>
                    <div class="admin-detail-title">${escapeHtml(getDisplayName(client))}</div>
                    <div class="admin-detail-subtitle">${escapeHtml(getLocationLabel(client))}</div>
                </div>
                <div class="admin-pill-row">
                    <span class="admin-pill ${client.mobileNumber ? 'admin-pill-success' : 'admin-pill-warning'}">${client.mobileNumber ? 'Lead captured' : 'No mobile'}</span>
                </div>
            </div>

            <div class="admin-detail-grid">
                <div class="admin-detail-kv">
                    <span class="admin-detail-label">Mobile</span>
                    <div class="admin-detail-value">${escapeHtml(getMobileLabel(client))}</div>
                </div>
                <div class="admin-detail-kv">
                    <span class="admin-detail-label">Referrer</span>
                    <div class="admin-detail-value">${escapeHtml(getReferrerLabel(client))}</div>
                </div>
                <div class="admin-detail-kv">
                    <span class="admin-detail-label">Device</span>
                    <div class="admin-detail-value">${escapeHtml(`${client.deviceType || 'unknown'} - ${client.browser || 'unknown'}`)}</div>
                </div>
                <div class="admin-detail-kv">
                    <span class="admin-detail-label">Timezone</span>
                    <div class="admin-detail-value">${escapeHtml(client.timezone || 'Not available')}</div>
                </div>
                <div class="admin-detail-kv">
                    <span class="admin-detail-label">Last Seen</span>
                    <div class="admin-detail-value">${escapeHtml(formatDateTime(client.lastSeenAt))}</div>
                </div>
                <div class="admin-detail-kv">
                    <span class="admin-detail-label">Tracking ID</span>
                    <div class="admin-detail-value">${escapeHtml(client.publicClientId || 'Not available')}</div>
                </div>
            </div>
        </div>
    `;
}

function renderSessionsList(sessions = []) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
        renderSessionsPlaceholder('No sessions recorded for this user yet.');
        return;
    }

    adminSessionsList.innerHTML = `
        <div class="admin-sublist">
            ${sessions.map((session) => `
                <div class="admin-sublist-item">
                    <div class="admin-sublist-title">${escapeHtml(session.entryPage || '/')} -> ${escapeHtml(session.lastPage || '/')}</div>
                    <div>Started ${escapeHtml(formatDateTime(session.startedAt))}</div>
                    <div>Last activity ${escapeHtml(formatRelativeTime(session.lastActivityAt))}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderEventsList(pageEvents = []) {
    if (!Array.isArray(pageEvents) || pageEvents.length === 0) {
        renderEventsPlaceholder('No page events recorded for this user yet.');
        return;
    }

    adminEventsList.innerHTML = `
        <div class="admin-sublist">
            ${pageEvents.slice(0, 20).map((event) => `
                <div class="admin-sublist-item">
                    <div class="admin-sublist-title">${escapeHtml(event.eventType || 'event')} on ${escapeHtml(event.pagePath || '/')}</div>
                    <div>${escapeHtml(event.pageTitle || 'Untitled page')}</div>
                    <div>${escapeHtml(formatDateTime(event.createdAt))}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderConversationDetail(detail) {
    if (!detail?.conversation) {
        renderConversationDetailPlaceholder('Conversation detail is unavailable.');
        return;
    }

    const client = detail.client || {};
    const conversation = detail.conversation;
    const session = detail.session;
    const messages = Array.isArray(detail.messages) ? detail.messages : [];

    adminConversationDetailContent.innerHTML = `
        <div class="admin-detail-stack">
            <div class="admin-detail-head">
                <div>
                    <div class="admin-detail-title">${escapeHtml(getDisplayName(client))}</div>
                    <div class="admin-detail-subtitle">${escapeHtml(getLocationLabel(client))}</div>
                </div>
                <div class="admin-pill-row">
                    <span class="admin-pill ${getConversationStatusClass(conversation.status)}">${escapeHtml(conversation.status || 'open')}</span>
                </div>
            </div>

            <div class="admin-detail-grid">
                <div class="admin-detail-kv">
                    <span class="admin-detail-label">Conversation ID</span>
                    <div class="admin-detail-value">${escapeHtml(conversation.id || '')}</div>
                </div>
                <div class="admin-detail-kv">
                    <span class="admin-detail-label">Messages</span>
                    <div class="admin-detail-value">${formatMetricValue(conversation.messageCount || 0)}</div>
                </div>
                <div class="admin-detail-kv">
                    <span class="admin-detail-label">Updated</span>
                    <div class="admin-detail-value">${escapeHtml(formatDateTime(conversation.updatedAt))}</div>
                </div>
                <div class="admin-detail-kv">
                    <span class="admin-detail-label">Active Session</span>
                    <div class="admin-detail-value">${escapeHtml(session?.id || conversation.activeSessionId || 'Not linked')}</div>
                </div>
            </div>

            <div class="admin-subsection">
                <div class="admin-subsection-title">User Context</div>
                <div class="admin-sublist">
                    <div class="admin-sublist-item">
                        <div class="admin-sublist-title">${escapeHtml(getDisplayName(client))}</div>
                        <div>Mobile: ${escapeHtml(getMobileLabel(client))}</div>
                        <div>Referrer: ${escapeHtml(getReferrerLabel(client))}</div>
                        <div>Last seen: ${escapeHtml(formatDateTime(client.lastSeenAt))}</div>
                    </div>
                </div>
            </div>

            <div class="admin-subsection">
                <div class="admin-subsection-title">Full Transcript</div>
                <div class="admin-message-stack">
                    ${messages.length > 0 ? messages.map((message) => `
                        <div class="admin-message-card ${getSenderClass(message.senderType)}">
                            <div class="admin-message-meta">
                                <span class="admin-message-author">${escapeHtml(getSenderLabel(message.senderType))}</span>
                                <span class="admin-message-time">${escapeHtml(formatDateTime(message.createdAt))}</span>
                            </div>
                            <div class="admin-message-body">${escapeHtml(message.messageText || '')}</div>
                        </div>
                    `).join('') : '<div class="admin-sublist-item">No messages are available for this conversation.</div>'}
                </div>
            </div>
        </div>
    `;
}

async function loadAdminOverview(session) {
    adminVisitorsStatus.textContent = 'Loading users...';
    adminVisitorsList.innerHTML = '';

    try {
        const data = await fetchAdminData(session, 'overview');
        if (!data) {
            return;
        }

        const clients = sortClientsByRecentActivity(Array.isArray(data.clients) ? data.clients : []);

        adminVisitorsStatus.textContent = `${formatMetricValue(clients.length)} users loaded, newest activity first`;
        renderVisitorsList(clients);

        if (clients.length === 0) {
            adminVisitorsStatus.textContent = 'No users have been recorded yet.';
            adminVisitorsList.innerHTML = '<p class="admin-empty-state">No users are available yet.</p>';
        }
    } catch (error) {
        adminVisitorsStatus.textContent = error.message || 'Unable to load users.';
        adminVisitorsList.innerHTML = '<p class="admin-empty-state">User data could not be loaded.</p>';
    }
}

async function loadAdminClientDetail(session, clientId) {
    if (!session || !clientId) {
        return;
    }

    adminState.selectedClientId = Number(clientId);
    adminClientDetailStatus.textContent = 'Loading user details...';
    if (adminSessionsStatus) {
        adminSessionsStatus.textContent = 'Loading recent sessions...';
    }
    if (adminEventsStatus) {
        adminEventsStatus.textContent = 'Loading recent events...';
    }
    adminConversationsStatus.textContent = 'Loading selected user conversations...';
    adminClientDetailContent.innerHTML = '';
    renderSessionsPlaceholder('Loading recent sessions...');
    renderEventsPlaceholder('Loading recent events...');
    renderConversationsPlaceholder('Loading conversations for the selected user...');
    renderConversationDetailPlaceholder('Select a conversation to inspect the full chat transcript and user context.');
    setActiveClientSelection(clientId);

    try {
        const data = await fetchAdminData(session, 'client', { clientId });
        if (!data) {
            return;
        }

        const client = data.client || null;
        const sessions = Array.isArray(data.sessions) ? data.sessions : [];
        const pageEvents = Array.isArray(data.pageEvents) ? data.pageEvents : [];
        const conversations = [...(Array.isArray(data.conversations) ? data.conversations : [])].sort((left, right) => {
            const leftTime = new Date(left?.updatedAt || 0).getTime();
            const rightTime = new Date(right?.updatedAt || 0).getTime();
            return rightTime - leftTime;
        });
        const clientName = client ? getDisplayName(client) : 'Selected user';
        const requestedConversationId = adminState.selectedConversationId;

        adminClientDetailStatus.textContent = `User details refreshed at ${new Date().toLocaleTimeString()}`;
        renderClientDetail(data);
        renderSessionsList(sessions);
        renderEventsList(pageEvents);
        renderConversationsList(conversations);
        adminConversationsStatus.textContent = `${formatMetricValue(conversations.length)} conversations for ${clientName}`;
        if (adminSessionsStatus) {
            adminSessionsStatus.textContent = `${formatMetricValue(sessions.length)} recent sessions`;
        }
        if (adminEventsStatus) {
            adminEventsStatus.textContent = `${formatMetricValue(pageEvents.length)} recent events`;
        }
        updateUserPageHeading(client, conversations);
        setActiveClientSelection(clientId);
        syncUserPageUrl(clientId, requestedConversationId);

        const selectedConversationStillBelongsToUser = conversations.some((conversation) => String(conversation.id) === String(adminState.selectedConversationId));

        if (selectedConversationStillBelongsToUser) {
            setActiveConversationSelection(adminState.selectedConversationId);
            loadAdminConversationDetail(session, adminState.selectedConversationId);
            return;
        }

        if (conversations[0]?.id) {
            adminState.selectedConversationId = String(conversations[0].id);
            loadAdminConversationDetail(session, adminState.selectedConversationId);
            return;
        }

        adminState.selectedConversationId = null;
        adminConversationsStatus.textContent = `No conversations found for ${clientName}.`;
        renderConversationsPlaceholder(`No conversations are available for ${clientName} yet.`);
        adminConversationDetailStatus.textContent = 'No conversation selected.';
        renderConversationDetailPlaceholder('This user has no conversations yet.');
        syncUserPageUrl(clientId);
    } catch (error) {
        adminClientDetailStatus.textContent = error.message || 'Unable to load user details.';
        renderClientDetailPlaceholder('User details could not be loaded.');
        if (adminSessionsStatus) {
            adminSessionsStatus.textContent = error.message || 'Unable to load recent sessions.';
        }
        if (adminEventsStatus) {
            adminEventsStatus.textContent = error.message || 'Unable to load recent events.';
        }
        renderSessionsPlaceholder('Recent sessions could not be loaded.');
        renderEventsPlaceholder('Recent events could not be loaded.');
        adminConversationsStatus.textContent = error.message || 'Unable to load selected user conversations.';
        renderConversationsPlaceholder('Conversation data could not be loaded for this user.');
    }
}

async function loadAdminConversationDetail(session, conversationId) {
    if (!session || !conversationId) {
        return;
    }

    adminState.selectedConversationId = String(conversationId);
    adminConversationDetailStatus.textContent = 'Loading conversation detail...';
    adminConversationDetailContent.innerHTML = '';

    try {
        const data = await fetchAdminData(session, 'conversation', { conversationId });
        if (!data) {
            return;
        }

        adminConversationDetailStatus.textContent = `Conversation detail refreshed at ${new Date().toLocaleTimeString()}`;
        renderConversationDetail(data);
        setActiveConversationSelection(conversationId);

        if (data.client?.id) {
            adminState.selectedClientId = Number(data.client.id);
            setActiveClientSelection(adminState.selectedClientId);
            syncUserPageUrl(adminState.selectedClientId, conversationId);
        }
    } catch (error) {
        adminConversationDetailStatus.textContent = error.message || 'Unable to load conversation detail.';
        renderConversationDetailPlaceholder('Conversation detail could not be loaded.');
    }
}

// Validate database/auth telemetry response latency
async function pingDatabaseConnection() {
    if (!dbStatusIndicator || !dbStatusText || !dbPingBtn) {
        return;
    }

    dbStatusIndicator.className = 'admin-status-dot testing';
    dbStatusText.textContent = 'Testing Latency...';
    dbPingBtn.disabled = true;
    
    const startTime = Date.now();
    try {
        const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
            method: 'GET',
            headers: {
                'apikey': PUBLIC_ANON_KEY
            }
        });
        
        const latency = Date.now() - startTime;
        if (response.ok) {
            dbStatusIndicator.className = 'admin-status-dot active';
            dbStatusText.textContent = `Online (${latency}ms)`;
        } else {
            throw new Error();
        }
    } catch (e) {
        dbStatusIndicator.className = 'admin-status-dot';
        dbStatusText.textContent = 'Offline / Connection Timeout';
    } finally {
        dbPingBtn.disabled = false;
    }
}

// Check session on window load
function checkSession() {
    const sessionStr = localStorage.getItem(SESSION_KEY);
    if (!sessionStr) {
        if (isAdminUserPage) {
            redirectToAdminList();
        }
        return;
    }
    
    try {
        const session = JSON.parse(sessionStr);
        const parsedClaims = parseJwt(session.access_token);
        
        // Auto expire session if token has expired
        if (parsedClaims && parsedClaims.exp * 1000 > Date.now()) {
            initDashboard(session);
            if (loginView && dashboardView) {
                loginView.style.display = 'none';
                dashboardView.style.display = 'flex';
                dashboardView.style.opacity = '1';
            }
        } else {
            localStorage.removeItem(SESSION_KEY);
            if (isAdminUserPage) {
                redirectToAdminList();
            }
        }
    } catch (e) {
        localStorage.removeItem(SESSION_KEY);
        if (isAdminUserPage) {
            redirectToAdminList();
        }
    }
}

// --- Event Listeners ---

// Password Show/Hide Toggle
if (passwordToggleBtn && passwordInput) {
    passwordToggleBtn.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        
        if (isPassword) {
            passwordToggleBtn.innerHTML = `
                <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"></path>
                </svg>
            `;
            passwordToggleBtn.setAttribute('aria-label', 'Hide password');
        } else {
            passwordToggleBtn.innerHTML = `
                <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
            `;
            passwordToggleBtn.setAttribute('aria-label', 'Show password');
        }
    });
}

// Perform authentication POST against GoTrue REST gateway
if (loginForm && emailInput && passwordInput) {
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearAlert();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        
        if (!email || !password) {
            showAlert('Please fill in both the User ID/Email and Password fields.');
            return;
        }
        
        setButtonLoading(true);
        
        try {
            const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': PUBLIC_ANON_KEY
                },
                body: JSON.stringify({ email, password })
            });
            
            const payload = await response.json();
            
            if (!response.ok) {
                const errorMsg = payload.error_description || payload.error?.message || 'Verification failed. Please review your administrative credentials.';
                throw new Error(errorMsg);
            }
            
            localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
            initDashboard(payload);
            
            showAlert('Authentication successful! Welcome to the Admin Console.', 'success');
            
            setTimeout(() => {
                clearAlert();
                transitionToView('dashboard');
                
                emailInput.value = '';
                passwordInput.value = '';
            }, 1200);
            
        } catch (error) {
            showAlert(error.message);
        } finally {
            setButtonLoading(false);
        }
    });
}

// Telemetry manual ping trigger
if (dbPingBtn) {
    dbPingBtn.addEventListener('click', pingDatabaseConnection);
}

// Perform secure local session termination
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem(SESSION_KEY);
        adminState.session = null;

        if (isAdminUserPage) {
            redirectToAdminList();
            return;
        }

        transitionToView('login');
    });
}

// Initialize on document arrival
window.addEventListener('DOMContentLoaded', checkSession);
