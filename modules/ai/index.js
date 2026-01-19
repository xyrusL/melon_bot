/**
 * ═══════════════════════════════════════════════════════════════
 *                    🧠 AI MODULE (Mochi's Brain)
 * ═══════════════════════════════════════════════════════════════
 * 
 * AI with FUNCTION CALLING - the AI can trigger bot actions!
 * 
 * HOW IT WORKS:
 * 1. Player says "sama ka sakin mochi"
 * 2. AI returns: {"action": "follow", "target": "PlayerName", "reply": "sige beh!"}
 * 3. Bot executes follow() AND chats the reply
 * 
 * ═══════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const OpenAI = require('openai');
const { MOCHI_PERSONA } = require('./persona');
const { getFunctionList, executeFunction } = require('./functions');

// Cooldown to prevent spam (3 seconds between replies)
const MIN_REPLY_COOLDOWN = 3000;
let lastReplyTime = 0;

// Track if AI is ready
let aiReady = false;
let openai = null;

// Store bot reference for safety checks
let botRef = null;

/**
 * Prompt that tells AI how to return function calls
 */
function getSystemPrompt() {
    return `${MOCHI_PERSONA}

═══════════════════════════════════════════════════════════════
FUNCTION CALLING - You can trigger bot actions!
═══════════════════════════════════════════════════════════════

AVAILABLE ACTIONS:
${getFunctionList()}

HOW TO USE:
If the player wants you to DO something (not just chat), respond with JSON:
{"action": "actionName", "target": "playerUsername", "reply": "your taglish reply"}

EXAMPLES:
- Player says "sama ka mochi" → {"action": "follow", "target": "PlayerName", "reply": "sige beh sunod ako!"}
- Player says "tigil ka" → {"action": "stopFollow", "target": "", "reply": "okie stay lang ako dito beh"}
- Player says "uwi ka na" → {"action": "goHome", "target": "", "reply": "sige uwi na ako, miss mo ko agad? hehe"}
- Player says "protect mo ko" → {"action": "protect", "target": "PlayerName", "reply": "tara g beh, protect kita!"}

If just normal conversation (no action needed), just reply normally WITHOUT JSON.

IMPORTANT:
- ONLY use JSON when player wants you to DO something
- Use the EXACT action names from the list above
- Always include a "reply" field with your response
- If you don't understand, just chat normally (no JSON)
`;
}

/**
 * Sets up the AI module
 */
