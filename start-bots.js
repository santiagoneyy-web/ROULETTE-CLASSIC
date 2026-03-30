const concurrently = require('concurrently');

module.exports = function startBots(port) {
    console.log("🚀 Server live! Starting Staggered DOM Scrapers...");

    // Definición de los comandos
    const bot1Cmd = `node crawler.js --table 1 --url "https://www.casino.org/casinoscores/es/auto-roulette/" --interval 12000 --delay 8000 --api http://127.0.0.1:${port}/api/spin`;
    const bot2Cmd = `node crawler.js --table 2 --url "https://www.casino.org/casinoscores/es/immersive-roulette/" --interval 15000 --delay 12000 --api http://127.0.0.1:${port}/api/spin`;

    // Bot 1 arranca de inmediato
    console.log("   [BOOT] Launching BOT-1 (Auto)...");
    const { result: r1 } = concurrently([{ command: bot1Cmd, name: 'BOT-1', prefixColor: 'magenta' }], { prefix: 'name', restartTries: 5 });
    r1.catch(() => {}); // Prevenir UnhandledPromiseRejection

    // Bot 2 arranca tras 45 segundos para no saturar la RAM al inicio
    setTimeout(() => {
        console.log("   [BOOT] Launching BOT-2 (Immersive) after stagger delay...");
        const { result: r2 } = concurrently([{ command: bot2Cmd, name: 'BOT-2', prefixColor: 'cyan' }], { prefix: 'name', restartTries: 5 });
        r2.catch(() => {}); // Prevenir UnhandledPromiseRejection
    }, 45000);
};
