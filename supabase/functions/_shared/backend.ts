/*
File: /supabase/functions/_shared/backend.ts
Purpose: Encapsulate anonymous client, session, analytics, conversation, and message workflows for Edge Functions.
*/

import { getAdminClient } from './db.ts';
import { MESSAGE_COOLDOWN_MS, MESSAGE_WINDOW_LIMIT, MESSAGE_WINDOW_MS, SESSION_TIMEOUT_MS } from './env.ts';
import { HttpError } from './http.ts';

// Section: Shared row selectors.
const CLIENT_SELECT = 'id, public_client_id, client_name, mobile_number, last_seen_at, last_seen_page, created_at, timezone, device_type, browser, referrer, country_name, country_code, city_name, region_name, zip_code';
const SESSION_SELECT = 'id, client_id, entry_page, last_page, started_at, last_activity_at, ended_at';
const CONVERSATION_SELECT = 'id, client_id, active_session_id, status, created_at, updated_at, closed_at';
const MESSAGE_SELECT = 'id, conversation_id, client_id, session_id, sender_type, message_type, message_text, metadata, created_at';

// Section: Utility helpers.
function nowIso() {
    return new Date().toISOString();
}

function isSessionExpired(lastActivityAt: string) {
    const lastActivityTimestamp = Date.parse(String(lastActivityAt || ''));

    if (!Number.isFinite(lastActivityTimestamp)) {
        return true;
    }

    return (Date.now() - lastActivityTimestamp) > SESSION_TIMEOUT_MS;
}

function throwIfQueryError(error: { message?: string } | null, fallbackMessage: string) {
    if (error) {
        throw new HttpError(500, 'DATABASE_ERROR', error.message || fallbackMessage);
    }
}

function serializeSessionSnapshot(clientRow: Record<string, unknown>, sessionRow: Record<string, unknown>, conversationRow: Record<string, unknown>) {
    return {
        internalClientDbId: clientRow.id,
        sessionId: sessionRow.id,
        conversationId: conversationRow.id,
        lastActivityAt: sessionRow.last_activity_at,
        clientName: clientRow.client_name || ''
    };
}

function serializeMessage(row: Record<string, unknown>) {
    const metadata = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata))
        ? row.metadata as Record<string, unknown>
        : {};
    const displayVariant = String(metadata.displayVariant || '').trim().toLowerCase();
    const senderType = displayVariant === 'system'
        ? 'system'
        : row.sender_type;

    return {
        id: row.id,
        conversationId: row.conversation_id,
        clientId: row.client_id,
        sessionId: row.session_id,
        senderType,
        messageType: row.message_type,
        messageText: row.message_text,
        createdAt: row.created_at
    };
}

function normalizeStoredMobileNumber(rawValue: string) {
    const compactValue = String(rawValue || '').trim().replace(/[^\d+]/g, '');

    if (!compactValue) {
        return '';
    }

    if (compactValue.startsWith('+')) {
        const digitsOnly = compactValue.slice(1).replace(/\D/g, '');
        return digitsOnly ? `+${digitsOnly}` : '';
    }

    if (compactValue.startsWith('00')) {
        const digitsOnly = compactValue.slice(2).replace(/\D/g, '');
        return digitsOnly ? `+${digitsOnly}` : '';
    }

    const digitsOnly = compactValue.replace(/\D/g, '');
    return digitsOnly;
}

function extractMobileNumber(messageText: string) {
    const mobileMatch = String(messageText || '').match(/(?:^|[^\d+])((?:\+|00)?\d[\d\s().-]{8,20}\d)(?!\d)/);

    if (!mobileMatch?.[1]) {
        return '';
    }

    const normalizedMobileNumber = normalizeStoredMobileNumber(mobileMatch[1]);
    const digitCount = normalizedMobileNumber.replace(/\D/g, '').length;

    if (digitCount < 10 || digitCount > 15) {
        return '';
    }

    return normalizedMobileNumber;
}

// Section: Client helpers.
async function getClientByPublicId(publicClientId: string) {
    const admin = getAdminClient();
    const { data, error } = await admin
        .from('clients')
        .select(CLIENT_SELECT)
        .eq('public_client_id', publicClientId)
        .maybeSingle();

    throwIfQueryError(error, 'Unable to load client.');
    return data;
}

