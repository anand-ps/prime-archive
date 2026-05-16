/*
File: /supabase/functions/_shared/db.ts
Purpose: Provide a singleton service-role Supabase client for Edge Functions.
*/

import { createClient } from 'npm:@supabase/supabase-js@2';
import { getRequiredEnv } from './env.ts';

let adminClient: ReturnType<typeof createClient> | null = null;

// Section: Singleton factory.
export function getAdminClient() {
    if (adminClient) {
        return adminClient;
    }

    adminClient = createClient(
        getRequiredEnv('SUPABASE_URL'),
        getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            },
            global: {
                headers: {
                    'X-Client-Info': 'prime-archive-edge-functions'
                }
            }
        }
    );

    return adminClient;
}
