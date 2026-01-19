/**
 * ═══════════════════════════════════════════════════════════════
 *                    🤝 SOCIAL MODULE (AFK & Following)
 * ═══════════════════════════════════════════════════════════════
 * 
 * This module handles Mochi's social behavior:
 * - Following players who ask
 * - Going to spawn when alone
 * - Waking up when friends return
 * 
 * EVENTS EMITTED:
 * - 'social:following' - Started following someone
 * - 'social:lonely'    - No players nearby, going home
 * - 'social:wakeup'    - Friends returned, waking up
 * 
 * ═══════════════════════════════════════════════════════════════
 */

const { goals } = require('mineflayer-pathfinder');

// Settings (easy to change)
const SEARCH_RANGE = 64;    // How far to look for friends
const FOLLOW_DIST = 3;      // How close to stand to friends
const CHECK_INTERVAL = 3000; // Check every 3 seconds (reduced for ping)

/**
 * Sets up the social module
 * @param {Object} bot - The mineflayer bot
 * @param {EventEmitter} botEvents - The event bus
 */
function setupSocial(bot, botEvents) {
    // Current state: IDLE, FOLLOWING, GOING_HOME, AT_HOME
    let state = 'IDLE';
    let currentFriend = null;      // Who we're following
    let explicitTarget = null;     // Who explicitly asked us to follow

    // ═══════════════════════════════════════════════════════════════
    //                    START SOCIAL LOOP
    // ═══════════════════════════════════════════════════════════════

    bot.once('spawn', () => {
        console.log('[Social] Looking for friends...');
        setInterval(socialLoop, CHECK_INTERVAL);
    });

    // ═══════════════════════════════════════════════════════════════
    //                    CHAT COMMANDS
    // ═══════════════════════════════════════════════════════════════

    bot.on('chat', (username, message) => {
        const msg = message.toLowerCase();

        // Command: "Follow me"
        if (msg.includes('follow me') || msg.includes('sunod ka') || msg.includes('dito ka')) {
            console.log(`[Social] ${username} asked me to follow.`);
            explicitTarget = username;

            // Request AI response
            botEvents.emit('ai:request', {
                context: `${username} asked you to follow them. Respond with something like "sige sunod ako sayo!"`,
                username: username
            });

            bot.chat(`/tpo ${username}`);
            socialLoop();
        }

        // Command: "Stay" / "Stop"
        else if (msg.includes('stay') || msg.includes('wait') || msg.includes('wag sumunod')) {
            console.log(`[Social] ${username} asked me to stay.`);
            explicitTarget = null;
            currentFriend = null;
            bot.pathfinder.stop();

            botEvents.emit('ai:request', {
                context: `${username} asked you to stay/stop following. Confirm you will stay here.`,
                username: username
            });
        }

        // Command: "Go home"
        else if (msg.includes('balik ka na') || msg.includes('uwi ka na') || msg.includes('go to spawn')) {
            console.log(`[Social] ${username} told me to go home.`);
            state = 'GOING_HOME';
            goHome();

            botEvents.emit('ai:request', {
                context: `${username} told you to go back to spawn. Confirm you're going home.`,
                username: username
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════
    //                    SOCIAL LOGIC
    // ═══════════════════════════════════════════════════════════════

    function socialLoop() {
        // Find all players nearby
        const players = Object.values(bot.entities).filter(e =>
            e.type === 'player' &&
            e !== bot.entity &&
            e.username &&
            e.position.distanceTo(bot.entity.position) <= SEARCH_RANGE
        );

        // Log scan result
        if (players.length > 0) {
            const names = players.map(p => p.username).join(', ');
            console.log(`[Social] 👀 Players nearby: ${names}`);
        } else {
            console.log(`[Social] 👀 Scanning... No players detected.`);
        }

        // Priority: 1. Explicit target, 2. Previous friend, 3. Closest player
        let target = null;

        // 1. Check explicit target first
        if (explicitTarget) {
            target = players.find(p => p.username === explicitTarget);
            if (target) console.log(`[Social] 🎯 Following explicit target: ${explicitTarget}`);
        }

        // 2. Fallback to previous friend
        if (!target && currentFriend) {
            target = players.find(p => p.username === currentFriend.username);
        }

        // 3. Fallback to closest player
        if (!target && players.length > 0) {
            target = players.sort((a, b) =>
                a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position)
            )[0];
        }

        // Execute decision
        if (target) {
            handleFollow(target);
        } else {
            handleLonely();
        }
    }

    function handleFollow(target) {
        // If waking up from home
        if (state === 'AT_HOME' || state === 'GOING_HOME') {
            console.log(`[Social] 🎉 Friends found! Waking up to join ${target.username}`);
            state = 'FOLLOWING';
            botEvents.emit('social:wakeup', { friend: target.username });
        }

        state = 'FOLLOWING';
        currentFriend = target;
        botEvents.emit('social:following', { friend: target.username });

        // Only move if far enough (prevents jitter)
        const dist = bot.entity.position.distanceTo(target.position);
        if (dist > FOLLOW_DIST + 1) {
            console.log(`[Social] 🚶 Following ${target.username} (distance: ${dist.toFixed(1)} blocks)`);
            try {
                const goal = new goals.GoalFollow(target, FOLLOW_DIST);
                bot.pathfinder.setGoal(goal, true);
            } catch (e) { }
        } else {
            console.log(`[Social] ✅ Standing near ${target.username}`);
        }
    }

    function handleLonely() {
        if (state === 'FOLLOWING' || state === 'IDLE') {
            console.log('[Social] 😢 No players nearby... Going back to spawn.');
            state = 'GOING_HOME';
            botEvents.emit('social:lonely');
            goHome();
        }
    }

    function goHome() {
        console.log('[Social] Teleporting to spawn...');
        bot.chat('/spawn');

        setTimeout(() => {
            if (state === 'GOING_HOME') {
                console.log('[Social] At spawn. Going AFK.');
                bot.chat('/afk');
                state = 'AT_HOME';
                bot.pathfinder.stop();
            }
        }, 5000);
    }

    console.log('[Social] Module loaded!');
}

module.exports = { setupSocial };
