/*
File: /supabase/functions/get-messages/index.ts
Purpose: Return ordered conversation messages for the current anonymous client context.
*/

import { listConversationMessages } from '../_shared/backend.ts';
import { assertMethod, handleUnexpectedError, optionsResponse, successResponse } from '../_shared/http.ts';
import { parseGetMessagesRequest } from '../_shared/validation.ts';

// Section: Edge Function handler.
Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return optionsResponse(request);
    }

    try {
        assertMethod(request, ['GET']);
        const payload = parseGetMessagesRequest(request);
        const result = await listConversationMessages(payload);
        return successResponse(request, result);
    } catch (error) {
        return handleUnexpectedError(request, error);
    }
});
