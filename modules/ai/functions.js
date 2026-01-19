/**
 * ═══════════════════════════════════════════════════════════════
 *                    🔧 BOT FUNCTIONS (AI-Callable Actions)
 * ═══════════════════════════════════════════════════════════════
 * 
 * These are actions the AI can trigger based on player requests.
 * The AI will return JSON like: {"action": "follow", "target": "player"}
 * 
 * ═══════════════════════════════════════════════════════════════
 */

const { goals } = require('mineflayer-pathfinder');

/**
 * All available bot functions
 * Each function has:
 * - description: What it does (shown to AI)
 * - execute: The actual function to run
 */
const BOT_FUNCTIONS = {
    // ═══════════════════════════════════════════════════════════════
    //                    SOCIAL / MOVEMENT
    // ═══════════════════════════════════════════════════════════════

    follow: {
        description: "Follow a player (sama, sunod, follow me)",
        execute: (bot, botEvents, { target }) => {
            console.log(`[Functions] Following ${target}`);

            // Teleport to player first
            bot.chat(`/tpo ${target}`);

            // Start following after teleport
            setTimeout(() => {
                const player = bot.players[target]?.entity;
                if (player) {
                    try {
                        const goal = new goals.GoalFollow(player, 3);
                        bot.pathfinder.setGoal(goal, true);
                    } catch (e) { }
                }
            }, 2000);

            botEvents.emit('social:following', { friend: target });
        }
    },

    stopFollow: {
        description: "Stop following and stay (tigil, stay, wag sumunod)",
        execute: (bot, botEvents, { target }) => {
            console.log(`[Functions] Stopping follow`);

            try {
                bot.pathfinder.stop();
                bot.clearControlStates();
            } catch (e) { }

            botEvents.emit('social:stopped');
        }
    },

    goHome: {
        description: "Go back to spawn and AFK (uwi, balik spawn, go home)",
        execute: (bot, botEvents, { target }) => {
            console.log(`[Functions] Going home to spawn`);

            bot.chat('/spawn');

            setTimeout(() => {
                bot.chat('/afk');
            }, 3000);

            botEvents.emit('social:lonely');
        }
    },

    teleportTo: {
        description: "Teleport to a player (punta ka sakin, halika dito)",
        execute: (bot, botEvents, { target }) => {
            console.log(`[Functions] Teleporting to ${target}`);
            bot.chat(`/tpo ${target}`);
        }
    },

    // ═══════════════════════════════════════════════════════════════
    //                    COMBAT
    // ═══════════════════════════════════════════════════════════════

    protect: {
        description: "Protect a player from mobs (protect, bantayan mo ko)",
        execute: (bot, botEvents, { target }) => {
            console.log(`[Functions] Protecting ${target}`);

            // Follow the player closely
            const player = bot.players[target]?.entity;
            if (player) {
                try {
                    const goal = new goals.GoalFollow(player, 2);
                    bot.pathfinder.setGoal(goal, true);
                } catch (e) { }
            }

            botEvents.emit('guard:active', { player: target });
        }
    },

    attack: {
        description: "Attack a nearby hostile mob or player (atake, patayin mo)",
        execute: (bot, botEvents, { target }) => {
            console.log(`[Functions] Looking for target to attack`);

            // Find nearest hostile entity
            const entities = Object.values(bot.entities);
            const hostile = entities.find(e =>
                e.type === 'mob' || (e.type === 'player' && e.username !== bot.username)
            );

            if (hostile && bot.startCombat) {
                bot.startCombat(hostile);
            }
        }
    },

    // ═══════════════════════════════════════════════════════════════
    //                    UTILITY
    // ═══════════════════════════════════════════════════════════════

    chat: {
        description: "Just reply without any action (normal conversation)",
        execute: (bot, botEvents, { target }) => {
            // No action, just chat
        }
    }
};

/**
 * Get function list for AI prompt
 */
function getFunctionList() {
    const list = Object.entries(BOT_FUNCTIONS)
        .map(([name, fn]) => `- ${name}: ${fn.description}`)
        .join('\n');
    return list;
}

/**
 * Execute a function by name
 */
function executeFunction(bot, botEvents, actionName, target) {
    const fn = BOT_FUNCTIONS[actionName];
    if (fn) {
        fn.execute(bot, botEvents, { target });
        return true;
    }
    return false;
}

module.exports = { BOT_FUNCTIONS, getFunctionList, executeFunction };
