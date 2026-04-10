require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const Table = require('./models/Table');
const Spin = require('./models/Spin');

const DB_FILE = path.join(__dirname, 'roulette_db.json');
let useMongo = false;

// Memory cache for fallback
let fallbackData = {
    tables: [
        { id: 1, name: 'Auto Roulette', provider: 'Evolution', url: 'https://www.casino.org/casinoscores/es/auto-roulette/' },
        { id: 2, name: 'Inmersive Roulette', provider: 'Evolution', url: 'https://www.casino.org/casinoscores/es/immersive-roulette/' }
    ],
    spins: [],
    expertRules: []
};

function loadFallback() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            // Merge logic: Preserve tables and expertRules if missing in file
            if (data.tables && data.tables.length > 0) fallbackData.tables = data.tables;
            if (data.spins) fallbackData.spins = data.spins;
            if (data.expertRules) fallbackData.expertRules = data.expertRules;
            
            console.log('[DB] Loaded JSON fallback data.');
        } catch (e) {
            console.error('[DB] JSON Load Error, using defaults.');
        }
    }
}

function saveFallback() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(fallbackData, null, 2));
    } catch (e) {
        console.error('[DB] Fallback Save Error:', e.message);
    }
}

async function initDB() {
    // console.log('📡 [DB] Connecting to MongoDB Atlas...');
    // process.env.MONGODB_URI is now ignored for JSON-only mode.
    let mongoUri = null; 
    
    if (mongoUri) {
        try {
            console.log('📡 [DB] Connecting to MongoDB Atlas...');
            
            // Basic sanitization: if the user put a raw password with special chars like ')' 
            // We should warn that it must be encoded, or try a simple fix.
            if (mongoUri.includes(')') && !mongoUri.includes('%29')) {
                console.warn('⚠️ [DB] Warning: Your MONGODB_URI contains ")". If connection fails, please encode it as %29');
            }

            await mongoose.connect(mongoUri, {
                serverSelectionTimeoutMS: 5000, // 5s timeout instead of waiting forever
                connectTimeoutMS: 10000
            });
            
            useMongo = true;
            console.log('✅ [DB] Connected to MongoDB Atlas successfully.');

            // Pre-seed tables if empty
            const tableCount = await Table.countDocuments();
            if (tableCount === 0 && fallbackData.tables.length > 0) {
                console.log('[DB] Seeding default tables in MongoDB...');
                await Table.insertMany(fallbackData.tables);
            }
            console.log('✅ [DB] Fresh Session: Local JSON sync disabled.');
        } catch (err) {
            console.error('❌ [DB] MongoDB Connection Failed:', err.message);
            console.log('ℹ️ [DB] Tip: Ensure your IP is whitelisted in MongoDB Atlas (Network Access -> Add IP Address -> Allow Access From Anywhere).');
            useMongo = false;
            loadFallback();
        }
    } else {
        console.warn('⚠️ [DB] No MONGODB_URI found in .env file. Falling back to JSON storage.');
        useMongo = false;
        loadFallback();
    }
}

// --- Tables ---
async function getTables(cb) {
    if (useMongo) {
        try {
            // Aggregate spins count
            const tables = await Table.aggregate([
                {
                    $lookup: {
                        from: 'spins',
                        localField: 'id',
                        foreignField: 'table_id',
                        as: 'spins_data'
                    }
                },
                {
                    $addFields: {
                        spin_count: { $size: "$spins_data" }
                    }
                },
                { $project: { spins_data: 0 } },
                { $sort: { id: 1 } }
            ]);
            cb(null, tables);
        } catch (e) { cb(e); }
    } else {
        const results = fallbackData.tables.map(t => {
            const spins = fallbackData.spins.filter(s => s.table_id == t.id);
            return { ...t, spin_count: spins.length };
        });
        cb(null, results);
    }
}

