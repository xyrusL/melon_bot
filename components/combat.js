/**
 * ═══════════════════════════════════════════════════════════════
 *                    ⚔️ COMBAT COMPONENT (AltoClef-Inspired)
 * ═══════════════════════════════════════════════════════════════
 *   - Smart Attack: Waits for attack cooldown for max damage
 *   - Kill Aura: Auto-attacks hostiles in range
 *   - Maintain Distance: Keeps optimal combat range
 *   - Smart Escape: Run away when low HP or outnumbered
 *   - Peace System: Stops fighting when player stops attacking
 * ═══════════════════════════════════════════════════════════════
 */

const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

// ┌─────────────────────────────────────────────────────────────┐
// │                    ⚙️ COMBAT SETTINGS                       │
// └─────────────────────────────────────────────────────────────┘

const ATTACK_REACH = 3.5;           // Attack reach distance
const OPTIMAL_DISTANCE = 2.5;       // Optimal fighting distance
const DETECT_RANGE = 8;             // Detect enemies within this range
const CHASE_RANGE = 20;             // Stop chasing beyond this
const ESCAPE_HEALTH = 6;            // Run away when HP below this
const EAT_HEALTH = 15;              // Eat when HP below this
const FORGIVE_TIME = 4000;          // Peace after 4s no attacks
const CREEPER_SAFE_DISTANCE = 6;    // Stay away from creepers

const HOSTILE_MOBS = [
  'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch',
  'slime', 'phantom', 'drowned', 'husk', 'stray', 'blaze',
  'ghast', 'magma_cube', 'hoglin', 'piglin_brute', 'warden',
  'pillager', 'vindicator', 'evoker', 'ravager', 'vex',
  'cave_spider', 'silverfish', 'endermite', 'guardian', 'elder_guardian',
  'wither_skeleton', 'zombified_piglin'
];

const SAFE_MOBS = [
  'horse', 'donkey', 'mule', 'llama', 'wolf', 'cat', 'parrot',
  'villager', 'wandering_trader', 'iron_golem', 'snow_golem',
  'pig', 'cow', 'sheep', 'chicken', 'rabbit', 'turtle', 'panda', 'fox'
];

const FOOD_ITEMS = [
  'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton',
  'cooked_rabbit', 'cooked_cod', 'cooked_salmon',
  'bread', 'apple', 'golden_apple', 'enchanted_golden_apple',
  'baked_potato', 'cookie', 'melon_slice', 'sweet_berries',
  'beef', 'porkchop', 'chicken', 'mutton', 'rabbit', 'carrot', 'potato'
];

