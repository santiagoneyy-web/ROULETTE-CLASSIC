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

// Tiempo máximo sin detectar antes de recargar la página
const STALE_RELOAD_MS = 120000; // 2 minutos sin número nuevo → reload

// ── EXTRACTOR ──────────────────────────────────────────────────
function extractNum() {
    const toNum = (t) => {
        const n = parseInt((t || '').trim());
        return (!isNaN(n) && n >= 0 && n <= 36) ? n : null;
    };

    // 1. CSS directos
    const selectors = [
        'div.flex.flex-col.gap-px > div:first-child span',
        'div.flex.flex-col > div:first-child > span',
        'div.flex.flex-col > div:first-child',
        '[class*="history"] li:first-child',
        '[class*="history"] > div:first-child span',
        '[class*="History"] > div:first-child span',
        '[class*="result"] > div:first-child span',
        'li:first-child > span',
    ];
    for (const sel of selectors) {
        try {
            const el = document.querySelector(sel);
            if (el) {
                const v = toNum(el.textContent);
                if (v !== null) return v;
            }
        } catch(e) {}
    }

    // 2. XPath: buscar label "Historial"/"History" y escanear hacia arriba
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
        } catch(e) {}
    }

    // 3. Brute-force: primer span corto con número válido
    for (const s of document.querySelectorAll('span')) {
        const txt = (s.textContent || '').trim();
        if (txt.length > 0 && txt.length <= 2) {
            const v = toNum(txt);
            if (v !== null) return v;
        }
    }

    return null;
}

// ── TABLA HANDLER ───────────────────────────────────────────────
async function scrapeTable(inst) {
    try {
        const num = await inst.page.evaluate(extractNum);
        if (typeof num === 'number' && num !== inst.lastNum) {
            console.log(`✨ [DOM-T${inst.table.id}] Detectado: ${num}`);
            axios.post(API_URL, {
                table_id: inst.table.id,
                number: num,
                source: 'dom_v13'
            }, { timeout: 3000 }).catch(() => {});
            inst.lastNum = num;
            inst.lastDetection = Date.now();
        }

        // Si llevamos STALE_RELOAD_MS sin número nuevo, recargar página
        if (Date.now() - inst.lastDetection > STALE_RELOAD_MS) {
            console.log(`🔄 [T${inst.table.id}] Stale (2min) → reloading page...`);
            inst.lastDetection = Date.now();
            await inst.page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
            await new Promise(r => setTimeout(r, 5000));
        }
    } catch(e) {
        // Silencioso — el loop sigue
    }
}

// ── MAIN ────────────────────────────────────────────────────────
async function startDomScraper() {
    console.log(`\n📺 [V13] Starting scraper (no request blocking, live WebSockets)...`);
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

            // ⚠️ SIN request interception — dejamos WebSockets pasar libremente
            // Esto es crucial para que el casino pushee números en tiempo real

            console.log(`📡 [T${table.id}] Navigating: ${table.url}`);
            await page.goto(table.url, { waitUntil: 'networkidle2', timeout: 90000 });
            console.log(`🏷️ [T${table.id}] Title: ${await page.title()}`);

            instances.push({
                page,
                table,
                lastNum: null,
                lastDetection: Date.now()
            });

            if (table.id < TABLES.length) {
                await new Promise(r => setTimeout(r, 12000));
            }
        }

        // Dar tiempo al JS dinámico
        await new Promise(r => setTimeout(r, 8000));

        // Diagnóstico
        for (const inst of instances) {
            try {
                const diag = await inst.page.evaluate(() => {
                    const spans = Array.from(document.querySelectorAll('span'))
                        .filter(s => { const t = (s.textContent||'').trim(); return t.length > 0 && t.length <= 3; })
                        .slice(0, 10).map(s => '"' + s.textContent.trim() + '"');
                    return 'Short spans: [' + spans.join(', ') + ']';
                });
                console.log(`🔍 [T${inst.table.id}] ${diag}`);
            } catch(e) {}
        }

        // ── POLLING 2 SEGUNDOS ──────────────────────────────────
        setInterval(async () => {
            for (const inst of instances) {
                await scrapeTable(inst);
            }
        }, 2000);

    } catch (e) {
        console.error(`❌ [V13] Fatal: ${e.message}`);
        if (browser) await browser.close().catch(() => {});
        console.log(`♻️ Restarting in 20s...`);
        setTimeout(() => startDomScraper(), 20000);
    }
}

startDomScraper();
