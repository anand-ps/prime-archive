/*
File: /supabase/functions/get-admin-dashboard-data/index.ts
Purpose: Return secure admin dashboard data after server-side token validation.
*/

import { requireAdminUser } from '../_shared/auth.ts';
import {
    getAdminClientDetail,
    getAdminConversationDetail,
    getAdminDashboardOverview,
    getAdminDashboardSummary
} from '../_shared/backend.ts';
import { HttpError } from '../_shared/http.ts';
import { assertMethod, handleUnexpectedError, optionsResponse, successResponse } from '../_shared/http.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePositiveInteger(value: string | null, fieldName: string) {
    const numericValue = Number.parseInt(String(value || '').trim(), 10);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        throw new HttpError(400, 'VALIDATION_ERROR', `"${fieldName}" must be a positive integer.`);
    }

    return numericValue;
}

function parseUuid(value: string | null, fieldName: string) {
    const normalizedValue = String(value || '').trim();

    if (!UUID_PATTERN.test(normalizedValue)) {
        throw new HttpError(400, 'VALIDATION_ERROR', `"${fieldName}" must be a valid UUID.`);
    }

    return normalizedValue;
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return optionsResponse(request);
    }

    try {
        assertMethod(request, ['GET']);

        const adminUser = await requireAdminUser(request);
        const url = new URL(request.url);
        const scope = String(url.searchParams.get('scope') || 'summary').trim().toLowerCase();

        console.info(`[ADMIN] Authorized dashboard request for ${adminUser.email || adminUser.userId}. Scope: ${scope}.`);

        if (scope === 'summary') {
            const summary = await getAdminDashboardSummary();
            return successResponse(request, {
                scope,
                summary
            });
        }

        if (scope === 'overview') {
            const overview = await getAdminDashboardOverview();
            return successResponse(request, {
                scope,
                ...overview
            });
        }

        if (scope === 'client') {
            const clientId = parsePositiveInteger(url.searchParams.get('clientId'), 'clientId');
            const detail = await getAdminClientDetail(clientId);
            return successResponse(request, {
                scope,
                ...detail
            });
        }

        if (scope === 'conversation') {
            const conversationId = parseUuid(url.searchParams.get('conversationId'), 'conversationId');
            const detail = await getAdminConversationDetail(conversationId);
            return successResponse(request, {
                scope,
                ...detail
            });
        }

        throw new HttpError(400, 'INVALID_SCOPE', `Unsupported admin scope "${scope}".`);
    } catch (error) {
        return handleUnexpectedError(request, error);
    }
});