async function upsertClientRecord(payload: Record<string, unknown>) {
    const admin = getAdminClient();
    const timestamp = nowIso();
    const { data, error } = await admin
        .from('clients')
        .upsert({
            public_client_id: payload.clientId,
            browser: payload.browser,
            device_type: payload.deviceType,
            timezone: payload.timezone,
            screen_width: payload.screenWidth,
            screen_height: payload.screenHeight,
            referrer: payload.referrer,
            last_seen_page: payload.currentPage,
            last_seen_at: timestamp,
            country_name: payload.countryName || null,
            country_code: payload.countryCode || null,
            city_name: payload.cityName || null,
            region_name: payload.regionName || null,
            zip_code: payload.zipCode || null
        }, {
            onConflict: 'public_client_id'
        })
        .select(CLIENT_SELECT)
        .single();

    throwIfQueryError(error, 'Unable to create or update client.');
    return data;
}

async function touchClientPresence(clientDbId: number, currentPage: string) {
    const admin = getAdminClient();
    const { error } = await admin
        .from('clients')
        .update({
            last_seen_at: nowIso(),
            last_seen_page: currentPage || '/'
        })
        .eq('id', clientDbId);

    throwIfQueryError(error, 'Unable to update client presence.');
}

async function updateClientName(clientDbId: number, clientName: string) {
    if (!clientName) {
        return;
    }

    const admin = getAdminClient();
    const { error } = await admin
        .from('clients')
        .update({
            client_name: clientName,
            last_seen_at: nowIso()
        })
        .eq('id', clientDbId);

    throwIfQueryError(error, 'Unable to update client name.');
}

async function updateClientMobile(clientDbId: number, mobileNumber: string) {
    if (!mobileNumber) {
        return;
    }

    const admin = getAdminClient();
    const { error } = await admin
        .from('clients')
        .update({
            mobile_number: mobileNumber,
            last_seen_at: nowIso()
        })
        .eq('id', clientDbId);

    throwIfQueryError(error, 'Unable to update client mobile number.');
}

// Section: Session helpers.
async function endSession(sessionId: string) {
    const admin = getAdminClient();
    const { error } = await admin
        .from('client_sessions')
        .update({
            ended_at: nowIso()
        })
        .eq('id', sessionId)
        .is('ended_at', null);

    throwIfQueryError(error, 'Unable to close expired session.');
}

async function getSessionById(clientDbId: number, sessionId: string) {
    if (!sessionId) {
        return null;
    }

    const admin = getAdminClient();
    const { data, error } = await admin
        .from('client_sessions')
        .select(SESSION_SELECT)
        .eq('id', sessionId)
        .eq('client_id', clientDbId)
        .maybeSingle();

    throwIfQueryError(error, 'Unable to load session.');
    return data;
}

