/**
 * ═══════════════════════════════════════════════════════════════
 *                    😊 EMOTIONS MODULE
 * ═══════════════════════════════════════════════════════════════
 * 
 * This module handles Mochi's emotional reactions:
 * - Thanking players who give items/food
 * - Expressing sadness when low health
 * - Doing a happy dance (sneak/unsneak)
 * 
 * NOW USES AI:
 * Instead of hardcoded messages, we request AI to generate
 * context-aware responses.
 * 
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Sets up the emotions module
 * @param {Object} bot - The mineflayer bot
 * @param {EventEmitter} botEvents - The event bus
 */
function setupEmotions(bot, botEvents) {
    let lastThanksTime = 0;
    let lastSadTime = 0;

    // ═══════════════════════════════════════════════════════════════
    //                    THANK USER
    // ═══════════════════════════════════════════════════════════════

    /**
     * Thanks a player for giving something
     * @param {string} username - Who gave the item
     * @param {string} type - 'food' or 'item'
     */
    function thankUser(username, type) {
        const now = Date.now();
        if (now - lastThanksTime < 3000) return; // Prevent spam
        lastThanksTime = now;

        // Look at the player
        const player = bot.players[username]?.entity;
        if (player) {
            bot.lookAt(player.position.offset(0, player.height, 0));
        }

        // Do happy dance
        happyDance();

        // Request AI to generate thank you message
        botEvents.emit('ai:request', {
            context: type === 'food'
                ? `${username} just gave you food! Thank them in a cute clingy way.`
                : `${username} just gave you an item! Thank them happily.`,
            username: username
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //                    SAD MESSAGE (LOW HEALTH)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Expresses sadness when health is low
     * DISABLED: Was causing spam. Now just logs to terminal.
     */
    function sadMessage() {
        const now = Date.now();
        if (now - lastSadTime < 30000) return; // Max once per 30 seconds
        lastSadTime = now;

        // Just log, don't spam chat
        console.log('[Emotions] 😢 Bot is sad (low health)');
    }

    // ═══════════════════════════════════════════════════════════════
    //                    HAPPY DANCE
    // ═══════════════════════════════════════════════════════════════

    function happyDance() {
        bot.setControlState('sneak', true);
        setTimeout(() => bot.setControlState('sneak', false), 200);
        setTimeout(() => bot.setControlState('sneak', true), 400);
        setTimeout(() => bot.setControlState('sneak', false), 600);
    }

    // ═══════════════════════════════════════════════════════════════
    //                    EXPOSE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    // Make functions available to other modules via bot object
    bot.emotions = {
        thankUser,
        sadMessage
    };

    console.log('[Emotions] Module loaded!');
}

module.exports = { setupEmotions };
