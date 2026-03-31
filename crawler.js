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

// ── EXTRACTOR UNIVERSAL ─────────────────────────────────────────
// Inyectado en el contexto del navegador via page.evaluate
const EXTRACTOR = `
(function extractRouletteNumber() {
    const isValid = n => Number.isInteger(n) && n >= 0 && n <= 36;
    const toNum = t => { const n = parseInt((t||'').trim()); return isValid(n) ? n : null; };
    
    // 1. Selectores CSS directos (más rápidos)
    const CSS = [
        'div.flex.flex-col.gap-px > div:first-child span',
        'div.flex.flex-col > div:first-child > span',
        'div.flex.flex-col > div:first-child',
        'li:first-child span',
        'li:first-child',
        'div[data-testid] span',
        'div[class*="result"]:first-child span',
        'div[class*="ball"]:first-child span',
        'div[class*="number"]:first-child',
        'span[class*="number"]:first-child',
    ];
    for (const sel of CSS) {
        const el = document.querySelector(sel);
        if (el) {
            const v = toNum(el.textContent);
            if (v !== null) return v;
        }
    }
    
    // 2. XPath: buscar contenedor "Historial/History" y escanear sus spans hijos
    const LABELS = ['Historial', 'History', 'Últimos', 'Results', 'Scores'];
    for (const label of LABELS) {
        try {
            const xr = document.evaluate(
                '//*[contains(text(),"' + label + '")]',
                document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
            );
            const labelNode = xr.singleNodeValue;
            if (!labelNode) continue;
            // Subir hasta 8 niveles buscando un contenedor con spans numéricos
            let container = labelNode.parentElement;
            for (let depth = 0; depth < 8; depth++) {
                if (!container) break;
                const spans = Array.from(container.querySelectorAll('span, div'));
                for (const s of spans) {
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
    
    // 3. Brute-force: cualquier span pequeño con número de ruleta válido
    const allSpans = document.querySelectorAll('span');
    for (const s of allSpans) {
        const txt = (s.textContent || '').trim();
        if (txt.length <= 2) {
            const v = toNum(txt);
            if (v !== null) return v;
        }
    }
    
    return null;
})()
`;

// ── DIAGNÓSTICO INICIAL ─────────────────────────────────────────
const DIAGNOSTIC = `
(function diagnose() {
    const lines = [];
    // Primer span con texto ≤2 chars
    const spans = Array.from(document.querySelectorAll('span')).filter(s => {
        const t = (s.textContent||'').trim();
        return t.length > 0 && t.length <= 3;
    });
    lines.push('First 8 short spans: ' + spans.slice(0, 8).map(s => JSON.stringify(s.textContent.trim())).join(', '));
    
    // Clases del body
    const body = document.body;
    lines.push('Body children count: ' + body.children.length);
    
    // Buscar todo lo que contenga dígitos
    const divs = Array.from(document.querySelectorAll('div')).filter(d => {
        const t = (d.textContent||'').trim();
        return /^\\d{1,2}$/.test(t);
    }).slice(0, 5);
    lines.push('Numeric divs: ' + divs.map(d => '"' + d.textContent.trim() + '" (' + (d.className||'').slice(0,40) + ')').join(' | '));
    
    return lines.join(' | ');
})()
`;

// ── MAIN ────────────────────────────────────────────────────────
async function startDomScraper() {
    console.log(`\n📺 [V11] Single-browser scraper starting...`);
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
                '--window-size=800,600'
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

            instances.push({ page, table, lastNum: null, diagDone: false });

            // Stagger entre tabs para evitar pico de RAM
            if (table.id < TABLES.length) {
                await new Promise(r => setTimeout(r, 10000));
            }
        }

        // Espera extra para renderizado React/Vue
        await new Promise(r => setTimeout(r, 8000));

        // Diagnóstico inicial de cada tabla
        for (const inst of instances) {
            try {
                const diag = await inst.page.evaluate(new Function('return ' + DIAGNOSTIC + ';'));
                console.log(`🔍 [T${inst.table.id}] Diag: ${diag}`);
            } catch(e) {}
            inst.diagDone = true;
        }

        // ── Polling RÁPIDO: cada 2 segundos ─────────────────────
        setInterval(async () => {
            for (const inst of instances) {
                try {
                    const num = await inst.page.evaluate(new Function('return ' + EXTRACTOR + ';'));
                    if (num !== null && num !== inst.lastNum) {
                        console.log(`✨ [DOM-T${inst.table.id}] Detectado: ${num}`);
                        axios.post(API_URL, {
                            table_id: inst.table.id,
                            number: num,
                            source: 'dom_v11'
                        }, { timeout: 3000 }).catch(() => {});
                        inst.lastNum = num;
                    }
                } catch (e) {
                    // Silencioso
                }
            }
        }, 2000); // ← 2 segundos para máxima velocidad

    } catch (e) {
        console.error(`❌ [V11] Fatal: ${e.message}`);
        if (browser) await browser.close().catch(() => {});
        console.log(`♻️ Restarting in 20s...`);
        setTimeout(() => startDomScraper(), 20000);
    }
}

startDomScraper();
