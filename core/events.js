/**
 * ═══════════════════════════════════════════════════════════════
 *                    📡 EVENT BUS (Central Communication)
 * ═══════════════════════════════════════════════════════════════
 * 
 * This is the HEART of the bot's communication system.
 * All modules talk to each other through this event bus.
 * 
 * HOW IT WORKS:
 * - Module A wants to tell Module B something? 
 *   → Module A does: botEvents.emit('event-name', data)
 *   → Module B listens: botEvents.on('event-name', (data) => { ... })
 * 
 * WHY USE THIS?
 * - Modules don't need to know about each other
 * - Easy to add new features without breaking old ones
 * - Easy to debug (just log events)
 * 
 * ═══════════════════════════════════════════════════════════════
 */

const EventEmitter = require('events');

// Create one shared event bus for the whole bot
const botEvents = new EventEmitter();

// Increase max listeners (we have many modules)
botEvents.setMaxListeners(20);

// Export it so all modules can use it
module.exports = botEvents;
