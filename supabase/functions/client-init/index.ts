/*
File: /supabase/functions/client-init/index.ts
Purpose: Initialize or resume an anonymous browser client, active session, and persistent conversation.
*/

import { initializeAnonymousClient } from '../_shared/backend.ts';
import { assertMethod, handleUnexpectedError, optionsResponse, readJsonBody, successResponse } from '../_shared/http.ts';
import { parseClientInitPayload } from '../_shared/validation.ts';

// Section: Edge Function handler.
Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return optionsResponse(request);
    }

    try {
        assertMethod(request, ['POST']);
        const payload = parseClientInitPayload(await readJsonBody(request));
        const snapshot = await initializeAnonymousClient(payload);
        return successResponse(request, snapshot);
    } catch (error) {
        return handleUnexpectedError(request, error);
    }
});
