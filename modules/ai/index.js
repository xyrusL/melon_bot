/**
 * ═══════════════════════════════════════════════════════════════
 *                    🧠 AI MODULE (Mochi's Brain)
 * ═══════════════════════════════════════════════════════════════
 * 
 * This is the AI system that generates Mochi's responses.
 * It uses NVIDIA's Qwen3 model via OpenAI-compatible API.
 * 
 * HOW IT WORKS:
 * 1. Other modules emit 'ai:request' event with context
 * 2. This module generates a response using the AI
 * 3. It emits 'ai:response' with the generated text
 * 4. The bot then chats the response
 * 
 * ERROR HANDLING:
 * - If API fails, it logs the error and does NOT crash
 * - Other modules can still work without AI
 * 
 * ═══════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const OpenAI = require('openai');
const { MOCHI_PERSONA } = require('./persona');

// Cooldown to prevent spam (3 seconds between replies)
const MIN_REPLY_COOLDOWN = 3000;
let lastReplyTime = 0;

// Track if AI is ready
let aiReady = false;
let openai = null;

/**
 * Sets up the AI module
 * @param {Object} bot - The mineflayer bot instance
 * @param {EventEmitter} botEvents - The central event bus
 */
async function setupAI(bot, botEvents) {
    const apiKey = process.env.NVIDIA_API_KEY;

    // ═══════════════════════════════════════════════════════════════
    //                    CHECK API KEY
    // ═══════════════════════════════════════════════════════════════

    if (!apiKey || apiKey === 'your_key_here') {
        console.log('[AI] ⚠️ No NVIDIA_API_KEY in .env. AI disabled.');
        console.log('[AI] Bot will still work, but won\'t chat intelligently.');
        botEvents.emit('ai:disabled');
        return;
    }

    // Create OpenAI client for NVIDIA API
    openai = new OpenAI({
        apiKey: apiKey,
        baseURL: 'https://integrate.api.nvidia.com/v1',
    });

    // ═══════════════════════════════════════════════════════════════
    //                    TEST API CONNECTION
    // ═══════════════════════════════════════════════════════════════

    console.log('[AI] Testing API connection...');
    try {
        await openai.chat.completions.create({
            model: "qwen/qwen3-next-80b-a3b-instruct",
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 10
        });
        console.log('[AI] ✅ API connected! Mochi is ready to chat.');
        aiReady = true;
        botEvents.emit('ai:ready');
    } catch (err) {
        console.error('[AI] ❌ API connection failed:', err.message);
        console.log('[AI] Bot will work, but AI chat is disabled.');
        botEvents.emit('ai:error', err);
        return;
    }

    // ═══════════════════════════════════════════════════════════════
    //                    AI RESPONSE FUNCTION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Generates an AI response and chats it
     * @param {string} context - What happened / what to respond to
     * @param {string} username - Who triggered this (for logging)
     */
    async function respond(context, username = 'System') {
        // Check cooldown
        const now = Date.now();
        if (now - lastReplyTime < MIN_REPLY_COOLDOWN) {
            console.log(`[AI] Cooldown, skipping: "${context.substring(0, 50)}..."`);
            return;
        }
        lastReplyTime = now;

        // Check if AI is ready
        if (!aiReady || !openai) {
            console.log('[AI] Not ready, skipping response.');
            return;
        }

        console.log(`[AI] Thinking for ${username}: "${context.substring(0, 50)}..."`);

        try {
            // IMPORTANT: Wrap API call in timeout to prevent disconnect
            // If API takes too long, the server thinks bot is AFK
            const TIMEOUT_MS = 5000; // 5 seconds max

            const apiPromise = openai.chat.completions.create({
                model: "qwen/qwen3-next-80b-a3b-instruct",
                messages: [
                    { role: "system", content: MOCHI_PERSONA },
                    { role: "user", content: `${username}: ${context}` }
                ],
                temperature: 0.7,
                top_p: 0.9,
                max_tokens: 80  // Reduced for faster response
            });

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS)
            );

            // Race: whichever finishes first
            const completion = await Promise.race([apiPromise, timeoutPromise]);

            let reply = completion.choices[0]?.message?.content;

            if (reply) {
                // Clean up the reply
                reply = reply
                    .replace(/<think>[\s\S]*?<\/think>/g, '') // Remove thinking tags
                    .replace(/[\r\n]+/g, ' ')                 // Remove newlines
                    .trim();

                // Limit length for Minecraft chat
                if (reply.length > 200) {
                    reply = reply.substring(0, 197) + '...';
                }

                // Use setImmediate to yield to event loop before chatting
                setImmediate(() => {
                    console.log(`[AI] Mochi says: ${reply}`);
                    bot.chat(reply);
                    botEvents.emit('ai:responded', { reply, username });
                });
            }
        } catch (err) {
            if (err.message === 'Timeout') {
                console.log('[AI] ⏱️ Response took too long, skipping to prevent disconnect.');
            } else {
                console.error(`[AI] Error: ${err.message}`);
            }
            // Don't crash, just log the error
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //                    EVENT LISTENERS
    // ═══════════════════════════════════════════════════════════════

    // Listen for AI requests from other modules
    botEvents.on('ai:request', ({ context, username }) => {
        respond(context, username);
    });

    // Also attach to bot for backward compatibility
    bot.chatWithAI = respond;

    // ═══════════════════════════════════════════════════════════════
    //                    CHAT MESSAGE LISTENER
    // ═══════════════════════════════════════════════════════════════

    bot.on('message', async (jsonMsg) => {
        try {
            const rawMessage = jsonMsg.toString();
            if (!rawMessage || rawMessage.trim() === '') return;

            // Parse username and message
            let username = null;
            let message = rawMessage;

            // Try different chat formats
            const angleMatch = rawMessage.match(/^<([^>]+)>\s*(.+)$/);
            if (angleMatch) { username = angleMatch[1]; message = angleMatch[2]; }

            const bracketMatch = rawMessage.match(/^\[([^\]]+)\]\s*(.+)$/);
            if (!username && bracketMatch) { username = bracketMatch[1]; message = bracketMatch[2]; }

            const colonMatch = rawMessage.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
            if (!username && colonMatch) { username = colonMatch[1]; message = colonMatch[2]; }

            // Ignore own messages
            if (username === bot.username) return;

            // Check if message is for Mochi
            const textLower = message.toLowerCase();
            const isForMochi = textLower.includes('mochi') || textLower.includes('bot');

            // Check if player is nearby
            let isNearby = false;
            if (username && bot.players[username]?.entity) {
                const dist = bot.entity.position.distanceTo(bot.players[username].entity.position);
                if (dist < 5) isNearby = true;
            }

            // Respond if addressed or nearby
            if (isForMochi || isNearby) {
                respond(message, username);
            }
        } catch (err) {
            // Ignore parse errors
        }
    });

    console.log('[AI] Module loaded!');
}

module.exports = { setupAI };
