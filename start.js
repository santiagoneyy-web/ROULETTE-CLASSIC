const concurrently = require('concurrently');

const port = process.env.PORT || 3000;

console.log('Initializing ROULETTE-CLASSIC data stack...');
console.log(`API on port ${port} + single crawler for casino.org tables.`);

const { result } = concurrently(
    [
        { command: 'node server.js', name: 'API', prefixColor: 'blue' },
        { command: `node crawler.js --api http://127.0.0.1:${port}/api/spin`, name: 'BOT', prefixColor: 'magenta' }
    ],
    {
        prefix: 'name',
        restartTries: 5
    }
);

result.then(
    () => console.log('All processes finished successfully.'),
    (err) => console.error('A process failed:', err)
);
