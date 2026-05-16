/*
File: /supabase/functions/heartbeat/index.ts
Purpose: Refresh anonymous session activity and rotate to a new session when inactivity has expired.
*/

import { refreshAnonymousSession } from '../_shared/backend.ts';
import { assertMethod, handleUnexpectedError, optionsResponse, readJsonBody, successResponse } from '../_shared/http.ts';
import { parseHeartbeatPayload } from '../_shared/validation.ts';

// Section: Edge Function handler.
Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return optionsResponse(request);
    }

    try {
        assertMethod(request, ['POST']);
        const payload = parseHeartbeatPayload(await readJsonBody(request));
        const snapshot = await refreshAnonymousSession(payload);
        return successResponse(request, snapshot);
    } catch (error) {
        return handleUnexpectedError(request, error);
    }
});
