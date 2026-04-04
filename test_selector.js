const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function test() {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox']});
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'media'].includes(req.resourceType())) req.abort();
        else req.continue();
    });
    
    console.log("\nNavigating to Auto Roulette...");
    await page.goto('https://www.casino.org/casinoscores/es/auto-roulette/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log("Waiting 5s for React...");
    await new Promise(r => setTimeout(r, 6000));
    
    console.log("Evaluating...");
    const data = await page.evaluate(() => {
        const toNum = (t) => {
            const n = parseInt((t || '').trim());
            return (!isNaN(n) && n >= 0 && n <= 36) ? n : null;
        };
        
        const results = [];
        const allContainers = document.querySelectorAll('div, ul');
        for (const container of allContainers) {
            const children = container.children;
            if (children.length < 5 || children.length > 25) continue;
            
            const nums = [];
            let garbageCount = 0;
            let sampleClasses = [];
            for (const child of children) {
                const raw = (child.textContent || '').trim();
                if (raw === '') continue;
                sampleClasses.push(child.className);
                if (raw.length <= 3) {
                    const v = toNum(raw);
                    if (v !== null) nums.push(v);
                    else garbageCount++;
                } else garbageCount++;
            }
            if (nums.length >= 3) {
                results.push({
                    nums: nums.slice(0, 10),
                    garbage: garbageCount,
                    totalChildren: children.length,
                    parentClass: container.className,
                    textSample: container.textContent.slice(0,25)
                });
            }
        }
        return results;
    });
    
    console.log("Results for Auto Roulette:", JSON.stringify(data.filter(d => d.nums.length >= 4), null, 2));

    console.log("\nNavigating to Immersive Roulette...");
    await page.goto('https://www.casino.org/casinoscores/es/immersive-roulette/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 6000));
    const data2 = await page.evaluate(() => {
        const toNum = (t) => {
            const n = parseInt((t || '').trim());
            return (!isNaN(n) && n >= 0 && n <= 36) ? n : null;
        };
        const results = [];
        for (const container of document.querySelectorAll('div, ul')) {
            const children = container.children;
            if (children.length < 5 || children.length > 25) continue;
            const nums = []; let garbage = 0;
            for (const child of children) {
                const raw = (child.textContent || '').trim();
                if (raw === '') continue;
                if (raw.length <= 3) {
                    const v = toNum(raw);
                    if (v !== null) nums.push(v);
                    else garbage++;
                } else garbage++;
            }
            if (nums.length >= 3) results.push({nums: nums.slice(0,10), garbage, totalChildren: children.length, parentClass: container.className});
        }
        return results;
    });
    console.log("Results for Immersive Roulette:", JSON.stringify(data2.filter(d => d.nums.length >= 4), null, 2));
    
    await browser.close();
}
test().catch(console.error);
