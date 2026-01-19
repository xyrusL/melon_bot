/**
 * ═══════════════════════════════════════════════════════════════
 *                    📊 PERFORMANCE MONITOR
 * ═══════════════════════════════════════════════════════════════
 * 
 * Monitors:
 * - Network Ping (actual server latency)
 * - Event Loop Lag (CPU blocking)
 * 
 * Helps diagnose if high ping is from internet or CPU freeze.
 * 
 * ═══════════════════════════════════════════════════════════════
 */

function setupPerformance(bot, botEvents) {
    let lastLoopCheck = Date.now();
    let highLagCount = 0;

    // Check event loop lag every 1 second
    setInterval(() => {
        const now = Date.now();
        const loopLag = now - lastLoopCheck - 1000; // Should be ~0 if healthy
        lastLoopCheck = now;

        // Get network ping from bot
        const netPing = bot.player?.ping || 0;

        // Only warn if lag is significant
        if (loopLag > 100) {
            highLagCount++;
            console.log(`[Perf] ⚠️ Event Loop Lag: ${loopLag}ms (CPU blocked)`);
        }

        if (netPing > 2000) {
            console.log(`[Perf] ⚠️ Network Ping: ${netPing}ms (Server/Internet slow)`);
        }

        // Periodic summary every 30 seconds
        if (highLagCount > 0 && highLagCount % 30 === 0) {
            console.log(`[Perf] 📊 Summary: ${highLagCount} lag spikes in last 30s`);
        }
    }, 1000);

    console.log('[Perf] Performance monitor loaded!');
}

module.exports = { setupPerformance };
