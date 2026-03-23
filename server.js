// ============================================================
// server.js — Express API server for Roulette Predictor
// Run: node server.js
// ============================================================
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./database');
const Spin    = require('./models/Spin'); // MongoDB Model
const agent5  = require('./agent5');      // Autonomous AI & Physics
const predictor = require('./predictor'); // Agents 1-4
const axios   = require('axios');

const NTFY_TOPIC = process.env.NTFY_TOPIC || 'ofi_santi_alerts';
const ntfyCooldowns = {}; // { tableId: remaining_spins_before_next_alert }

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Serve static frontend from the same folder
app.use(express.static(path.join(__dirname)));

db.initDB();

// ---- API: Tables ----
app.get('/api/tables', (req, res) => {
    db.getTables((err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/tables', (req, res) => {
    const { name, provider, url } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    db.addTable(name, provider || '', url || '', (err, id) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id, name, provider, url });
    });
});

app.delete('/api/tables/:id', (req, res) => {
    db.deleteTable(req.params.id, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ---- API: Spins / History ----
app.get('/api/history/:tableId', (req, res) => {
    const tableId = req.params.tableId;
    const limit = req.query.limit ? parseInt(req.query.limit) : 400; // Updated limit to 400 to match OFI
    console.log(`[GET] History for table ${tableId} (limit: ${limit})`);
    db.getHistory(tableId, limit, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        console.log(`[DB] Found ${rows.length} rows for table ${tableId}`);
        res.json(rows);
    });
});

// ── SSE: broadcast to all clients listening per table ──────
const sseClients = {}; // { tableId: [res, res, ...] }

app.get('/api/events/:tableId', (req, res) => {
    const tableId = req.params.tableId;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering on Render
    res.flushHeaders();
    // Keep connection alive
    res.write('data: {"type":"connected"}\n\n');
    if (!sseClients[tableId]) sseClients[tableId] = [];
    sseClients[tableId].push(res);
    req.on('close', () => {
        sseClients[tableId] = (sseClients[tableId] || []).filter(c => c !== res);
    });
});

app.post('/api/spin', async (req, res) => {
    // ── NODO 1: INGESTA ──
    const { table_id, number, source, direction } = req.body;
    if (table_id == null || number == null) return res.status(400).json({ error: 'table_id and number required' });
    if (number < 0 || number > 36) return res.status(400).json({ error: 'number must be 0-36' });

    // Decrement Ntfy cooldown
    if (ntfyCooldowns[table_id] && ntfyCooldowns[table_id] > 0) {
        ntfyCooldowns[table_id]--;
    }

    try {
        const isMongo = db.getUseMongo();
        let currentHistory = [];
        
        // Fetch history to drive the agents
        if (isMongo) {
            currentHistory = await Spin.find({ table_id }).sort({ id: -1 }).limit(100).exec();
            currentHistory.reverse();
        } else {
            // Fallback JSON relies on db.getHistory callback
            currentHistory = await new Promise((resolve, reject) => {
                db.getHistory(table_id, 100, (err, rows) => {
                    if (err) reject(err); else resolve(rows);
                });
            });
        }
        
        const numsOnly = currentHistory.map(s => s.number);
        const lastNumber = numsOnly.length > 0 ? numsOnly[numsOnly.length - 1] : null;

        // --- DUPLICATE GUARD ---
        if (number === lastNumber && source === 'public_scraper') {
            console.log(`[DUPLICATE IGNORED] Table ${table_id}, Number ${number} (Source: ${source})`);
            return res.json({ id: 'ignored', table_id, number, source, note: 'Duplicate ignored' });
        }

        const prevSpin = currentHistory.length > 0 ? currentHistory[currentHistory.length - 1] : null;
        
        // ── NODO 2: PROCESAMIENTO FÍSICO ──
        const prevNumber = prevSpin ? prevSpin.number : null;
        const physics = agent5.getPhysics(prevNumber, number);
        const sector = agent5.getSector(number);

        // ── NODO 4: EVALUACIÓN (Del tiro anterior contra el número actual) ──
        if (isMongo && prevSpin && prevSpin.predictions) {
            prevSpin.results = {
                agent1_result: agent5.evaluatePrediction(number, prevSpin.predictions.agent1_top),
                agent2_result: agent5.evaluatePrediction(number, prevSpin.predictions.agent2_top),
                agent3_result: agent5.evaluatePrediction(number, prevSpin.predictions.agent3_top),
                agent4_result: agent5.evaluatePrediction(number, prevSpin.predictions.agent4_top),
                agent5_result: agent5.evaluatePrediction(number, prevSpin.predictions.agent5_top)
            };
            await prevSpin.save(); // Sync eval back to db
        }

        // Add the new number to the local array to generate predictions for the NEXT round
        numsOnly.push(number);

        // ── NODO 3: IA & AGENTES (Predicciones para el FUTURO) ──
        let newPredictions = {
            agent1_top: null, agent2_top: null, agent3_top: null, agent4_top: null, agent5_top: null
        };

        if (numsOnly.length >= 3) {
            // Run prediction algorithms
            const stats = {};
            // Simulate the analysis pipeline to build the stats
            for (let i = 2; i < numsOnly.length; i++) {
                predictor.analyzeSpin(numsOnly.slice(0, i + 1), stats);
            }
            
            const nextRound = predictor.projectNextRound(numsOnly, stats);
            const signature = predictor.computeDealerSignature(numsOnly);
            const masterSignals = predictor.getIAMasterSignals(nextRound, signature, numsOnly);

    if (masterSignals && masterSignals.length > 0) {
        const ag1 = masterSignals.find(s => s.name === 'Android n17');
        const ag2 = masterSignals.find(s => s.name === 'Android n16');
        const ag3 = masterSignals.find(s => s.name === 'Android 1717');
        const ag4 = masterSignals.find(s => s.name === 'N18');
        
        if (ag1) newPredictions.agent1_top = ag1.number;
        if (ag2 && ag2.tp !== undefined) newPredictions.agent2_top = ag2.tp;
        if (ag3) newPredictions.agent3_top = ag3.number;
        if (ag4) newPredictions.agent4_top = ag4.number;
    }

    // Célula (Androide Célula) - DNA Absorption enabled
    const ag5Result = await agent5.predictAgent5(table_id, numsOnly, masterSignals);
    if (ag5Result) {
        newPredictions.agent5_top = ag5Result.topNum;
        newPredictions.agent5_dna = ag5Result.dnaMatch; 
        console.log(`🤖 [Célula] Generated prediction: ${ag5Result.topNum} ${ag5Result.dnaMatch ? '(PERFECT DNA)' : ''}`);
    } else if (numsOnly.length < 50) {
        console.log(`⏳ [Célula] Learning mode: (${numsOnly.length}/50) spins.`);
    }
        }

        // ── NODO 3.5: ALARMAS AL CELULAR (NTFY) ──
        if (numsOnly.length >= 6) {
            try { 
                const windowSize = 6;
                const recentHist = currentHistory.slice(-(windowSize-1));
                
                const physList = [];
                for(let i = 0; i < recentHist.length; i++){
                    physList.push({ dir: recentHist[i].direction, dist: recentHist[i].distance });
                }
                physList.push({ dir: physics.direction, dist: physics.distance });

                if (physList.length >= 6) {
                    const lastW = physList.slice(-windowSize);
                    const dirs = lastW.map(p => p.dir);
                    const zones = lastW.map(p => p.dist);

                    const getTrend = (arr, minVal) => {
                        const counts = {};
                        arr.forEach(val => { if (val) counts[val] = (counts[val] || 0) + 1; });
                        for (const [key, c] of Object.entries(counts)) {
                            if (c >= minVal) return key;
                        }
                        return null;
                    };

                    const trendDir = getTrend(dirs, 5);
                    const trendZone = getTrend(zones, 5);

                    // ALARMA SOLO SI LA DIRECCIÓN DOMINA (5 de 6 o 6 de 6)
                    if (trendDir) {
                        const cooldown = ntfyCooldowns[table_id] || 0;
                        if (cooldown <= 0) { 
                            ntfyCooldowns[table_id] = 4; // 4 spins cooldown

                            const isSuper = trendDir && trendZone;
                            let title = isSuper ? '⭐⭐ SÚPER ESTABLE' : '⭐ TENDENCIA ESTABLE';

                            let msg = `MESA ${table_id}: `;
                            msg += `[${trendDir === 'DERECHA' || trendDir === 'DER' ? 'DER' : 'IZQ'}]`;
                            if (trendZone) msg += ` - [ZONA ${trendZone.toUpperCase()}]`;

                            axios.post(`https://ntfy.sh/`, {
                                topic: NTFY_TOPIC,
                                title: title,
                                message: msg,
                                tags: isSuper ? ['fire', 'slot_machine'] : ['star', 'bar_chart'],
                                priority: isSuper ? 5 : 4
                            }).catch(err => console.log('Ntfy Err:', err.message));
                            
                            console.log(`🔔 [NTFY SENT] ${title} - ${msg}`);
                        }
                    }
                }
            } catch(e) { console.error('Ntfy check err:', e); }
        }

        // ── NODO 4: SINCRONIZACIÓN (Guardar la inyección enriquecida) ──
        if (isMongo) {
            const maxSpin = await Spin.findOne().sort('-id').exec();
            const newId = maxSpin ? maxSpin.id + 1 : 1;

            const newSpin = new Spin({
                id: newId,
                table_id,
                number,
                source: source || 'bot',
                distance: physics.distance,
                direction: direction || physics.direction,
                sector,
                predictions: newPredictions
            });
            await newSpin.save();
            
            if (sseClients[table_id]) {
                sseClients[table_id].forEach(client => {
                    client.write(`data: ${JSON.stringify({ type: 'new_spin', number })}\n\n`);
                });
            }
            res.json(newSpin);
        } else {
            // Fallback
            db.addSpin(table_id, number, source || 'bot', (err, id) => {
                if (err) return res.status(500).json({ error: err.message });
                if (sseClients[table_id]) {
                    sseClients[table_id].forEach(client => {
                        client.write(`data: ${JSON.stringify({ type: 'new_spin', number })}\n\n`);
                    });
                }
                res.json({ id, table_id, number, source, note: 'Saved to fallback' });
            });
        }

    } catch (e) {
        console.error('Pipeline Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Batch import (for OCR auto-capture)
app.post('/api/spin/batch', (req, res) => {
    const { table_id, numbers, source } = req.body;
    if (!table_id || !Array.isArray(numbers)) return res.status(400).json({ error: 'table_id and numbers[] required' });
    let inserted = 0;
    const errors = [];
    const done = () => {
        if (inserted + errors.length === numbers.length) {
            res.json({ inserted, errors });
        }
    };
    if (numbers.length === 0) return res.json({ inserted: 0, errors: [] });
    numbers.forEach(n => {
        if (n < 0 || n > 36) { errors.push(n); return done(); }
        db.addSpin(table_id, n, source || 'ocr', (err) => {
            if (err) errors.push(n); else inserted++;
            done();
        });
    });
});

app.delete('/api/history/:tableId', (req, res) => {
    db.clearHistory(req.params.tableId, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Real-time prediction endpoint (called at page load)
app.get('/api/predict/:tableId', async (req, res) => {
    const tableId = req.params.tableId;
    try {
        let spins = [];
        const isMongo = db.getUseMongo();
        if (isMongo) {
            spins = await Spin.find({ table_id: tableId }).sort({ id: -1 }).limit(100).exec();
            spins.reverse();
        } else {
            spins = await new Promise((resolve, reject) => {
                db.getHistory(tableId, 100, (err, rows) => {
                    if (err) reject(err); else resolve(rows);
                });
            });
        }
        const numsOnly = spins.map(s => s.number);
        if (numsOnly.length < 3) return res.json({ agent5_top: null, message: 'Not enough data' });

        // Full prediction pipeline
        const stats = {};
        for (let i = 2; i < numsOnly.length; i++) {
            predictor.analyzeSpin(numsOnly.slice(0, i + 1), stats);
        }
        const nextRound = predictor.projectNextRound(numsOnly, stats);
        const signature = predictor.computeDealerSignature(numsOnly);
        const masterSignals = predictor.getIAMasterSignals(nextRound, signature, numsOnly);
        
        let predictions = { agent1_top: null, agent2_top: null, agent3_top: null, agent4_top: null, agent5_top: null };
        if (masterSignals && masterSignals.length > 0) {
            const ag1 = masterSignals.find(s => s.name === 'Android n17');
            const ag2 = masterSignals.find(s => s.name === 'Android n16');
            const ag3 = masterSignals.find(s => s.name === 'Android 1717');
            const ag4 = masterSignals.find(s => s.name === 'N18');
            if (ag1) predictions.agent1_top = ag1.number;
            if (ag2 && ag2.tp !== undefined) predictions.agent2_top = ag2.tp;
            if (ag3) predictions.agent3_top = ag3.number;
            if (ag4) predictions.agent4_top = ag4.number;
        }
        if (isMongo) {
            predictions.agent5_top = await agent5.predictAgent5(tableId, numsOnly);
        }
        res.json(predictions);
    } catch (e) {
        console.error('Predict endpoint error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Admin endpoint to wipe DB without shell (Free tier Render doesn't have shell)
app.get('/api/admin/wipe-all-spins-securely', async (req, res) => {
    try {
        if (db.getUseMongo()) {
            const result = await Spin.deleteMany({});
            res.send(`✅ [ADMIN] MongoDB: Historial borrado. Se eliminaron ${result.deletedCount} registros.`);
        } else {
            // Wipe local JSON too
            db.wipeAllSpins(() => {});
            res.send('✅ [ADMIN] Local JSON: Historial borrado.');
        }
    } catch (e) {
        res.status(500).send(`❌ Error en el wipe: ${e.message}`);
    }
});

// DELETE all spins for all tables (frontend "Wipe All" button)
app.delete('/api/wipe-all', async (req, res) => {
    try {
        console.log('🧹 [Wipe All] Triggering full database cleaning...');
        if (db.getUseMongo()) {
            const result = await Spin.deleteMany({});
            res.json({ success: true, deleted: result.deletedCount, message: `Borrados ${result.deletedCount} registros de MongoDB.` });
        } else {
            db.wipeAllSpins((err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Historial local vaciado.' });
            });
        }
    } catch (e) {
        console.error('Wipe failed:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/stats/:tableId', (req, res) => {
    db.getStats(req.params.tableId, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

// ---- Start ----
const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n🎰 Roulette Predictor Server running at http://0.0.0.0:${PORT}`);
    console.log(`   API ready at:          http://0.0.0.0:${PORT}/api/\n`);
    
    // 🔥 CRITICAL: Update table names if they exist but have old names (for Mongo)
    if (db.getUseMongo()) {
        try {
            const Table = require('./models/Table');
            await Table.updateOne({ id: 1 }, { $set: { name: 'Auto Roulette', url: 'https://www.casino.org/casinoscores/es/auto-roulette/' } });
            await Table.updateOne({ id: 2 }, { $set: { name: 'Inmersive Roulette', url: 'https://www.casino.org/casinoscores/es/immersive-roulette/' } });
            console.log('✅ [BOOT] Table names synchronized with focused config.');
        } catch (e) {
            console.error('❌ [BOOT] Table sync error:', e.message);
        }
    }

    if (!process.env.DISABLE_BOTS) {
        require('./start-bots.js')(PORT);
    }
});
