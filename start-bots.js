const concurrently = require('concurrently');

module.exports = function startBots(port) {
    console.log("🚀 Server is live! Now Initializing MYLUCKYROULETTE Automations...");

    const { result } = concurrently(
      [
        { command: `node crawler.js --table 1 --url "https://gamblingcounting.com/evolution-roulette" --interval 30000 --delay 8000 --api http://0.0.0.0:${port}/api/spin`, name: 'BOT-1', prefixColor: 'magenta' },
        { command: `node crawler.js --table 2 --url "https://www.casino.org/casinoscores/es/immersive-roulette/" --interval 35000 --delay 15000 --api http://0.0.0.0:${port}/api/spin`, name: 'BOT-2', prefixColor: 'cyan' }
      ],
      {
        prefix: 'name',
        restartTries: 5,
      }
    );

    result.then(
      () => console.log("✅ All bot processes finished successfully."),
      (err) => console.error("❌ A bot process failed:", err)
    );
};
