/*
File: /supabase/functions/_shared/auth.ts
Purpose: Validate admin bearer tokens for privileged Edge Functions.
*/

import { getAdminClient } from './db.ts';
import { HttpError } from './http.ts';

function getBearerToken(request: Request) {
    const authorizationHeader = String(request.headers.get('authorization') || '').trim();

    if (!authorizationHeader.toLowerCase().startsWith('bearer ')) {
        throw new HttpError(401, 'AUTHORIZATION_REQUIRED', 'A valid bearer token is required.');
    }

    const accessToken = authorizationHeader.slice(7).trim();

    if (!accessToken) {
        throw new HttpError(401, 'AUTHORIZATION_REQUIRED', 'A valid bearer token is required.');
    }

    return accessToken;
}

function hasAdminMetadata(user: Record<string, unknown>) {
    const appMetadata = user.app_metadata && typeof user.app_metadata === 'object'
        ? user.app_metadata as Record<string, unknown>
        : {};
    const userMetadata = user.user_metadata && typeof user.user_metadata === 'object'
        ? user.user_metadata as Record<string, unknown>
        : {};

    const appRole = String(appMetadata.role || '').trim().toLowerCase();
    const userRole = String(userMetadata.role || '').trim().toLowerCase();

    return appRole === 'admin'
        || userRole === 'admin'
        || appMetadata.is_admin === true
        || userMetadata.is_admin === true;
}

export async function requireAdminUser(request: Request) {
    const accessToken = getBearerToken(request);
    const admin = getAdminClient();
    const { data, error } = await admin.auth.getUser(accessToken);

    if (error || !data.user) {
        throw new HttpError(401, 'INVALID_TOKEN', 'The supplied session token is invalid or expired.');
    }

    const user = data.user as unknown as Record<string, unknown>;
    const email = String(user.email || '').trim().toLowerCase();
    const isAdmin = hasAdminMetadata(user);

    if (!isAdmin) {
        throw new HttpError(403, 'ADMIN_ACCESS_REQUIRED', 'This account is not authorized to access admin data.');
    }

    // Backend-driven automatic audit and Telegram alert
    auditAdminLogin(String(user.id || ''), email, accessToken, request).catch((err) => {
        console.error('[ADMIN AUDIT ERROR]', err);
    });

    return {
        accessToken,
        userId: String(user.id || ''),
        email,
        adminSource: 'metadata'
    };
}

function parseJwt(token: string) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch {
        return null;
    }
}

async function auditAdminLogin(userId: string, email: string, accessToken: string, request: Request) {
    const claims = parseJwt(accessToken);
    const sessionId = claims?.session_id || claims?.sid;
    if (!sessionId) return;

    const admin = getAdminClient();
    
    try {
        // Query to check if the session is already audited
        const { data, error } = await admin
            .from('admin_logins')
            .select('id')
            .eq('session_id', sessionId)
            .maybeSingle();

        if (error) {
            console.error('[ADMIN AUDIT] Table check failed (ignoring error):', error.message);
            return;
        }

        if (!data) {
            const rawIp = request.headers.get('x-forwarded-for') || 'Unknown';
            const ip = rawIp.split(',')[0].trim();
            const userAgent = request.headers.get('user-agent') || 'Unknown';

            // Insert audit record
            const { error: insertError } = await admin
                .from('admin_logins')
                .insert({
                    user_id: userId,
                    email,
                    session_id: sessionId,
                    ip_address: ip,
                    user_agent: userAgent
                });

            if (insertError) {
                console.error('[ADMIN AUDIT] Failed to save audit row:', insertError.message);
                return;
            }

            // Send notification to Telegram
            const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
            const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
            if (token && chatId) {
                const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
                const message = `🔔 <b>Admin Login Alert</b>\n\n` +
                                `<b>Email:</b> <code>${email}</code>\n` +
                                `<b>IP Address:</b> <a href="https://ipinfo.io/${ip}">${ip}</a>\n` +
                                `<b>User Agent:</b> <code>${userAgent}</code>\n` +
                                `<b>Time:</b> <code>${timestamp} (IST)</code>`;

                await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: message,
                        parse_mode: 'HTML'
                    })
                }).catch((err) => {
                    console.error('[ADMIN AUDIT] Telegram send error:', err);
                });
            }
        }
    } catch (e) {
        console.error('[ADMIN AUDIT] Execution warning:', e);
    }
}

