/**
 * crawler.js — Casino.org Internal API Fetcher
 * Uses casino.org's own JSON API endpoints instead of DOM scraping.
 * This eliminates: ad issues, duplicate numbers, selenium detection, iframe confusion.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const getArg = (name, def) => {
    const idx = args.indexOf(name);
    return (idx > -1 && args[idx+1]) ? args[idx+1] : def;
};

const TABLE_ID   = getArg('--table', '1');
const TARGET_URL = getArg('--url', 'https://www.casino.org/casinoscores/es/immersive-roulette/');
const API_URL    = getArg('--api', 'http://0.0.0.0:10000/api/spin');
const INTERVAL   = parseInt(getArg('--interval', '12000'));

// ── Casino.org API endpoint mapping (based on page URL) ───────
function getCasinoApiUrl(pageUrl) {
    const u = pageUrl.toLowerCase();
    const BASE = 'https://api-cs.casino.org/svc-evolution-game-events/api';
    if (u.includes('auto-roulette'))       return `${BASE}/autoroulette?page=0&size=20&sort=data.settledAt,desc&duration=6`;
    if (u.includes('immersive-roulette'))  return `${BASE}/immersiveroulette?page=0&size=20&sort=data.settledAt,desc&duration=6`;
    if (u.includes('speed-roulette'))      return `${BASE}/speedroulette?page=0&size=20&sort=data.settledAt,desc&duration=6`;
    if (u.includes('lightning-roulette'))  return `${BASE}/lightningroulette?page=0&size=20&sort=data.settledAt,desc&duration=6`;
    if (u.includes('roulette-1'))          return `${BASE}/roulette1?page=0&size=20&sort=data.settledAt,desc&duration=6`;
    // Generic fallback: try to extract game slug from URL
    const match = pageUrl.match(/casinoscores\/es\/([^\/]+)/);
    if (match) {
        const slug = match[1].replace(/-/g, '');
        return `${BASE}/${slug}?page=0&size=20&sort=data.settledAt,desc&duration=6`;
    }
    return null;
}

// ── Logging ───────────────────────────────────────────────────
const logDir = path.join(__dirname, 'logs', `table_${TABLE_ID}`);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, 'bot.log');

const originalLog = console.log;
console.log = function(...a) {
    const msg = `[${new Date().toISOString()}] ` + a.join(' ');
    originalLog(msg);
    fs.appendFileSync(logFile, msg + '\n');
};
const originalError = console.error;
console.error = function(...a) {
    const msg = `[${new Date().toISOString()}] ERROR: ` + a.join(' ');
    originalError(msg);
    fs.appendFileSync(logFile, msg + '\n');
};

// ── State ─────────────────────────────────────────────────────
let lastKnownEventId = null;
let consecutiveErrors = 0;

const CASINO_API_URL = getCasinoApiUrl(TARGET_URL);

async function startScraper() {
    const delay = parseInt(getArg('--delay', '5000'));
    console.log(`⏳ Waiting ${delay/1000}s for API server to stabilize...`);
    await new Promise(r => setTimeout(r, delay));

    console.log(`\n🤖 Starting API Scraper for Table ${TABLE_ID}`);
    console.log(`🔗 Page: ${TARGET_URL}`);
    console.log(`📡 Casino API: ${CASINO_API_URL}`);

    if (!CASINO_API_URL) {
        console.error('❌ Could not determine casino.org API URL from page URL. Exiting.');
        return;
    }

    poll();
}

async function poll() {
    try {
        // ── Fetch from casino.org API using native fetch to bypass Cloudflare ──
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(CASINO_API_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': TARGET_URL,
                'Origin': 'https://www.casino.org'
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Request failed with status code ${response.status}`);
        }

        const body = await response.json();
        let events = Array.isArray(body) ? body : (body?.content || []);

        if (!events.length) {
            console.log(`⚠️ [T${TABLE_ID}] API returned 0 events.`);
            setTimeout(poll, INTERVAL);
            return;
        }

        consecutiveErrors = 0;

        // 1. Filter only RESOLVED events
        const resolvedEvents = events.filter(e => e.data && e.data.status === 'Resolved');
        
        // 2. Find events NEWER than our last known ID
        let newEvents = [];
        if (!lastKnownEventId) {
            // First run: send all 20 historical events to fill any gaps directly to the backend.
            // The server's event_id duplicate guard will safely ignore any that are already in the DB.
            newEvents = resolvedEvents.slice();
        } else {
            const lastIdx = resolvedEvents.findIndex(e => (e.data?.id || e.id) === lastKnownEventId);
            
            if (lastIdx === -1) {
                // If last ID not found in the recent list (maybe we missed too many),
                // take ALL 20 events to re-sync completely.
                newEvents = resolvedEvents.slice(); 
            } else if (lastIdx > 0) {
                // Slice all elements from 0 to lastIdx (exclusive)
                newEvents = resolvedEvents.slice(0, lastIdx);
            }
        }

        // 3. Post new events in CHRONOLOGICAL order (oldest to newest)
        // Since original list is newest first, we reverse it.
        const toPost = newEvents.reverse();

        for (const ev of toPost) {
            const evId = ev.data?.id || ev.id;
            const num = ev.data?.result?.outcome?.number;
            
            // Critical: Extra check to prevent duplicate posts during rapid poll cycles
            if (evId === lastKnownEventId) continue;

            if (num !== undefined && num !== null) {
                console.log(`✨ NEW SPIN [T${TABLE_ID}] EventId: ${evId} → Number: ${num}`);
                try {
                    await axios.post(API_URL, {
                        table_id: parseInt(TABLE_ID),
                        number: parseInt(num),
                        source: 'casino_api',
                        event_id: evId // Pass ID for server-side guard too
                    }, { timeout: 10000 });
                    console.log(`✅ [T${TABLE_ID}] Posted: ${num}`);
                    lastKnownEventId = evId; 
                } catch (postErr) {
                    console.error(`❌ [T${TABLE_ID}] API Post Error: ${postErr.message}`);
                    break; // Stop and retry next poll if server is down
                }
            }
        }


    } catch (fetchErr) {
        consecutiveErrors++;
        console.error(`❌ [T${TABLE_ID}] Casino API Error (${consecutiveErrors}): ${fetchErr.message}`);
        // Back off on repeated errors
        if (consecutiveErrors > 5) {
            console.log(`🔄 [T${TABLE_ID}] Multiple errors, extending retry interval...`);
            setTimeout(poll, INTERVAL * 3);
            return;
        }
    }

    setTimeout(poll, INTERVAL);
}

startScraper();
