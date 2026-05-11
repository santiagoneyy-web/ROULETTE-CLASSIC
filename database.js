require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const Table = require('./models/Table');
const Spin = require('./models/Spin');
const UserAccess = require('./models/UserAccess');
const Strategy = require('./models/Strategy');
const MetricSnapshot = require('./models/MetricSnapshot');
const AiPrediction = require('./models/AiPrediction');

const DB_FILE = path.join(__dirname, 'roulette_db.json');
let useMongo = false;

// Memory cache for fallback
let fallbackData = {
    tables: [
        {
            schema_version: 2,
            id: 1,
            code: 'AUTO',
            name: 'Auto Roulette',
            provider: 'Evolution',
            url: 'https://www.casino.org/casinoscores/es/auto-roulette/',
            source_type: 'casino_org',
            status: 'active'
        }
    ],
    spins: [],
    expertRules: [],
    users: [],
    strategies: [],
    metricSnapshots: [],
    aiPredictions: []
};

function loadFallback() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            // Merge logic: Preserve tables and expertRules if missing in file
            if (data.tables && data.tables.length > 0) fallbackData.tables = data.tables;
            if (data.spins) fallbackData.spins = data.spins;
            if (data.expertRules) fallbackData.expertRules = data.expertRules;
            if (data.users) fallbackData.users = data.users;
            if (data.strategies) fallbackData.strategies = data.strategies;
            if (data.metricSnapshots) fallbackData.metricSnapshots = data.metricSnapshots;
            if (data.aiPredictions) fallbackData.aiPredictions = data.aiPredictions;
            
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
    let mongoUri = process.env.MONGODB_URI || null; 
    
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
            } else {
                await Table.updateOne(
                    { id: 1 },
                    {
                        $setOnInsert: fallbackData.tables[0],
                        $set: {
                            code: 'AUTO',
                            name: 'Auto Roulette',
                            provider: 'Evolution',
                            url: 'https://www.casino.org/casinoscores/es/auto-roulette/',
                            source_type: 'casino_org',
                            status: 'active'
                        }
                    },
                    { upsert: true }
                );
                await Table.updateOne({ id: 2 }, { $set: { status: 'inactive' } });
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
                    $match: {
                        status: { $ne: 'inactive' }
                    }
                },
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
        }).filter(t => t.status !== 'inactive');
        cb(null, results);
    }
}

