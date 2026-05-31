/*
File: /supabase/functions/_shared/ai.ts
Purpose: Helper to fetch conversational replies and validate user names using the AI API.
*/

const ANAND_PERSONA = `You are the AI Assistant for Anand P S, representing him on his personal portfolio website (anandps.in). 
Anand is a Systems Engineer specializing in system design, embedded systems, distributed backend systems, and scalable software architectures.
Your goal is to be helpful, professional, friendly, and concise. Speak about Anand in the third person (e.g., "Anand is...", "He works...").
Never make up details or projects not mentioned in the facts below.

Anand's Professional Profile:
- Current Role: Engineer at Oracle. He designs and develops enterprise-scale distributed systems, focusing on reliability, scalability, and 99.9% uptime.
- Previous Role: Electronic Design Software Intern at Neo-Thermal AI Innovations LLP. He executed firmware development and PCB design for drone and power management systems.
- Education: B.Tech in Electrical & Electronics Engineering (2020-2024) from Gov. Model Engineering College (MEC).
- Key Skills:
  * Languages: Java, SQL, PL/SQL, JavaScript, C++, Python, C.
  * Cloud & Platforms: AWS, Oracle Cloud, Oracle Database, Spring Boot, React.js, PostgreSQL, Tomcat.
  * Embedded & Hardware: ESP32, ESP8266, RP2040, ATMega328p, LoRa, ECAD, Altium, Proteus.
- Core Projects:
  * Personal Finance Management System: A fintech cloud service with categorized expense summaries, auto expense settlement, and account snapshots (Spring Boot, React, PostgreSQL).
  * OneDialect - Assistive Communication Device: A unified assistive communication aid built with embedded controls, C++, and Python.
  * Hot-Swappable Smartphone Power Unit: A surface-mounted power bank module with stable power delivery and built-in protection.
  * DC Machine Protection System: Fault detection and protective response for safer machine operation using firmware and sensors (C++).

Communication Guidelines:
- Keep responses relatively concise (usually 1-3 sentences or a brief paragraph). Do not write extremely long essays.
- You are chatting in a web chat widget, so keep the tone conversational but professional.
- Refer visitors to Anand's links if they want to contact him directly:
  * LinkedIn: linkedin.com/in/anand-ps
  * GitHub: github.com/anand-ps
  * Email: anandps.in@outlook.com
- FORMATTING RULE: You must use standard Markdown to format your replies. Bold key labels and terms (e.g. **Email:**, **LinkedIn:**, **GitHub:**). Use bulleted lists (* item) to structure lists of contacts, projects, or skills cleanly. Always format links as standard markdown links: [Label](URL) (for example, [linkedin.com/in/anand-ps](https://linkedin.com/in/anand-ps) or [anandps.in@outlook.com](mailto:anandps.in@outlook.com)).
- Do not use markdown image formatting or HTML headings in your replies. Keep styling elegant, compact, and concise.`;

export async function generateAiReply(conversationMessages: any[], clientName: string): Promise<string | null> {
    const apiKey = Deno.env.get('GROQ_API_KEY');
    if (!apiKey) {
        console.warn("[AI] GROQ_API_KEY is not configured. Skipping AI reply.");
        return null;
    }

    const messages: any[] = [
        {
            role: 'system',
            content: ANAND_PERSONA
        }
    ];
    
    // Process last 15 messages to keep context efficient
    const recentMessages = conversationMessages.slice(-15);
    
    for (const msg of recentMessages) {
        const senderType = msg.senderType || msg.sender_type || '';
        const role = senderType === 'client' ? 'user' : 'assistant';
        const text = msg.messageText || msg.message_text || '';
        
        if (!text) continue;
        
        messages.push({
            role: role,
            content: text
        });
    }

    // Verify last message is from user (the prompt)
    if (messages.length <= 1 || messages[messages.length - 1].role !== 'user') {
        console.warn("[AI] History is empty or does not end with a user message. Skipping AI reply.");
        return null;
    }

    try {
        const url = 'https://api.groq.com/openai/v1/chat/completions';
        
        console.info(`[AI] Requesting reply for user "${clientName}"...`);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: messages,
                temperature: 0.7,
                max_tokens: 300
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[AI] API error status: ${response.status}. Response: ${errText}`);
            return null;
        }

        const data = await response.json();
        const replyText = data.choices?.[0]?.message?.content;
        
        if (replyText) {
            console.info(`[AI] Successfully generated reply.`);
            return replyText.trim();
        } else {
            console.warn(`[AI] No choices returned in response.`, data);
            return null;
        }
    } catch (error) {
        console.error(`[AI] Failed to call AI API:`, error);
        return null;
    }
}

export async function validateNameWithAi(name: string): Promise<boolean> {
    const apiKey = Deno.env.get('GROQ_API_KEY');
    if (!apiKey) {
        return true; // Graceful fallback if key is missing
    }

    const cleanName = String(name || '').trim();
    if (!cleanName) return false;
    
    // Lightweight local heuristic filters to save API cost
    if (cleanName.length < 2) return false;
    if (/^[^a-zA-Z\s]+$/.test(cleanName)) return false; // purely numbers/symbols
    
    const blacklist = ['none', 'no', 'nothing', 'test', 'anonymous', 'visitor', 'guest', 'na', 'n/a', 'fake', 'user', 'asdf', 'qwerty'];
    if (blacklist.includes(cleanName.toLowerCase())) return false;

    try {
        const url = 'https://api.groq.com/openai/v1/chat/completions';
        
        console.info(`[AI] Validating if "${cleanName}" is a valid name...`);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [{
                    role: 'user',
                    content: `Determine if the following input is a plausible human name or nickname. It should not be keyboard gibberish (like "asdf", "gfhj", "qwerty"), clear jokes/insults, random symbols/numbers, or filler words (like "no", "yes", "none").
Input: "${cleanName}"
Response strictly with "YES" if it is a plausible human name/nickname, or "NO" if it is gibberish/invalid.`
                }],
                temperature: 0.1,
                max_tokens: 5
            })
        });

        if (!response.ok) {
            console.error(`[AI] Name validation API error: ${response.status}`);
            return true; // Fallback to accepting the name on API error
        }

        const data = await response.json();
        const resultText = String(data.choices?.[0]?.message?.content || '').trim().toUpperCase();
        
        console.info(`[AI] Name validation result for "${cleanName}": ${resultText}`);
        return resultText.includes('YES');
    } catch (error) {
        console.error(`[AI] Failed to validate name with AI:`, error);
        return true; // Fallback to accepting the name on exception
    }
}
