/**
 * ═══════════════════════════════════════════════════════════════
 *                    🏃 MOVEMENT CONFIG (Baritone-like)
 * ═══════════════════════════════════════════════════════════════
 * 
 * Configures pathfinder for:
 * - Sprint-jumping (faster movement)
 * - Parkour (jump gaps, climb mountains)
 * - Avoid dangerous blocks (lava, magma, fire, cactus)
 * 
 * ═══════════════════════════════════════════════════════════════
 */

const { pathfinder, Movements } = require('mineflayer-pathfinder');

/**
 * Sets up advanced movement for the bot
 * @param {Object} bot - The mineflayer bot
 * @param {Object} botEvents - The event bus
 */
function setupMovement(bot, botEvents) {
    // Load pathfinder plugin
    bot.loadPlugin(pathfinder);

    bot.once('spawn', () => {
        try {
            // Get minecraft data for this version
            const mcData = require('minecraft-data')(bot.version);

            // Create movement configuration
            const movements = new Movements(bot, mcData);

            // ═══════════════════════════════════════════════════════════════
            //                    SPEED SETTINGS
            // ═══════════════════════════════════════════════════════════════

            movements.allowSprinting = true;     // Sprint when moving
            movements.allowParkour = true;       // Jump gaps, parkour moves
            movements.canDig = false;            // Don't break blocks
            movements.allow1by1towers = false;   // Don't pillar up

            // ═══════════════════════════════════════════════════════════════
            //                    DANGER AVOIDANCE
            // ═══════════════════════════════════════════════════════════════

            // Add dangerous blocks to avoid
            const dangerousBlocks = [
                'lava',
                'flowing_lava',
                'fire',
                'soul_fire',
                'magma_block',
                'cactus',
                'sweet_berry_bush',
                'wither_rose',
                'campfire',
                'soul_campfire',
                'powder_snow'
            ];

            for (const blockName of dangerousBlocks) {
                const block = mcData.blocksByName[blockName];
                if (block) {
                    movements.blocksToAvoid.add(block.id);
                    console.log(`[Movement] ⚠️ Avoiding: ${blockName}`);
                }
            }

            // ═══════════════════════════════════════════════════════════════
            //                    APPLY SETTINGS
            // ═══════════════════════════════════════════════════════════════

            bot.pathfinder.setMovements(movements);

            console.log('[Movement] ✅ Pathfinder configured:');
            console.log('[Movement]    - Sprinting: ON');
            console.log('[Movement]    - Parkour: ON');
            console.log('[Movement]    - Danger avoidance: ON');

        } catch (err) {
            console.error(`[Movement] Error configuring pathfinder: ${err.message}`);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    //                    SPRINT-JUMP WHILE FOLLOWING
    // ═══════════════════════════════════════════════════════════════

    // This makes the bot jump while sprinting (like players do for speed)
    let lastJumpTime = 0;

    bot.on('physicsTick', () => {
        // Only sprint-jump when moving forward AND sprinting
        if (!bot.controlState.forward || !bot.controlState.sprint) return;
        if (bot.isEating && bot.isEating()) return;

        const now = Date.now();
        if (now - lastJumpTime < 400) return; // Jump every 400ms

        // Check if on ground and moving
        if (bot.entity.onGround) {
            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 100);
            lastJumpTime = now;
        }
    });

    console.log('[Movement] Module loaded!');
}

module.exports = { setupMovement };
