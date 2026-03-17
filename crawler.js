/**
 * crawler.js — Public Source Data Extractor
 * Uses Puppeteer to fetch roulette history from statistics sites.
 */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const args = process.argv.slice(2);
const getArg = (name, def) => {
    const idx = args.indexOf(name);
    return (idx > -1 && args[idx+1]) ? args[idx+1] : def;
};

// Defaults to Immersive
const TABLE_ID  = getArg('--table', '1');
const TARGET_URL = getArg('--url', 'https://www.casino.org/casinoscores/es/immersive-roulette/');
const API_URL    = getArg('--api', 'http://0.0.0.0:10000/api/spin');
const INTERVAL   = parseInt(getArg('--interval', '15000'));

// Custom Logger to save to separate folders per table
const logDir = path.join(__dirname, 'logs', `table_${TABLE_ID}`);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, 'bot.log');

const originalLog = console.log;
console.log = function(...args) {
    const msg = `[${new Date().toISOString()}] ` + args.join(' ');
    originalLog(msg);
    fs.appendFileSync(logFile, msg + '\n');
};

const originalError = console.error;
console.error = function(...args) {
    const msg = `[${new Date().toISOString()}] ERROR: ` + args.join(' ');
    originalError(msg);
    fs.appendFileSync(logFile, msg + '\n');
};

let lastKnownTimestamp = null;
let lastKnownNumber = null;

const getExecutablePath = () => {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
    return null;
};

