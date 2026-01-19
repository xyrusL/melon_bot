/**
 * ═══════════════════════════════════════════════════════════════
 *                    🛡️ DEFENSE MODULE
 * ═══════════════════════════════════════════════════════════════
 * 
 * Defensive behaviors: Shield, jump, 360° threat detection.
 * 
 * ═══════════════════════════════════════════════════════════════
 */

function setupDefense(bot, botEvents) {
    let isBlocking = false;
    let hasShield = false;
    let shieldItem = null;
    let threatsAround = { front: [], behind: [], left: [], right: [] };

    bot.once('spawn', () => {
        console.log('[Defense] Ready!');
    });

    setInterval(() => checkForShield(), 5000);

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
        const botYaw = bot.entity.yaw;

        for (const entity of Object.values(bot.entities)) {
            if (entity === bot.entity) continue;

            const dist = botPos.distanceTo(entity.position);
            if (dist > 10) continue;

            const isProjectile = entity.type === 'object' &&
                (entity.name === 'arrow' || entity.name === 'fireball');
            const isRangedMob = entity.name === 'skeleton' ||
                entity.name === 'pillager' ||
                entity.name === 'blaze';
            const isCreeper = entity.name === 'creeper';
            const isDangerous = isProjectile || isRangedMob || isCreeper;

            if (!isDangerous) continue;

            const dx = entity.position.x - botPos.x;
            const dz = entity.position.z - botPos.z;
            const angleToThreat = Math.atan2(-dx, -dz);

            let relativeAngle = angleToThreat - botYaw;
            while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
            while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;

            const threat = { entity, dist, relativeAngle };

            const absAngle = Math.abs(relativeAngle);
            if (absAngle < Math.PI / 4) {
                threats.front.push(threat);
            } else if (absAngle > 3 * Math.PI / 4) {
                threats.behind.push(threat);
            } else if (relativeAngle > 0) {
                threats.left.push(threat);
            } else {
                threats.right.push(threat);
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

        if (threatsAround.behind.length > 0) {
            handleBehindThreat(threatsAround.behind[0]);
            return;
        }

        const projectile = allThreats.find(t =>
            t.entity.type === 'object' &&
            (t.entity.name === 'arrow' || t.entity.name === 'fireball')
        );
        if (projectile && projectile.dist < 8) {
            equipShieldAndBlock(projectile.entity);
            return;
        }

        const creeper = allThreats.find(t => t.entity.name === 'creeper');
        if (creeper && creeper.dist < 5) {
            handleCreeper(creeper.entity);
            return;
        }

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
        console.log(`[Defense] ⚠️ Threat from BEHIND!`);

        const entity = threat.entity;
        try {
            bot.lookAt(entity.position.offset(0, entity.height || 1, 0));

            if (entity.name === 'arrow' || entity.name === 'creeper') {
                equipShieldAndBlock(entity);
            }
        } catch (e) { }
    }

    function equipShieldAndBlock(threat) {
        if (!hasShield || !shieldItem) return;

        if (!isBlocking) {
            bot.equip(shieldItem, 'off-hand').then(() => {
                console.log('[Defense] 🛡️ Shield equipped!');
                startBlocking(threat);
            }).catch(() => { });
        } else {
            startBlocking(threat);
        }
    }

    function startBlocking(threat) {
        if (isBlocking) return;

        try {
            bot.lookAt(threat.position.offset(0, threat.height || 1, 0));
            bot.activateItem();
            isBlocking = true;

            console.log(`[Defense] 🛡️ Blocking!`);

            setTimeout(() => stopBlocking(), 2000);
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
            console.log('[Defense] 💥 CREEPER TOO CLOSE!');
            equipShieldAndBlock(creeper);
            bot.setControlState('sprint', true);
            bot.setControlState('forward', true);

            setTimeout(() => {
                bot.setControlState('sprint', false);
                bot.setControlState('forward', false);
            }, 1000);

        } else if (dist < 5) {
            console.log('[Defense] ⚠️ Creeper nearby!');
            equipShieldAndBlock(creeper);
        }
    }

    console.log('[Defense] Module loaded!');
}

module.exports = { setupDefense };
