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
    page.on('request', (req) => {
        const type = req.resourceType();
        // Block media and styles. Allow scripts just in case the data is rendered by JS/React.
        if (['image', 'stylesheet', 'font', 'media'].includes(type) || req.url().includes('ads')) {
            req.abort();
        } else {
            req.continue();
        }
    });

    try {
        console.log("⏳ Navigating to stats page...");
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 90000 });
        console.log("✅ Page loaded. Beginning extraction loop...");

        let errorCount = 0;
        
        async function poll() {
            try {
                if (page.isClosed()) return;
                
                // Extract spins from the DOM
                const data = await page.evaluate(() => {
                    let extracted = [];
                    // Try various selectors used by common stats sites
                    const selectors = [
                        '.roulette-number', 
                        '.number-box', 
                        '.last-numbers .number',
                        '[data-slot="badge"]',
                        '.roulette-history-item',
                        '.recent-numbers .num'
                    ];
                    
                    let elements = [];
                    for (const sel of selectors) {
                        const found = document.querySelectorAll(sel);
                        if (found && found.length > 0) {
                            elements = Array.from(found);
                            break;
                        }
                    }

                    if (elements.length > 0) {
                        for (let el of elements.slice(0, 10)) {
                            const text = el.innerText.trim();
                            // Precise match: must be only a number 0-36
                            const numMatch = text.match(/^([0-9]|[12][0-9]|3[0-6])$/);
                            if (numMatch) {
                                extracted.push(parseInt(numMatch[1]));
                            }
                        }
                    }
                    return extracted;
                });

                if (data && data.length > 0) {
                    errorCount = 0; // Reset error count on success
                    const latestNumber = data[0];
                    const historyStr = data.slice(0, 5).join(',');

                    // Only update if the sequence changed (handles same-number-twice case)
                    if (historyStr !== this.lastHistoryStr) {
                        console.log(`✨ NEW DATA DETECTED [Table ${TABLE_ID}] -> Numbers: ${historyStr}`);
                        
                        // We only post if the newest number is different or the sequence shifted
                        if (latestNumber !== lastKnownNumber || historyStr !== this.lastHistoryStr) {
                             console.log(`🚀 POSTING NEW SPIN: ${latestNumber}`);
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
                        this.lastHistoryStr = historyStr;
                    }
                } else {
                    errorCount++;
                    if (errorCount > 5) {
                        console.log("⚠️ No numbers detected for a while. Reloading page...");
                        await page.reload({ waitUntil: 'networkidle2' });
                        errorCount = 0;
                    }
                }
            } catch (e) {
                console.error("❌ Extraction Poll Error:", e.message);
                if (e.message.includes('detached') || e.message.includes('Protocol error')) {
                    console.log("🔄 Frame detached or protocol error. Attempting to reload page...");
                    try {
                        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
                        errorCount = 0;
                    } catch (navErr) {
                        console.error("❌ Reload failed:", navErr.message);
                    }
                }
            }
            setTimeout(poll, INTERVAL);
        }

        poll();

    } catch (err) {
        console.error("💥 Fatal Bot Error:", err.message);
        if (browser) await browser.close();
        // Restart after a delay
        setTimeout(startScraper, 30000);
    }
}

startScraper();
