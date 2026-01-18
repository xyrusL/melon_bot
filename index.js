/**
 * ═══════════════════════════════════════════════════════════════
 *                    🍈 MELON BOT - AFK & COMBAT BOT
 * ═══════════════════════════════════════════════════════════════
 *   
 *   Edit the settings below, then run: npm start
 *   
 * ═══════════════════════════════════════════════════════════════
 */

const mineflayer = require('mineflayer');

// Components
const { setupAFK } = require('./components/afk');
const { setupCombat } = require('./components/combat');
const { setupGuard } = require('./components/guard');
const { setupDefense } = require('./components/defense');
const { setupInventory } = require('./components/inventory');
const { setupEmotions } = require('./components/emotions');
const { setupChat } = require('./components/chat');

// ┌─────────────────────────────────────────────────────────────┐
// │                    ⚙️ YOUR SETTINGS                         │
// └─────────────────────────────────────────────────────────────┘

const config = {
  host: "watermelonsugar-Sctm.aternos.me",
  port: 62782,
  username: "_Mochi",
  version: false,
};

// ═══════════════════════════════════════════════════════════════
//                    ⚠️ DON'T EDIT BELOW ⚠️
// ═══════════════════════════════════════════════════════════════

function createBot() {
  const botOptions = {
    host: config.host,
    port: config.port,
    username: config.username,
    auth: "offline"
  };

  if (config.version) {
    botOptions.version = config.version;
  }

  console.log(`[MelonBot] Starting bot "${config.username}"...`);
  console.log(`[MelonBot] Connecting to ${config.host}:${config.port}`);

  const bot = mineflayer.createBot(botOptions);

  // Load components (setupChat is async and may prompt user)
  setupAFK(bot, 10);      // AFK after 10 seconds
  setupInventory(bot);    // Auto-equip, upgrades, emergency
  setupEmotions(bot);     // Social reactions
  setupChat(bot);         // AI Chat (Mochi Persona) - async, will prompt if API fails
  setupGuard(bot);        // Protect nearby players
  setupDefense(bot);      // Shield, jump, sneak behaviors
  setupCombat(bot);       // Self-defense combat (load last)

  bot.on('spawn', () => {
    console.log(`[MelonBot] ${config.username} spawned in the world!`);
  });

  // Auto-respawn when dead
  bot.on('death', () => {
    console.log('[MelonBot] Bot died! Respawning...');
    setTimeout(() => {
      bot.chat('/spawn');
      console.log('[MelonBot] Sent /spawn command.');
    }, 1000);
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    console.log(`[Chat] <${username}> ${message}`);
  });

  bot.on('error', (err) => {
    console.error(`[MelonBot] Error: ${err.message}`);
  });

  bot.on('end', (reason) => {
    console.log(`[MelonBot] Disconnected: ${reason}`);
    console.log('[MelonBot] Reconnecting in 5 seconds...');
    setTimeout(createBot, 5000);
  });

  bot.on('kicked', (reason) => {
    console.log(`[MelonBot] Kicked: ${reason}`);
    console.log('[MelonBot] Reconnecting in 10 seconds...');
    setTimeout(createBot, 10000);
  });

  console.log('[MelonBot] Bot initialized. Connecting...');
}

// Start the bot
createBot();
