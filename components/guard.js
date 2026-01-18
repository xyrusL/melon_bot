/**
 * ═══════════════════════════════════════════════════════════════
 *                    🛡️ SMART GUARD COMPONENT
 * ═══════════════════════════════════════════════════════════════
 *   Handles multiple combat scenarios:
 *   1. Single mob attacking player → Direct attack
 *   2. Player surrounded → Help clear space
 *   3. Creeper near player → PRIORITY kill
 *   4. Player low health → Aggressive defense
 *   5. Player chased by mobs → Intercept
 *   6. Boss fight → Focus fire same target
 * ═══════════════════════════════════════════════════════════════
 */

const { pathfinder, goals } = require('mineflayer-pathfinder');

const GUARD_RANGE = 12;
const CRITICAL_HEALTH = 10; // Player below this = emergency mode

// Mob threat levels (higher = more dangerous)
const THREAT_PRIORITY = {
    'creeper': 10,        // HIGHEST - can one-shot
    'warden': 9,
    'wither_skeleton': 8,
    'pillager': 7,       // Ranged threat
    'skeleton': 7,
    'vindicator': 6,
    'zombie': 5,
    'spider': 4,
    'enderman': 3,
    'default': 2
};

const HOSTILE_MOBS = [
    'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch',
    'slime', 'phantom', 'drowned', 'husk', 'stray', 'blaze',
    'ghast', 'magma_cube', 'hoglin', 'piglin_brute', 'warden',
    'pillager', 'vindicator', 'evoker', 'ravager', 'vex',
    'cave_spider', 'silverfish', 'endermite', 'guardian', 'elder_guardian',
    'wither_skeleton', 'zombified_piglin'
];

