import { getAdminClient } from '../_shared/db.ts';

Deno.serve(async (req) => {
    // We only accept POST from Telegram
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    
    const allowedChatId = Deno.env.get('TELEGRAM_CHAT_ID');

    try {
        const update = await req.json();
        
        // Ignore updates that are not messages
        if (!update.message || !update.message.text) {
            return new Response('OK');
        }

        const message = update.message;
        const chatId = String(message.chat.id);

        // Security: Only allow your specific Telegram Chat ID to send replies
        if (chatId !== allowedChatId) {
            console.warn(`Blocked unauthorized message from chat ID: ${chatId}`);
            return new Response('OK');
        }

        // Check if this is a reply to the bot's message
        if (!message.reply_to_message || !message.reply_to_message.text) {
            // It's not a reply, just a normal message. Do nothing.
            return new Response('OK');
        }

        const repliedText = message.reply_to_message.text;
        const replyText = message.text;

        // Extract the conversation ID we appended to the bottom of the original message
        const match = repliedText.match(/ID:\s*([a-fA-F0-9-]+)/);
        if (!match) {
            return new Response('OK');
        }

        const conversationId = match[1];
        const admin = getAdminClient();
        
        // We need the client_id for the database insert. Load the conversation.
        const { data: convData, error: convError } = await admin
            .from('conversations')
            .select('client_id, active_session_id')
            .eq('id', conversationId)
            .single();

        if (convError || !convData) {
            console.error('Conversation not found for ID:', conversationId);
            return new Response('OK');
        }

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
            console.error('Failed to insert admin message:', insertError);
        } else {
            // Update the conversation's updated_at timestamp to bubble it up
            await admin.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
        }

    } catch (error) {
        console.error('Webhook error:', error);
    }

    // Always return 200 OK to Telegram so it stops retrying the webhook
    return new Response('OK', { status: 200 });
});