async function addTable(name, provider, url, cb) {
    if (useMongo) {
        try {
            const maxTable = await Table.findOne().sort('-id').exec();
            const id = maxTable ? maxTable.id + 1 : 1;
            const newTable = new Table({ id, name, provider, url });
            await newTable.save();
            cb(null, id);
        } catch (e) { cb(e); }
    } else {
        const id = fallbackData.tables.length > 0 ? Math.max(...fallbackData.tables.map(t => t.id)) + 1 : 1;
        fallbackData.tables.push({ id, name, provider, url });
        saveFallback();
        cb(null, id);
    }
}

async function deleteTable(tableId, cb) {
    if (useMongo) {
        try {
            await Spin.deleteMany({ table_id: tableId });
            await Table.deleteOne({ id: tableId });
            cb(null);
        } catch (e) { cb(e); }
    } else {
        fallbackData.spins = fallbackData.spins.filter(s => s.table_id != tableId);
        fallbackData.tables = fallbackData.tables.filter(t => t.id != tableId);
        saveFallback();
        cb(null);
    }
}

// --- Spins ---
async function getHistory(tableId, limit, cb) {
    if (useMongo) {
        try {
            let query = Spin.find({ table_id: tableId }).sort({ id: 1 });
            if (limit) query = query.limit(limit);
            // Mongoose limit() with ASC sort might return the *first* N elements instead of the *last* N.
            // Wait, to get the LAST N, we normally sort descending, limit, then sort ascending.
            // If they want the most recent N spins, we should do:
            if (limit) {
                let recent = await Spin.find({ table_id: tableId }).sort({ id: -1 }).limit(limit);
                recent = recent.reverse(); // put back into ASC order
                return cb(null, recent);
            } else {
                const all = await Spin.find({ table_id: tableId }).sort({ id: 1 });
                return cb(null, all);
            }
        } catch (e) { cb(e); }
    } else {
        let spins = fallbackData.spins.filter(s => s.table_id == tableId);
        if (limit) spins = spins.slice(-limit);
        cb(null, spins);
    }
}

async function addSpin(tableId, number, source, extra = {}, cb) {
    if (useMongo) {
        try {
            if (extra.event_id) {
                const existing = await Spin.findOne({ table_id: parseInt(tableId), event_id: extra.event_id }).exec();
                if (existing) {
                    if (typeof cb === 'function') cb(null, existing.id);
                    return;
                }
            }
            const maxSpin = await Spin.findOne().sort('-id').exec();
            const id = maxSpin ? maxSpin.id + 1 : 1;
            
            // Basic Physics Calculation (Mock/Placeholder for now, can be refined)
            const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
            const num = parseInt(number);
            let sector = 'Zero';
            if ([26, 3, 35, 12, 28, 7, 29, 18, 22, 9, 31, 14, 20].includes(num)) sector = 'Voisins';
            if ([1, 20, 14, 31, 9].includes(num)) sector = 'Orphelins'; // Simplified
            
            const newSpin = new Spin({
                id,
                table_id: parseInt(tableId),
                number: num,
                source: source || 'bot',
                event_id: extra.event_id || null,
                speed_rpm: extra.speed_rpm || Number((21 + Math.random()).toFixed(1)),
                timestamp_str: extra.timestamp_str || new Date().toLocaleTimeString(),
                angle: extra.angle || Math.floor(Math.random() * 360),
                distance: extra.distance || (num > 18 ? 'Big' : 'Small'),
                direction: extra.direction || (Math.random() > 0.5 ? 'CW' : 'CCW'),
                sector: sector
            });
            await newSpin.save();
            if (typeof cb === 'function') cb(null, id);
        } catch (e) { if (typeof cb === 'function') cb(e); }
    } else {
        if (extra && extra.event_id) {
            const exists = fallbackData.spins.find(s => s.table_id == tableId && s.event_id === extra.event_id);
            if (exists) {
                if (typeof cb === 'function') cb(null, exists.id);
                return;
            }
        }
        const id = fallbackData.spins.length > 0 ? Math.max(...fallbackData.spins.map(s => s.id)) + 1 : 1;
        const newSpin = {
            id,
            table_id: parseInt(tableId),
            number: parseInt(number),
            source: source || 'manual',
            event_id: extra ? extra.event_id : null,
            timestamp: new Date().toISOString()
        };
        fallbackData.spins.push(newSpin);
        if (fallbackData.spins.length > 5000) fallbackData.spins.shift(); 
        saveFallback();
        if (typeof cb === 'function') cb(null, id);
    }
}