function setupGuard(bot) {
    let protectedPlayers = new Set();
    let isReady = false;
    let guardMode = 'passive'; // passive, active, emergency

    bot.once('spawn', () => {
        isReady = true;
        console.log('[Guard] Smart Guard ready! (Multiple scenario handling)');
    });

    // Main guard loop - scan every 500ms
    setInterval(() => {
        if (!isReady || !bot.entities) return;

        scanAndProtect();
    }, 500);

    function scanAndProtect() {
        const nearbyPlayers = getNearbyPlayers();

        for (const player of nearbyPlayers) {
            const scenario = analyzePlayerSituation(player);

            if (scenario.needsHelp) {
                protectedPlayers.add(player.username);
                handleScenario(player, scenario);
            }
        }
    }

    // Analyze what's happening to a player
    function analyzePlayerSituation(player) {
        const situation = {
            needsHelp: false,
            scenario: 'safe',
            threats: [],
            priority: 0
        };

        // Find all hostile mobs near player
        const nearbyMobs = Object.values(bot.entities).filter(e =>
            e.type === 'mob' &&
            HOSTILE_MOBS.includes(e.name) &&
            player.position.distanceTo(e.position) < 8
        );

        if (nearbyMobs.length === 0) return situation;

        situation.needsHelp = true;
        situation.threats = nearbyMobs;

        // SCENARIO 1: Creeper nearby (EMERGENCY!)
        const creeper = nearbyMobs.find(m => m.name === 'creeper');
        if (creeper && player.position.distanceTo(creeper.position) < 4) {
            situation.scenario = 'creeper_emergency';
            situation.priority = 10;
            situation.primaryThreat = creeper;
            return situation;
        }

        // SCENARIO 2: Player surrounded (3+ mobs)
        if (nearbyMobs.length >= 3) {
            situation.scenario = 'surrounded';
            situation.priority = 8;
            situation.primaryThreat = getClosestMob(player, nearbyMobs);
            return situation;
        }

        // SCENARIO 3: Player low health (if we can detect it)
        // Note: We can't directly read player health, but we can infer from behavior

        // SCENARIO 4: High priority mob (Warden, Wither Skeleton, etc.)
        const dangerousMob = findMostDangerousMob(nearbyMobs);
        if (getThreatLevel(dangerousMob.name) >= 7) {
            situation.scenario = 'high_threat';
            situation.priority = getThreatLevel(dangerousMob.name);
            situation.primaryThreat = dangerousMob;
            return situation;
        }

        // SCENARIO 5: Player being chased (mob close and moving toward player)
        const chasingMob = nearbyMobs.find(m =>
            player.position.distanceTo(m.position) < 4
        );
        if (chasingMob) {
            situation.scenario = 'chasing';
            situation.priority = 6;
            situation.primaryThreat = chasingMob;
            return situation;
        }

        // SCENARIO 6: Normal combat (1-2 mobs)
        situation.scenario = 'normal_combat';
        situation.priority = 5;
        situation.primaryThreat = getClosestMob(player, nearbyMobs);

        return situation;
    }

    function handleScenario(player, scenario) {
        const startCombat = bot.startCombat;
        if (!startCombat) return;

        switch (scenario.scenario) {
            case 'creeper_emergency':
                console.log(`[Guard] 🚨 CREEPER NEAR ${player.username}! EMERGENCY!`);
                guardMode = 'emergency';
                // Attack creeper immediately
                startCombat(scenario.primaryThreat, 'PRIORITY: Creeper threat!');
                break;

            case 'surrounded':
                console.log(`[Guard] ${player.username} surrounded by ${scenario.threats.length} mobs!`);
                guardMode = 'active';
                // Attack closest to help clear space
                startCombat(scenario.primaryThreat, 'Clearing mobs around player:');
                break;

            case 'high_threat':
                console.log(`[Guard] Dangerous mob (${scenario.primaryThreat.name}) attacking ${player.username}!`);
                guardMode = 'active';
                startCombat(scenario.primaryThreat, 'High threat mob:');
                break;

            case 'chasing':
                console.log(`[Guard] ${scenario.primaryThreat.name} chasing ${player.username}! Intercepting!`);
                guardMode = 'active';
                // Intercept the mob
                startCombat(scenario.primaryThreat, 'Intercepting:');
                break;

            case 'normal_combat':
                if (guardMode === 'passive') {
                    console.log(`[Guard] Assisting ${player.username} vs ${scenario.primaryThreat.name}`);
                    guardMode = 'active';
                }
                startCombat(scenario.primaryThreat, 'Assisting player:');
                break;
        }
    }

    // Listen for entity hurt events (backup detection)
    bot.on('entityHurt', (entity) => {
        if (!isReady || !bot.entities) return;
        if (entity === bot.entity) return;

        const startCombat = bot.startCombat;
        if (!startCombat) return;

        // Player hurt - immediate reaction
        if (entity.type === 'player' && entity.username) {
            if (bot.entity.position.distanceTo(entity.position) < GUARD_RANGE) {
                const attacker = findMobNearEntity(bot, entity, 5);
                if (attacker) {
                    const threat = getThreatLevel(attacker.name);
                    const prefix = threat >= 7 ? '🚨' : '';
                    console.log(`[Guard] ${prefix} ${entity.username} hit by ${attacker.name}!`);
                    protectedPlayers.add(entity.username);
                    startCombat(attacker, 'Player damaged by:');
                }
            }
        }

        // Mob hurt - player might be fighting
        if (HOSTILE_MOBS.includes(entity.name)) {
            const nearbyPlayer = findNearestPlayerToPos(bot, entity.position);
            if (nearbyPlayer && nearbyPlayer.username !== bot.username) {
                const distToBot = bot.entity.position.distanceTo(nearbyPlayer.position);
                if (distToBot < GUARD_RANGE) {
                    protectedPlayers.add(nearbyPlayer.username);
                    startCombat(entity, 'Player fighting:');
                }
            }
        }
    });

    // Utils
    function getNearbyPlayers() {
        if (!bot.entities) return [];
        return Object.values(bot.entities).filter(e =>
            e.type === 'player' &&
            e.username &&
            e !== bot.entity &&
            bot.entity.position.distanceTo(e.position) < GUARD_RANGE
        );
    }

    function getClosestMob(player, mobs) {
        return mobs.reduce((closest, mob) => {
            const dist = player.position.distanceTo(mob.position);
            const closestDist = closest ? player.position.distanceTo(closest.position) : Infinity;
            return dist < closestDist ? mob : closest;
        }, null);
    }

    function findMostDangerousMob(mobs) {
        return mobs.reduce((most, mob) => {
            const threat = getThreatLevel(mob.name);
            const mostThreat = most ? getThreatLevel(most.name) : 0;
            return threat > mostThreat ? mob : most;
        }, null);
    }

    function getThreatLevel(mobName) {
        return THREAT_PRIORITY[mobName] || THREAT_PRIORITY['default'];
    }

    function findMobNearEntity(bot, entity, radius) {
        if (!bot.entities) return null;
        return Object.values(bot.entities).find(e =>
            e.type === 'mob' &&
            HOSTILE_MOBS.includes(e.name) &&
            entity.position.distanceTo(e.position) < radius
        );
    }

    function findNearestPlayerToPos(bot, position) {
        if (!bot.entities) return null;
        let closest = null;
        let closestDist = Infinity;

        for (const e of Object.values(bot.entities)) {
            if (e.type === 'player' && e.username) {
                const dist = e.position.distanceTo(position);
                if (dist < closestDist) {
                    closest = e;
                    closestDist = dist;
                }
            }
        }
        return closest;
    }

    function isProtectedPlayer(entity) {
        if (!entity || entity.type !== 'player') return false;
        return protectedPlayers.has(entity.username);
    }

    // Expose
    bot.guard = {
        isProtectedPlayer,
        protectedPlayers,
        guardMode: () => guardMode
    };
}

module.exports = { setupGuard };
