/*
File: /supabase/functions/client-init/index.ts
Purpose: Initialize or resume an anonymous browser client, active session, and persistent conversation.
*/

import { initializeAnonymousClient } from '../_shared/backend.ts';
import { assertMethod, handleUnexpectedError, optionsResponse, readJsonBody, successResponse } from '../_shared/http.ts';
import { parseClientInitPayload } from '../_shared/validation.ts';

// Section: Helper to mask IP address for privacy in logs.
function maskIp(ip: string): string {
    if (!ip) return "unknown";
    
    // Check if it's an IPv6 address
    if (ip.includes(":")) {
        const parts = ip.split(":");
        // Mask the second half of the IPv6 blocks
        return parts.map((part, index) => (index >= Math.ceil(parts.length / 2) ? "xxxx" : part)).join(":");
    }
    
    // Otherwise assume it's IPv4
    const parts = ip.split(".");
    if (parts.length === 4) {
        // Mask the last two octets for privacy
        return `${parts[0]}.${parts[1]}.x.x`;
    }
    
    return ip;
}

// Section: Edge Function handler.
Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return optionsResponse(request);
    }

    try {
        assertMethod(request, ['POST']);
        const payload = parseClientInitPayload(await readJsonBody(request));
        
        // Extract client IP address from standard headers for server-side debugging
        const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
            || request.headers.get("cf-connecting-ip")
            || "";
            
        console.info(`[DEBUG] Client initialization request from IP: ${maskIp(clientIp)}`);

        const snapshot = await initializeAnonymousClient(payload);
        return successResponse(request, snapshot);
    } catch (error) {
        return handleUnexpectedError(request, error);
    }
});
