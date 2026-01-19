/**
 * ═══════════════════════════════════════════════════════════════
 *                    ⚔️ COMBAT MODULE
 * ═══════════════════════════════════════════════════════════════
 * 
 * Main combat logic: Attack hostiles, chase, escape when low HP.
 * Uses AltoClef-style attack timing for maximum damage.
 * 
 * ═══════════════════════════════════════════════════════════════
 */

const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

// Combat settings
const ATTACK_REACH = 3.5;
const OPTIMAL_DISTANCE = 2.5;
const DETECT_RANGE = 8;
const CHASE_RANGE = 20;
const ESCAPE_HEALTH = 6;
const EAT_HEALTH = 15;
const FORGIVE_TIME = 4000;
const CREEPER_SAFE_DISTANCE = 6;

const HOSTILE_MOBS = [
    'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch',
    'slime', 'phantom', 'drowned', 'husk', 'stray', 'blaze',
    'ghast', 'magma_cube', 'hoglin', 'piglin_brute', 'warden',
    'pillager', 'vindicator', 'evoker', 'ravager', 'vex',
    'cave_spider', 'silverfish', 'endermite', 'guardian', 'elder_guardian',
    'wither_skeleton', 'zombified_piglin'
];

const FOOD_ITEMS = [
    'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton',
    'cooked_rabbit', 'cooked_cod', 'cooked_salmon',
    'bread', 'apple', 'golden_apple', 'enchanted_golden_apple',
    'baked_potato', 'cookie', 'melon_slice', 'sweet_berries',
    'beef', 'porkchop', 'chicken', 'mutton', 'rabbit', 'carrot', 'potato'
];

