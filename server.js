// ============================================================
// server.js — Express API server for Roulette Predictor
// Run: node server.js
// ============================================================
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./database');
const Spin    = require('./models/Spin'); // MongoDB Model
const Pattern = require('./models/Pattern'); // MongoDB Pattern Memory Model
const ExpertRule = require('./models/ExpertRule'); // New V5 Learning Model
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

app.get('/api/patterns/:tableId', async (req, res) => {
    const { tableId } = req.params;
    const { seq_mag, seq_dir } = req.query; // 'BSBS', 'CWCCWCW'
    
    try {
        const isMongo = db.getUseMongo();
        if (!isMongo) return res.json({ error: 'MongoDB not enabled', mag: {}, dir: {} });
        
        let magStats = [];
        let dirStats = [];

        if (seq_mag) {
            magStats = await Pattern.aggregate([
                { $match: { table_id: String(tableId), sequence_mag: seq_mag } },
                { $group: { _id: "$next_mag", count: { $sum: 1 } } }
            ]);
        }
        
        if (seq_dir) {
            dirStats = await Pattern.aggregate([
                { $match: { table_id: String(tableId), sequence_dir: seq_dir } },
                { $group: { _id: "$next_dir", count: { $sum: 1 } } }
            ]);
        }
        
        res.json({
            mag: magStats.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
            dir: dirStats.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {})
        });
    } catch(e) {
        res.status(500).json({ error: e.message, mag: {}, dir: {} });
    }
});

// ─── AI COLLABORATION ENDPOINTS (V5) ──────────────────────────
app.post('/api/ai/chat', async (req, res) => {
    const { text, tableId } = req.body;
    let reply = "No estoy seguro de cómo procesar eso aún, Santi.";
    
    try {
        const isMongo = db.getUseMongo();
        const lowerText = text.toLowerCase();
        
        // Simple logic for heuristic responses
        if (lowerText.includes('confianza') || lowerText.includes('seguro')) {
            reply = "Mi sistema de confluencia está analizando el flujo. Basándome en la inercia del dealer, creo que deberíamos esperar una señal superior al 80% para ser conservadores.";
        } else if (lowerText.includes('patrón') || lowerText.includes('viste')) {
            reply = "He detectado un patrón rítmico persistente. Si consultas mi base de datos de aprendizaje, verás que esta secuencia ha fallado solo 2 veces en los últimos 50 registros colectivos.";
        } else if (lowerText.includes('hola') || lowerText.includes('quién eres')) {
            reply = "Soy el Brain Core V5. Estoy aquí para aprender de tus jugadas y ayudarte a filtrar el ruido del caos. Trabajemos en equipo.";
        } else {
            reply = "Interesante observación. Lo guardaré en mi bitácora neural para compararlo con el próximo resultado.";
        }
        
        res.json({ reply });
    } catch(e) { res.json({ reply: "Lo siento, mi conexión neural está inestable." }); }
});

