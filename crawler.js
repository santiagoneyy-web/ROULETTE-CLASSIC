const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const axios = require('axios');

// ── CONFIG ─────────────────────────────────────────────────────
const clArgs = process.argv.slice(2).reduce((acc, arg, i, arr) => {
    if (arg.startsWith('--')) acc[arg.slice(2)] = arr[i+1];
    return acc;
}, {});

const TABLE_ID   = parseInt(clArgs.table) || 1;
const TARGET_URL = clArgs.url   || "https://www.casino.org/casinoscores/es/auto-roulette/";
const API_URL    = clArgs.api   || "http://127.0.0.1:3000/api/spin";

// ── SCRAPER ─────────────────────────────────────────────────────
async function startDomScraper() {
    console.log(`\n📺 [V10] Scraper starting for Table ${TABLE_ID}`);

    // Stagger de arranque: Tabla 2 espera 30s
    if (TABLE_ID > 1) {
        await new Promise(r => setTimeout(r, (TABLE_ID - 1) * 30000));
    }

    let browser = null;
    let lastNum = null;
    let interval = null;

    try {
        browser = await puppeteer.launch({
            headless: true,
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',         // Usa /tmp en vez de /dev/shm
                '--disable-gpu',
                '--no-zygote',
                // ⚠️ --single-process ELIMINADO: causa frame detached y crashes
                '--disable-blink-features=AutomationControlled',
                '--window-size=1280,800'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
        await page.setViewport({ width: 390, height: 844 });
        page.setDefaultTimeout(60000);

        // Solo bloquear imágenes y media; dejar CSS/JS para renderizado correcto
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (['image', 'media'].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        // Capturar errores del browser para loguear
        browser.on('disconnected', () => {
            console.error(`⚠️ [V10-T${TABLE_ID}] Browser disconnected!`);
        });

        console.log(`📡 [V10] Navigating: ${TARGET_URL}`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 90000 });
        console.log(`🏷️ [V10] Title: ${await page.title()}`);

        // Esperar renderizado dinámico (React/Vue del casino)
        await new Promise(r => setTimeout(r, 12000));

        // ── Diagnóstico de selectores (solo al arranque) ──────────
        const diag = await page.evaluate(() => {
            const tests = [
                'div.flex.flex-col.gap-px > div:first-child span',
                'div.flex.flex-col > div:first-child span',
                'div[class*="history"] span',
                'div[class*="History"] span',
                'div[class*="result"] span',
                'div[class*="ball"] span',
                'span[class*="number"]',
            ];
            return tests.map(sel => {
                const el = document.querySelector(sel);
                const txt = el ? el.textContent.trim() : null;
                return txt ? `✅ ${sel} => "${txt}"` : `❌ ${sel}`;
            }).join('\n');
        }).catch(() => '⚠️ Diagnóstico falló');
        console.log(`🔍 [V10-T${TABLE_ID}] Selector scan:\n${diag}`);

        // ── Detector ──────────────────────────────────────────────
        const detect = async () => {
            return page.evaluate(() => {
                const toNum = (t) => {
                    const n = parseInt((t || '').trim());
                    return (isNaN(n) || n < 0 || n > 36) ? null : n;
                };

                // Selectores directos (más rápidos)
                const quick = [
                    'div.flex.flex-col.gap-px > div:first-child span',
                    'div.flex.flex-col > div:first-child span',
                    'div[class*="history"] span',
                    'div[class*="History"] span',
                    'div[class*="result"] span',
                    'span[class*="number"]',
                ];
                for (const sel of quick) {
                    const el = document.querySelector(sel);
                    if (el) {
                        const v = toNum(el.textContent);
                        if (v !== null) return v;
                    }
                }

                // XPath fallback - buscar "Historial" o "History"
                try {
                    for (const label of ['Historial', 'History', 'Últimas']) {
                        const xr = document.evaluate(
                            `//*[contains(text(),'${label}')]`,
                            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
                        );
                        const node = xr.singleNodeValue;
                        if (!node) continue;
                        let container = node.parentElement;
                        for (let depth = 0; depth < 6; depth++) {
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

        interval = setInterval(async () => {
            try {
                const num = await detect();
                if (num !== null && num !== lastNum) {
                    console.log(`✨ [DOM-T${TABLE_ID}] Detectado: ${num}`);
                    await axios.post(API_URL, {
                        table_id: TABLE_ID,
                        number: num,
                        source: 'dom_v10'
                    }, { timeout: 5000 }).catch(e => console.error(`⚠️ API: ${e.message}`));
                    lastNum = num;
                }
            } catch (e) {
                // Silencioso
            }
        }, 5000);

    } catch (e) {
        console.error(`❌ [DOM-T${TABLE_ID}] Fatal: ${e.message}`);
        if (interval) clearInterval(interval);
        if (browser) await browser.close().catch(() => {});
        console.log(`♻️ [V10-T${TABLE_ID}] Restarting in 20s...`);
        setTimeout(() => startDomScraper(), 20000);
    }
}

startDomScraper();
