const concurrently = require('concurrently');

module.exports = function startBots(port) {
    console.log("🚀 Server live! Starting Single-Browser DOM Scraper...");

    // Un SOLO proceso crawler que maneja TODAS las tablas internamente
    // Esto evita el OOM de tener 2 instancias de Chrome separadas
    const crawlerCmd = `node crawler.js --api http://localhost:${port}/api/spin`;

    const { result } = concurrently(
        [{ command: crawlerCmd, name: 'BOT-1', prefixColor: 'magenta' }],
        { prefix: 'name', restartTries: 10 }
    );
    result.catch(() => {}); // Prevenir UnhandledPromiseRejection
};
