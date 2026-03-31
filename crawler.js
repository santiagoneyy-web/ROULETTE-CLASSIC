const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');

// ── CONFIG ─────────────────────────────────────────────────────
const clArgs = process.argv.slice(2).reduce((acc, arg, i, arr) => {
    if (arg.startsWith('--')) acc[arg.slice(2)] = arr[i + 1];
    return acc;
}, {});

const PORT = clArgs.port || process.env.PORT || 3000;
const API_URL = clArgs.api || `http://127.0.0.1:${PORT}/api/spin`;

const TABLES = [
    { id: 1, url: 'https://www.casino.org/casinoscores/es/auto-roulette/' },
    { id: 2, url: 'https://www.casino.org/casinoscores/es/immersive-roulette/' }
];

// ── SCRAPER CON UN SOLO BROWSER (ahorra ~300MB de RAM) ─────────
async function startDomScraper() {
    console.log(`\n📺 [V10-MONO] Single-browser mode starting...`);
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
                // --single-process ELIMINADO: causa crashes en Render
                '--disable-blink-features=AutomationControlled',
                '--window-size=800,600'
            ]
        });

        // Abrir una página por tabla en el mismo browser
        const instances = [];
        for (const table of TABLES) {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
            await page.setViewport({ width: 390, height: 844 });
            page.setDefaultTimeout(60000);

            // Solo bloquear imágenes/media
            await page.setRequestInterception(true);
            page.on('request', req => {
                if (['image', 'media'].includes(req.resourceType())) req.abort();
                else req.continue();
            });

            console.log(`📡 [T${table.id}] Navigating: ${table.url}`);
            await page.goto(table.url, { waitUntil: 'networkidle2', timeout: 90000 });
            console.log(`🏷️ [T${table.id}] Title: ${await page.title()}`);

            instances.push({ page, table, lastNum: null });

            // Stagger: esperar entre cargas de páginas
            if (table.id < TABLES.length) {
                await new Promise(r => setTimeout(r, 15000));
            }
        }

        // Esperar renderizado inicial de React/Vue
        await new Promise(r => setTimeout(r, 10000));

        // Extractor rápido — usa el selector confirmado + XPath fallback
        const extractNum = async (page) => {
            return page.evaluate(() => {
                const toNum = (t) => {
                    const n = parseInt((t || '').trim());
                    return (!isNaN(n) && n >= 0 && n <= 36) ? n : null;
                };

                // Selectores directos
                const selectors = [
                    'div.flex.flex-col > div:first-child span',
                    'div.flex.flex-col.gap-px > div:first-child span',
                    'div[class*="history"] span',
                    'div[class*="History"] span',
                    'div[class*="result"] span',
                ];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        const v = toNum(el.textContent);
                        if (v !== null) return v;
                    }
                }

                // XPath: buscar "Historial" y escanear spans del contenedor padre
                try {
                    for (const label of ['Historial', 'History', 'Últimas', 'Results']) {
                        const xr = document.evaluate(
                            `//*[contains(text(),'${label}')]`,
                            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
                        );
                        const node = xr.singleNodeValue;
                        if (!node) continue;
                        let container = node.parentElement;
                        for (let d = 0; d < 6; d++) {
                            if (!container) break;
                            for (const s of container.querySelectorAll('span')) {
                                const v = toNum(s.textContent);
                                if (v !== null) return v;
                            }
                            container = container.parentElement;
                        }
                    }
                } catch (e) {}
                return null;
            });
        };

        // Polling para cada tabla
        setInterval(async () => {
            for (const inst of instances) {
                try {
                    const num = await extractNum(inst.page);
                    if (num !== null && num !== inst.lastNum) {
                        console.log(`✨ [DOM-T${inst.table.id}] Detectado: ${num}`);
                        await axios.post(API_URL, {
                            table_id: inst.table.id,
                            number: num,
                            source: 'dom_v10_mono'
                        }, { timeout: 5000 }).catch(e => console.error(`⚠️ API T${inst.table.id}: ${e.message}`));
                        inst.lastNum = num;
                    }
                } catch (e) {
                    // Silencioso
                }
            }
        }, 6000);

    } catch (e) {
        console.error(`❌ [MONO] Fatal: ${e.message}`);
        if (browser) await browser.close().catch(() => {});
        console.log(`♻️ Restarting in 25s...`);
        setTimeout(() => startDomScraper(), 25000);
    }
}

startDomScraper();
