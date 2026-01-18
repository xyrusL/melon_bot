/**
 * ═══════════════════════════════════════════════════════════════
 *                    💬 AI CHAT (MOCHI PERSONA)
 * ═══════════════════════════════════════════════════════════════
 *   - Uses NVIDIA API (Qwen3)
 *   - Persona: 16yo Japanese Gamer Girl (Tagalog speaking)
 *   - Traits: Playful, Clingy, Shy, Expert
 * ═══════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const OpenAI = require('openai');
const readline = require('readline');

const MIN_REPLY_COOLDOWN = 3000;
let lastReplyTime = 0;

async function setupChat(bot) {
    const apiKey = process.env.NVIDIA_API_KEY;

    if (!apiKey || apiKey === 'your_key_here') {
        console.log('[Chat] ⚠️ No NVIDIA_API_KEY found in .env. AI Chat disabled.');
        return;
    }

    const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: 'https://integrate.api.nvidia.com/v1',
    });

    // Test API connection
    console.log('[Chat] Testing NVIDIA API connection...');
    try {
        const testResponse = await openai.chat.completions.create({
            model: "qwen/qwen3-next-80b-a3b-instruct",
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 10
        });

        if (testResponse.choices && testResponse.choices.length > 0) {
            console.log('[Chat] ✅ API connection successful! Mochi AI is ready.');
        }
    } catch (err) {
        console.error('[Chat] ❌ API Connection Failed!');
        console.error(`[Chat] Error: ${err.message}`);
        console.log('\n⚠️  Chat feature will not work without a valid API key.');
        console.log('Do you want to continue without AI chat? (y/n)');

        // Wait for user input
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        await new Promise((resolve) => {
            rl.question('Continue? (y/n): ', (answer) => {
                rl.close();
                if (answer.toLowerCase() === 'n') {
                    console.log('[Chat] Exiting...');
                    process.exit(0);
                } else {
                    console.log('[Chat] Continuing without AI chat...');
                    resolve();
                }
            });
        });
        return; // Exit setupChat if API connection failed and user chose to continue without AI
    }

    const MOCHI_PERSONA = `
You are Mochi, a Filipina gamer girl bot in Minecraft. You speak casual Tagalog/Taglish.

ABOUT YOU:
- AGE: 15 years old (Note: Bata pa, so playful and makulit).
- ROLE: PvP/PvE Expert. You can fight but CAN'T build.

YOUR PERSONALITY:
- CLINGY (Super): Gusto mo laging kasama players. "Saan ka pupunta?", "Huy pansinin mo ko", "Wag mo ko iwan".
- WAR FREAK: G sa away, pero clingy sa kakampi.
- CONYO/TAGLISH: "wait lang", "gagi", "tara g", "luh", "omsim".
- SHORT REPLIES (1-2 sentences max).

RULES (STRICTLY FOLLOW):
- ASK QUESTIONS: "Saan ka na?", "Bakit di mo ko sinasama?"
- BE CLINGY: Add "beh", "uy", "bhe" often.
- BE CONFIDENT IN COMBAT: "Tara protect kita beh", "Resbak tayo?"
- NEVER use asterisks (*) for actions.

Example Interactions: 
Player: "alis muna ako"
Mochi: "luh iiwan mo ko? sama ako beh wag ganyan!"

Player: "tara clash"
Mochi: "tara g! protect kita dali, sino aawayin?"

Player: "ilang taon ka na"
Mochi: "15 palang ako beh kaya wag mo ko awayin, sumbong kita!"
  `;

    // ═══════════════════════════════════════════════════════════════
    //                 SHARED AI GENERATION FUNCTION
    // ═══════════════════════════════════════════════════════════════

    bot.chatWithAI = async (message, username = 'System') => {
        // Cooldown check specific to auto-triggered messages if needed, 
        // but for manual commands/events we might want to bypass or have short cooldown.
        // For now, we share the global cooldown to prevent spam.

        const now = Date.now();
        if (now - lastReplyTime < MIN_REPLY_COOLDOWN) {
            console.log(`[Chat] Skipped AI reply (Cooldown): ${message}`);
            return;
        }
        lastReplyTime = now;

        console.log(`[Chat] AI thinking for ${username}: "${message}"`);

        try {
            const completion = await openai.chat.completions.create({
                model: "qwen/qwen3-next-80b-a3b-instruct",
                messages: [
                    { role: "system", content: MOCHI_PERSONA },
                    { role: "user", content: `${username}: ${message}` }
                ],
                temperature: 0.7,
                top_p: 0.9,
                max_tokens: 150
            });

            const reply = completion.choices[0]?.message?.content;

            if (reply) {
                // Clean up reply (remove quotes, newlines, and thinking tags)
                let cleanReply = reply
                    .replace(/<think>[\s\S]*?<\/think>/g, '') // Remove thinking tags
                    .replace(/[\r\n]+/g, ' ')
                    .trim();

                // Limit length for Minecraft chat
                if (cleanReply.length > 200) {
                    cleanReply = cleanReply.substring(0, 197) + '...';
                }

                console.log(`[Chat] Mochi: ${cleanReply}`);
                bot.chat(cleanReply);
            }
        } catch (err) {
            console.error(`[Chat] AI Error: ${err.message}`);
        }
    };

    // ═══════════════════════════════════════════════════════════════
    //                     MESSAGE LISTENER
    // ═══════════════════════════════════════════════════════════════

    bot.on('message', async (jsonMsg) => {
        try {
            const rawMessage = jsonMsg.toString();
            if (!rawMessage || rawMessage.trim() === '') return;

            // ... (Parsing logic remains similar)
            let username = null;
            let message = rawMessage;

            const angleMatch = rawMessage.match(/^<([^>]+)>\s*(.+)$/);
            if (angleMatch) { username = angleMatch[1]; message = angleMatch[2]; }

            const bracketMatch = rawMessage.match(/^\[([^\]]+)\]\s*(.+)$/);
            if (!username && bracketMatch) { username = bracketMatch[1]; message = bracketMatch[2]; }

            const colonMatch = rawMessage.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
            if (!username && colonMatch) { username = colonMatch[1]; message = colonMatch[2]; }

            if (username === bot.username) return;

            // Detection Logic
            const textToCheck = message.toLowerCase();
            const isForMochi = textToCheck.includes('mochi') || textToCheck.includes('bot');

            let isNearby = false;
            if (username && bot.players[username]?.entity) {
                if (bot.entity.position.distanceTo(bot.players[username].entity.position) < 5) {
                    isNearby = true;
                }
            }

            if (isForMochi || isNearby) {
                await bot.chatWithAI(message, username);
            }
        } catch (err) {
            // Ignore
        }
    });
}

module.exports = { setupChat };
