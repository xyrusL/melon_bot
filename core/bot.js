/**
 * ═══════════════════════════════════════════════════════════════
 *                    🤖 BOT FACTORY (Creates the Bot)
 * ═══════════════════════════════════════════════════════════════
 * 
 * This file creates the Minecraft bot and loads all modules.
 * Think of it as the "assembly line" that puts the bot together.
 * 
 * ═══════════════════════════════════════════════════════════════
 */

const mineflayer = require('mineflayer');
const botEvents = require('./events');

// Load all modules
const { setupAI } = require('../modules/ai');
const { setupSocial } = require('../modules/social');
const { setupEmotions } = require('../modules/social/emotions');
const { setupCombat } = require('../modules/combat');
const { setupDefense } = require('../modules/combat/defense');
const { setupGuard } = require('../modules/combat/guard');
const { setupInventory } = require('../modules/inventory');
const { setupMovement } = require('../modules/movement');
const { setupPerformance } = require('../modules/performance');

/**
 * Creates and starts the bot
 * @param {Object} config - Bot configuration (host, port, username, etc.)
 */
function createBot(config) {
    console.log(`[Bot] Starting "${config.username}"...`);
    console.log(`[Bot] Connecting to ${config.host}:${config.port}`);

    // Create the mineflayer bot
    const botOptions = {
        host: config.host,
        port: config.port,
        username: config.username,
        auth: 'offline'
    };

    if (config.version) {
        botOptions.version = config.version;
    }

    const bot = mineflayer.createBot(botOptions);

    // ═══════════════════════════════════════════════════════════════
    //                    LOAD ALL MODULES
    // ═══════════════════════════════════════════════════════════════
    // Order matters! AI must load first so other modules can use it.

    setupAI(bot, botEvents);           // AI Chat (must be first)
    setupPerformance(bot, botEvents);  // Performance monitor
    setupMovement(bot, botEvents);     // Pathfinder config (parkour, avoid lava)
    setupInventory(bot, botEvents);    // Auto-equip, food management
    setupEmotions(bot, botEvents);     // Social reactions (uses AI)
    setupSocial(bot, botEvents);       // AFK/follow behavior
    setupGuard(bot, botEvents);        // Protect nearby players
    setupDefense(bot, botEvents);      // Shield, jump, sneak
    setupCombat(bot, botEvents);       // Self-defense (load last)

    // ═══════════════════════════════════════════════════════════════
    //                    CORE BOT EVENTS
    // ═══════════════════════════════════════════════════════════════

    bot.on('spawn', () => {
        console.log(`[Bot] ${config.username} spawned in the world!`);
        botEvents.emit('bot:spawn');
        // NOTE: We do NOT chat here anymore (fix for auto-chat issue)
    });

    bot.on('death', () => {
        console.log('[Bot] Bot died! Respawning...');
        setTimeout(() => {
            bot.chat('/spawn');
        }, 1000);
    });

    bot.on('chat', (username, message) => {
        if (username === bot.username) return;
        console.log(`[Chat] <${username}> ${message}`);
    });

    bot.on('error', (err) => {
        console.error(`[Bot] Error: ${err.message}`);
    });

    bot.on('end', (reason) => {
        console.log(`[Bot] Disconnected: ${reason}`);
        console.log('[Bot] Reconnecting in 5 seconds...');
        setTimeout(() => createBot(config), 5000);
    });

    bot.on('kicked', (reason) => {
        console.log(`[Bot] Kicked: ${reason}`);
        console.log('[Bot] Reconnecting in 10 seconds...');
        setTimeout(() => createBot(config), 10000);
    });

    console.log('[Bot] All modules loaded. Connecting...');
    return bot;
}

module.exports = { createBot };
