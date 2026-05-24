/*
File: /supabase/functions/_shared/env.ts
Purpose: Centralize Edge Function environment access and numeric runtime configuration.
*/

// Section: Default fallback settings (can be tweaked directly here)
const DEFAULT_SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour (in milliseconds)
const DEFAULT_MESSAGE_COOLDOWN_MS = 3000;         // 3 seconds (in milliseconds)
const DEFAULT_MESSAGE_WINDOW_MS = 60 * 1000;       // 1 minute (in milliseconds)
const DEFAULT_MESSAGE_WINDOW_LIMIT = 20;            // 20 messages maximum

// Section: Environment readers.
export function getRequiredEnv(name: string) {
    const value = String(Deno.env.get(name) || '').trim();

    if (!value) {
        throw new Error(`Missing required environment variable "${name}".`);
    }

    return value;
}

function getIntegerEnv(name: string, fallbackValue: number, minValue: number, maxValue: number) {
    const rawValue = String(Deno.env.get(name) || '').trim();
    const numericValue = Number.parseInt(rawValue, 10);

    if (!Number.isFinite(numericValue)) {
        return fallbackValue;
    }

    return Math.min(Math.max(numericValue, minValue), maxValue);
}

// Section: Shared backend runtime settings.
export const SESSION_TIMEOUT_MS = getIntegerEnv('SESSION_TIMEOUT_MS', DEFAULT_SESSION_TIMEOUT_MS, 60 * 1000, 24 * 60 * 60 * 1000);
export const MESSAGE_COOLDOWN_MS = getIntegerEnv('MESSAGE_COOLDOWN_MS', DEFAULT_MESSAGE_COOLDOWN_MS, 1000, 60 * 1000);
export const MESSAGE_WINDOW_MS = getIntegerEnv('MESSAGE_WINDOW_MS', DEFAULT_MESSAGE_WINDOW_MS, 10 * 1000, 10 * 60 * 1000);
export const MESSAGE_WINDOW_LIMIT = getIntegerEnv('MESSAGE_WINDOW_LIMIT', DEFAULT_MESSAGE_WINDOW_LIMIT, 1, 100);