function setupCombat(bot, botEvents) {
    bot.loadPlugin(pathfinder);

    let isReady = false;
    let target = null;
    let lastAttackTime = 0;
    let isEating = false;
    let lastLowHealthComplaint = 0;

    // Track who attacked us
    const hostilePlayers = new Map();
    const forgiveTimers = new Map();

    bot.once('spawn', () => {
        try {
            const mcData = require('minecraft-data')(bot.version);
            const movements = new Movements(bot, mcData);
            movements.allowSprinting = true;
            movements.canDig = false;
            bot.pathfinder.setMovements(movements);
            isReady = true;
            console.log('[Combat] Ready!');
            botEvents.emit('combat:ready');
        } catch (err) {
            console.log('[Combat] Setup delayed...');
        }
    });

    // When bot gets hurt
    bot.on('entityHurt', (entity) => {
        if (!isReady || entity !== bot.entity) return;

        const attacker = findNearestPlayer();
        if (attacker && attacker.username) {
            markHostile(attacker.username);
            if (!target || target !== attacker) {
                setTarget(attacker);
                console.log(`[Combat] Under attack by ${attacker.username}!`);
            }
        }
    });

    function markHostile(username) {
        hostilePlayers.set(username, Date.now());

        if (forgiveTimers.has(username)) {
            clearTimeout(forgiveTimers.get(username));
        }

        const timer = setTimeout(() => forgive(username), FORGIVE_TIME);
        forgiveTimers.set(username, timer);
    }

    function forgive(username) {
        console.log(`[Combat] ${username} stopped attacking. Peace! 🕊️`);
        hostilePlayers.delete(username);
        forgiveTimers.delete(username);

        if (target && target.username === username) {
            clearTarget();
        }
    }

    function isHostile(username) {
        if (!hostilePlayers.has(username)) return false;
        const elapsed = Date.now() - hostilePlayers.get(username);
        if (elapsed >= FORGIVE_TIME) {
            forgive(username);
            return false;
        }
        return true;
    }

    // Main combat loop
    bot.on('physicsTick', () => {
        if (!isReady || !bot.entity || isEating) return;

        const health = bot.health || 20;

        if (health < ESCAPE_HEALTH) {
            runAway();
            return;
        }

        if (health < EAT_HEALTH && hasFood()) {
            consumeFood();
            return;
        }

        const creeper = findFusingCreeper();
        if (creeper) {
            runFromCreeper(creeper);
            return;
        }

        killAura();

        if (target) {
            if (!target.isValid) {
                console.log('[Combat] Target eliminated!');
                clearTarget();
                return;
            }

            if (target.username && !isHostile(target.username)) {
                console.log(`[Combat] ${target.username} is peaceful now.`);
                clearTarget();
                return;
            }

            const dist = bot.entity.position.distanceTo(target.position);

            if (dist > CHASE_RANGE) {
                console.log('[Combat] Target escaped.');
                clearTarget();
                return;
            }

            if (dist <= ATTACK_REACH) {
                smartAttack(target);
            } else {
                chase(target);
            }
        } else {
            scanForThreats();
        }
    });

    async function consumeFood() {
        if (isEating) return;
        isEating = true;

        try {
            bot.pathfinder.stop();
            bot.clearControlStates();
        } catch (e) { }

        const items = bot.inventory.items();
        const food = items.find(item => FOOD_ITEMS.includes(item.name));

        if (!food) {
            console.log('[Combat] No food found!');
            isEating = false;
            return;
        }

        console.log(`[Combat] Low health. Eating ${food.name}...`);

        try {
            await bot.equip(food, 'hand');
            bot.activateItem();
            await new Promise(resolve => setTimeout(resolve, 1600));
            bot.deactivateItem();
            console.log('[Combat] Ate food.');
        } catch (e) {
            console.log(`[Combat] Error eating: ${e.message}`);
        }

        equipBestWeapon();
        isEating = false;
    }

    function hasFood() {
        const items = bot.inventory.items();
        return items.some(item => FOOD_ITEMS.includes(item.name));
    }

    function killAura() {
        if (!bot.entities) return;

        for (const entity of Object.values(bot.entities)) {
            if (entity === bot.entity) continue;
            if (!entity.position) continue;

            const dist = bot.entity.position.distanceTo(entity.position);
            if (dist > ATTACK_REACH) continue;

            const isHostilePlayer = entity.type === 'player' && entity.username && isHostile(entity.username);
            if (isHostilePlayer) {
                smartAttack(entity);
                break;
            }

            const isHostileMob = HOSTILE_MOBS.includes(entity.name);
            if (isHostileMob && isThreateningAnyPlayer(entity)) {
                smartAttack(entity);
                break;
            }
        }
    }

    function smartAttack(entity) {
        if (!entity || !entity.isValid) return;

        const headPos = entity.position.offset(0, entity.height || 1.8, 0);
        bot.lookAt(headPos, true);

        const now = Date.now();
        const cooldown = 500;

        if (now - lastAttackTime >= cooldown) {
            equipBestWeapon();
            bot.attack(entity);
            lastAttackTime = now;
        }
    }

    function chase(entity) {
        if (!entity || !entity.position) return;

        try {
            const goal = new goals.GoalFollow(entity, OPTIMAL_DISTANCE);
            bot.pathfinder.setGoal(goal, true);
        } catch (e) {
            bot.lookAt(entity.position);
            bot.setControlState('forward', true);
            bot.setControlState('sprint', true);
        }
    }

    function runAway() {
        console.log(`[Combat] Low health! Running away...`);

        const now = Date.now();
        if (now - lastLowHealthComplaint > 10000) {
            lastLowHealthComplaint = now;
            botEvents.emit('ai:request', {
                context: `You are at ${bot.health.toFixed(0)} HP! Scream for help or say you are running away!`,
                username: 'System'
            });
        }

        const escapePos = findEscapePosition();
        if (escapePos) {
            try {
                const goal = new goals.GoalBlock(
                    Math.floor(escapePos.x),
                    Math.floor(escapePos.y),
                    Math.floor(escapePos.z)
                );
                bot.pathfinder.setGoal(goal, true);
                bot.setControlState('sprint', true);
            } catch (e) { }
        }

        clearTarget();
    }

    function runFromCreeper(creeper) {
        const dx = bot.entity.position.x - creeper.position.x;
        const dz = bot.entity.position.z - creeper.position.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;

        const escapeX = bot.entity.position.x + (dx / len) * 10;
        const escapeZ = bot.entity.position.z + (dz / len) * 10;

        try {
            const goal = new goals.GoalXZ(escapeX, escapeZ);
            bot.pathfinder.setGoal(goal, true);
            bot.setControlState('sprint', true);
        } catch (e) { }
    }

    function scanForThreats() {
        const threat = findNearestGuardThreat();
        if (threat && bot.entity.position.distanceTo(threat.position) <= DETECT_RANGE) {
            setTarget(threat);
            console.log(`[Combat] Protecting player from ${threat.name}!`);
        }
    }

    function setTarget(entity) {
        target = entity;
        equipBestWeapon();
        botEvents.emit('combat:target', { target: entity.name || entity.username });
    }

    function clearTarget() {
        target = null;
        try {
            bot.pathfinder.stop();
            bot.clearControlStates();
        } catch (e) { }
        botEvents.emit('combat:cleared');
    }

    function findNearestPlayer() {
        if (!bot.entities) return null;

        let nearest = null;
        let nearestDist = Infinity;

        for (const entity of Object.values(bot.entities)) {
            if (entity.type !== 'player' || entity === bot.entity || !entity.username) continue;

            const dist = bot.entity.position.distanceTo(entity.position);
            if (dist < nearestDist) {
                nearest = entity;
                nearestDist = dist;
            }
        }
        return nearest;
    }

    function findNearestGuardThreat() {
        if (!bot.entities) return null;

        let nearest = null;
        let nearestDist = Infinity;

        for (const entity of Object.values(bot.entities)) {
            if (entity === bot.entity) continue;

            if (entity.type === 'player' && entity.username && isHostile(entity.username)) {
                const dist = bot.entity.position.distanceTo(entity.position);
                if (dist < nearestDist) {
                    nearest = entity;
                    nearestDist = dist;
                }
                continue;
            }

            if (HOSTILE_MOBS.includes(entity.name)) {
                if (isThreateningAnyPlayer(entity)) {
                    const dist = bot.entity.position.distanceTo(entity.position);
                    if (dist < nearestDist) {
                        nearest = entity;
                        nearestDist = dist;
                    }
                }
            }
        }
        return nearest;
    }

    function isThreateningAnyPlayer(mob) {
        for (const player of Object.values(bot.entities)) {
            if (player.type !== 'player' || player === bot.entity) continue;

            if (mob.position.distanceTo(player.position) < 5) {
                return true;
            }
        }
        return false;
    }

    function findFusingCreeper() {
        if (!bot.entities) return null;

        for (const entity of Object.values(bot.entities)) {
            if (entity.name !== 'creeper') continue;

            const dist = bot.entity.position.distanceTo(entity.position);
            if (dist > CREEPER_SAFE_DISTANCE) continue;

            if (dist < 4) return entity;
        }
        return null;
    }

    function findEscapePosition() {
        if (!bot.entities) return null;

        let avgX = 0, avgZ = 0, count = 0;

        for (const entity of Object.values(bot.entities)) {
            const isHostileMob = HOSTILE_MOBS.includes(entity.name);
            const isHostilePlayer = entity.type === 'player' && entity.username && isHostile(entity.username);

            if (!isHostileMob && !isHostilePlayer) continue;

            const dist = bot.entity.position.distanceTo(entity.position);
            if (dist > 15) continue;

            avgX += entity.position.x;
            avgZ += entity.position.z;
            count++;
        }

        if (count === 0) return null;

        avgX /= count;
        avgZ /= count;

        const dx = bot.entity.position.x - avgX;
        const dz = bot.entity.position.z - avgZ;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;

        return bot.entity.position.offset((dx / len) * 20, 0, (dz / len) * 20);
    }

    function equipBestWeapon() {
        const priority = [
            'netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword',
            'netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe'
        ];

        const items = bot.inventory.items();
        for (const weaponName of priority) {
            const weapon = items.find(item => item.name === weaponName);
            if (weapon) {
                bot.equip(weapon, 'hand').catch(() => { });
                return;
            }
        }
    }

    // Expose for guard module
    bot.startCombat = setTarget;

    console.log('[Combat] Module loaded!');
}

module.exports = { setupCombat };
