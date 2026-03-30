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

// ── DOM-BASED SCRAPER (V7 - Magic Detector) ──────────────────
async function startDomScraper() {
    console.log(`\n📺 [V7] Starting Magic-DOM Scraper for Table ${TABLE_ID}`);
    let lastNum = null;

    const browser = await puppeteer.launch({
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
    // Identidad de iPhone para saltar protecciones de escritorio
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
    await page.setViewport({ width: 390, height: 844 });

    try {
        console.log(`📡 [V7] Navigating: ${TARGET_URL}`);
        const response = await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 90000 });
        
        console.log(`📍 [V7] Final URL: ${page.url()}`);
        console.log(`📊 [V7] Status: ${response?.status() || 'unknown'}`);
        console.log(`🏷️ [V6] Title: ${await page.title()}`);

        const magicDetector = async () => {
            return await page.evaluate(() => {
                // Función auxiliar para limpiar números
                const clean = (t) => {
                    if (!t) return null;
                    const n = parseInt(t.trim().replace(/[^0-9]/g, ''));
                    return (isNaN(n) || n < 0 || n > 36) ? null : n;
                };

                // 1. Selector Hardcoded (si funciona)
                const primary = document.querySelector('div.flex.flex-col.gap-px > div:first-child span');
                if (primary) {
                    const n = clean(primary.innerText);
                    if (n !== null) return n;
                }

                // 2. Magic Search: Buscar "Historial" y el número de abajo
                const els = Array.from(document.querySelectorAll('*'));
                const hIdx = els.findIndex(e => e.innerText && e.innerText.includes('Historial'));
                if (hIdx !== -1) {
                    for(let i=hIdx; i < hIdx + 100 && i < els.length; i++) {
                        const n = clean(els[i].innerText);
                        if (n !== null && els[i].innerText.length <= 2) return n;
                    }
                }

                // 3. Cualquier span/div con número dentro de un flex
                const guess = document.querySelector('div.flex span');
                if (guess) return clean(guess.innerText);

                return null;
            });
        };

        // Esperar a que el JS pinte los números
        await new Promise(r => setTimeout(r, 15000));

        setInterval(async () => {
            try {
                const detection = await magicDetector();
                if (detection !== null && detection !== lastNum) {
                    console.log(`✨ [DOM-T${TABLE_ID}] Detectado: ${detection}`);
                    await axios.post(API_URL, {
                        table_id: parseInt(TABLE_ID),
                        number: parseInt(detection),
                        source: 'dom_v7_magic'
                    }, { timeout: 5000 }).catch(() => {});
                    lastNum = detection;
                }
            } catch (e) {
                console.error(`⚠️ [DOM-T${TABLE_ID}] Loop error: ${e.message}`);
            }
        }, 4000);

    } catch (e) {
        console.error(`❌ [DOM-T${TABLE_ID}] Bot Critical: ${e.message}`);
        // Ver si nos bloquearon
        const html = await page.content();
        if (html.includes('Cloudflare') || html.includes('captcha')) console.error("🛑 BLOQUEO CLOUDFLARE DETECTADO");
        process.exit(1);
    }
}

startDomScraper();
