const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    await page.goto('https://www.casino.org/casinoscores/es/auto-roulette/', { waitUntil: 'networkidle2' });
    
    const result = await page.evaluate(async () => {
        try {
            const pathSegments = window.location.pathname.split('/').filter(Boolean);
            let tableEndpoint = 'autoroulette'; // default
            for (const seg of pathSegments) {
                if (seg.includes('roulette')) {
                    tableEndpoint = seg.replace(/-/g, '');
                }
            }
            
            const res = await fetch(`https://api-cs.casino.org/svc-evolution-game-events/api/${tableEndpoint}?page=0&size=15&sort=data.settledAt,desc&duration=6`);
            if (!res.ok) return { error: 'fetch failed ' + res.status };
            const json = await res.json();
            return { success: true, count: json.length, endpoint: tableEndpoint };
        } catch(e) { return { error: e.message }; }
    });
    
    console.log("EVALUATE RESULT:", result);
    await browser.close();
})();
