/**
 * ═══════════════════════════════════════════════════════════════
 *                    🎒 INVENTORY & SURVIVAL MODULE
 * ═══════════════════════════════════════════════════════════════
 * 
 * Smart survival system:
 * - Eating blocks other actions (like real player)
 * - Interrupt eating if danger → escape
 * - Spawn when almost dead
 * - Ask for food at spawn (AI)
 * - Thank food giver (AI)
 * 
 * ═══════════════════════════════════════════════════════════════
 */

const ARMOR_TIERS = {
    'netherite': 5, 'diamond': 4, 'iron': 3,
    'chainmail': 2, 'golden': 1, 'leather': 0
};

const WEAPON_TIERS = {
    'netherite_sword': 10, 'diamond_sword': 9, 'iron_sword': 8,
    'stone_sword': 7, 'wooden_sword': 6,
    'netherite_axe': 5, 'diamond_axe': 4, 'iron_axe': 3,
    'stone_axe': 2, 'wooden_axe': 1
};

const FOOD_ITEMS = [
    'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton',
    'cooked_rabbit', 'cooked_cod', 'cooked_salmon',
    'bread', 'apple', 'golden_apple', 'enchanted_golden_apple',
    'baked_potato', 'cookie', 'melon_slice', 'sweet_berries',
    'beef', 'porkchop', 'chicken', 'mutton', 'rabbit', 'carrot', 'potato'
];

const HOSTILE_MOBS = [
    'zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch',
    'phantom', 'drowned', 'husk', 'stray', 'pillager', 'vindicator',
    'blaze', 'ghast', 'wither_skeleton', 'zombified_piglin'
];

const EMERGENCY_HEALTH = 6;
const CRITICAL_HEALTH = 4;

