/**
 * crawler.js — Cloud-Stealth Scraper (Classic)
 * Dual-mode: Uses Puppeteer locally and Hyper-Stealth Axios in the cloud.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const axios     = require('axios');
const fs        = require('fs');
const path      = require('path');

// ── CONFIG ────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
    if (arg.startsWith('--')) acc[arg.slice(2)] = arr[i+1];
    return acc;
}, {});

const TABLE_ID   = args.table || 1;
const TARGET_URL = args.url   || "https://www.casino.org/casinoscores/es/auto-roulette/";
const API_URL    = args.api   || "http://127.0.0.1:3000/api/spin";
const IS_CLOUD   = process.env.RENDER || process.env.RENDER_EXTERNAL_URL;

async function startScraper() {
    if (IS_CLOUD) {
        return startDomScraper();
    } else {
        // En local usamos el interceptor de red
        const puppeteerVanilla = require('puppeteer'); 
        return startPuppeteer(puppeteerVanilla);
    }
}

// ── DOM-BASED SCRAPER (V5 - Deep Search) ──────────────────────
async function startDomScraper() {
    console.log(`\n📺 [V5] Starting Deep-DOM Scraper for Table ${TABLE_ID}`);
    let lastNum = null;

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--single-process'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // Bloquear solo lo realmente pesado
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'media', 'font'].includes(req.resourceType())) req.abort();
        else req.continue();
    });

    try {
        console.log(`📡 [V5] Navigating: ${TARGET_URL}`);
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
        console.log(`📍 [V5] URL: ${page.url()}`);

        const findNumber = async () => {
            return await page.evaluate(() => {
                // 1. Intentar por selectores conocidos
                const primary = document.querySelector('div.flex.flex-col.gap-px > div:first-child span');
                if (primary && primary.innerText) {
                    const n = parseInt(primary.innerText.replace(/[^0-9]/g, ''));
                    if (!isNaN(n)) return n;
                }

                // 2. Búsqueda profunda: buscar "Historial" y el primer número cercano
                const allSpans = Array.from(document.querySelectorAll('span, div'));
                const historyIdx = allSpans.findIndex(s => s.innerText && s.innerText.includes('Historial'));
                if (historyIdx !== -1) {
                    // Buscar números en los siguientes 50 elementos
                    for (let i = historyIdx; i < Math.min(historyIdx + 50, allSpans.length); i++) {
                        const txt = allSpans[i].innerText.trim();
                        if (txt.length > 0 && txt.length <= 2) {
                            const n = parseInt(txt);
                            if (!isNaN(n) && n >= 0 && n <= 36) return n;
                        }
                    }
                }

                // 3. Último recurso: cualquier span con clase flex-col gap-px
                const fallback = document.querySelector('[class*="History"] span');
                if (fallback) {
                    const n = parseInt(fallback.innerText.replace(/[^0-9]/g, ''));
                    if (!isNaN(n)) return n;
                }
                return null;
            });
        };

        // Esperar un poco a que cargue el JS dinámico
        await new Promise(r => setTimeout(r, 10000));

        setInterval(async () => {
            try {
                const detection = await findNumber();
                if (detection !== null && detection !== lastNum) {
                    console.log(`✨ [DOM-T${TABLE_ID}] New: ${detection}`);
                    await axios.post(API_URL, {
                        table_id: parseInt(TABLE_ID),
                        number: parseInt(detection),
                        source: 'dom_v5_deep'
                    }, { timeout: 5000 }).catch(() => {});
                    lastNum = detection;
                }
            } catch (e) {
                console.error(`⚠️ [DOM-T${TABLE_ID}] Loop error: ${e.message}`);
            }
        }, 4000);

    } catch (e) {
        console.error(`❌ [DOM-T${TABLE_ID}] Startup failed: ${e.message}`);
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