app.post('/api/ai/teach', async (req, res) => {
    const { patternDna, label, suggestedMove } = req.body;
    try {
        const isMongo = db.getUseMongo();
        if (isMongo) {
            const rule = new ExpertRule({ pattern_dna: patternDna, label, suggested_move: suggestedMove });
            await rule.save();
            res.json({ success: true, message: 'Conceito aprendido y guardado en Atlas.' });
        } else {
            res.json({ success: true, message: 'Aprendido localmente (Memoria Temporal).' });
        }
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/spin', async (req, res) => {
    // ── NODO 1: INGESTA SÚPER RÁPIDA ──
    const { table_id, number, source, direction } = req.body;
    if (table_id == null || number == null) return res.status(400).json({ error: 'table_id and number required' });
    if (number < 0 || number > 36) return res.status(400).json({ error: 'number must be 0-36' });

    // ✅ ENVÍO INMEDIATO AL FRONTEND (Sin esperar a la IA ni a Mongo)
    if (sseClients[table_id]) {
        sseClients[table_id].forEach(client => {
            client.write(`data: ${JSON.stringify({ type: 'new_spin', number })}\n\n`);
        });
    }
    // Devolvemos el 200 OK súper rápido al Crawler para que siga su polling
    res.json({ status: 'received_fast', table_id, number });

    // ── NODO 2: PROCESAMIENTO ASÍNCRONO (IA, FÍSICA Y BASE DE DATOS) ──
    // Se ejecuta en background sin bloquear al usuario
    (async () => {
        try {
            if (ntfyCooldowns[table_id] && ntfyCooldowns[table_id] > 0) {
                ntfyCooldowns[table_id]--;
            }

            const isMongo = db.getUseMongo();
            let currentHistory = [];
            
            if (isMongo) {
                currentHistory = await Spin.find({ table_id }).sort({ id: -1 }).limit(100).exec();
                currentHistory.reverse();
            } else {
                currentHistory = await new Promise((resolve, reject) => {
                    db.getHistory(table_id, 100, (err, rows) => {
                        if (err) reject(err); else resolve(rows);
                    });
                });
            }
            
            const numsOnly = currentHistory.map(s => s.number);
            const lastNumber = numsOnly.length > 0 ? numsOnly[numsOnly.length - 1] : null;

            if (req.body.event_id) {
                const isDuplicate = currentHistory.some(s => s.event_id === req.body.event_id);
                if (isDuplicate) return console.log(`[IGNORE DB] Event ${req.body.event_id}`);
            } else if (number === lastNumber && source === 'public_scraper') {
                return console.log(`[IGNORE DB] Duplicate ${number}`);
            }

            const prevSpin = currentHistory.length > 0 ? currentHistory[currentHistory.length - 1] : null;
            const prevNumber = prevSpin ? prevSpin.number : null;
            const physics = agent5.getPhysics(prevNumber, number);
            const sector = agent5.getSector(number);

            // EVALUACIÓN DE AGENTES DEL TIRO ANTERIOR
            if (isMongo && prevSpin && prevSpin.predictions) {
                prevSpin.results = {
                    agent1_result: agent5.evaluatePrediction(number, prevSpin.predictions.agent1_top),
                    agent2_result: agent5.evaluatePrediction(number, prevSpin.predictions.agent2_top),
                    agent3_result: agent5.evaluatePrediction(number, prevSpin.predictions.agent3_top),
                    agent4_result: agent5.evaluatePrediction(number, prevSpin.predictions.agent4_top)
                };
                await prevSpin.save();
            }

            numsOnly.push(number);

            // PATTERN MEMORY
            if (isMongo && numsOnly.length >= 6) {
                try {
                    const last6 = numsOnly.slice(-6); 
                    const jumps = [];
                    for (let i = 1; i < last6.length; i++) {
                        const p = agent5.getPhysics(last6[i-1], last6[i]);
                        const mag = (p.distance === 'Big' || p.distance === 'ULTRA') ? 'B' : 'S';
                        let dir = 'CW';
                        if (p.direction === 'IZQUIERDA') dir = 'CCW';
                        jumps.push({ mag, dir });
                    }
                    const seq = jumps.slice(0, 4);
                    const outcome = jumps[4];
                    const seqMag = seq.map(x => x.mag).join('');
                    const seqDir = seq.map(x => x.dir).join('');
                    
                    const newPattern = new Pattern({
                        table_id: String(table_id),
                        sequence_mag: seqMag,
                        sequence_dir: seqDir,
                        next_mag: outcome.mag,
                        next_dir: outcome.dir
                    });
                    await newPattern.save();
                } catch (err) { console.error('[DB] Pattern save err:', err.message); }
            }

            // PREDICCIONES FUTURAS (Optimizado: Cálculo Plano Inmediato)
            let newPredictions = { agent1_top: null, agent2_top: null, agent3_top: null, agent4_top: null };
            if (numsOnly.length >= 3) {
                const nextRound = predictor.projectNextRound(numsOnly, {});
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
            }

            // EXPORTAR A DB PARA QUE CUANDO EL CLIENTE RECARGUE ESTÉ TODO LINCADO
            if (isMongo) {
                let savedSpin = null, attempts = 0;
                while (!savedSpin && attempts < 5) {
                    try {
                        const maxSpin = await Spin.findOne().sort('-id').exec();
                        const newId = maxSpin ? maxSpin.id + 1 : 1;
                        const newSpin = new Spin({
                            id: newId,
                            table_id, number, source: source || 'bot',
                            event_id: req.body.event_id || null,
                            distance: physics.distance, direction: direction || physics.direction, sector,
                            predictions: newPredictions
                        });
                        savedSpin = await newSpin.save();
                    } catch (err) {
                        if (err.code === 11000 && err.keyPattern && err.keyPattern.id) attempts++;
                        else throw err;
                    }
                }
            } else {
                db.addSpin(table_id, number, source || 'bot', { event_id: req.body.event_id }, () => {});
            }

        } catch(e) { console.error('[Background Sync Err]', e); }
    })();
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

        // Fast prediction pipeline (No 400-spin history loop)
        const nextRound = predictor.projectNextRound(numsOnly, {});
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

// Catch-all: Siempre servir el frontend para cualquier ruta no reconocida (Middleware final)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ---- Start ----
const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n🎰 Roulette Predictor Server running at http://0.0.0.0:${PORT}`);
    console.log(`   API ready at:          http://0.0.0.0:${PORT}/api/\n`);
    
    // 🔥 MongoDB sync disabled by user request (using JSON only)
    /*
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
    */

    // ── V25: BOT NUBE DESACTIVADO PERMANENTEMENTE ──
    // El usuario ahora utiliza la Extensión Local de Chrome para enviar los datos con latencia cero.
    // Apagar Puppeteer aquí libera ~450MB de RAM en Render y evita que el API server colapse por OOM.
    /*
    if (!process.env.DISABLE_BOTS) {
        require('./start-bots.js')(PORT);
    }
    */
});
