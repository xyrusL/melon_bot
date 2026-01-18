/**
 * ═══════════════════════════════════════════════════════════════
 *                    🤝 SOCIAL / AFK COMPONENT (v2)
 * ═══════════════════════════════════════════════════════════════
 *   - "Follow Me": Chat command to lock onto a player
 *   - "Join" groups: Follows nearby players if detected
 *   - "Lonely": If alone, goes to /spawn and sets /afk
 *   - Rejoin: Wakes up from AFK if players return
 * ═══════════════════════════════════════════════════════════════
 */

const { goals } = require('mineflayer-pathfinder');

// Settings
const SEARCH_RANGE = 64;   // Range to look for friends
const FOLLOW_DIST = 3;     // Distance to stand near friends
const CHECK_INTERVAL = 2000; // Check every 2 seconds

function setupAFK(bot) {
    let state = 'IDLE'; // IDLE, FOLLOWING, GOING_HOME, AT_HOME
    let currentFriend = null;      // Currently followed player entity
    let explicitTargetName = null; // Name of player who said "follow me"

    bot.once('spawn', () => {
        console.log('[Social] Social system active. Looking for friends...');
        setInterval(socialLoop, CHECK_INTERVAL);
    });

    // Chat Listener for Social Commands
    bot.on('chat', (username, message) => {
        const msg = message.toLowerCase();

        // Command: Follow Me
        if (msg.includes('follow me') || msg.includes('sunod ka') || msg.includes('dito ka')) {
            console.log(`[Social] Command received from ${username}: "Follow me"`);
            explicitTargetName = username;

            // AI Reply & Teleport
            if (bot.chatWithAI) {
                bot.chatWithAI(`The player ${username} asked you to follow them. Tell them "Sige sunod ako sayo!" or similar.`, username);
            } else {
                bot.chat('sige beh sunod ako sayo :>');
            }

            bot.chat(`/tpo ${username}`);
            socialLoop();
        }
        // Command: Stop / Stay
        else if (msg.includes('stay') || msg.includes('wait') || msg.includes('wag sumunod')) {
            console.log(`[Social] Command received from ${username}: "Stay/Stop following"`);
            explicitTargetName = null;
            currentFriend = null;
            bot.pathfinder.stop();

            if (bot.chatWithAI) {
                bot.chatWithAI(`The player ${username} asked you to stay/stop following. Confirm you will stay here.`, username);
            } else {
                bot.chat(`okie stay lang ako dito.`);
            }
        }
        // Command: Go Home / Spawn
        else if (msg.includes('balik ka na') || msg.includes('uwi ka na') || msg.includes('go to spawn')) {
            console.log(`[Social] Command received from ${username}: "Go home/spawn"`);
            state = 'GOING_HOME';
            goHome();

            if (bot.chatWithAI) {
                bot.chatWithAI(`The player ${username} told you to go back to spawn/base. Confirm you are going home now.`, username);
            }
        }
    });

    function socialLoop() {
        // Find visible players
        const players = Object.values(bot.entities).filter(e =>
            e.type === 'player' &&
            e !== bot.entity &&
            e.username &&
            e.position.distanceTo(bot.entity.position) <= SEARCH_RANGE
        );

        // Logic Tree:
        // 1. Explicit Target (Command)
        // 2. Previous Auto-Target (Stability)
        // 3. New Closest Target (Auto-Join)
        // 4. Lonely (Go Home)

        let target = null;

        // 1. Check Explicit Target
        if (explicitTargetName) {
            const found = players.find(p => p.username === explicitTargetName);
            if (found) {
                target = found;
            } else {
                console.log(`[Social] Lost explicit target ${explicitTargetName}. Falling back...`);
                // Stay on explicit until replaced, or just fall back?
                // User said: "if she can't then focus what previos followed"
                // So we fall back to auto logic below
            }
        }

        // 2. Fallback to previous friend (if valid and no explicit target found)
        if (!target && currentFriend) {
            const found = players.find(p => p.username === currentFriend.username);
            if (found) {
                target = found;
            }
        }

        // 3. Fallback to closest available (if no target yet)
        if (!target && players.length > 0) {
            target = players.sort((a, b) =>
                a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position)
            )[0];
        }

        // Execute Decision
        if (target) {
            handleFollow(target);
        } else {
            handleLonely();
        }
    }

    function handleFollow(target) {
        // If waking up
        if (state === 'AT_HOME' || state === 'GOING_HOME') {
            console.log('[Social] Friends found! Waking up from AFK/Home...');
            state = 'FOLLOWING';
            // Maybe cancel AFK?
            bot.chat('uy ayan na sila! wait lang');
        }

        state = 'FOLLOWING';
        currentFriend = target;

        // Only move if far enough (prevent jitter)
        const dist = bot.entity.position.distanceTo(target.position);
        if (dist > FOLLOW_DIST + 1) {
            goTo(target);
        }
    }

    function handleLonely() {
        if (state === 'FOLLOWING') {
            console.log('[Social] Everyone left... I am alone. 😢');
            state = 'GOING_HOME';
            goHome();
        } else if (state === 'IDLE') {
            state = 'GOING_HOME';
            goHome();
        } else if (state === 'AT_HOME') {
            // check if actually at spawn? roughly?
            // mostly just chill
        }
    }

    function goTo(player) {
        try {
            const goal = new goals.GoalFollow(player, FOLLOW_DIST);
            bot.pathfinder.setGoal(goal, true);
        } catch (e) { }
    }

    function goHome() {
        console.log('[Social] Teleporting to spawn...');

        // Only chat /spawn if not already there (simple check?)
        // For now, always do it to be safe
        bot.chat('/spawn');

        lastSpawnTime = Date.now();
        setTimeout(() => {
            if (state === 'GOING_HOME') {
                console.log('[Social] At spawn. Going AFK.');
                bot.chat('/afk');
                state = 'AT_HOME';
                bot.pathfinder.stop();
            }
        }, 5000);
    }
}

module.exports = { setupAFK };
