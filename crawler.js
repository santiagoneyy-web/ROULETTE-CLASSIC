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

const STALE_MS = 90000; // 90s sin detección → reload

// ── EXTRACTOR: devuelve LISTA de números del historial ──────────
// Comparamos el primer elemento de la lista para detectar nuevos giros.
// Usamos la LISTA completa porque el primer span puede ser estático.
function extractHistory() {
    const toNum = (t) => {
        const n = parseInt((t || '').trim());
        return (!isNaN(n) && n >= 0 && n <= 36) ? n : null;
    };

    const nums = [];

    // Estrategia 1: buscar el contenedor "Historial" via XPath y listar spans
    const labels = ['Historial', 'History', 'Últimos', 'Results', 'Last'];
    for (const label of labels) {
        try {
            const xr = document.evaluate(
                '//*[contains(text(),"' + label + '")]',
                document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
            );
            const node = xr.singleNodeValue;
            if (!node) continue;
            let container = node.parentElement;
            for (let d = 0; d < 10; d++) {
                if (!container) break;
                const children = container.querySelectorAll('span, div');
                const found = [];
                for (const el of children) {
                    const t = (el.textContent || '').trim();
                    if (t.length > 0 && t.length <= 2) {
                        const v = toNum(t);
                        if (v !== null) found.push(v);
                    }
                }
                if (found.length >= 3) {
                    // Encontramos el contenedor correcto (≥3 números válidos)
                    return found.slice(0, 10);
                }
                container = container.parentElement;
            }
        } catch(e) {}
    }

    // Estrategia 2: recoger todos los spans cortos con números válidos
    const allNums = [];
    for (const s of document.querySelectorAll('span')) {
        const t = (s.textContent || '').trim();
        if (t.length > 0 && t.length <= 2) {
            const v = toNum(t);
            if (v !== null) allNums.push(v);
        }
    }
    return allNums.slice(0, 10);
}

// ── MAIN ────────────────────────────────────────────────────────
async function startDomScraper() {
    console.log(`\n📺 [V14] Starting with history-array detection...`);
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
            // Sin request interception — WebSockets libres

            console.log(`📡 [T${table.id}] Navigating: ${table.url}`);
            try {
                await page.goto(table.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
            } catch (err) {
                console.log(`⚠️ [T${table.id}] Goto timeout/error, attempting to continue anyway... (${err.message})`);
            }
            try {
                console.log(`🏷️ [T${table.id}] Title: ${await page.title()}`);
            } catch(e) {}

            instances.push({
                page,
                table,
                prevHistory: [],    // Lista completa anterior
                lastSent: null,     // Último número enviado
                lastDetection: Date.now(),
                isReloading: false
            });

            if (table.id < TABLES.length) {
                await new Promise(r => setTimeout(r, 6000));
            }
        }

        // Espera renderizado
        await new Promise(r => setTimeout(r, 8000));

        // Diagnóstico
        for (const inst of instances) {
            try {
                const hist = await inst.page.evaluate(extractHistory);
                console.log(`🔍 [T${inst.table.id}] Initial history: [${hist.join(', ')}]`);
                inst.prevHistory = hist;
                // Enviar el primer número ya detectado
                if (hist.length > 0 && hist[0] !== inst.lastSent) {
                    console.log(`✨ [DOM-T${inst.table.id}] Inicial: ${hist[0]}`);
                    await axios.post(API_URL, {
                        table_id: inst.table.id,
                        number: hist[0],
                        source: 'dom_v14'
                    }, { timeout: 3000 }).catch(() => {});
                    inst.lastSent = hist[0];
                    inst.lastDetection = Date.now();
                }
            } catch(e) {}
        }

        // ── POLLING EXTREMO CADA 800ms (PARALELIZADO) ─────────────
        setInterval(async () => {
            await Promise.all(instances.map(async (inst) => {
                if (inst.isReloading) return; // ← Bloqueo: si está recargando, saltamos esta vuelta

                try {
                    const hist = await inst.page.evaluate(extractHistory);
                    if (!hist || hist.length === 0) return;

                    const newFirst = hist[0];

                    if (newFirst !== inst.lastSent) {
                        console.log(`✨ [DOM-T${inst.table.id}] Detectado: ${newFirst} (hist: [${hist.slice(0,5).join(',')}])`);
                        axios.post(API_URL, {
                            table_id: inst.table.id,
                            number: newFirst,
                            source: 'dom_v16'
                        }, { timeout: 2000 }).catch(() => {});
                        
                        inst.lastSent = newFirst;
                        inst.lastDetection = Date.now();
                        inst.prevHistory = hist;
                    }

                    // Stale check
                    if (Date.now() - inst.lastDetection > STALE_MS) {
                        console.log(`🔄 [T${inst.table.id}] Stale → reloading...`);
                        inst.isReloading = true; // Activar cerrojo
                        inst.lastDetection = Date.now();
                        inst.lastSent = null;
                        inst.prevHistory = [];
                        
                        try {
                            await inst.page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
                            await new Promise(r => setTimeout(r, 6000));
                        } catch(err) {
                            console.error(`⚠️ [T${inst.table.id}] Reload failed: ${err.message}`);
                        } finally {
                            inst.isReloading = false; // Liberar cerrojo siempre
                        }
                    }
                } catch(e) { 
                    // Si tira error context destroyed/detached, lo ignoramos sabiendo que es puente de carga
                    if (e.message.includes('detached') || e.message.includes('context')) {
                        // Silent
                    } else {
                        console.log(`⚠️ [T${inst.table.id}] Eval Error: ${e.message}`);
                    }
                }
            }));
        }, 800);

    } catch (e) {
        console.error(`❌ [V14] Fatal: ${e.message}`);
        if (browser) await browser.close().catch(() => {});
        console.log(`♻️ Restarting in 20s...`);
        setTimeout(() => startDomScraper(), 20000);
    }
}

startDomScraper();
