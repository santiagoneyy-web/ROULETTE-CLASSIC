const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    page.on('response', async (response) => {
        const url = response.url();
        const type = response.request().resourceType();
        
        // We only care about XHR or fetch requests
        if (type === 'xhr' || type === 'fetch') {
            try {
                const text = await response.text();
                // Check if it looks like roulette data (numbers)
                if (text.includes('numero') || text.includes('number') || text.includes('history') || text.includes('result') || text.includes('[')) {
                    console.log('--- API INTERCEPTED ---');
                    console.log('URL:', url);
                    console.log('Content Snippet:', text.substring(0, 150));
                }
            } catch(e) {}
        }
    });

    console.log('Navigating to GamblingCounting...');
    try {
        await page.goto('https://gamblingcounting.com/evolution-auto-roulette', { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 8000));
    } catch(e) {
        console.log("Navigation error or timeout", e.message);
    }
    
    console.log('Done GamblingCounting');
    await browser.close();
})();
