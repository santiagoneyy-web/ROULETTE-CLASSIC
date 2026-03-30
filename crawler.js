/**
 * crawler.js — Cloud-Stealth Scraper (Classic)
 * Dual-mode: Uses Puppeteer locally and Hyper-Stealth Axios in the cloud.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

let puppeteer, StealthPlugin;
try {
    puppeteer = require('puppeteer-extra');
    StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());
} catch (e) {
    console.log("ℹ️ Puppeteer not found, falling back to Hyper-Stealth (Cloud Mode).");
}

const args = process.argv.slice(2);
const getArg = (name, def) => {
    const idx = args.indexOf(name);
    return (idx > -1 && args[idx+1]) ? args[idx+1] : def;
};

const TABLE_ID   = getArg('--table', '1');
const TARGET_URL = getArg('--url', 'https://www.casino.org/casinoscores/es/auto-roulette/');
const API_URL    = getArg('--api', 'http://localhost:3000/api/spin'); 
const IS_CLOUD   = process.env.RENDER || process.env.RENDER_EXTERNAL_URL || !puppeteer;

async function startScraper() {
    if (!IS_CLOUD) {
        return startPuppeteer();
    } else {
        return startStealthAxios();
    }
}

// ── HYPER-STEALTH AXIOS (For Render/Cloud) ────────────────────
async function startStealthAxios() {
    console.log(`\n☁️ Starting CLOUD-STEALTH Scraper (Classic) for Table ${TABLE_ID}`);
    let lastKnownEventId = null;

    const poll = async () => {
        try {
            const slug = TARGET_URL.includes('immersive-roulette') ? 'immersiveroulette' : 'autoroulette';
            const casinoApi = `https://api-cs.casino.org/svc-evolution-game-events/api/${slug}?page=0&size=20&sort=data.settledAt,desc&duration=6`;

            const response = await axios.get(casinoApi, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Referer': TARGET_URL,
                    'Origin': 'https://www.casino.org',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-site'
                },
                timeout: 10000
            });

            const body = response.data;
            let events = Array.isArray(body) ? body : (body?.content || []);
            const resolved = events.filter(e => e.data && e.data.status === 'Resolved');
            
            let newEvents = [];
            if (!lastKnownEventId) {
                newEvents = [resolved[0]];
            } else {
                const idx = resolved.findIndex(e => (e.data?.id || e.id) === lastKnownEventId);
                if (idx === -1) newEvents = [resolved[0]];
                else if (idx > 0) newEvents = resolved.slice(0, idx);
            }

            for (const ev of newEvents.reverse()) {
                const evId = ev.data?.id || ev.id;
                const num = ev.data?.result?.outcome?.number;
                if (num !== undefined && num !== null && evId !== lastKnownEventId) {
                    console.log(`✨ [CLOUD-T${TABLE_ID}] ${num}`);
                    await axios.post(API_URL, {
                        table_id: parseInt(TABLE_ID),
                        number: parseInt(num),
                        source: 'cloud_stealth',
                        event_id: evId
                    }, { timeout: 5000 }).catch(() => {});
                    lastKnownEventId = evId;
                }
            }
        } catch (e) {
            console.error(`⚠️ [CLOUD-T${TABLE_ID}] Error: ${e.message}`);
        }
        setTimeout(poll, 12000 + (Math.random() * 5000));
    };
    poll();
}

// ── PUPPETEER STEALTH (For Local) ───────────────────────────
async function startPuppeteer() {
    console.log(`\n🕵️ Starting Puppeteer Stealth (Local) for Table ${TABLE_ID}`);
    const CHROME_PATHS = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
    let exePath = CHROME_PATHS.find(p => fs.existsSync(p));

    const browser = await puppeteer.launch({
        headless: true,
        executablePath: exePath || null,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
        else req.continue();
    });

    let lastId = null;
    page.on('response', async (res) => {
        if (res.url().includes('svc-evolution-game-events/api')) {
            try {
                const body = await res.json();
                let events = Array.isArray(body) ? body : (body?.content || []);
                const resolved = events.filter(e => e.data && e.data.status === 'Resolved');
                if (resolved.length && (resolved[0].data?.id || resolved[0].id) !== lastId) {
                    const num = resolved[0].data?.result?.outcome?.number;
                    lastId = resolved[0].data?.id || resolved[0].id;
                    console.log(`✨ [LOCAL-T${TABLE_ID}] ${num}`);
                    await axios.post(API_URL, {
                        table_id: parseInt(TABLE_ID),
                        number: parseInt(num),
                        source: 'stealth_bot',
                        event_id: lastId
                    }).catch(() => {});
                }
            } catch (e) {}
        }
    });

    try {
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
        console.log(`✅ Monitoring Table ${TABLE_ID}...`);
    } catch (e) {
        process.exit(1);
    }
}

startScraper().catch(() => process.exit(1));