async function startScraper() {
    const delay = parseInt(getArg('--delay', '5000'));
    console.log(`⏳ Waiting ${delay/1000}s for API server to stabilize...`);
    await new Promise(r => setTimeout(r, delay));

    console.log(`\n🤖 Starting Public Scraper for Table ${TABLE_ID}...`);
    console.log(`🔗 Target: ${TARGET_URL}`);
    
    const exePath = getExecutablePath();
    if (exePath) console.log(`🚀 Using Browser at: ${exePath}`);

    let browser;
    try {
        // Use internally detected path if env not set
        const finalExePath = exePath || puppeteer.executablePath();
        console.log(`🎬 Launching browser from: ${finalExePath}`);

        browser = await puppeteer.launch({
            headless: true, // Simplified for modern Puppeteer
            executablePath: finalExePath,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-extensions'
            ]
        });
    } catch (e) {
        console.error("❌ Failed to launch browser:", e.message || e);
        return;
    }

    const page = await browser.newPage();
    
    // Block images, css, and fonts to save memory and bypass ad-heavy sites
    await page.setRequestInterception(true);
    
    // Aggressive Ad-Blocking Domains
    const blockedDomains = [
        'googlesyndication.com', 'adservice.google.com', 'google-analytics.com',
        'doubleclick.net', 'adnxs.com', 'taboola.com', 'outbrain.com',
        'amazon-adsystem.com', 'facebook.net', 'fontawesome.com', 'gravatar.com',
        'hotjar.com', 'quantserve.com', 'scorecardresearch.com', 'pubmatic.com',
        'rubiconproject.com', 'criteo.com', 'openx.net', 'adroll.com'
    ];

    page.on('request', (req) => {
        const url = req.url().toLowerCase();
        const type = req.resourceType();
        
        const isAd = blockedDomains.some(d => url.includes(d));
        const isMedia = ['image', 'stylesheet', 'font', 'media', 'webmanifest'].includes(type);
        
        if (isAd || isMedia || url.includes('ads') || url.includes('tracking') || url.includes('pixel')) {
            req.abort();
        } else {
            req.continue();
        }
    });

    try {
        console.log("⏳ Navigating to stats page...");
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await new Promise(r => setTimeout(r, 5000)); // extra wait for JS-rendered content
        console.log("✅ Page loaded. Beginning extraction loop...");

        let errorCount = 0;
        let lastHistoryStr = ''; // closure variable — avoids the 'this' scope bug
        
        async function poll() {
            try {
                if (page.isClosed()) return;
                
                // --- EXTRACTION LOGIC (Search all frames) ---
                let data = [];
                const frames = page.frames();

                for (const frame of frames) {
                    try {
                        const frameData = await frame.evaluate(() => {
                            let extracted = [];
                            // Priority selectors: gamblingcounting.com specific first, then generic
                            const selectors = [
                                '.roulette-tracker__number',
                                '.number-tracker .number',
                                '.tracker-numbers .num',
                                '.roulette-results .result',
                                '.game-results__item',
                                '.recent-results .number',
                                '.roulette-number', '.number-box',
                                '.last-numbers .number',
                                '[data-slot="badge"]', '.roulette-history-item',
                                '.history-item', '.stats-number',
                                '.ball-number', '.last-spin'
                            ];
                            
                            let elements = [];
                            for (const sel of selectors) {
                                try {
                                    const found = document.querySelectorAll(sel);
                                    if (found && found.length > 0) {
                                        elements = Array.from(found);
                                        break; 
                                    }
                                } catch(e) {}
                            }

                            // Fallback: scan ALL elements for standalone numbers 0-36
                            if (elements.length === 0) {
                                const allEls = document.querySelectorAll('td, li, span, div');
                                elements = Array.from(allEls).filter(el => {
                                    const t = (el.innerText || el.textContent || '').trim();
                                    return /^(3[0-6]|[12][0-9]|[0-9])$/.test(t) && !el.querySelector('*');
                                }).slice(0, 20);
                            }

                            for (let el of elements.slice(0, 20)) {
                                const text = (el.innerText || el.textContent || '').trim();
                                const numMatch = text.match(/^(3[0-6]|[12][0-9]|[0-9])$/);
                                if (numMatch) extracted.push(parseInt(numMatch[1]));
                            }
                            return extracted;
                        });

                        if (frameData && frameData.length >= 3) {
                            data = frameData;
                            break; 
                        }
                    } catch (frameErr) {}
                }

                if (data && data.length > 0) {
                    errorCount = 0;
                    const latestNumber = data[0];
                    const historyStr = data.slice(0, 5).join(',');

                    if (historyStr !== lastHistoryStr) {
                        console.log(`✨ NEW DATA [Table ${TABLE_ID}] -> ${historyStr}`);
                        
                        if (latestNumber !== lastKnownNumber || historyStr !== lastHistoryStr) {
                             console.log(`🚀 POSTING: ${latestNumber}`);
                             try {
                                 await axios.post(API_URL, {
                                    table_id: parseInt(TABLE_ID),
                                    number: latestNumber,
                                    source: 'public_scraper'
                                 });
                                 lastKnownNumber = latestNumber;
                             } catch (postErr) {
                                 console.error("❌ API Post Error:", postErr.message);
                             }
                        }
                        lastHistoryStr = historyStr;
                    } else {
                        console.log(`⏳ [Table ${TABLE_ID}] Same data, waiting for next spin...`);
                    }
                } else {
                    errorCount++;
                    console.log(`⚠️ [Table ${TABLE_ID}] No numbers found (attempt ${errorCount})`);
                    if (errorCount > 6) {
                        console.log("🔄 Reloading page...");
                        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
                        await new Promise(r => setTimeout(r, 5000));
                        errorCount = 0;
                    }
                }
            } catch (e) {
                console.error("❌ Poll Error:", e.message);
                if (e.message.includes('detached') || e.message.includes('Protocol') || e.message.includes('Target closed')) {
                    console.log("🔄 Critical error — reloading...");
                    try {
                        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
                        await new Promise(r => setTimeout(r, 4000));
                        errorCount = 0;
                    } catch (navErr) { console.error("❌ Reload failed:", navErr.message); }
                }
            }
            setTimeout(poll, INTERVAL);
        }

        poll();

    } catch (err) {
        console.error("💥 Fatal Bot Error:", err.message);
        if (browser) await browser.close();
        setTimeout(startScraper, 30000);
    }
}

startScraper();
