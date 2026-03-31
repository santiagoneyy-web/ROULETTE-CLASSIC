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

// ── DOM-BASED SCRAPER (V8 - Ultra Light & RAM Optimized) ──────
async function startDomScraper() {
    console.log(`\n📺 [V8] Starting RAM-Optimized Scraper for Table ${TABLE_ID}`);
    let lastNum = null;
    let browser = null;

    try {
        // Pausa inicial para escalonamiento de RAM
        await new Promise(r => setTimeout(r, 5000 + (parseInt(TABLE_ID) * 2000)));

        browser = await puppeteer.launch({
            headless: true,
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--single-process', // Ahorra mucha RAM pero es sensible
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
        await page.setViewport({ width: 390, height: 844 });
        page.setDefaultTimeout(90000);

        // Bloqueo ULTRA de recursos (solo dejamos el HTML y los scripts esenciales)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media', 'other'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log(`📡 [V8] Navigating: ${TARGET_URL}`);
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
        
        console.log(`🏷️ [V8] Title: ${await page.title()}`);

        const magicDetector = async () => {
            return await page.evaluate(() => {
                const clean = (t) => {
                    if (!t) return null;
                    const n = parseInt(t.trim().replace(/[^0-9]/g, ''));
                    return (isNaN(n) || n < 0 || n > 36) ? null : n;
                };

                // 1. Intentar Selectores Rápidos
                const selectors = [
                    'div.flex.flex-col > div:first-child span',
                    'div.flex.flex-col.gap-px > div:first-child span',
                    '.history-number',
                    'div[class*="History"] div:first-child span'
                ];
                for (let sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        const val = clean(el.textContent);
                        if (val !== null) return val;
                    }
                }

                // 2. Búsqueda Mágica con XPath (Ultra Rápida, no bloquea CPU)
                try {
                    const xpath = "//span[contains(text(), 'Historial')] | //div[contains(text(), 'Historial')] | //span[contains(text(), 'History')]";
                    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    let histNode = result.singleNodeValue;
                    
                    if (histNode) {
                        // Buscar el contenedor padre y sus spans
                        let parent = histNode.parentElement;
                        for (let k = 0; k < 5; k++) { // Subir 5 niveles como máximo buscando los números
                            if (!parent) break;
                            const spans = parent.querySelectorAll('span');
                            for (let i = 0; i < spans.length; i++) {
                                const txt = (spans[i].textContent || '').trim();
                                if (txt.length > 0 && txt.length <= 2) {
                                    const val = parseInt(txt);
                                    if (!isNaN(val) && val >= 0 && val <= 36) {
                                        return val; // Retorna el primer número válido encontrado
                                    }
                                }
                            }
                            parent = parent.parentElement;
                        }
                    }
                } catch(e) {}
                
                return null;
            });
        };

        // Espera de seguridad para renderizado parcial
        await new Promise(r => setTimeout(r, 10000));

        setInterval(async () => {
            try {
                const detection = await magicDetector();
                if (detection !== null && detection !== lastNum) {
                    console.log(`✨ [DOM-T${TABLE_ID}] Detectado: ${detection}`);
                    await axios.post(API_URL, {
                        table_id: parseInt(TABLE_ID),
                        number: parseInt(detection),
                        source: 'dom_v8_light'
                    }, { timeout: 4000 }).catch(() => {});
                    lastNum = detection;
                }
            } catch (e) {
                // Silencioso para no ensuciar el log
            }
        }, 5000);

    } catch (e) {
        console.error(`❌ [DOM-T${TABLE_ID}] Bot Crash: ${e.message}`);
        if (browser) await browser.close().catch(() => {});
        process.exit(1);
    }
}

startDomScraper();