function setupCombat(bot) {
  bot.loadPlugin(pathfinder);

  // State
  let isReady = false;
  let target = null;
  let lastAttackTime = 0;
  let isEating = false;
  let lastLowHealthComplaint = 0;

  // Player hostility tracking
  const hostilePlayers = new Map(); // username -> timestamp
  const forgiveTimers = new Map();

  // ═══════════════════════════════════════════════════════════════
  //                         INITIALIZATION
  // ═══════════════════════════════════════════════════════════════

  bot.once('spawn', () => {
    try {
      const mcData = require('minecraft-data')(bot.version);
      const movements = new Movements(bot, mcData);
      movements.allowSprinting = true;
      movements.canDig = false;
      bot.pathfinder.setMovements(movements);
      isReady = true;
      console.log('[Combat] Ready! (AltoClef-style combat)');
    } catch (err) {
      console.log('[Combat] Setup delayed...');
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //                     PLAYER HOSTILITY SYSTEM
  // ═══════════════════════════════════════════════════════════════

  // When bot gets hurt, find who attacked
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

    // Clear existing timer
    if (forgiveTimers.has(username)) {
      clearTimeout(forgiveTimers.get(username));
    }

    // Set forgive timer
    const timer = setTimeout(() => forgive(username), FORGIVE_TIME);
    forgiveTimers.set(username, timer);
  }

  function forgive(username) {
    console.log(`[Combat] ${username} stopped attacking. Peace! 🕊️`);
    hostilePlayers.delete(username);
    forgiveTimers.delete(username);

    // Stop fighting this player
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

  // ═══════════════════════════════════════════════════════════════
  //                      MAIN COMBAT LOOP
  // ═══════════════════════════════════════════════════════════════

  bot.on('physicsTick', () => {
    if (!isReady || !bot.entity || isEating) return;

    const health = bot.health || 20;

    // Priority 1: Run away if low health
    if (health < ESCAPE_HEALTH) {
      runAway();
      return;
    }

    // Priority 2.5: Eat if hurt (and safe enough or urgent)
    if (health < EAT_HEALTH) {
      // Only eat if we have food
      if (hasFood()) {
        consumeFood();
        return;
      }
    }

    // Priority 2: Run from fusing creepers
    const creeper = findFusingCreeper();
    if (creeper) {
      runFromCreeper(creeper);
      return;
    }

    // Priority 3: Kill Aura - attack anything in reach
    killAura();

    // Priority 4: Chase current target
    if (target) {
      if (!target.isValid) {
        console.log('[Combat] Target eliminated!');
        clearTarget();
        return;
      }

      // Check if player target became peaceful
      if (target.username && !isHostile(target.username)) {
        console.log(`[Combat] ${target.username} is peaceful now.`);
        clearTarget();
        return;
      }

      const dist = bot.entity.position.distanceTo(target.position);

      // Lost target (too far)
      if (dist > CHASE_RANGE) {
        console.log('[Combat] Target escaped.');
        clearTarget();
        return;
      }

      // In range - attack with cooldown
      if (dist <= ATTACK_REACH) {
        smartAttack(target);
      } else {
        // Chase target
        chase(target);
      }
    } else {
      // No target - scan for hostiles
      scanForThreats();
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //                      COMBAT FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Eat food to recover health
   */
  async function consumeFood() {
    if (isEating) return;
    isEating = true;

    // Stop moving/attacking to eat
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

    console.log(`[Combat] Low health (${bot.health.toFixed(1)}). Eating ${food.name}...`);

    try {
      await bot.equip(food, 'hand');
      bot.activateItem(); // Start eating

      await new Promise(resolve => setTimeout(resolve, 1600)); // Eat duration
      bot.deactivateItem();

      console.log('[Combat] Ate food. Recovering...');
    } catch (e) {
      console.log(`[Combat] Error eating: ${e.message}`);
    }

    // Re-equip weapon immediately
    equipBestWeapon();
    isEating = false;
  }

  function hasFood() {
    const items = bot.inventory.items();
    return items.some(item => FOOD_ITEMS.includes(item.name));
  }

  /**
   * Guardian Kill Aura - Attack only if threat to us or players
   */
  function killAura() {
    if (!bot.entities) return;

    for (const entity of Object.values(bot.entities)) {
      if (entity === bot.entity) continue;
      if (!entity.position) continue;

      const dist = bot.entity.position.distanceTo(entity.position);
      if (dist > ATTACK_REACH) continue;

      // Logic: Attack if...
      // 1. It's a player who attacked us (hostile)
      // 2. It's a mob threatening a player

      const isHostilePlayer = entity.type === 'player' && entity.username && isHostile(entity.username);
      if (isHostilePlayer) {
        smartAttack(entity);
        break;
      }

      const isHostileMob = HOSTILE_MOBS.includes(entity.name);
      if (isHostileMob) {
        // Check if threatening any player
        const threateningPlayer = isThreateningAnyPlayer(entity);
        if (threateningPlayer) {
          smartAttack(entity);
          break;
        }
      }
    }
  }

  /**
   * Smart Attack - Wait for attack cooldown for maximum damage
   * AltoClef style: Only attack when cooldown is ready
   */
  function smartAttack(entity) {
    if (!entity || !entity.isValid) return;

    // Look at target
    const headPos = entity.position.offset(0, entity.height || 1.8, 0);
    bot.lookAt(headPos, true);

    // Check attack cooldown (similar to AltoClef's getAttackCooldownProgress)
    const now = Date.now();
    const cooldown = 500; // ~0.5s between attacks (10 TPS attack speed)

    if (now - lastAttackTime >= cooldown) {
      equipBestWeapon();
      bot.attack(entity);
      lastAttackTime = now;
    }
  }

  /**
   * Chase target while maintaining optimal distance
   */
  function chase(entity) {
    if (!entity || !entity.position) return;

    try {
      const goal = new goals.GoalFollow(entity, OPTIMAL_DISTANCE);
      bot.pathfinder.setGoal(goal, true);
    } catch (e) {
      // Fallback: just walk towards
      bot.lookAt(entity.position);
      bot.setControlState('forward', true);
      bot.setControlState('sprint', true);
    }
  }

  /**
   * Run away from all threats
   */
  function runAway() {
    console.log(`[Combat] Low health! Running away...`);

    // AI Complaint (throttled 10s)
    const now = Date.now();
    if (bot.chatWithAI && now - lastLowHealthComplaint > 10000) {
      lastLowHealthComplaint = now;
      bot.chatWithAI(`You are at ${bot.health.toFixed(0)} HP! Scream for help or say you are running away to heal!`, 'System');
    }

    // Attempt to consume food while running away if possibleats
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

  /**
   * Run away from fusing creeper
   */
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

  /**
   * Scan for threats (Guardian Mode)
   */
  function scanForThreats() {
    const threat = findNearestGuardThreat();
    if (threat && bot.entity.position.distanceTo(threat.position) <= DETECT_RANGE) {
      setTarget(threat);
      console.log(`[Combat] Protecting player from ${threat.name}!`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //                      UTILITY FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  function setTarget(entity) {
    target = entity;
    equipBestWeapon();
  }

  function clearTarget() {
    target = null;
    try {
      bot.pathfinder.stop();
      bot.clearControlStates();
    } catch (e) { }
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

      // 1. Hostile Players (Self-Defense)
      if (entity.type === 'player' && entity.username && isHostile(entity.username)) {
        const dist = bot.entity.position.distanceTo(entity.position);
        if (dist < nearestDist) {
          nearest = entity;
          nearestDist = dist;
        }
        continue;
      }

      // 2. Mobs Threatening Players (Guardian)
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
    // Check if mob is close to ANY player (except bot)
    for (const player of Object.values(bot.entities)) {
      if (player.type !== 'player' || player === bot.entity) continue;

      if (mob.position.distanceTo(player.position) < 5) {
        return true; // Mob is within 5 blocks of a player
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

      // Check if creeper is fusing (metadata check)
      // In mineflayer, we can check entity.metadata for fuse state
      // For now, just run if creeper is close
      if (dist < 4) return entity;
    }
    return null;
  }

  function findEscapePosition() {
    if (!bot.entities) return null;

    // Find average position of all threats
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

    // Run opposite direction
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

  // Expose for guard component
  bot.startCombat = setTarget;

  console.log('[Combat] Combat system loaded! (AltoClef-style)');
}

module.exports = { setupCombat };