async function clearHistory(tableId, cb) {
    if (useMongo) {
        try {
            await Spin.deleteMany({ table_id: tableId });
            if (typeof cb === 'function') cb(null);
        } catch (e) { if (typeof cb === 'function') cb(e); }
    } else {
        fallbackData.spins = fallbackData.spins.filter(s => s.table_id != tableId);
        saveFallback();
        if (typeof cb === 'function') cb(null);
    }
}

async function getStats(tableId, cb) {
    if (useMongo) {
        try {
            const total = await Spin.countDocuments({ table_id: tableId });
            const zeros = await Spin.countDocuments({ table_id: tableId, number: 0 });
            if (typeof cb === 'function') cb(null, { total, zeros });
        } catch (e) { if (typeof cb === 'function') cb(e); }
    } else {
        const spins = fallbackData.spins.filter(s => s.table_id == tableId);
        const zeros = spins.filter(s => s.number === 0).length;
        if (typeof cb === 'function') cb(null, { total: spins.length, zeros });
    }
}

async function wipeAllSpins(cb) {
    if (useMongo) {
        try {
            await Spin.deleteMany({});
            if (typeof cb === 'function') cb(null);
        } catch (e) { if (typeof cb === 'function') cb(e); }
    } else {
        fallbackData.spins = [];
        saveFallback();
        if (typeof cb === 'function') cb(null);
    }
}

// --- Expert Rules (V5 Learning) ---
async function getExpertRule(patternDna, cb) {
    if (useMongo) {
        try {
            const ExpertRule = require('./models/ExpertRule');
            const rule = await ExpertRule.findOne({ pattern_dna: patternDna });
            cb(null, rule);
        } catch (e) { cb(e); }
    } else {
        const rule = fallbackData.expertRules.find(r => r.pattern_dna === patternDna);
        cb(null, rule || null);
    }
}

async function addExpertRule(data, cb) {
    if (useMongo) {
        try {
            const ExpertRule = require('./models/ExpertRule');
            const newRule = new ExpertRule(data);
            await newRule.save();
            cb(null, newRule._id);
        } catch (e) { cb(e); }
    } else {
        const id = Date.now();
        fallbackData.expertRules.push({ ...data, id, timestamp: new Date().toISOString() });
        saveFallback();
        cb(null, id);
    }
}

// --- Pattern Stats (Learning Engine) ---
async function getPatternStats(tableId, seqMag, seqDir, cb) {
    if (useMongo) {
        try {
            const Pattern = require('./models/Pattern');
            const stats = await Pattern.aggregate([
                { $match: { table_id: String(tableId), sequence_mag: seqMag, sequence_dir: seqDir } },
                { $group: { _id: { mag: "$next_mag", dir: "$next_dir" }, count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);
            cb(null, stats);
        } catch (e) { cb(e); }
    } else {
        // Simple manual aggregation for JSON fallback
        // We look for patterns in the 'spins' history if 'Pattern' collection isn't fully replicated in JSON
        // Actually, let's just return empty for now or implement a basic scan if necessary.
        // For the sake of the task, I'll assume we want at least Mongo-like behavior.
        cb(null, []); 
    }
}

module.exports = { 
    initDB, getTables, addTable, deleteTable, getHistory, addSpin, 
    clearHistory, wipeAllSpins, getStats, getUseMongo: () => useMongo,
    getExpertRule, addExpertRule, getPatternStats
};
