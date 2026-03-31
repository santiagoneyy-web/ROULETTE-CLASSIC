const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const axios = require('axios');

// ── CONFIG ────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
    if (arg.startsWith('--')) acc[arg.slice(2)] = arr[i+1];
    return acc;
}, {});

const TABLE_ID   = args.table || 1;
const TARGET_URL = args.url   || "https://www.casino.org/casinoscores/es/auto-roulette/";
const API_URL    = args.api   || "http://127.0.0.1:3000/api/spin";

// ── DOM-BASED SCRAPER (V9 - XPath + Debug) ────────────────── 
async function startDomScraper() {
    console.log(`\n📺 [V9] Scraper starting for Table ${TABLE_ID}`);
    let lastNum = null;
    let browser = null;
    let detectionCount = 0;

    // Stagger por tabla para evitar pico de RAM al inicio
    await new Promise(r => setTimeout(r, (parseInt(TABLE_ID) - 1) * 20000));

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
                '--single-process',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
        await page.setViewport({ width: 390, height: 844 });
        page.setDefaultTimeout(90000);

        // Solo bloquear imágenes/media - DEJAR CSS Y JS para que el sitio renderice
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'media'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log(`📡 [V9] Navigating: ${TARGET_URL}`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 90000 });
        console.log(`🏷️ [V9] Title: ${await page.title()}`);

        // Espera extra para renderizado dinámico (React/Vue)
        await new Promise(r => setTimeout(r, 12000));

        // ── Diagnóstico inicial (solo si no tenemos selector funcional) ──
        const snapshot = await page.evaluate(() => {
            // Intentar cada selector y reportar el primero que funcione
            const candidates = [
                'div.flex.flex-col.gap-px > div:first-child span',
                'div.flex.flex-col > div:first-child span',
                'div[class*="history"] span',
                'div[class*="History"] span',
                'div[class*="result"] span',
                'div[class*="ball"] span',
                'span[class*="number"]',
                'div[class*="number"]'
            ];
            const found = [];
            for (const sel of candidates) {
                const el = document.querySelector(sel);
                if (el && el.textContent.trim()) {
                    found.push(`  ✅ ${sel} => "${el.textContent.trim()}"`);
                } else {
                    found.push(`  ❌ ${sel}`);
                }
            }
            return found.join('\n');
        });
        console.log(`🔍 [V9] Selector Scan:\n${snapshot}`);

        const magicDetector = async () => {
            return await page.evaluate(() => {
                const clean = (t) => {
                    if (!t) return null;
                    const n = parseInt(t.trim());
                    return (isNaN(n) || n < 0 || n > 36) ? null : n;
                };

                // 1. Selectores directos
                const selectors = [
                    'div.flex.flex-col.gap-px > div:first-child span',
                    'div.flex.flex-col > div:first-child span',
                    'div[class*="history"] span',
                    'div[class*="History"] span',
                    'div[class*="result"] span',
                    'span[class*="number"]',
                ];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        const val = clean(el.textContent);
                        if (val !== null) return val;
                    }
                }

                // 2. XPath - Buscar nodo "Historial" y escanear sus spans hermanos
                try {
                    const textNodes = ['Historial', 'History', 'Últimas', 'Results'];
                    for (const label of textNodes) {
                        const xpath = `//*[contains(text(),'${label}')]`;
                        const xResult = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                        const node = xResult.singleNodeValue;
                        if (node) {
                            let container = node.parentElement;
                            for (let depth = 0; depth < 6; depth++) {
                                if (!container) break;
                                const spans = container.querySelectorAll('span');
                                for (const s of spans) {
                                    const v = clean(s.textContent);
                                    if (v !== null) return v;
                                }
                                container = container.parentElement;
                            }
                        }
                    }
                } catch(e) {}

                return null;
            });
        };

        const interval = setInterval(async () => {
            try {
                const detection = await magicDetector();
                if (detection !== null && detection !== lastNum) {
                    detectionCount++;
                    console.log(`✨ [DOM-T${TABLE_ID}] Detectado: ${detection} (total: ${detectionCount})`);
                    await axios.post(API_URL, {
                        table_id: parseInt(TABLE_ID),
                        number: parseInt(detection),
                        source: 'dom_v9'
                    }, { timeout: 4000 }).catch(e => console.error(`⚠️ API error: ${e.message}`));
                    lastNum = detection;
                }
            } catch (e) {
                // Silencioso para no llenar el log de ruido
            }
        }, 5000);

        // Autolimpieza de memoria cada 10 minutos
        setInterval(async () => {
            try {
                await page.evaluate(() => window.gc && window.gc());
            } catch(e) {}
        }, 600000);

    } catch (e) {
        console.error(`❌ [DOM-T${TABLE_ID}] Fatal: ${e.message}`);
        if (browser) await browser.close().catch(() => {});
        // Reiniciar con delay
        setTimeout(() => startDomScraper(), 15000);
    }
}

startDomScraper();
