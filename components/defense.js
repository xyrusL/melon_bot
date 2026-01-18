/**
 * ═══════════════════════════════════════════════════════════════
 *                    🛡️ DEFENSIVE BEHAVIORS
 * ═══════════════════════════════════════════════════════════════
 *   - Auto-equip shield against ranged attacks
 *   - Block creepers with shield
 *   - Jump over obstacles
 *   - Sneak for stealth/creepers
 *   - 360° threat detection (including behind)
 * ═══════════════════════════════════════════════════════════════
 */

function setupDefense(bot) {
    let isBlocking = false;
    let hasShield = false;
    let shieldItem = null;
    let lastShieldCheck = 0;
    let threatsAround = { front: [], behind: [], left: [], right: [] };

    bot.once('spawn', () => {
        console.log('[Defense] Defensive behaviors enabled!');
    });

    // Check for shield every 5 seconds
    setInterval(() => {
        checkForShield();
    }, 5000);

    // Scan for threats in all directions
    bot.on('physicsTick', () => {
        if (!bot.entity || !bot.entities) return;

        scan360Threats();
        handleDefensiveBehaviors();
    });

    function checkForShield() {
        if (!bot.inventory) return;

        const shield = bot.inventory.items().find(item => item.name === 'shield');
        if (shield) {
            hasShield = true;
            shieldItem = shield;
        } else {
            hasShield = false;
            shieldItem = null;
        }
    }

    function scan360Threats() {
        if (!bot.entities) return;

        const threats = { front: [], behind: [], left: [], right: [] };
        const botPos = bot.entity.position;
        const botYaw = bot.entity.yaw; // Bot's facing direction

        for (const entity of Object.values(bot.entities)) {
            if (entity === bot.entity) continue;

            const dist = botPos.distanceTo(entity.position);
            if (dist > 10) continue; // Only care about close threats

            const isProjectile = entity.type === 'object' &&
                (entity.name === 'arrow' || entity.name === 'fireball');
            const isRangedMob = entity.name === 'skeleton' ||
                entity.name === 'pillager' ||
                entity.name === 'blaze';
            const isCreeper = entity.name === 'creeper';
            const isDangerous = isProjectile || isRangedMob || isCreeper;

            if (!isDangerous) continue;

            // Calculate angle to threat
            const dx = entity.position.x - botPos.x;
            const dz = entity.position.z - botPos.z;
            const angleToThreat = Math.atan2(-dx, -dz); // Minecraft coords

            // Relative angle to bot's facing
            let relativeAngle = angleToThreat - botYaw;
            while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
            while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;

            const threat = { entity, dist, relativeAngle };

            // Categorize by direction
            const absAngle = Math.abs(relativeAngle);
            if (absAngle < Math.PI / 4) {
                threats.front.push(threat); // Front
            } else if (absAngle > 3 * Math.PI / 4) {
                threats.behind.push(threat); // Behind!
            } else if (relativeAngle > 0) {
                threats.left.push(threat); // Left
            } else {
                threats.right.push(threat); // Right
            }
        }

        threatsAround = threats;
    }

    function handleDefensiveBehaviors() {
        const allThreats = [
            ...threatsAround.front,
            ...threatsAround.behind,
            ...threatsAround.left,
            ...threatsAround.right
        ];

        if (allThreats.length === 0) {
            stopBlocking();
            return;
        }

        // Priority 1: Threats from BEHIND - turn around!
        if (threatsAround.behind.length > 0) {
            handleBehindThreat(threatsAround.behind[0]);
            return;
        }

        // Priority 2: Arrows/projectiles incoming - SHIELD UP
        const projectile = allThreats.find(t =>
            t.entity.type === 'object' &&
            (t.entity.name === 'arrow' || t.entity.name === 'fireball')
        );
        if (projectile && projectile.dist < 8) {
            equipShieldAndBlock(projectile.entity);
            return;
        }

        // Priority 3: Creeper nearby - SHIELD + SNEAK
        const creeper = allThreats.find(t => t.entity.name === 'creeper');
        if (creeper && creeper.dist < 5) {
            handleCreeper(creeper.entity);
            return;
        }

        // Priority 4: Skeleton/Pillager - Shield ready
        const ranged = allThreats.find(t =>
            t.entity.name === 'skeleton' ||
            t.entity.name === 'pillager' ||
            t.entity.name === 'blaze'
        );
        if (ranged && ranged.dist < 10) {
            equipShieldAndBlock(ranged.entity);
            return;
        }

        stopBlocking();
    }

    function handleBehindThreat(threat) {
        console.log(`[Defense] ⚠️ Threat from BEHIND! Turning around!`);

        // Turn to face the threat
        const entity = threat.entity;
        try {
            bot.lookAt(entity.position.offset(0, entity.height || 1, 0));

            // If it's a projectile or creeper, shield up!
            if (entity.name === 'arrow' || entity.name === 'creeper') {
                equipShieldAndBlock(entity);
            }
        } catch (e) { }
    }

    function equipShieldAndBlock(threat) {
        if (!hasShield || !shieldItem) return;

        // Equip shield in offhand
        if (!isBlocking) {
            bot.equip(shieldItem, 'off-hand').then(() => {
                console.log('[Defense] 🛡️ Shield equipped!');
                startBlocking(threat);
            }).catch(() => { });
        } else {
            // Already has shield, just block
            startBlocking(threat);
        }
    }

    function startBlocking(threat) {
        if (isBlocking) return;

        try {
            // Look at threat
            bot.lookAt(threat.position.offset(0, threat.height || 1, 0));

            // Activate shield (right-click / use item)
            bot.activateItem(); // Hold right-click
            isBlocking = true;

            const threatName = threat.name || 'threat';
            console.log(`[Defense] 🛡️ Blocking against ${threatName}!`);

            // Auto-stop after 2 seconds
            setTimeout(() => {
                stopBlocking();
            }, 2000);
        } catch (e) { }
    }

    function stopBlocking() {
        if (!isBlocking) return;

        try {
            bot.deactivateItem();
            isBlocking = false;
        } catch (e) { }
    }

    function handleCreeper(creeper) {
        const dist = bot.entity.position.distanceTo(creeper.position);

        if (dist < 3) {
            // VERY CLOSE - Shield + Sprint away!
            console.log('[Defense] 💥 CREEPER TOO CLOSE! Retreating!');
            equipShieldAndBlock(creeper);
            bot.setControlState('sprint', true);
            bot.setControlState('forward', true);

            // Try to move away
            setTimeout(() => {
                bot.setControlState('sprint', false);
                bot.setControlState('forward', false);
            }, 1000);

        } else if (dist < 5) {
            // Medium range - Shield up and ready
            console.log('[Defense] ⚠️ Creeper nearby! Shield ready!');
            equipShieldAndBlock(creeper);
        }
    }

    // Jump logic (for obstacles during combat)
    bot.on('physicsTick', () => {
        // If bot is moving forward and hits obstacle, jump
        if (bot.controlState && bot.controlState.forward) {
            const blockAhead = bot.blockAtCursor(3);
            if (blockAhead && blockAhead.position.y >= bot.entity.position.y) {
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 100);
            }
        }
    });

    console.log('[Defense] Defensive behaviors loaded!');
}

module.exports = { setupDefense };