function setupInventory(bot, botEvents) {
    // ═══════════════════════════════════════════════════════════════
    //                    STATE VARIABLES
    // ═══════════════════════════════════════════════════════════════

    let isEating = false;
    let lastEatTime = 0;
    let lastSpawnTime = 0;
    let lastFoodAskTime = 0;
    let lastEquipTime = {};
    let atSpawn = false;
    let hasAskedForFood = false;

    // Expose eating state to other modules
    bot.isEating = () => isEating;

    // ═══════════════════════════════════════════════════════════════
    //                    MAIN HEALTH HANDLER
    // ═══════════════════════════════════════════════════════════════

    bot.on('health', () => {
        const health = bot.health || 20;
        const food = bot.food || 20;

        console.log(`[Survival] ❤️ Health: ${health.toFixed(0)} | 🍖 Food: ${food}`);

        // Check if we have food in inventory
        const hasFood = checkHasFood();

        // CRITICAL: Almost dead
        if (health <= CRITICAL_HEALTH) {
            const danger = checkNearbyDanger();

            if (hasFood && !danger) {
                // Has food and safe → EAT FIRST!
                console.log(`[Survival] 🍖 Critical HP but have food - eating first!`);
                tryEatFood();
            } else if (hasFood && danger) {
                // Has food but danger → spawn then eat
                console.log(`[Survival] ⚠️ Critical HP + danger - spawning first!`);
                emergencySpawn();
            } else {
                // No food → spawn and ask for food
                console.log(`[Survival] ❌ Critical HP + no food - spawning!`);
                emergencySpawn();
            }
            return;
        }

        // LOW: Need to eat
        if (health < EMERGENCY_HEALTH) {
            if (hasFood) {
                console.log(`[Survival] 🍖 Low HP - trying to eat...`);
                tryEatFood();
            } else {
                console.log(`[Survival] ❌ Low HP + no food!`);
                // Will ask for food at spawn
            }
            return;
        }

        // HUNGRY: Need to eat (but not critical)
        if (food < 15 || health < 15) {
            tryEatFood();
        }
    });

    // ═══════════════════════════════════════════════════════════════
    //                    EATING SYSTEM
    // ═══════════════════════════════════════════════════════════════

    async function tryEatFood() {
        // Check cooldowns and state
        const now = Date.now();
        if (now - lastEatTime < 3000) return;
        if (isEating) return;
        if (!bot.inventory) return;

        // Find food
        const allItems = bot.inventory.items();
        const foods = allItems.filter(item => FOOD_ITEMS.includes(item.name));

        if (foods.length === 0) {
            console.log('[Survival] ❌ No food in inventory!');

            // At spawn? Ask for food
            if (atSpawn && !hasAskedForFood && now - lastFoodAskTime > 30000) {
                lastFoodAskTime = now;
                hasAskedForFood = true;
                console.log('[Survival] 🙏 Asking for food...');
                botEvents.emit('ai:request', {
                    context: 'You are at spawn with no food and low health. Ask someone for food in a cute clingy way.',
                    username: 'System'
                });
            }
            return;
        }

        // Reset food ask flag if we have food now
        hasAskedForFood = false;

        // Find best food (golden first, then cooked, then raw)
        const bestFood = foods.find(f => f.name.includes('golden')) ||
            foods.find(f => f.name.includes('cooked')) ||
            foods[0];

        // Record current stats
        const healthBefore = bot.health;
        const foodBefore = bot.food;

        // Start eating
        console.log(`[Survival] 🍖 Eating ${bestFood.name}... (HP: ${healthBefore.toFixed(0)}, Hunger: ${foodBefore})`);
        lastEatTime = now;
        isEating = true;

        // STOP ALL OTHER ACTIONS (like a real player)
        try {
            bot.pathfinder.stop();
            bot.clearControlStates();
        } catch (e) { }

        try {
            await bot.equip(bestFood, 'hand');
            bot.activateItem();

            // Wait for eating to complete (food takes ~1.6-2s to eat)
            // We wait 2.5s to be safe
            await new Promise((resolve) => {
                bot._eatTimeout = setTimeout(resolve, 2500);
            });

            bot.deactivateItem();

            // Check if it worked
            const healthAfter = bot.health;
            const foodAfter = bot.food;

            if (healthAfter > healthBefore || foodAfter > foodBefore) {
                console.log(`[Survival] ✅ Ate food! HP: ${healthBefore.toFixed(0)} → ${healthAfter.toFixed(0)}, Hunger: ${foodBefore} → ${foodAfter}`);
            } else {
                console.log(`[Survival] ⚠️ Eating didn't work? HP: ${healthAfter.toFixed(0)}, Hunger: ${foodAfter}`);
            }

            // If still hungry or low HP, try eating again
            if (healthAfter < 15 || foodAfter < 18) {
                isEating = false;
                console.log(`[Survival] 🍖 Still hungry, eating more...`);
                setTimeout(() => tryEatFood(), 500);
                return;
            }

        } catch (err) {
            console.log(`[Survival] ❌ Eating error: ${err.message}`);
        }

        isEating = false;
    }

    function interruptEating() {
        if (!isEating) return;

        console.log('[Survival] 🚫 Eating interrupted!');

        try {
            bot.deactivateItem();
            if (bot._eatTimeout) {
                clearTimeout(bot._eatTimeout);
            }
        } catch (e) { }

        isEating = false;
    }

    // ═══════════════════════════════════════════════════════════════
    //                    EMERGENCY SPAWN
    // ═══════════════════════════════════════════════════════════════

    function emergencySpawn() {
        const now = Date.now();
        if (now - lastSpawnTime < 5000) return; // Max once per 5 seconds

        console.log('[Survival] 🚨 EMERGENCY! Teleporting to spawn!');
        lastSpawnTime = now;
        atSpawn = true;

        // Interrupt eating if we were eating
        interruptEating();

        bot.chat('/spawn');
    }

    // ═══════════════════════════════════════════════════════════════
    //                    FOOD CHECK HELPER
    // ═══════════════════════════════════════════════════════════════

    function checkHasFood() {
        if (!bot.inventory) return false;
        const items = bot.inventory.items();
        return items.some(item => FOOD_ITEMS.includes(item.name));
    }

    // ═══════════════════════════════════════════════════════════════
    //                    DANGER DETECTION
    // ═══════════════════════════════════════════════════════════════

    function checkNearbyDanger() {
        if (!bot.entities) return false;

        for (const entity of Object.values(bot.entities)) {
            if (!entity.position) continue;

            const dist = bot.entity.position.distanceTo(entity.position);
            if (dist > 8) continue;

            // Hostile mob nearby
            if (HOSTILE_MOBS.includes(entity.name)) {
                return entity;
            }

            // Player who attacked us (check if hostile)
            if (entity.type === 'player' && entity !== bot.entity) {
                // Could add hostile player tracking here
            }
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════════
    //                    ITEM RECEIVED → THANK (ONCE ONLY)
    // ═══════════════════════════════════════════════════════════════

    let lastThankTime = 0;
    let lastThankPlayer = '';
    let foodCountBefore = 0;

    // Track food count before collecting
    setInterval(() => {
        if (bot.inventory) {
            foodCountBefore = bot.inventory.items().filter(i => FOOD_ITEMS.includes(i.name)).length;
        }
    }, 1000);

    bot.on('playerCollect', (collector, collected) => {
        if (collector !== bot.entity) return;

        // Wait for inventory to update
        setTimeout(() => {
            processInventory();

            // Check if food count increased (someone gave us food)
            const currentFoodCount = bot.inventory.items().filter(i => FOOD_ITEMS.includes(i.name)).length;
            const gotNewFood = currentFoodCount > foodCountBefore;

            if (!gotNewFood) return; // Didn't get food, probably XP or something else

            const now = Date.now();
            const nearbyPlayer = findNearestPlayer();

            // Only thank if player is VERY close (within 5 blocks = they threw it)
            if (nearbyPlayer && nearbyPlayer.position) {
                const dist = bot.entity.position.distanceTo(nearbyPlayer.position);
                if (dist > 5) return; // Too far, probably not from this player

                const shouldThank = (now - lastThankTime > 30000) ||
                    (nearbyPlayer.username !== lastThankPlayer);

                if (shouldThank) {
                    lastThankTime = now;
                    lastThankPlayer = nearbyPlayer.username;

                    console.log(`[Survival] 🎁 ${nearbyPlayer.username} gave food!`);
                    atSpawn = false;
                    hasAskedForFood = false;

                    botEvents.emit('ai:request', {
                        context: `${nearbyPlayer.username} just gave you food! Thank them in a cute happy way.`,
                        username: nearbyPlayer.username
                    });
                }
            }
        }, 500);
    });

    function findNearestPlayer() {
        if (!bot.entities) return null;

        let nearest = null;
        let nearestDist = Infinity;

        for (const entity of Object.values(bot.entities)) {
            if (entity.type !== 'player' || entity === bot.entity) continue;
            if (!entity.username) continue;

            const dist = bot.entity.position.distanceTo(entity.position);
            if (dist < nearestDist && dist < 10) {
                nearest = entity;
                nearestDist = dist;
            }
        }

        return nearest;
    }

    // ═══════════════════════════════════════════════════════════════
    //                    AUTO EQUIP
    // ═══════════════════════════════════════════════════════════════

    function processInventory() {
        if (!bot.inventory) return;
        if (isEating) return; // Don't equip while eating

        equipBestArmor('helmet', 'head');
        equipBestArmor('chestplate', 'torso');
        equipBestArmor('leggings', 'legs');
        equipBestArmor('boots', 'feet');
        equipBestWeapon();
        equipShield();
    }

    function equipBestArmor(type, slot) {
        const now = Date.now();
        if (lastEquipTime[slot] && (now - lastEquipTime[slot]) < 3000) return;

        const items = bot.inventory.items();
        const armorPieces = items.filter(item => item.name.includes(type));

        if (armorPieces.length === 0) return;

        let best = null;
        let bestTier = -1;

        for (const piece of armorPieces) {
            const tier = getArmorTier(piece.name);
            if (tier > bestTier) {
                best = piece;
                bestTier = tier;
            }
        }

        if (!best) return;

        const equipped = bot.inventory.slots[bot.getEquipmentDestSlot(slot)];
        if (equipped) {
            const equippedTier = getArmorTier(equipped.name);
            if (equippedTier >= bestTier) return;
        }

        lastEquipTime[slot] = now;
        bot.equip(best, slot).then(() => {
            console.log(`[Survival] ✅ Equipped ${best.name}`);
        }).catch(() => { });
    }

    function equipBestWeapon() {
        if (isEating) return;

        const items = bot.inventory.items();
        const weapons = items.filter(item => WEAPON_TIERS[item.name]);

        if (weapons.length === 0) return;

        let best = null;
        let bestTier = -1;

        for (const weapon of weapons) {
            const tier = WEAPON_TIERS[weapon.name] || 0;
            if (tier > bestTier) {
                best = weapon;
                bestTier = tier;
            }
        }

        if (!best) return;

        const equipped = bot.inventory.slots[bot.getEquipmentDestSlot('hand')];
        if (equipped && WEAPON_TIERS[equipped.name]) {
            const equippedTier = WEAPON_TIERS[equipped.name] || 0;
            if (equippedTier >= bestTier) return;
        }

        bot.equip(best, 'hand').then(() => {
            console.log(`[Survival] ⚔️ Equipped ${best.name}`);
        }).catch(() => { });
    }

    function equipShield() {
        if (isEating) return;

        const items = bot.inventory.items();
        const shield = items.find(item => item.name === 'shield');

        if (!shield) return;

        const equipped = bot.inventory.slots[bot.getEquipmentDestSlot('off-hand')];
        if (equipped && equipped.name === 'shield') return;

        bot.equip(shield, 'off-hand').then(() => {
            console.log(`[Survival] 🛡️ Equipped shield`);
        }).catch(() => { });
    }

    function getArmorTier(name) {
        for (const [material, tier] of Object.entries(ARMOR_TIERS)) {
            if (name.includes(material)) return tier;
        }
        return -1;
    }

    console.log('[Survival] Module loaded!');
}

module.exports = { setupInventory };
