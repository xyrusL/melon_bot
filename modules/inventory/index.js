/**
 * ═══════════════════════════════════════════════════════════════
 *                    🎒 INVENTORY MODULE
 * ═══════════════════════════════════════════════════════════════
 * 
 * Auto-equip armor, weapons, shields.
 * Emergency: /spawn when low HP, drop items when dying.
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

const EMERGENCY_HEALTH = 6;
const CRITICAL_HEALTH = 3;

function setupInventory(bot, botEvents) {
    let lastEmergencySpawn = 0;
    let hasDroppedItems = false;
    let lastEquipTime = {};
    let lastEatTime = 0;
    let isEating = false;

    bot.once('spawn', () => {
        console.log('[Inventory] Ready!');
    });

    bot.on('playerCollect', (collector, collected) => {
        if (collector !== bot.entity) return;
        setTimeout(() => processInventory(), 500);
    });

    bot.on('health', () => {
        const health = bot.health || 20;

        if (health <= CRITICAL_HEALTH && !hasDroppedItems) {
            console.log(`[Inventory] 💀 CRITICAL! Dropping ALL items!`);
            dropAllItems();
            hasDroppedItems = true;
            return;
        }

        if (health < EMERGENCY_HEALTH && health > CRITICAL_HEALTH) {
            if (bot.emotions) bot.emotions.sadMessage();

            const now = Date.now();
            if (now - lastEmergencySpawn > 10000) {
                console.log(`[Inventory] 🚨 EMERGENCY! Teleporting to spawn!`);
                bot.chat('/spawn');
                lastEmergencySpawn = now;
            }
        }

        if (health < 15) {
            tryEatFood();
        }

        if (health > EMERGENCY_HEALTH && hasDroppedItems) {
            hasDroppedItems = false;
            console.log('[Inventory] Health recovered.');
        }
    });

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

            for (const itemEntity of nearbyItems) {
                try {
                    const dist = bot.entity.position.distanceTo(itemEntity.position);
                    if (dist < 1.5) continue;
                    if (dist > 4) continue;

                    console.log(`[Inventory] Found item nearby!`);

                    try {
                        bot.pathfinder.setGoal(new (require('mineflayer-pathfinder').goals.GoalNear)(
                            itemEntity.position.x,
                            itemEntity.position.y,
                            itemEntity.position.z,
                            1
                        ));

                        if (bot.emotions) {
                            const player = Object.values(bot.entities).find(e =>
                                e.type === 'player' &&
                                e !== bot.entity &&
                                e.position.distanceTo(bot.entity.position) < 5
                            );
                            if (player) {
                                setTimeout(() => bot.emotions.thankUser(player.username, 'item'), 1000);
                            }
                        }

                        setTimeout(() => {
                            try { bot.pathfinder.stop(); } catch (e) { }
                        }, 1500);

                        break;
                    } catch (e) { }
                } catch (e) { }
            }
        } catch (e) { }
    }

    function tryEatFood() {
        const now = Date.now();
        if (now - lastEatTime < 3000) return;
        if (isEating) return;
        if (!bot.inventory) return;

        const allItems = bot.inventory.items();
        console.log(`[Inventory] 📦 Checking inventory... Found ${allItems.length} items`);

        // Debug: Show all items in inventory
        if (allItems.length > 0) {
            const itemNames = allItems.map(i => i.name).join(', ');
            console.log(`[Inventory] 📦 Items: ${itemNames}`);
        }

        const foods = allItems.filter(item => FOOD_ITEMS.includes(item.name));

        if (foods.length === 0) {
            console.log('[Inventory] ❌ No food found in inventory!');
            return;
        }

        const bestFood = foods.find(f => f.name.includes('golden')) ||
            foods.find(f => f.name.includes('cooked')) ||
            foods[0];

        console.log(`[Inventory] 🍖 Eating ${bestFood.name}...`);
        lastEatTime = now;
        isEating = true;

        try {
            bot.pathfinder.stop();
            bot.clearControlStates();
        } catch (e) { }

        bot.equip(bestFood, 'hand').then(() => {
            bot.activateItem();

            setTimeout(() => {
                try {
                    bot.deactivateItem();
                    isEating = false;
                    console.log('[Inventory] ✅ Finished eating!');
                } catch (e) {
                    isEating = false;
                }
            }, 2000);
        }).catch((err) => {
            isEating = false;
            console.log(`[Inventory] ❌ Error eating: ${err.message}`);
        });
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
        console.log('[Inventory] Dropping all items...');

        const items = bot.inventory.items();
        for (const item of items) {
            try {
                if (item && item.type != null && item.count > 0) {
                    await bot.toss(item.type, null, item.count).catch(() => { });
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (e) {
                console.log(`[Inventory] Error dropping ${item?.name}: ${e.message}`);
            }
        }

        console.log('[Inventory] Dropping armor...');
        const slots = ['head', 'torso', 'legs', 'feet', 'off-hand'];

        for (const slot of slots) {
            try {
                const destSlot = bot.getEquipmentDestSlot(slot);
                const equipped = bot.inventory.slots[destSlot];

                if (equipped && equipped.type != null) {
                    await bot.unequip(slot).catch(() => { });
                    await new Promise(resolve => setTimeout(resolve, 200));

                    const unequippedItem = bot.inventory.items().find(i => i.name === equipped.name);
                    if (unequippedItem && unequippedItem.type != null) {
                        await bot.toss(unequippedItem.type, null, unequippedItem.count).catch(() => { });
                    }
                }
            } catch (e) {
                console.log(`[Inventory] Error dropping ${slot}: ${e.message}`);
            }
        }

        bot.chat('✅ All items dropped!');
        console.log('[Inventory] All items dropped!');
    }

    function getArmorTier(name) {
        for (const [material, tier] of Object.entries(ARMOR_TIERS)) {
            if (name.includes(material)) return tier;
        }
        return -1;
    }

    console.log('[Inventory] Module loaded!');
}

module.exports = { setupInventory };