async function getLatestSession(clientDbId: number) {
    const admin = getAdminClient();
    const { data, error } = await admin
        .from('client_sessions')
        .select(SESSION_SELECT)
        .eq('client_id', clientDbId)
        .is('ended_at', null)
        .order('last_activity_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    throwIfQueryError(error, 'Unable to load the latest session.');
    return data;
}

async function createSession(clientDbId: number, currentPage: string) {
    const admin = getAdminClient();
    const timestamp = nowIso();
    const { data, error } = await admin
        .from('client_sessions')
        .insert({
            client_id: clientDbId,
            entry_page: currentPage || '/',
            last_page: currentPage || '/',
            started_at: timestamp,
            last_activity_at: timestamp
        })
        .select(SESSION_SELECT)
        .single();

    throwIfQueryError(error, 'Unable to create a session.');
    return data;
}

async function touchSession(sessionId: string, currentPage: string) {
    const admin = getAdminClient();
    const { data, error } = await admin
        .from('client_sessions')
        .update({
            last_activity_at: nowIso(),
            last_page: currentPage || '/'
        })
        .eq('id', sessionId)
        .select(SESSION_SELECT)
        .single();

    throwIfQueryError(error, 'Unable to update session activity.');
    return data;
}

async function resolveActiveSession(clientDbId: number, requestedSessionId: string, currentPage: string) {
    const candidateSessions = [];

    if (requestedSessionId) {
        const requestedSession = await getSessionById(clientDbId, requestedSessionId);
        if (requestedSession) {
            candidateSessions.push(requestedSession);
        }
    }

    const latestSession = await getLatestSession(clientDbId);
    if (latestSession && !candidateSessions.find((session) => session.id === latestSession.id)) {
        candidateSessions.push(latestSession);
    }

    for (const session of candidateSessions) {
        if (session.ended_at || isSessionExpired(String(session.last_activity_at || ''))) {
            await endSession(String(session.id));
            continue;
        }

        return touchSession(String(session.id), currentPage);
    }

    return createSession(clientDbId, currentPage);
}

// Section: Conversation helpers.
async function getConversationById(clientDbId: number, conversationId: string) {
    if (!conversationId) {
        return null;
    }

    const admin = getAdminClient();
    const { data, error } = await admin
        .from('conversations')
        .select(CONVERSATION_SELECT)
        .eq('id', conversationId)
        .eq('client_id', clientDbId)
        .maybeSingle();

    throwIfQueryError(error, 'Unable to load conversation.');
    return data;
}

async function getLatestOpenConversation(clientDbId: number) {
    const admin = getAdminClient();
    const { data, error } = await admin
        .from('conversations')
        .select(CONVERSATION_SELECT)
        .eq('client_id', clientDbId)
        .eq('status', 'open')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    throwIfQueryError(error, 'Unable to load the latest conversation.');
    return data;
}

async function createConversation(clientDbId: number, sessionId: string) {
    const admin = getAdminClient();
    const { data, error } = await admin
        .from('conversations')
        .insert({
            client_id: clientDbId,
            active_session_id: sessionId,
            status: 'open'
        })
        .select(CONVERSATION_SELECT)
        .single();

    throwIfQueryError(error, 'Unable to create a conversation.');
    return data;
}

async function touchConversation(conversationId: string, sessionId: string) {
    const admin = getAdminClient();
    const { data, error } = await admin
        .from('conversations')
        .update({
            active_session_id: sessionId
        })
        .eq('id', conversationId)
        .select(CONVERSATION_SELECT)
        .single();

    throwIfQueryError(error, 'Unable to update conversation state.');
    return data;
}

async function resolveConversation(clientDbId: number, requestedConversationId: string, sessionId: string) {
    const requestedConversation = await getConversationById(clientDbId, requestedConversationId);

    if (requestedConversation?.status === 'open') {
        return touchConversation(String(requestedConversation.id), sessionId);
    }

    const latestConversation = await getLatestOpenConversation(clientDbId);
    if (latestConversation) {
        return touchConversation(String(latestConversation.id), sessionId);
    }

    return createConversation(clientDbId, sessionId);
}

// Section: Shared context resolution.
async function requireExistingClient(publicClientId: string) {
    const clientRow = await getClientByPublicId(publicClientId);

    if (!clientRow) {
        throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Client context could not be found. Reinitialize the browser client.');
    }

    return clientRow;
}

async function resolveClientState(publicClientId: string, sessionId: string, currentPage: string, conversationId = '') {
    const clientRow = await requireExistingClient(publicClientId);
    const sessionRow = await resolveActiveSession(Number(clientRow.id), sessionId, currentPage);
    const conversationRow = await resolveConversation(Number(clientRow.id), conversationId, String(sessionRow.id));

    await touchClientPresence(Number(clientRow.id), currentPage);

    return {
        clientRow,
        sessionRow,
        conversationRow
    };
}

export async function initializeAnonymousClient(payload: Record<string, unknown>, clientIp: string) {
    let locationData: Record<string, any> | null = null;

    const isLocalIp = !clientIp || clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.startsWith('localhost');
    if (!isLocalIp) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`https://freeipapi.com/api/json/${clientIp}`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                locationData = await response.json();
            } else {
                console.warn(`freeipapi.com returned status ${response.status} for IP: ${clientIp}`);
            }
        } catch (error) {
            console.error(`Failed to fetch IP location from freeipapi.com for IP ${clientIp}:`, error);
        }
    }

    const enrichedPayload = {
        ...payload,
        countryName: locationData?.countryName || null,
        countryCode: locationData?.countryCode || null,
        cityName: locationData?.cityName || null,
        regionName: locationData?.regionName || null,
        zipCode: locationData?.zipCode || null
    };

    const clientRow = await upsertClientRecord(enrichedPayload);
    const sessionRow = await resolveActiveSession(Number(clientRow.id), '', String(payload.currentPage || '/'));
    const conversationRow = await resolveConversation(Number(clientRow.id), '', String(sessionRow.id));

    return serializeSessionSnapshot(clientRow, sessionRow, conversationRow);
}