async function addTable(name, provider, url, cb) {
    if (useMongo) {
        try {
            const maxTable = await Table.findOne().sort('-id').exec();
            const id = maxTable ? maxTable.id + 1 : 1;
            const newTable = new Table({
                schema_version: 2,
                id,
                code: String(name || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''),
                name,
                provider,
                url,
                source_type: 'manual',
                status: 'active'
            });
            await newTable.save();
            cb(null, id);
        } catch (e) { cb(e); }
    } else {
        const id = fallbackData.tables.length > 0 ? Math.max(...fallbackData.tables.map(t => t.id)) + 1 : 1;
        fallbackData.tables.push({
            schema_version: 2,
            id,
            code: String(name || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''),
            name,
            provider,
            url,
            source_type: 'manual',
            status: 'active'
        });
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
                schema_version: 2,
                id,
                table_id: parseInt(tableId),
                table_code: extra.table_code || 'AUTO',
                number: num,
                source: source || 'bot',
                source_quality: extra.source_quality || (source === 'casino_org_live' ? 'live' : 'manual'),
                session_id: extra.session_id || '',
                round_key: extra.round_key || extra.event_id || '',
                event_id: extra.event_id || null,
                speed_rpm: extra.speed_rpm || Number((21 + Math.random()).toFixed(1)),
                timestamp_str: extra.timestamp_str || new Date().toLocaleTimeString(),
                angle: extra.angle || Math.floor(Math.random() * 360),
                raw_history: Array.isArray(extra.raw_history) ? extra.raw_history : [],
                distance: extra.distance || (num > 18 ? 'Big' : 'Small'),
                direction: extra.direction || (Math.random() > 0.5 ? 'CW' : 'CCW'),
                sector: sector,
                observed_at: extra.observed_at || new Date(),
                ingested_at: new Date()
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
            schema_version: 2,
            id,
            table_id: parseInt(tableId),
            table_code: extra?.table_code || 'AUTO',
            number: parseInt(number),
            source: source || 'manual',
            source_quality: extra?.source_quality || (source === 'casino_org_live' ? 'live' : 'manual'),
            session_id: extra?.session_id || '',
            round_key: extra?.round_key || extra?.event_id || '',
            event_id: extra ? extra.event_id : null,
            raw_history: Array.isArray(extra?.raw_history) ? extra.raw_history : [],
            observed_at: extra?.observed_at || new Date().toISOString(),
            ingested_at: new Date().toISOString(),
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

function nextFallbackId(collection) {
    return collection.length > 0 ? Math.max(...collection.map(item => Number(item.id) || 0)) + 1 : 1;
}

async function findAccessCode(code, cb) {
    if (useMongo) {
        try {
            const user = await UserAccess.findOne({ code }).lean().exec();
            cb(null, user || null);
        } catch (e) { cb(e); }
    } else {
        const user = fallbackData.users.find(item => item.code === code);
        cb(null, user || null);
    }
}

async function saveAccessCode(data, cb) {
    if (useMongo) {
        try {
            const existing = data.id ? await UserAccess.findOne({ id: data.id }).exec() : await UserAccess.findOne({ code: data.code }).exec();
            if (existing) {
                Object.assign(existing, data, { updated_at: new Date() });
                await existing.save();
                cb(null, existing);
                return;
            }

            const id = data.id || ((await UserAccess.findOne().sort('-id').lean().exec())?.id || 0) + 1;
            const created = await UserAccess.create({ ...data, id });
            cb(null, created);
        } catch (e) { cb(e); }
    } else {
        const idx = fallbackData.users.findIndex(item => item.code === data.code || item.id === data.id);
        const now = new Date().toISOString();
        if (idx >= 0) {
            fallbackData.users[idx] = { ...fallbackData.users[idx], ...data, updated_at: now };
            saveFallback();
            cb(null, fallbackData.users[idx]);
            return;
        }

        const record = {
            id: data.id || nextFallbackId(fallbackData.users),
            name: data.name || 'User',
            code: data.code,
            role: data.role || 'member',
            status: data.status || 'active',
            permissions: Array.isArray(data.permissions) ? data.permissions : [],
            notes: data.notes || '',
            last_login_at: data.last_login_at || null,
            created_at: now,
            updated_at: now
        };
        fallbackData.users.push(record);
        saveFallback();
        cb(null, record);
    }
}

async function listStrategies(filters, cb) {
    const source = filters?.source || null;
    const tableId = filters?.tableId || null;
    const includeInactive = Boolean(filters?.includeInactive);

    if (useMongo) {
        try {
            const query = {};
            if (source) query.source = source;
            if (!includeInactive) query.status = { $ne: 'inactive' };
            if (tableId) query.table_id = { $in: [String(tableId), 'global'] };
            const rows = await Strategy.find(query).sort({ updated_at: -1 }).lean().exec();
            cb(null, rows);
        } catch (e) { cb(e); }
    } else {
        const rows = fallbackData.strategies
            .filter(item => includeInactive || item.status !== 'inactive')
            .filter(item => !source || item.source === source)
            .filter(item => !tableId || item.table_id === String(tableId) || item.table_id === 'global')
            .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
        cb(null, rows);
    }
}

async function saveStrategyRecord(data, cb) {
    if (useMongo) {
        try {
            const query = data.id ? { id: data.id } : { name: data.name, source: data.source || 'human', table_id: data.table_id || 'global' };
            let existing = await Strategy.findOne(query).exec();
            if (existing) {
                Object.assign(existing, data, { updated_at: new Date() });
                await existing.save();
                cb(null, existing);
                return;
            }

            const id = data.id || ((await Strategy.findOne().sort('-id').lean().exec())?.id || 0) + 1;
            const created = await Strategy.create({ ...data, id });
            cb(null, created);
        } catch (e) { cb(e); }
    } else {
        const idx = fallbackData.strategies.findIndex(item =>
            (data.id && item.id === data.id) ||
            (item.name === data.name && item.source === (data.source || 'human') && item.table_id === (data.table_id || 'global'))
        );
        const now = new Date().toISOString();
        if (idx >= 0) {
            fallbackData.strategies[idx] = { ...fallbackData.strategies[idx], ...data, updated_at: now };
            saveFallback();
            cb(null, fallbackData.strategies[idx]);
            return;
        }

        const record = {
            schema_version: 2,
            id: data.id || nextFallbackId(fallbackData.strategies),
            table_id: data.table_id || 'global',
            table_code: data.table_code || (data.table_id && data.table_id !== 'global' ? 'AUTO' : 'GLOBAL'),
            name: data.name || 'Strategy',
            summary: data.summary || '',
            source: data.source || 'human',
            origin: data.origin || 'manual',
            status: data.status || 'active',
            pattern: data.pattern || '',
            trigger: data.trigger || '',
            action: data.action || '',
            tags: Array.isArray(data.tags) ? data.tags : [],
            priority: data.priority || 'suggestion',
            confidence_weight: Number(data.confidence_weight || 1),
            success_hits: Number(data.success_hits || 0),
            fail_hits: Number(data.fail_hits || 0),
            sample_size: Number(data.sample_size || 0),
            effectiveness: data.effectiveness || { direct_rate: 0, neighbor_rate: 0, loss_rate: 0 },
            last_context: data.last_context || '',
            last_used_at: data.last_used_at || null,
            created_at: now,
            updated_at: now
        };
        fallbackData.strategies.push(record);
        saveFallback();
        cb(null, record);
    }
}

async function addMetricSnapshot(data, cb) {
    if (useMongo) {
        try {
            let created = null;
            let attempts = 0;
            while (!created && attempts < 5) {
                try {
                    const id = data.id || ((await MetricSnapshot.findOne().sort('-id').lean().exec())?.id || 0) + 1;
                    created = await MetricSnapshot.create({ ...data, schema_version: 2, id });
                } catch (err) {
                    if (err.code === 11000 && err.keyPattern && err.keyPattern.id) attempts++;
                    else throw err;
                }
            }
            cb(null, created);
        } catch (e) { cb(e); }
    } else {
        const record = {
            schema_version: 2,
            id: data.id || nextFallbackId(fallbackData.metricSnapshots),
            table_id: Number(data.table_id),
            table_code: data.table_code || 'AUTO',
            spin_id: data.spin_id ?? null,
            window_size: Number(data.window_size || 15),
            recent_numbers: Array.isArray(data.recent_numbers) ? data.recent_numbers : [],
            stability_level: data.stability_level || 'red',
            pattern_label: data.pattern_label || '',
            dominant_axis: data.dominant_axis || 'none',
            dominant_signal: data.dominant_signal || '',
            dominance_score: Number(data.dominance_score || 0),
            dominance8: data.dominance8 || { cw: 0, ccw: 0, big: 0, small: 0 },
            momentum15: data.momentum15 || { cw: 0, ccw: 0, big: 0, small: 0 },
            performance8: data.performance8 || { cwN9: '', cwN4: '', ccwN9: '', ccwN4: '' },
            routes: data.routes || {},
            context: data.context || { source: 'auto', notes: '' },
            captured_at: data.captured_at || new Date().toISOString()
        };
        fallbackData.metricSnapshots.push(record);
        if (fallbackData.metricSnapshots.length > 10000) fallbackData.metricSnapshots.shift();
        saveFallback();
        cb(null, record);
    }
}

async function getMetricSnapshots(tableId, limit, cb) {
    if (useMongo) {
        try {
            const rows = await MetricSnapshot.find({ table_id: Number(tableId) })
                .sort({ captured_at: -1 })
                .limit(limit || 100)
                .lean()
                .exec();
            cb(null, rows);
        } catch (e) { cb(e); }
    } else {
        const rows = fallbackData.metricSnapshots
            .filter(item => item.table_id == tableId)
            .slice(-(limit || 100))
            .reverse();
        cb(null, rows);
    }
}

async function addAiPrediction(data, cb) {
    if (useMongo) {
        try {
            let created = null;
            let attempts = 0;
            while (!created && attempts < 5) {
                try {
                    const id = data.id || ((await AiPrediction.findOne().sort('-id').lean().exec())?.id || 0) + 1;
                    created = await AiPrediction.create({ ...data, schema_version: 2, id });
                } catch (err) {
                    if (err.code === 11000 && err.keyPattern && err.keyPattern.id) attempts++;
                    else throw err;
                }
            }
            cb(null, created);
        } catch (e) { cb(e); }
    } else {
        const record = {
            schema_version: 2,
            id: data.id || nextFallbackId(fallbackData.aiPredictions),
            table_id: Number(data.table_id),
            table_code: data.table_code || 'AUTO',
            spin_id: data.spin_id ?? null,
            basis: data.basis || 'dominance',
            dominance_priority: data.dominance_priority !== false,
            mode: data.mode || 'SAFE',
            route: data.route || 'ESPERAR',
            zone: data.zone || 'ESPERAR',
            n9: data.n9 || 'ESPERAR',
            n4: data.n4 || 'ESPERAR',
            analysis: data.analysis || '',
            strategy_refs: Array.isArray(data.strategy_refs) ? data.strategy_refs : [],
            confidence: Number(data.confidence || 0),
            context_hash: data.context_hash || '',
            result: data.result || 'pending',
            resolved_number: data.resolved_number ?? null,
            created_at: data.created_at || new Date().toISOString(),
            resolved_at: data.resolved_at || null
        };
        fallbackData.aiPredictions.push(record);
        if (fallbackData.aiPredictions.length > 10000) fallbackData.aiPredictions.shift();
        saveFallback();
        cb(null, record);
    }
}

async function resolvePendingAiPredictions(tableId, resolvedNumber, evaluator, cb) {
    const now = new Date();
    if (useMongo) {
        try {
            const rows = await AiPrediction.find({
                table_id: Number(tableId),
                result: 'pending'
            }).sort({ created_at: 1 }).limit(25).exec();

            let resolved = 0;
            for (const row of rows) {
                const result = typeof evaluator === 'function' ? evaluator(row, resolvedNumber) : 'loss';
                if (!['win', 'loss', 'skip'].includes(result)) continue;
                row.result = result;
                row.resolved_number = Number(resolvedNumber);
                row.resolved_at = now;
                await row.save();
                resolved++;
            }

            cb(null, { resolved });
        } catch (e) { cb(e); }
    } else {
        let resolved = 0;
        fallbackData.aiPredictions = fallbackData.aiPredictions.map(item => {
            if (item.table_id != tableId || item.result !== 'pending') return item;
            const result = typeof evaluator === 'function' ? evaluator(item, resolvedNumber) : 'loss';
            if (!['win', 'loss', 'skip'].includes(result)) return item;
            resolved++;
            return {
                ...item,
                result,
                resolved_number: Number(resolvedNumber),
                resolved_at: now.toISOString()
            };
        });
        saveFallback();
        cb(null, { resolved });
    }
}

async function getAiPredictions(tableId, limit, cb) {
    if (useMongo) {
        try {
            const rows = await AiPrediction.find({ table_id: Number(tableId) })
                .sort({ created_at: -1 })
                .limit(limit || 100)
                .lean()
                .exec();
            cb(null, rows);
        } catch (e) { cb(e); }
    } else {
        const rows = fallbackData.aiPredictions
            .filter(item => item.table_id == tableId)
            .slice(-(limit || 100))
            .reverse();
        cb(null, rows);
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
    getExpertRule, addExpertRule, getPatternStats,
    findAccessCode, saveAccessCode,
    listStrategies, saveStrategyRecord,
    addMetricSnapshot, getMetricSnapshots,
    addAiPrediction, getAiPredictions, resolvePendingAiPredictions
};
