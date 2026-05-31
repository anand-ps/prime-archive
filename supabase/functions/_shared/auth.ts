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

    return {
        accessToken,
        userId: String(user.id || ''),
        email,
        adminSource: 'metadata'
    };
}
