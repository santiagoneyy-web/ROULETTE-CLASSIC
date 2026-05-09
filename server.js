// ============================================================
// server.js — Roulette Predictor API (Neural V5)
// Optimización: Build sin Chromium para Render (10/04/2026)
// ============================================================
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./database');
const Spin    = require('./models/Spin'); // MongoDB Model
const predictor = require('./predictor'); // Agents 1-4
const agent5  = require('./agent5');      // Autonomous AI & Physics
const axios   = require('axios');

const NTFY_TOPIC = process.env.NTFY_TOPIC || 'ofi_santi_alerts';
const ntfyCooldowns = {}; // { tableId: remaining_spins_before_next_alert }

const app  = express();

// Batch import (for initial sync from Bot over missing history)
app.post('/api/spin/batch', async (req, res) => {
    const { table_id, numbers, source } = req.body;
    if (!table_id || !Array.isArray(numbers) || numbers.length === 0) {
        return res.status(400).json({ error: 'table_id and numbers array required' });
    }
    
    // Proceso el array y lo guardo localmente en el DB (como sync mode)
    try {
        // Obtenemos historial db
        await new Promise((resolveDB) => {
            db.getHistory(table_id, 20, (err, rows) => {
                const existing = rows ? rows.map(r => r.number) : [];
                
                // Procesar evitando el solapamiento o bucles en recargas de bot
                const doWork = async () => {
                    // Validar primero si el array entrante (numbers) es EXACTAMENTE igual al final del historial existente (existing)
                    if (existing && existing.length >= numbers.length) {
                        const tail = existing.slice(-numbers.length);
                        let isIdentical = true;
                        for(let k=0; k < numbers.length; k++) {
                            if (tail[k] !== numbers[k]) isIdentical = false;
                        }
                        if (isIdentical) {
                            console.log(`[BATCH] Solapamiento detectado. Ignorando lote duplicado.`);
                            return resolveDB(); // Terminamos sin añadir basura 
                        }
                    }

                    // Sino es idéntico, o es parcial, barremos y forzamos adición.
                    // Para ser seguros en escenarios complejos, simplemente insertamos asumiendo que el lote es fresco.
                    for(let i=0; i < numbers.length; i++){
                        const n = numbers[i];
                        await new Promise((cb) => db.addSpin(table_id, n, source || 'batch', {}, cb));
                    }
                    resolveDB();
                };
                doWork();
            });
        });

        // Hacemos ping a la UI
        if (sseClients[table_id]) {
            sseClients[table_id].forEach(client => {
                client.write(`data: ${JSON.stringify({ type: 'batch_load' })}\n\n`);
            });
        }
        res.json({ success: true, inserted: numbers.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// START
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Serve static frontend from the same folder
app.use(express.static(path.join(__dirname)));

db.initDB();

// ---- API: Tables ----
app.get('/api/tables', (req, res) => {
    db.getTables((err, tables) => {
        if (err || !tables || tables.length === 0) {
            // Hard fallback in case database.js logic fails
            return res.json([
                { id: 1, name: 'Auto Roulette', provider: 'Evolution', url: 'https://www.casino.org/casinoscores/es/auto-roulette/' },
                { id: 2, name: 'Inmersive Roulette', provider: 'Evolution', url: 'https://www.casino.org/casinoscores/es/immersive-roulette/' }
            ]);
        }
        res.json(tables);
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

// SSE Heartbeat para evitar desconexiones de Render por inactividad (>60s)
setInterval(() => {
    Object.keys(sseClients).forEach(tableId => {
        sseClients[tableId].forEach(client => {
            try { client.write('data: {"type":"ping"}\n\n'); } catch (e) {}
        });
    });
}, 25000);

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

// ── Memoria local para el chat del usuario (Temporal por reinicio)
const aiMemory = {};

// ─── AI COLLABORATION ENDPOINTS (V5 GEMINI) ────────────────────────

// ---------------------------------------------------
// Groq LLM endpoint (Llama 4 via Groq API)
// ---------------------------------------------------
app.post('/api/ai/groq', async (req, res) => {
    const { prompt, tableId, historyStr } = req.body;
    try {
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) return res.json({ reply: 'N9: ESPERAR | N4: ESPERAR' });

        // Extraer los 6 números válidos del prompt
        const validNums = [];
        const n9cwMatch = prompt.match(/N9=(\d+)/);
        const n4sCWMatch = prompt.match(/N4_S=(\d+)/);
        const n4bCWMatch = prompt.match(/N4_B=(\d+)/);
        const matches = prompt.match(/N9=(\d+)|N4_S=(\d+)|N4_B=(\d+)/g);
        if (matches) {
            matches.forEach(m => {
                const num = m.split('=')[1];
                if (num && !validNums.includes(num)) validNums.push(num);
            });
        }

        const requestBody = {
            model: "llama-3.3-70b-versatile",
            messages: [
                { 
                    role: "system", 
                    content: "Eres un motor de predicción. RESPONDE SOLO JSON. PROHIBIDO texto extra." 
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.15,
            max_completion_tokens: 60,
            response_format: { type: "json_object" }
        };

        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", requestBody, {
            headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" }
        });
        
        let result = response.data.choices[0].message.content.trim();
        try {
            const parsed = JSON.parse(result);
            let n9 = String(parsed.n9 || '').replace(/[^0-9]/g, '');
            let n4 = String(parsed.n4 || '').replace(/[^0-9]/g, '');
            
            // VALIDACIÓN: Si el número NO está en la lista de 6 válidos, forzar uno válido
            if (validNums.length > 0) {
                if (!validNums.includes(n9)) n9 = validNums[0]; // Primer N9 disponible
                if (!validNums.includes(n4)) n4 = validNums[Math.min(3, validNums.length - 1)]; // Primer N4
            }
            
            res.json({ reply: `N9: ${n9} | N4: ${n4}` });
        } catch(e) {
            // Fallback: si no parseó JSON, dar el primer válido
            if (validNums.length >= 2) {
                res.json({ reply: `N9: ${validNums[0]} | N4: ${validNums[1]}` });
            } else {
                res.json({ reply: 'N9: ESPERAR | N4: ESPERAR' });
            }
        }
    } catch (error) {
        console.error('Groq predictor error:', error.message);
        res.json({ reply: 'N9: ESPERAR | N4: ESPERAR' });
    }
});

app.post('/api/ai/chat', async (req, res) => {
    const { text, tableId, historyStr } = req.body;
    try {
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) return res.json({ reply: 'IA Desconectada - Falta GROQ_API_KEY' });

        if (!aiMemory[tableId]) aiMemory[tableId] = [];
        // Sanitizar memoria vieja (formato Gemini -> Groq)
        aiMemory[tableId] = aiMemory[tableId].map(m => {
            if (m.parts && m.parts[0]) return { role: m.role === 'model' ? 'assistant' : m.role, content: m.parts[0].text };
            if (!m.content && m.text) return { role: m.role, content: m.text };
            return m;
        }).filter(m => m.content && m.role);

        const sysPrompt = `Eres el colega analista de Santi en "ROULETTE CLASSIC".
REGLAS ESTRICTAS:
- Responde CORTO, maximo 3 oraciones. PROHIBIDO dar listas largas o explicaciones academicas.
- Hablas casual y tecnico, como un compañero de equipo.
- Conoces la web: Panel Travel mide distancia del dealer (SMALL 1-9, BIG 10-18).
- Direcciones: CW(Derecha), CCW(Izquierda).
- Colores de estabilidad: Verde(Dominancia fuerte), Amarillo(Tendencia), Rojo(Caos).
- Metricas N9/N4: Objetivos matematicos calculados por el motor de fisica.
- Si te preguntan algo, responde DIRECTO. Nada de "es una buena pregunta" ni introducciones.
- Si te dicen "no escribas tanto", responde en 1 oracion.`;

        const requestBody = {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: sysPrompt },
                ...aiMemory[tableId].slice(-10),
                { role: "user", content: text + (historyStr ? ` [Historial mesa: ${historyStr}]` : '') }
            ],
            temperature: 0.6,
            max_tokens: 150
        };

        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", requestBody, {
            headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" }
        });
        
        const reply = response.data.choices[0].message.content;
        aiMemory[tableId].push({ role: "user", content: text });
        aiMemory[tableId].push({ role: "assistant", content: reply });
        if (aiMemory[tableId].length > 20) aiMemory[tableId] = aiMemory[tableId].slice(-20);

        res.json({ reply });
    } catch (error) {
        console.error('Chat error:', error.response?.data || error.message);
        res.json({ reply: 'Error de conexion con Ollama. Verifica GROQ_API_KEY.' });
    }
});

app.post('/api/ai/teach', async (req, res) => {
    const { patternDna, label, suggestedMove } = req.body;
    try {
        db.addExpertRule({ pattern_dna: patternDna, label, suggested_move: suggestedMove, learned_from: 'human' }, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Conceito aprendido y guardado.' });
        });
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

            // PATTERN MEMORY (Mongo focus, JSON-sync skipped for performance)
            if (isMongo && numsOnly.length >= 6) {
                try {
                    const Pattern = require('./models/Pattern');
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
                        async function requestAIPrediction(type) {
    const historyStr = history.join(',');
    const resp = await fetch('/api/ai/predict-nx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, tableId: currentTableId, historyStr })
    });
    const data = await resp.json();
    const el = document.getElementById(`ai-pred-${type}-text`);
    if (el) el.innerText = data.reply || 'Sin respuesta';
}                       savedSpin = await newSpin.save();
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

        // Agent 5 Neural Logic (V5 Learning)
        const jumpsA5 = [];
        for (let i = 1; i < numsOnly.slice(-5).length; i++) {
            const p = agent5.getPhysics(numsOnly.slice(-5)[i-1], numsOnly.slice(-5)[i]);
            jumpsA5.push({ mag: (p.distance==='Big'||p.distance==='ULTRA')?'B':'S', dir: p.direction==='IZQUIERDA'?'CCW':'CW' });
        }
        const seqMA5 = jumpsA5.map(x=>x.mag).join('');
        const seqDA5 = jumpsA5.map(x=>x.dir).join('');
        const dnaA5 = `${seqMA5}|${seqDA5}`;

        const expert = await new Promise(r => db.getExpertRule(dnaA5, (err, rule) => r(rule)));
        const stats = await new Promise(r => db.getPatternStats(tableId, seqMA5, seqDA5, (err, s) => r(s)));
        
        predictions.agent5_top = await agent5.predictAgent5(numsOnly, expert, stats);
        
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

// ============================================================
// /api/ai/groq-predict — Auto Prediccion con Llama 4 via Groq
// ============================================================
app.post('/api/ai/predict-nx', async (req, res) => {
    const { type, tableId, historyStr } = req.body;
    const groqKey = process.env.GROQ_API_KEY;

    if (!groqKey) {
        return res.status(503).json({ error: 'GROQ_API_KEY no configurada en el .env del servidor.' });
    }

    const WHEEL = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
    const getPos = n => WHEEL.indexOf(n);
    const getDist = (a, b) => { const diff = getPos(b) - getPos(a); return diff > 18 ? diff - 37 : diff < -18 ? diff + 37 : diff; };

    const nums = historyStr ? historyStr.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x)) : [];
    if (nums.length < 4) {
        return res.json({ prediction: null, reason: 'Se necesitan al menos 4 tiradas para analizar.' });
    }

    // Build last 12 events
    const events = [];
    for (let i = 1; i < nums.length && events.length < 12; i++) {
        const idx = nums.length - i;
        if (idx > 0) {
            const dist = getDist(nums[idx - 1], nums[idx]);
            events.unshift({ from: nums[idx-1], to: nums[idx], dist, dir: dist >= 0 ? 'DER' : 'IZQ', zone: Math.abs(dist) >= 9 ? 'BIG' : 'SMALL' });
        }
    }

    const last8 = events.slice(-8);
    const derC = last8.filter(e => e.dir === 'DER').length;
    const bigC = last8.filter(e => e.zone === 'BIG').length;
    const eventsStr = events.map(e => `${e.from}->${e.to} dist:${e.dist>0?'+':''}${e.dist} ${e.dir} ${e.zone}`).join('\n');

    const sysPrompt = `Eres un analizador experto de ruleta europea. Responde SIEMPRE en JSON valido con este formato exacto:
{"color":"verde","confianza":8,"direccion":"DER","zona":"BIG","prediccion":"Inercia CW dominante","razon":"5 de 8 ultimas en DER con tendencia BIG"}

Reglas de color:
- verde: mayoria en DIR y ZONA en ultimas 8
- amarillo: mayoria en solo un eje
- rojo: sin patron claro o caos

Confianza 1-10 segun claridad del patron.`;

    const userMsg = `HISTORIAL (${events.length} tiradas, antiguo a reciente):
${eventsStr}

RESUMEN ULTIMAS 8:
DER:${derC} IZQ:${8-derC} | BIG:${bigC} SMALL:${8-bigC}
Ultimas 3: ${events.slice(-3).map(e => e.dir+'/'+e.zone).join(', ')}

Responde solo JSON.`;

    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: userMsg }
            ],
            max_tokens: 250,
            temperature: 0.2,
            response_format: { type: 'json_object' }
        }, {
            headers: {
                'Authorization': `Bearer ${groqKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 8000
        });

        const raw = response.data.choices[0].message.content;
        const parsed = JSON.parse(raw);
        return res.json(parsed);
    } catch (err) {
        console.error('Groq API error:', err.response?.data || err.message);
        return res.status(500).json({ error: 'Error al contactar Groq API', detail: err.message });
    }
});

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