async function setupAI(bot, botEvents) {
    botRef = bot;
    const apiKey = process.env.NVIDIA_API_KEY;

    if (!apiKey || apiKey === 'your_key_here') {
        console.log('[AI] ⚠️ No NVIDIA_API_KEY in .env. AI disabled.');
        botEvents.emit('ai:disabled');
        return;
    }

    openai = new OpenAI({
        apiKey: apiKey,
        baseURL: 'https://integrate.api.nvidia.com/v1',
    });

    console.log('[AI] Testing API connection...');
    try {
        await openai.chat.completions.create({
            model: "qwen/qwen3-next-80b-a3b-instruct",
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 10
        });
        console.log('[AI] ✅ API connected! Function calling enabled.');
        aiReady = true;
        botEvents.emit('ai:ready');
    } catch (err) {
        console.error('[AI] ❌ API connection failed:', err.message);
        botEvents.emit('ai:error', err);
        return;
    }

    // ═══════════════════════════════════════════════════════════════
    //                    SMART RESPOND FUNCTION
    // ═══════════════════════════════════════════════════════════════

    async function respond(context, username = 'System') {
        const now = Date.now();
        if (now - lastReplyTime < MIN_REPLY_COOLDOWN) {
            console.log(`[AI] Cooldown, skipping`);
            return;
        }
        lastReplyTime = now;

        if (!aiReady || !openai) {
            console.log('[AI] Not ready, skipping.');
            return;
        }

        console.log(`[AI] Thinking for ${username}: "${context.substring(0, 50)}..."`);

        try {
            const TIMEOUT_MS = 5000;

            const apiPromise = openai.chat.completions.create({
                model: "moonshotai/kimi-k2-instruct",
                messages: [
                    { role: "system", content: getSystemPrompt() },
                    { role: "user", content: `Player "${username}" says: ${context}` }
                ],
                temperature: 0.7,
                top_p: 0.9,
                max_tokens: 100
            });

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS)
            );

            const completion = await Promise.race([apiPromise, timeoutPromise]);
            let response = completion.choices[0]?.message?.content;

            if (!response) return;

            // Clean up response
            response = response
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .replace(/[\r\n]+/g, ' ')
                .trim();

            console.log(`[AI] Raw response: ${response}`);

            // ═══════════════════════════════════════════════════════════════
            //                    PARSE FUNCTION CALL
            // ═══════════════════════════════════════════════════════════════

            let actionExecuted = false;
            let reply = response;

            // Try to parse JSON (function call)
            if (response.includes('{') && response.includes('}')) {
                try {
                    // Extract JSON from response
                    const jsonMatch = response.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);

                        if (parsed.action && parsed.action !== 'chat') {
                            console.log(`[AI] 🔧 Function call: ${parsed.action}(${parsed.target || username})`);

                            // Execute the function
                            const target = parsed.target || username;
                            executeFunction(bot, botEvents, parsed.action, target);
                            actionExecuted = true;
                        }

                        // Use the reply from JSON
                        if (parsed.reply) {
                            reply = parsed.reply;
                        }
                    }
                } catch (parseErr) {
                    // Not valid JSON, treat as normal reply
                    console.log(`[AI] Not a function call, normal reply`);
                }
            }

            // ═══════════════════════════════════════════════════════════════
            //                    SEND CHAT MESSAGE
            // ═══════════════════════════════════════════════════════════════

            // Limit length
            if (reply.length > 200) {
                reply = reply.substring(0, 197) + '...';
            }

            // Safety check: make sure bot is still connected
            if (botRef && botRef.entity && botRef._client) {
                console.log(`[AI] Mochi says: ${reply}`);
                try {
                    botRef.chat(reply);
                } catch (chatErr) {
                    console.log(`[AI] Chat error (bot disconnected?): ${chatErr.message}`);
                }
                botEvents.emit('ai:responded', { reply, username, actionExecuted });
            } else {
                console.log(`[AI] Bot not ready to chat, skipping.`);
            }

        } catch (err) {
            if (err.message === 'Timeout') {
                console.log('[AI] ⏱️ Timeout, skipping.');
            } else {
                console.error(`[AI] Error: ${err.message}`);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //                    EVENT LISTENERS
    // ═══════════════════════════════════════════════════════════════

    botEvents.on('ai:request', ({ context, username }) => {
        respond(context, username);
    });

    bot.chatWithAI = respond;

    // ═══════════════════════════════════════════════════════════════
    //                    CHAT MESSAGE LISTENER
    // ═══════════════════════════════════════════════════════════════

    bot.on('message', async (jsonMsg) => {
        try {
            const rawMessage = jsonMsg.toString();
            if (!rawMessage || rawMessage.trim() === '') return;

            let username = null;
            let message = rawMessage;

            // Parse chat formats
            const angleMatch = rawMessage.match(/^<([^>]+)>\s*(.+)$/);
            if (angleMatch) { username = angleMatch[1]; message = angleMatch[2]; }

            const bracketMatch = rawMessage.match(/^\[([^\]]+)\]\s*(.+)$/);
            if (!username && bracketMatch) { username = bracketMatch[1]; message = bracketMatch[2]; }

            const colonMatch = rawMessage.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
            if (!username && colonMatch) { username = colonMatch[1]; message = colonMatch[2]; }

            // Ignore own messages and system messages
            if (username === bot.username) return;
            if (!username) return; // Skip system messages

            // ONLY respond if explicitly mentioned (no more spam from nearby chat)
            const textLower = message.toLowerCase();
            const isForMochi = textLower.includes('mochi') || textLower.includes('bot');

            console.log(`[AI] 📩 Chat from ${username}: "${message}" (forMochi: ${isForMochi})`);

            // Only respond if explicitly addressed
            if (isForMochi) {
                console.log(`[AI] ✅ Responding to ${username}...`);
                respond(message, username);
            }
        } catch (err) {
            // Ignore parse errors
        }
    });

    console.log('[AI] Module loaded with function calling!');
}

module.exports = { setupAI };
