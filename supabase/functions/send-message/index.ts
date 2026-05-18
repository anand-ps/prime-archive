/*
File: /supabase/functions/send-message/index.ts
Purpose: Validate and store anonymous client chat messages through privileged backend access only.
*/

import { createClientMessage } from '../_shared/backend.ts';
import { assertMethod, handleUnexpectedError, optionsResponse, readJsonBody, successResponse } from '../_shared/http.ts';
import { parseSendMessagePayload } from '../_shared/validation.ts';

// Section: Edge Function handler.
Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return optionsResponse(request);
    }

    try {
        assertMethod(request, ['POST']);
        const payload = parseSendMessagePayload(await readJsonBody(request));
        const result = await createClientMessage(payload);
        return successResponse(request, result);
    } catch (error) {
        return handleUnexpectedError(request, error);
    }
});
