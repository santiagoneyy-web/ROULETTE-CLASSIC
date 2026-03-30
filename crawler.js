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
    if (IS_CLOUD) {
        // En la nube, usamos "Lectura Directa" del DOM para evitar bloqueos 403 de la API
        return startDomScraper();
    } else {
        // En local, seguimos usando el interceptor de red por ser más rápido
        return startPuppeteer();
    }
}

// ── DOM-BASED SCRAPER (For Render/Cloud) ──────────────────────
async function startDomScraper() {
    console.log(`\n📺 Starting DOM-READING Scraper (Classic) for Table ${TABLE_ID}`);
    let lastNum = null;

    if (!puppeteer) {
        console.error("❌ ERROR: Puppeteer not available for DOM Scraping.");
        process.exit(1);
    }

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--no-zygote',
            '--single-process' // Reduce RAM significantly
        ]
    });

    const page = await browser.newPage();
    // Bloquear recursos pesados para ahorrar RAM en Render
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'font', 'media', 'stylesheet', 'other'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    try {
        console.log(`📡 Navigating to: ${TARGET_URL}`);
        // 'domcontentloaded' es más rápido y suficiente para leer el texto del DOM
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
        
        // El contenedor de los resultados en casino.org
        const selector = 'div.flex.flex-col.gap-px > div:first-child span';
        await page.waitForSelector(selector, { timeout: 30000 });
        console.log("✅ DOM Loaded. Reading numbers...");

        setInterval(async () => {
            try {
                const detection = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return null;
                    const val = parseInt(el.innerText);
                    return isNaN(val) ? null : val;
                }, selector);

                if (detection !== null && detection !== lastNum) {
                    console.log(`✨ [DOM-T${TABLE_ID}] Detectado: ${detection}`);
                    await axios.post(API_URL, {
                        table_id: parseInt(TABLE_ID),
                        number: parseInt(detection),
                        source: 'dom_scraper_v3',
                        timestamp: new Date().toISOString()
                    }, { timeout: 5000 }).catch(() => {});
                    lastNum = detection;
                }
            } catch (e) {
                console.error(`⚠️ [DOM-T${TABLE_ID}] Read error: ${e.message}`);
            }
        }, 2000 + Math.random() * 2000); // Polleo rápido: cada 2-4 segundos

    } catch (e) {
        console.error(`❌ [DOM-T${TABLE_ID}] Failed to start: ${e.message}`);
        await browser.close();
        process.exit(1);
    }
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
