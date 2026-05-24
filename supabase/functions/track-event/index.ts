/*
File: /supabase/functions/track-event/index.ts
Purpose: Persist frontend analytics events and return the current page view total when relevant.
*/

import { createEventRecord } from '../_shared/backend.ts';
import { assertMethod, handleUnexpectedError, optionsResponse, readJsonBody, successResponse } from '../_shared/http.ts';
import { parseTrackEventPayload } from '../_shared/validation.ts';

// Section: Edge Function handler.
Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return optionsResponse(request);
    }

    try {
        assertMethod(request, ['POST']);
        const payload = parseTrackEventPayload(await readJsonBody(request));
        console.info(`[DEBUG] Tracking event: "${payload.eventType}" | Page: "${payload.pagePath}" | Title: "${payload.pageTitle}"`);
        
        const result = await createEventRecord(payload);
        console.info(`[DEBUG] Event stored. Event ID: ${result.eventId}. Total Page Views: ${result.pageViewCount ?? 'N/A'}`);
        return successResponse(request, result);
    } catch (error) {
        return handleUnexpectedError(request, error);
    }
});
