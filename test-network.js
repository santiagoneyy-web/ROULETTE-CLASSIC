const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('api') || url.includes('json') || url.includes('graphql') || url.includes('spins') || url.includes('history')) {
            try {
                const text = await response.text();
                if (text.includes('"result"') || text.includes('numero') || text.includes('history') || text.includes('spins')) {
                    console.log('Intercepted:', url);
                    console.log(text.substring(0, 300));
                }
            } catch(e) {}
        }
    });

    console.log('Navigating...');
    await page.goto('https://www.casino.org/casinoscores/es/auto-roulette/', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 10000));
    console.log('Done');
    await browser.close();
})();