export async function refreshAnonymousSession(payload: Record<string, unknown>) {
    const { clientRow, sessionRow, conversationRow } = await resolveClientState(
        String(payload.clientId || ''),
        String(payload.sessionId || ''),
        String(payload.currentPage || '/')
    );

    return serializeSessionSnapshot(clientRow, sessionRow, conversationRow);
}

export async function createEventRecord(payload: Record<string, unknown>) {
    const { clientRow, sessionRow, conversationRow } = await resolveClientState(
        String(payload.clientId || ''),
        String(payload.sessionId || ''),
        String(payload.pagePath || '/')
    );

    const admin = getAdminClient();
    const { data, error } = await admin
        .from('page_events')
        .insert({
            client_id: clientRow.id,
            session_id: sessionRow.id,
            event_type: payload.eventType,
            page_path: payload.pagePath,
            page_title: payload.pageTitle,
            metadata: payload.metadata || {}
        })
        .select('id')
        .single();

    throwIfQueryError(error, 'Unable to track the requested event.');

    let pageViewCount = null;

    if (payload.eventType === 'page_view') {
        const { count, error: countError } = await admin
            .from('page_events')
            .select('id', {
                count: 'exact',
                head: true
            })
            .eq('event_type', 'page_view')
            .eq('page_path', payload.pagePath);

        throwIfQueryError(countError, 'Unable to calculate the page view count.');
        pageViewCount = count ?? 0;
    }

    return {
        ...serializeSessionSnapshot(clientRow, sessionRow, conversationRow),
        eventId: data.id,
        pageViewCount
    };
}

async function enforceMessageRateLimit(clientDbId: number, conversationId: string) {
    const admin = getAdminClient();
    const recentWindowStart = new Date(Date.now() - MESSAGE_WINDOW_MS).toISOString();
    const { data, error } = await admin
        .from('messages')
        .select('id, created_at')
        .eq('client_id', clientDbId)
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'client')
        .gte('created_at', recentWindowStart)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_WINDOW_LIMIT);

    throwIfQueryError(error, 'Unable to evaluate chat rate limits.');

    if (!Array.isArray(data)) {
        return;
    }

    const latestMessage = data[0];
    if (latestMessage?.created_at) {
        const millisecondsSinceLatestMessage = Date.now() - Date.parse(String(latestMessage.created_at));

        if (Number.isFinite(millisecondsSinceLatestMessage) && millisecondsSinceLatestMessage < MESSAGE_COOLDOWN_MS) {
            throw new HttpError(429, 'MESSAGE_COOLDOWN', 'Please wait a few seconds before sending another message.');
        }
    }

    if (data.length >= MESSAGE_WINDOW_LIMIT) {
        throw new HttpError(429, 'MESSAGE_RATE_LIMIT', 'Too many messages were sent in a short time. Please try again later.');
    }
}

async function countClientMessages(conversationId: string) {
    const admin = getAdminClient();
    const { count, error } = await admin
        .from('messages')
        .select('id', {
            count: 'exact',
            head: true
        })
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'client');

    throwIfQueryError(error, 'Unable to count existing client messages.');
    return Number(count ?? 0);
}

