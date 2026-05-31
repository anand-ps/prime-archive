/*
File: /supabase/functions/get-admin-dashboard-data/index.ts
Purpose: Return secure admin dashboard data after server-side token validation.
*/

import { requireAdminUser } from '../_shared/auth.ts';
import { getAdminDashboardSummary } from '../_shared/backend.ts';
import { HttpError } from '../_shared/http.ts';
import { assertMethod, handleUnexpectedError, optionsResponse, successResponse } from '../_shared/http.ts';

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return optionsResponse(request);
    }

    try {
        assertMethod(request, ['GET']);

        const adminUser = await requireAdminUser(request);
        const url = new URL(request.url);
        const scope = String(url.searchParams.get('scope') || 'summary').trim().toLowerCase();

        if (scope !== 'summary') {
            throw new HttpError(400, 'INVALID_SCOPE', `Unsupported admin scope "${scope}".`);
        }

        console.info(`[ADMIN] Authorized dashboard request for ${adminUser.email || adminUser.userId}. Scope: ${scope}.`);

        const summary = await getAdminDashboardSummary();
        return successResponse(request, {
            scope,
            summary
        });
    } catch (error) {
        return handleUnexpectedError(request, error);
    }
});
