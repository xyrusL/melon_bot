/**
 * ═══════════════════════════════════════════════════════════════
 *                    😊 EMOTIONS & SOCIAL
 * ═══════════════════════════════════════════════════════════════
 *   - Says thanks when given items/food ("salamat sa food :>")
 *   - Sneaks up and down (twerks) as a thank you gesture
 *   - Cries when low health ("low health na ako huhu :<")
 * ═══════════════════════════════════════════════════════════════
 */

function setupEmotions(bot) {
    let lastThanksTime = 0;
    let lastSadTime = 0;

    bot.once('spawn', () => {
        console.log('[Emotions] Social interactions enabled!');
    });

    // Expose functions for other components
    bot.emotions = {
        thankUser,
        sadMessage
    };

    function thankUser(username, type) {
        const now = Date.now();
        if (now - lastThanksTime < 3000) return; // Prevent spam
        lastThanksTime = now;

        // Look at player if close
        const player = bot.players[username]?.entity;
        if (player) {
            bot.lookAt(player.position.offset(0, player.height, 0));
        }

        // Do "happy dance" (sneak/unsneak)
        happyDance();

        // Chat message
        setTimeout(() => {
            if (type === 'food') {
                bot.chat(`salamat sa food :>`);
            } else {
                bot.chat(`salamat dito :>`);
            }
        }, 500);
    }

    function sadMessage() {
        const now = Date.now();
        if (now - lastSadTime < 10000) return;
        lastSadTime = now;

        bot.chat("low health na ako huhu :<");
    }

    function happyDance() {
        bot.setControlState('sneak', true);
        setTimeout(() => bot.setControlState('sneak', false), 200);
        setTimeout(() => bot.setControlState('sneak', true), 400);
        setTimeout(() => bot.setControlState('sneak', false), 600);
    }

    console.log('[Emotions] Interactions loaded!');
}

module.exports = { setupEmotions };
