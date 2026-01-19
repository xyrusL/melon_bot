/**
 * ═══════════════════════════════════════════════════════════════
 *                    🛡️ GUARD MODULE
 * ═══════════════════════════════════════════════════════════════
 * 
 * Protects nearby players from hostile mobs.
 * Handles scenarios: creeper emergency, surrounded, high threat.
 * 
 * ═══════════════════════════════════════════════════════════════
 */

const { goals } = require('mineflayer-pathfinder');

const GUARD_RANGE = 12;

const THREAT_PRIORITY = {
    'creeper': 10,
    'warden': 9,
    'wither_skeleton': 8,
    'pillager': 7,
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

function setupGuard(bot, botEvents) {
    let protectedPlayers = new Set();
    let isReady = false;
    let guardMode = 'passive';

    bot.once('spawn', () => {
        isReady = true;
        console.log('[Guard] Ready!');
    });

    // Guard scan every 1 second (was 0.5s - reduced for ping)
    setInterval(() => {
        if (!isReady || !bot.entities) return;
        scanAndProtect();
    }, 1000);

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

    function analyzePlayerSituation(player) {
        const situation = {
            needsHelp: false,
            scenario: 'safe',
            threats: [],
            priority: 0
        };

        const nearbyMobs = Object.values(bot.entities).filter(e =>
            e.type === 'mob' &&
            HOSTILE_MOBS.includes(e.name) &&
            player.position.distanceTo(e.position) < 8
        );

        if (nearbyMobs.length === 0) return situation;

        situation.needsHelp = true;
        situation.threats = nearbyMobs;

        const creeper = nearbyMobs.find(m => m.name === 'creeper');
        if (creeper && player.position.distanceTo(creeper.position) < 4) {
            situation.scenario = 'creeper_emergency';
            situation.priority = 10;
            situation.primaryThreat = creeper;
            return situation;
        }

        if (nearbyMobs.length >= 3) {
            situation.scenario = 'surrounded';
            situation.priority = 8;
            situation.primaryThreat = getClosestMob(player, nearbyMobs);
            return situation;
        }

        const dangerousMob = findMostDangerousMob(nearbyMobs);
        if (getThreatLevel(dangerousMob.name) >= 7) {
            situation.scenario = 'high_threat';
            situation.priority = getThreatLevel(dangerousMob.name);
            situation.primaryThreat = dangerousMob;
            return situation;
        }

        const chasingMob = nearbyMobs.find(m =>
            player.position.distanceTo(m.position) < 4
        );
        if (chasingMob) {
            situation.scenario = 'chasing';
            situation.priority = 6;
            situation.primaryThreat = chasingMob;
            return situation;
        }

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
                console.log(`[Guard] 🚨 CREEPER NEAR ${player.username}!`);
                guardMode = 'emergency';
                startCombat(scenario.primaryThreat);
                break;

            case 'surrounded':
                console.log(`[Guard] ${player.username} surrounded!`);
                guardMode = 'active';
                startCombat(scenario.primaryThreat);
                break;

            case 'high_threat':
                console.log(`[Guard] Dangerous mob attacking ${player.username}!`);
                guardMode = 'active';
                startCombat(scenario.primaryThreat);
                break;

            case 'chasing':
                console.log(`[Guard] Mob chasing ${player.username}!`);
                guardMode = 'active';
                startCombat(scenario.primaryThreat);
                break;

            case 'normal_combat':
                if (guardMode === 'passive') {
                    console.log(`[Guard] Assisting ${player.username}`);
                    guardMode = 'active';
                }
                startCombat(scenario.primaryThreat);
                break;
        }
    }

    bot.on('entityHurt', (entity) => {
        if (!isReady || !bot.entities) return;
        if (entity === bot.entity) return;

        const startCombat = bot.startCombat;
        if (!startCombat) return;

        if (entity.type === 'player' && entity.username) {
            if (bot.entity.position.distanceTo(entity.position) < GUARD_RANGE) {
                const attacker = findMobNearEntity(entity, 5);
                if (attacker) {
                    console.log(`[Guard] ${entity.username} hit by ${attacker.name}!`);
                    protectedPlayers.add(entity.username);
                    startCombat(attacker);
                }
            }
        }

        if (HOSTILE_MOBS.includes(entity.name)) {
            const nearbyPlayer = findNearestPlayerToPos(entity.position);
            if (nearbyPlayer && nearbyPlayer.username !== bot.username) {
                const distToBot = bot.entity.position.distanceTo(nearbyPlayer.position);
                if (distToBot < GUARD_RANGE) {
                    protectedPlayers.add(nearbyPlayer.username);
                    startCombat(entity);
                }
            }
        }
    });

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

    function findMobNearEntity(entity, radius) {
        if (!bot.entities) return null;
        return Object.values(bot.entities).find(e =>
            e.type === 'mob' &&
            HOSTILE_MOBS.includes(e.name) &&
            entity.position.distanceTo(e.position) < radius
        );
    }

    function findNearestPlayerToPos(position) {
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

    bot.guard = {
        protectedPlayers,
        guardMode: () => guardMode
    };

    console.log('[Guard] Module loaded!');
}

module.exports = { setupGuard };
