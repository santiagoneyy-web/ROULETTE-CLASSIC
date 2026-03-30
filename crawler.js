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
    // Bloquear solo lo ABSOLUTAMENTE pesado para no romper el renderizado
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'media', 'font'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    try {
        console.log(`📡 Navigating to: ${TARGET_URL}`);
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
        console.log(`📍 Actual URL: ${page.url()}`);
        
        // Lista de posibles selectores si el diseño cambia
        const selectors = [
            'div.flex.flex-col.gap-px > div:first-child span', // Tabla Historial
            'div.flex.overflow-x-scroll > div:first-child span', // Fila superior (si existe)
            '.history-number', // Clásicos
            'div[class*="History"] div:first-child span' // Genérico por clase
        ];

        let activeSelector = null;
        for (const sel of selectors) {
            try {
                await page.waitForSelector(sel, { timeout: 15000 });
                activeSelector = sel;
                console.log(`✅ Selector found: ${sel}`);
                break;
            } catch (e) {
                console.log(`🔁 Selector ${sel} failed, trying next...`);
            }
        }

        if (!activeSelector) {
            console.error("❌ FAILED: All selectors failed. The page layout might be blocked or different.");
            // Loguear el contenido HTML básico para debuguear en Render
            const content = await page.evaluate(() => document.body.innerText.substring(0, 500));
            console.log(`📄 Page Text Preview: ${content}...`);
            await browser.close();
            process.exit(1);
        }

        setInterval(async () => {
            try {
                const detection = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return null;
                    const val = parseInt(el.innerText.replace(/[^0-9]/g, ''));
                    return isNaN(val) ? null : val;
                }, activeSelector);

                if (detection !== null && detection !== lastNum) {
                    console.log(`✨ [DOM-T${TABLE_ID}] Detectado: ${detection}`);
                    await axios.post(API_URL, {
                        table_id: parseInt(TABLE_ID),
                        number: parseInt(detection),
                        source: 'dom_scraper_v4'
                    }, { timeout: 5000 }).catch(() => {});
                    lastNum = detection;
                }
            } catch (e) {
                console.error(`⚠️ [DOM-T${TABLE_ID}] Read error: ${e.message}`);
            }
        }, 3000 + Math.random() * 2000);

    } catch (e) {
        console.error(`❌ [DOM-T${TABLE_ID}] Navigation failed: ${e.message}`);
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
