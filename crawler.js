const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');

// ── CONFIG ─────────────────────────────────────────────────────
const clArgs = process.argv.slice(2).reduce((acc, arg, i, arr) => {
    if (arg.startsWith('--')) acc[arg.slice(2)] = arr[i + 1];
    return acc;
}, {});

const PORT    = clArgs.port || process.env.PORT || 3000;
const API_URL = clArgs.api  || `http://127.0.0.1:${PORT}/api/spin`;

const TABLES = [
    { id: 1, url: 'https://www.casino.org/casinoscores/es/auto-roulette/' },
    { id: 2, url: 'https://www.casino.org/casinoscores/es/immersive-roulette/' }
];

// ── EXTRACTOR (ejecutado dentro del browser context) ───────────
function extractNum() {
    const toNum = (t) => {
        const n = parseInt((t || '').trim());
        return (!isNaN(n) && n >= 0 && n <= 36) ? n : null;
    };

    // 1. CSS directo
    const CSSTargets = [
        'div.flex.flex-col.gap-px > div:first-child span',
        'div.flex.flex-col > div:first-child > span',
        'div.flex.flex-col > div:first-child',
        'li:first-child > span',
        'li:first-child',
        '[class*="history"] span:first-of-type',
        '[class*="History"] span:first-of-type',
        '[class*="result"] span:first-of-type',
        '[class*="ball"]:first-child > span',
        'span[class*="number"]:first-of-type',
    ];
    for (const sel of CSSTargets) {
        try {
            const el = document.querySelector(sel);
            if (el) {
                const v = toNum(el.textContent);
                if (v !== null) return v;
            }
        } catch (e) {}
    }

    // 2. XPath: buscar etiqueta "Historial" y escanear spans hermanos
    const labels = ['Historial', 'History', 'Últimos', 'Results'];
    for (const label of labels) {
        try {
            const xr = document.evaluate(
                '//*[contains(text(),"' + label + '")]',
                document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
            );
            const node = xr.singleNodeValue;
            if (!node) continue;
            let container = node.parentElement;
            for (let d = 0; d < 8; d++) {
                if (!container) break;
                for (const s of container.querySelectorAll('span, div')) {
                    const txt = (s.textContent || '').trim();
                    if (txt.length > 0 && txt.length <= 2) {
                        const v = toNum(txt);
                        if (v !== null) return v;
                    }
                }
                container = container.parentElement;
            }
        } catch (e) {}
    }

    // 3. Brute-force: primer span con exactamente 1-2 chars numéricos
    for (const s of document.querySelectorAll('span')) {
        const txt = (s.textContent || '').trim();
        if (txt.length > 0 && txt.length <= 2) {
            const v = toNum(txt);
            if (v !== null) return v;
        }
    }

    return null;
}

function diagnose() {
    const spans = Array.from(document.querySelectorAll('span'))
        .filter(s => { const t = (s.textContent || '').trim(); return t.length > 0 && t.length <= 3; })
        .slice(0, 10)
        .map(s => '"' + s.textContent.trim() + '"');
    return 'Short spans: [' + spans.join(', ') + ']';
}

// ── MAIN ────────────────────────────────────────────────────────
async function startDomScraper() {
    console.log(`\n📺 [V12] Starting single-browser scraper...`);
    let browser = null;

    try {
        browser = await puppeteer.launch({
            headless: true,
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1280,800'
            ]
        });

        const instances = [];

        for (const table of TABLES) {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1280, height: 800 });
            page.setDefaultTimeout(60000);

            await page.setRequestInterception(true);
            page.on('request', req => {
                if (['image', 'media'].includes(req.resourceType())) req.abort();
                else req.continue();
            });

            console.log(`📡 [T${table.id}] Navigating: ${table.url}`);
            await page.goto(table.url, { waitUntil: 'networkidle2', timeout: 90000 });
            console.log(`🏷️ [T${table.id}] Title: ${await page.title()}`);

            instances.push({ page, table, lastNum: null });

            if (table.id < TABLES.length) {
                await new Promise(r => setTimeout(r, 10000));
            }
        }

        // Esperar renderizado React/Vue
        await new Promise(r => setTimeout(r, 8000));

        // Diagnóstico inicial por tabla
        for (const inst of instances) {
            try {
                const diag = await inst.page.evaluate(diagnose);
                console.log(`🔍 [T${inst.table.id}] ${diag}`);
            } catch (e) {
                console.log(`⚠️ [T${inst.table.id}] Diag failed: ${e.message}`);
            }
        }

        // ── POLLING RÁPIDO: 2 segundos ──────────────────────────
        setInterval(async () => {
            for (const inst of instances) {
                try {
                    const num = await inst.page.evaluate(extractNum);
                    if (typeof num === 'number' && num !== inst.lastNum) {
                        console.log(`✨ [DOM-T${inst.table.id}] Detectado: ${num}`);
                        axios.post(API_URL, {
                            table_id: inst.table.id,
                            number: num,
                            source: 'dom_v12'
                        }, { timeout: 3000 }).catch(() => {});
                        inst.lastNum = num;
                    }
                } catch (e) {
                    // Silencioso
                }
            }
        }, 2000);

    } catch (e) {
        console.error(`❌ [V12] Fatal: ${e.message}`);
        if (browser) await browser.close().catch(() => {});
        console.log(`♻️ Restarting in 20s...`);
        setTimeout(() => startDomScraper(), 20000);
    }
}

startDomScraper();