async function insertSystemConversationMessages({
    clientId,
    conversationId,
    sessionId,
    clientName,
    detectedMobileNumber,
    persistOnboardingFlow
}: {
    clientId: number,
    conversationId: string,
    sessionId: string,
    clientName: string,
    detectedMobileNumber: string,
    persistOnboardingFlow: boolean
}) {
    const admin = getAdminClient();
    const messageRows: Array<Record<string, unknown>> = [];

    if (persistOnboardingFlow && clientName) {
        messageRows.push(
            {
                conversation_id: conversationId,
                client_id: clientId,
                session_id: sessionId,
                sender_type: 'admin',
                message_type: 'text',
                message_text: 'Thanks for reaching out!\nBefore I forward this to Anand, may I get your name?',
                metadata: {
                    displayVariant: 'system',
                    automationKey: 'collect_name_prompt'
                }
            },
            {
                conversation_id: conversationId,
                client_id: clientId,
                session_id: sessionId,
                sender_type: 'client',
                message_type: 'text',
                message_text: clientName,
                metadata: {
                    automationKey: 'collected_name_reply',
                    captureType: 'client_name'
                }
            }
        );
    }

    if (clientName) {
        messageRows.push(
            {
                conversation_id: conversationId,
                client_id: clientId,
                session_id: sessionId,
                sender_type: 'admin',
                message_type: 'text',
                message_text: `Hi ${clientName}!\nYour message has been shared with Anand. He'll reply here soon.`,
                metadata: {
                    displayVariant: 'system',
                    automationKey: 'message_forwarded_confirmation'
                }
            },
            {
                conversation_id: conversationId,
                client_id: clientId,
                session_id: sessionId,
                sender_type: 'admin',
                message_type: 'text',
                message_text: 'Prefer a callback over chat?\nDrop your contact below.',
                metadata: {
                    displayVariant: 'system',
                    automationKey: 'callback_prompt'
                }
            }
        );
    }

    if (detectedMobileNumber) {
        messageRows.push({
            conversation_id: conversationId,
            client_id: clientId,
            session_id: sessionId,
            sender_type: 'admin',
            message_type: 'text',
            message_text: 'Done.\nYour contact has been noted.',
            metadata: {
                displayVariant: 'system',
                automationKey: 'mobile_number_captured'
            }
        });
    }

    if (!messageRows.length) {
        return [];
    }

    const { data, error } = await admin
        .from('messages')
        .insert(messageRows)
        .select(MESSAGE_SELECT);

    throwIfQueryError(error, 'Unable to store automated conversation messages.');
    return Array.isArray(data) ? data : [];
}

async function getConversationMessages(conversationId: string) {
    const admin = getAdminClient();
    const { data, error } = await admin
        .from('messages')
        .select(MESSAGE_SELECT)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

    throwIfQueryError(error, 'Unable to load conversation messages.');
    return Array.isArray(data) ? data : [];
}

export async function createClientMessage(payload: Record<string, unknown>) {
    const { clientRow, sessionRow, conversationRow } = await resolveClientState(
        String(payload.clientId || ''),
        String(payload.sessionId || ''),
        '/chat',
        String(payload.conversationId || '')
    );

    await enforceMessageRateLimit(Number(clientRow.id), String(conversationRow.id));
    await updateClientName(Number(clientRow.id), String(payload.clientName || ''));

    const existingMobileNumber = String(clientRow.mobile_number || '').trim();
    const detectedMobileNumber = existingMobileNumber
        ? ''
        : extractMobileNumber(String(payload.messageText || ''));

    if (detectedMobileNumber) {
        await updateClientMobile(Number(clientRow.id), detectedMobileNumber);
        clientRow.mobile_number = detectedMobileNumber;
    }

    const admin = getAdminClient();
    const existingClientMessageCount = await countClientMessages(String(conversationRow.id));
    const { data, error } = await admin
        .from('messages')
        .insert({
            conversation_id: conversationRow.id,
            client_id: clientRow.id,
            session_id: sessionRow.id,
            sender_type: payload.senderType,
            message_type: payload.messageType,
            message_text: payload.messageText,
            metadata: {}
        })
        .select(MESSAGE_SELECT)
        .single();

    throwIfQueryError(error, 'Unable to store the outgoing message.');

    const persistOnboardingFlow = Boolean(payload.persistOnboardingFlow);
    let automatedRows: Record<string, unknown>[] = [];

    if (existingClientMessageCount === 0) {
        automatedRows = await insertSystemConversationMessages({
            clientId: Number(clientRow.id),
            conversationId: String(conversationRow.id),
            sessionId: String(sessionRow.id),
            clientName: String(payload.clientName || '').trim(),
            detectedMobileNumber,
            persistOnboardingFlow
        });
    } else if (detectedMobileNumber) {
        automatedRows = await insertSystemConversationMessages({
            clientId: Number(clientRow.id),
            conversationId: String(conversationRow.id),
            sessionId: String(sessionRow.id),
            clientName: '',
            detectedMobileNumber,
            persistOnboardingFlow: false
        });
    }

    await touchConversation(String(conversationRow.id), String(sessionRow.id));

    const conversationMessages = await getConversationMessages(String(conversationRow.id));

    // Fire and forget Telegram notification
    sendToTelegram(String(payload.clientName || 'Anonymous'), String(payload.messageText), String(conversationRow.id), clientRow, conversationMessages, Number(data.id)).catch((err) => {
        console.error('Failed to send Telegram notification:', err);
    });

    return {
        ...serializeSessionSnapshot(clientRow, sessionRow, conversationRow),
        message: serializeMessage(data),
        automatedMessages: automatedRows.map((row) => serializeMessage(row)),
        messages: conversationMessages.map((row) => serializeMessage(row)),
        mobileNumberAccepted: Boolean(detectedMobileNumber)
    };
}

