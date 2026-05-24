import { getAdminClient } from '../_shared/db.ts';

Deno.serve(async (req) => {
    // We only accept POST from Telegram
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    
    const allowedChatId = Deno.env.get('TELEGRAM_CHAT_ID');

    try {
        const update = await req.json();
        console.info(`[DEBUG] Incoming Telegram Webhook update ID: ${update.update_id}`);
        
        // Ignore updates that are not messages
        if (!update.message || !update.message.text) {
            console.info(`[DEBUG] Ignored non-text Telegram update.`);
            return new Response('OK');
        }

        const message = update.message;
        const chatId = String(message.chat.id);

        // Security: Only allow your specific Telegram Chat ID to send replies
        if (chatId !== allowedChatId) {
            console.warn(`[SECURITY WARN] Blocked unauthorized message from Chat ID: ${chatId}`);
            return new Response('OK');
        }

        // Check if this is a reply to the bot's message
        if (!message.reply_to_message || !message.reply_to_message.text) {
            console.info(`[DEBUG] Telegram message is not a direct reply. Ignored.`);
            return new Response('OK');
        }

        const repliedText = message.reply_to_message.text;
        const replyText = message.text;

        // Extract the conversation ID we appended to the bottom of the original message
        const match = repliedText.match(/ID:\s*([a-fA-F0-9-]+)/);
        if (!match) {
            console.warn(`[DEBUG] Could not extract conversation ID from replied message text.`);
            return new Response('OK');
        }

        const conversationId = match[1];
        console.info(`[DEBUG] Extracted Conversation ID: ${conversationId}. Fetching client context...`);
        const admin = getAdminClient();
        
        // We need the client_id for the database insert. Load the conversation.
        const { data: convData, error: convError } = await admin
            .from('conversations')
            .select('client_id, active_session_id')
            .eq('id', conversationId)
            .single();

        if (convError || !convData) {
            console.error(`[ERROR] Conversation not found in DB for ID: ${conversationId}`);
            return new Response('OK');
        }

        console.info(`[DEBUG] Conversation found. Client ID: ${convData.client_id}. Inserting admin reply...`);
        // Insert the admin's reply into the messages table
        const { error: insertError } = await admin.from('messages').insert({
            conversation_id: conversationId,
            client_id: convData.client_id,
            session_id: convData.active_session_id,
            sender_type: 'admin',
            message_type: 'text',
            message_text: replyText,
            metadata: {}
        });

        if (insertError) {
            console.error(`[ERROR] Failed to insert admin message in DB:`, insertError);
        } else {
            console.info(`[DEBUG] Admin message inserted successfully. Updating conversation timestamp...`);
            // Update the conversation's updated_at timestamp to bubble it up
            await admin.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
            console.info(`[DEBUG] Conversation updated successfully.`);
        }

    } catch (error) {
        console.error('[ERROR] Webhook processing exception:', error);
    }

    // Always return 200 OK to Telegram so it stops retrying the webhook
    return new Response('OK', { status: 200 });
});
