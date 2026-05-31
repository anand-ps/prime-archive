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
    alertContainer.innerHTML = '';
}

function formatMetricValue(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return '--';
    }

    return new Intl.NumberFormat('en-US').format(numericValue);
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
    adminSummaryStatus.textContent = message;
}

function clearSessionAndReturnToLogin(message) {
    localStorage.removeItem(SESSION_KEY);
    transitionToView('login');

    window.setTimeout(() => {
        showAlert(message);
    }, 220);
}

// Manage UI View States with Transition Fades
function transitionToView(target) {
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
            loginView.style.display = 'block';
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

// Populate and Initialize the Active Dashboard UI
function initDashboard(session) {
    const user = session.user;
    const email = user.email || 'admin@anandps.in';
    
    // Set Welcome headers
    profileEmail.textContent = email;
    const username = email.split('@')[0];
    welcomeName.textContent = `Welcome back, ${username.charAt(0).toUpperCase() + username.slice(1)}!`;
    initialsAvatar.textContent = username.substring(0, 2).toUpperCase();
    
    // Parse and print JWT claims beautifully
    const parsedClaims = parseJwt(session.access_token);
    if (parsedClaims) {
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
    } else {
        tokenViewer.textContent = 'Unable to decode active session token claims.';
    }
    
    // Read local visitor client ID
    const localClientId = localStorage.getItem('client_id');
    dashboardClientId.textContent = localClientId ? localClientId : 'No visitor tracking token present';
    
    // Auto-ping database on entrance
    pingDatabaseConnection();
    loadAdminSummary(session);
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
    }
}

// Validate database/auth telemetry response latency
async function pingDatabaseConnection() {
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
    if (!sessionStr) return;
    
    try {
        const session = JSON.parse(sessionStr);
        const parsedClaims = parseJwt(session.access_token);
        
        // Auto expire session if token has expired
        if (parsedClaims && parsedClaims.exp * 1000 > Date.now()) {
            initDashboard(session);
            loginView.style.display = 'none';
            dashboardView.style.display = 'flex';
            dashboardView.style.opacity = '1';
        } else {
            localStorage.removeItem(SESSION_KEY);
        }
    } catch (e) {
        localStorage.removeItem(SESSION_KEY);
    }
}

// --- Event Listeners ---

// Password Show/Hide Toggle
passwordToggleBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    
    // Switch SVG Icon dynamically for modern states
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

// Perform authentication POST against GoTrue REST gateway
loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAlert();
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    // Basic Input Validations
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
        
        // Save Session and Transition Views
        localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
        initDashboard(payload);
        
        showAlert('Authentication successful! Welcome to the Admin Console.', 'success');
        
        setTimeout(() => {
            clearAlert();
            transitionToView('dashboard');
            
            // Clean up credentials
            emailInput.value = '';
            passwordInput.value = '';
        }, 1200);
        
    } catch (error) {
        showAlert(error.message);
    } finally {
        setButtonLoading(false);
    }
});

// Telemetry manual ping trigger
dbPingBtn.addEventListener('click', pingDatabaseConnection);

// Perform secure local session termination
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem(SESSION_KEY);
    transitionToView('login');
});

// Initialize on document arrival
window.addEventListener('DOMContentLoaded', checkSession);