// Section: Telegram Integration
async function sendToTelegram(clientName: string, text: string, conversationId: string, clientRow?: any, conversationMessages: any[] = [], currentMessageId?: number) {
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
    if (!token || !chatId) return;

    let metaDetails = '';
    if (clientRow) {
        const isNewVisitor = Date.now() - new Date(clientRow.created_at).getTime() < 1000 * 60 * 60 * 24;
        const visitorType = isNewVisitor ? '🆕 New Visitor' : '🔙 Returning';
        
        let location = 'Unknown';
        if (clientRow.city_name || clientRow.country_name) {
            const parts = [clientRow.city_name, clientRow.region_name, clientRow.country_name].filter(Boolean);
            location = parts.join(', ');
        } else if (clientRow.timezone) {
            location = clientRow.timezone.split('/')[1]?.replace('_', ' ') || clientRow.timezone;
        }
        
        metaDetails = `\n` +
                      `👤 <b>Visitor:</b> ${visitorType}\n` +
                      `🌍 <b>Location:</b> ${location}\n` +
                      `📱 <b>Device:</b> ${clientRow.device_type || 'Unknown'} (${clientRow.browser || 'Unknown'})\n` +
                      `📞 <b>Mobile:</b> ${clientRow.mobile_number || 'Unknown'}\n` +
                      `🔗 <b>Referrer:</b> ${clientRow.referrer || 'Direct'}\n`;
    }

    let historyStr = '';
    
    const currentIndex = conversationMessages.findIndex(m => m.id === currentMessageId);
    const historyMessages = (currentIndex !== -1 
        ? conversationMessages.slice(0, currentIndex) 
        : conversationMessages)
        .slice(-10);

    if (historyMessages.length > 0) {
        historyStr = '\n\n📝 <b>Recent History:</b>\n';
        for (const msg of historyMessages) {
            const metadata = msg.metadata || {};
            const isSystem = metadata.displayVariant === 'system' || msg.sender_type === 'system';
            
            let senderName = clientName;
            if (isSystem) {
                senderName = 'Bot';
            } else if (msg.sender_type === 'admin') {
                senderName = 'You';
            }
            
            historyStr += `<b>${senderName}:</b> ${msg.message_text}\n`;
        }
    }

    // We include the conversationId so we can extract it later when you reply
    const message = `💬 <b>Message from ${clientName}</b>\n${metaDetails}${historyStr}\n\n<b>Current Message:</b>\n${text}\n\nID: ${conversationId}`;
    
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
        })
    });
}

export async function listConversationMessages(payload: Record<string, unknown>) {
    const { clientRow, sessionRow, conversationRow } = await resolveClientState(
        String(payload.clientId || ''),
        String(payload.sessionId || ''),
        '/chat',
        String(payload.conversationId || '')
    );

    const data = await getConversationMessages(String(conversationRow.id));

    return {
        ...serializeSessionSnapshot(clientRow, sessionRow, conversationRow),
        messages: Array.isArray(data) ? data.map((row) => serializeMessage(row)) : []
    };
}
