/**
 * ═══════════════════════════════════════════════════════════════
 *                    🎒 INVENTORY MANAGEMENT
 * ═══════════════════════════════════════════════════════════════
 *   - Auto-equip weapons, armor, shields
 *   - Upgrade to better gear automatically
 *   - Health < 6: Emergency /spawn
 *   - Health < 3: Drop ALL items (before death!)
 * ═══════════════════════════════════════════════════════════════
 */

const ARMOR_TIERS = {
    'netherite': 5,
    'diamond': 4,
    'iron': 3,
    'chainmail': 2,
    'golden': 1,
    'leather': 0
};

const WEAPON_TIERS = {
    'netherite_sword': 10,
    'diamond_sword': 9,
    'iron_sword': 8,
    'stone_sword': 7,
    'wooden_sword': 6,
    'netherite_axe': 5,
    'diamond_axe': 4,
    'iron_axe': 3,
    'stone_axe': 2,
    'wooden_axe': 1
};

const EMERGENCY_HEALTH = 6;   // Teleport to spawn
const CRITICAL_HEALTH = 3;     // Drop all items

function setupInventory(bot) {
    let lastEmergencySpawn = 0;
    let hasDroppedItems = false;

    bot.once('spawn', () => {
        console.log('[Inventory] Auto-equip + emergency system enabled!');
    });

    // Auto-equip when collecting items
    bot.on('playerCollect', (collector, collected) => {
        if (collector !== bot.entity) return;
        setTimeout(() => processInventory(), 500);
    });

    // Monitor health continuously
    bot.on('health', () => {
        const health = bot.health || 20;

        // CRITICAL: Drop ALL items before dying!
        if (health <= CRITICAL_HEALTH && !hasDroppedItems) {
            console.log(`[Inventory] 💀 CRITICAL! HP: ${health.toFixed(1)} - Dropping ALL items!`);
            dropAllItems();
            hasDroppedItems = true;
            return;
        }

        // Emergency spawn
        if (health < EMERGENCY_HEALTH && health > CRITICAL_HEALTH) {
            if (bot.emotions) bot.emotions.sadMessage();

            const now = Date.now();
            if (now - lastEmergencySpawn > 10000) {
                console.log(`[Inventory] 🚨 EMERGENCY! HP: ${health.toFixed(1)} - Teleporting to spawn!`);
                bot.chat('/spawn');
                lastEmergencySpawn = now;
            }
        }

        // Auto-eat when low health
        if (health < 15) {
            console.log(`[Inventory] Low health detected: ${health.toFixed(1)} HP. Trying to eat...`);
            tryEatFood();
        }

        // Reset when health recovers
        if (health > EMERGENCY_HEALTH && hasDroppedItems) {
            hasDroppedItems = false;
            console.log('[Inventory] Health recovered.');
        }
    });

    // Scan for nearby items on ground every 2 seconds
    setInterval(() => {
        if (!bot.entities) return;

        scanForNearbyItems();
    }, 2000);

    function processInventory() {
        if (!bot.inventory) return;

        equipBestArmor('helmet', 'head');
        equipBestArmor('chestplate', 'torso');
        equipBestArmor('leggings', 'legs');
        equipBestArmor('boots', 'feet');
        equipBestWeapon();
        equipShield();
    }

    let lastEquipTime = {};  // Track last equip time for each slot

    function scanForNearbyItems() {
        try {
            const nearbyItems = Object.values(bot.entities).filter(e => {
                try {
                    if (e.type !== 'object') return false;
                    if (!e.position) return false;

                    const dist = bot.entity.position.distanceTo(e.position);
                    return dist < 5;
                } catch (err) {
                    return false;
                }
            });

            if (nearbyItems.length === 0) return;

            // Simple approach: just move near items and let auto-collect work
            for (const itemEntity of nearbyItems) {
                try {
                    const dist = bot.entity.position.distanceTo(itemEntity.position);
                    if (dist < 1.5) continue; // Will auto-collect
                    if (dist > 4) continue; // Too far

                    const itemName = itemEntity.name || (itemEntity.metadata && itemEntity.metadata[8] && itemEntity.metadata[8].nbt && itemEntity.metadata[8].nbt.value && itemEntity.metadata[8].nbt.value.display && itemEntity.metadata[8].nbt.value.display.value.Name && itemEntity.metadata[8].nbt.value.display.value.Name.value) || 'item';
                    console.log(`[Inventory] Found ${itemName} nearby! Moving to pick up...`);

                    // Move to item
                    try {
                        bot.pathfinder.setGoal(new (require('mineflayer-pathfinder').goals.GoalNear)(
                            itemEntity.position.x,
                            itemEntity.position.y,
                            itemEntity.position.z,
                            1
                        ));

                        // Trigger thanks
                        if (bot.emotions) {
                            const type = itemName.includes('cooked') || itemName.includes('apple') || itemName.includes('bread') ? 'food' : 'item';
                            // Get nearest player to thank
                            const player = Object.values(bot.entities).find(e =>
                                e.type === 'player' &&
                                e !== bot.entity &&
                                e.position.distanceTo(bot.entity.position) < 5
                            );
                            if (player) {
                                setTimeout(() => bot.emotions.thankUser(player.username, type), 1000);
                            }
                        }

                        setTimeout(() => {
                            try { bot.pathfinder.stop(); } catch (e) { }
                        }, 1500);

                        break;
                    } catch (e) {
                        // Ignore metadata errors
                    }
                } catch (e) {
                    // Ignore metadata errors
                }
            }
        } catch (e) {
            // Silently ignore scanning errors
        }
    }

    let lastEatTime = 0;
    let isEating = false;

    function tryEatFood() {
        const now = Date.now();
        if (now - lastEatTime < 3000) {
            console.log('[Inventory] Eating on cooldown...');
            return;
        }

        if (isEating) {
            console.log('[Inventory] Already eating...');
            return;
        }

        if (!bot.inventory) {
            console.log('[Inventory] No inventory available');
            return;
        }

        const FOOD_ITEMS = [
            'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton',
            'cooked_rabbit', 'cooked_cod', 'cooked_salmon',
            'bread', 'apple', 'golden_apple', 'enchanted_golden_apple',
            'baked_potato', 'cookie', 'melon_slice', 'sweet_berries',
            'beef', 'porkchop', 'chicken', 'mutton', 'rabbit', 'carrot', 'potato'
        ];

        const allItems = bot.inventory.items();
        console.log(`[Inventory] Checking inventory for food... (${allItems.length} items total)`);

        const foods = allItems.filter(item => FOOD_ITEMS.includes(item.name));

        if (foods.length === 0) {
            console.log('[Inventory] ❌ No food found in inventory!');
            const itemNames = allItems.map(i => i.name).join(', ');
            console.log(`[Inventory] Current items: ${itemNames || 'none'}`);
            return;
        }

        // Prioritize cooked/good food
        const bestFood = foods.find(f => f.name.includes('golden')) ||
            foods.find(f => f.name.includes('cooked')) ||
            foods[0];

        console.log(`[Inventory] 🍖 Found food! Eating ${bestFood.name}...`);
        lastEatTime = now;
        isEating = true;

        // STOP all movement first
        try {
            bot.pathfinder.stop();
            bot.clearControlStates();
        } catch (e) { }

        bot.equip(bestFood, 'hand').then(() => {
            console.log(`[Inventory] Equipped ${bestFood.name}, holding to eat...`);

            // Start eating
            bot.activateItem();

            // Hold for full eating duration (2 seconds to be safe)
            setTimeout(() => {
                try {
                    bot.deactivateItem();
                    isEating = false;
                    console.log('[Inventory] ✅ Finished eating! Health should recover now.');
                } catch (e) {
                    isEating = false;
                    console.log('[Inventory] Error stopping eat:', e.message);
                }
            }, 2000);
        }).catch((err) => {
            isEating = false;
            console.log(`[Inventory] ❌ Error equipping food: ${err.message}`);
        });
    }

    function equipBestArmor(type, slot) {
        // Cooldown: Only equip once every 3 seconds per slot
        const now = Date.now();
        if (lastEquipTime[slot] && (now - lastEquipTime[slot]) < 3000) {
            return;
        }

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
            console.log(`[Inventory] Upgrading ${equipped.name} → ${best.name}`);
        }

        lastEquipTime[slot] = now;
        bot.equip(best, slot).then(() => {
            console.log(`[Inventory] ✅ Equipped ${best.name}`);
        }).catch(() => { });
    }

    function equipBestWeapon() {
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
            console.log(`[Inventory] Upgrading ${equipped.name} → ${best.name}`);
        }

        bot.equip(best, 'hand').then(() => {
            console.log(`[Inventory] ⚔️ Equipped ${best.name}`);
        }).catch(() => { });
    }

    function equipShield() {
        const items = bot.inventory.items();
        const shield = items.find(item => item.name === 'shield');

        if (!shield) return;

        const equipped = bot.inventory.slots[bot.getEquipmentDestSlot('off-hand')];
        if (equipped && equipped.name === 'shield') return;

        bot.equip(shield, 'off-hand').then(() => {
            console.log(`[Inventory] 🛡️ Equipped shield`);
        }).catch(() => { });
    }

    async function dropAllItems() {
        bot.chat('💀 Critical health! Dropping ALL items!');
        console.log('[Inventory] Dropping inventory items...');

        // Drop inventory items one by one with delay to prevent race conditions
        const items = bot.inventory.items();
        for (const item of items) {
            try {
                // Check if item exists and has valid type before tossing
                if (item && item.type != null && item.count > 0) {
                    await bot.toss(item.type, null, item.count).catch(() => { });
                    // Small delay between drops to prevent inventory sync issues
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (e) {
                console.log(`[Inventory] Error dropping ${item?.name}: ${e.message}`);
            }
        }

        // Drop equipped armor and shield
        console.log('[Inventory] Dropping equipped armor...');
        const slots = ['head', 'torso', 'legs', 'feet', 'off-hand'];

        for (const slot of slots) {
            try {
                const destSlot = bot.getEquipmentDestSlot(slot);
                const equipped = bot.inventory.slots[destSlot];

                if (equipped && equipped.type != null) {
                    await bot.unequip(slot).catch(() => { });
                    // After unequip, the item goes to inventory, so we need to find and toss it
                    await new Promise(resolve => setTimeout(resolve, 200));

                    // Find the unequipped item in inventory and toss it
                    const unequippedItem = bot.inventory.items().find(i => i.name === equipped.name);
                    if (unequippedItem && unequippedItem.type != null) {
                        await bot.toss(unequippedItem.type, null, unequippedItem.count).catch(() => { });
                    }
                }
            } catch (e) {
                console.log(`[Inventory] Error dropping ${slot}: ${e.message}`);
            }
        }

        bot.chat('✅ All items dropped here!');
        console.log('[Inventory] All items dropped!');
    }

    function getArmorTier(name) {
        for (const [material, tier] of Object.entries(ARMOR_TIERS)) {
            if (name.includes(material)) return tier;
        }
        return -1;
    }

    console.log('[Inventory] Inventory manager loaded!');
}

module.exports = { setupInventory };
