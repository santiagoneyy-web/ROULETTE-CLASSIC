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

function cleanAutoNumber(value) {
    return String(value ?? '').replace(/[^0-9]/g, '');
}

function formatAutoReply(n9, n4) {
    return `N9: ${n9} | N4: ${n4}`;
}

function detectWlPattern(sequence) {
    const s = String(sequence || '').replace(/[^WL]/g, '');
    if (!s) return 'sin historial';
    if (/WLWL$/.test(s) || /LWLW$/.test(s)) return 'zigzag/rodillo';
    if (/WWLL$/.test(s) || /LLWW$/.test(s)) return 'ola 2-2';
    if (/WWWLL$/.test(s) || /LLWWW$/.test(s)) return 'bambu/bloque';
    if (/WLLWLL$/.test(s) || /LLWLL$/.test(s)) return 'trampa';
    if (/WWL$/.test(s)) return 'doble victoria';
    if (/WWWL$/.test(s)) return 'racha 3W antes de L';
    if (/WWWWL$/.test(s)) return 'pico';
    if (/WWW$/.test(s) || /LLLL$/.test(s)) return 'racha/bloque';
    return 'patron mixto';
}

function summarizePatternContext(context, routeKey) {
    const perf = context.performance8 || {};
    const n9Seq = routeKey === 'cw' ? perf.cwN9 : perf.ccwN9;
    const n4Seq = routeKey === 'cw' ? perf.cwN4 : perf.ccwN4;
    return `Patron ${detectWlPattern(n9Seq)} en N9 y ${detectWlPattern(n4Seq)} en N4`;
}

function buildAutoAiFallback(context) {
    if (!context || !context.routes || !context.routes.cw || !context.routes.ccw) {
        return {
            n9: 'ESPERAR',
            n4: 'ESPERAR',
            analysis: 'Sin medidas matematicas activas para analizar.'
        };
    }

    const dom8 = context.dominance8 || {};
    const mom15 = context.momentum15 || {};
    const cw = context.routes.cw;
    const ccw = context.routes.ccw;

    const scoreCW = (Number(cw.hitRate) || 0) + ((Number(mom15.cw) || 0) * 4) + ((Number(dom8.cw) || 0) * 2);
    const scoreCCW = (Number(ccw.hitRate) || 0) + ((Number(mom15.ccw) || 0) * 4) + ((Number(dom8.ccw) || 0) * 2);
    const zoneBigScore = ((Number(mom15.big) || 0) * 4) + ((Number(dom8.big) || 0) * 2);
    const zoneSmallScore = ((Number(mom15.small) || 0) * 4) + ((Number(dom8.small) || 0) * 2);

    const routeKey = scoreCW >= scoreCCW ? 'cw' : 'ccw';
    const zoneKey = zoneBigScore > zoneSmallScore ? 'big' : 'small';
    const route = context.routes[routeKey];
    const routeLabel = routeKey.toUpperCase();
    const zoneLabel = zoneKey.toUpperCase();
    const stability = String(context.stabilityLevel || 'red').toLowerCase();
    const safeMode = String(context.mode || 'SAFE').toUpperCase() === 'SAFE';
    const patternText = summarizePatternContext(context, routeKey);

    if (safeMode && stability === 'red' && Math.abs(scoreCW - scoreCCW) < 8) {
        return {
            n9: 'ESPERAR',
            n4: 'ESPERAR',
            analysis: `SAFE: ${patternText}; mesa ${stability.toUpperCase()} sin ventaja clara.`
        };
    }

    return {
        n9: String(route.n9),
        n4: zoneKey === 'big' ? String(route.n4Big) : String(route.n4Small),
        analysis: `${patternText}. Ruta ${routeLabel}, zona ${zoneLabel}.`
    };
}

function buildAutoAiUserPrompt(context) {
    const dom8 = context.dominance8 || {};
    const mom15 = context.momentum15 || {};
    const perf8 = context.performance8 || {};
    const cw = context.routes.cw;
    const ccw = context.routes.ccw;

    return [
        `MODO: ${String(context.mode || 'SAFE').toUpperCase()}`,
        `ESTABILIDAD: ${String(context.stabilityLevel || 'red').toUpperCase()}`,
        `PATRON TRAVEL: ${context.patternLabel || 'Sin patron'}`,
        `DOMINANCIA 8T: CW=${dom8.cw || 0} CCW=${dom8.ccw || 0} BIG=${dom8.big || 0} SMALL=${dom8.small || 0}`,
        `MOMENTUM 15T: CW=${mom15.cw || 0} CCW=${mom15.ccw || 0} BIG=${mom15.big || 0} SMALL=${mom15.small || 0}`,
        `PERF 8T CW_N9=${perf8.cwN9 || 'Sin datos'} | CW_N4=${perf8.cwN4 || 'Sin datos'}`,
        `PERF 8T CCW_N9=${perf8.ccwN9 || 'Sin datos'} | CCW_N4=${perf8.ccwN4 || 'Sin datos'}`,
        `RUTA CW: N9=${cw.n9}, N4_SMALL=${cw.n4Small}, N4_BIG=${cw.n4Big}, HIT_RATE=${cw.hitRate}%`,
        `RUTA CCW: N9=${ccw.n9}, N4_SMALL=${ccw.n4Small}, N4_BIG=${ccw.n4Big}, HIT_RATE=${ccw.hitRate}%`,
        `ULTIMOS_NUMEROS: ${(context.recentNumbers || []).join(',') || 'Sin datos'}`,
        'Recuerda: SMALL es 1-9 y BIG es 10-18.',
        'Recuerda: en CW el objetivo BIG es N4_BIG y en CCW el objetivo BIG es N4_BIG.',
        '',
        'COLORES DE ESTABILIDAD:',
        '- VERDE: Mesa en BLOQUES. Las direcciones salen en grupos largos (DER DER DER DER IZQ IZQ IZQ IZQ). Tiene doble tendencia o estructura fuerte. MEJOR MOMENTO para operar. Alta confianza.',
        '- AMARILLO: Transicion. La mesa esta cambiando. Puede estar saliendo de bloques a turbulencia o viceversa. Precaucion media.',
        '- ROJO: Mesa dificil. Las direcciones no forman bloques grandes, son patrones cortos (DER IZQ DER DER IZQ DER IZQ). Necesita mas lectura de patrones W/L para encontrar ventaja.',
        '',
        'FILOSOFIA DE LECTURA:',
        '- Esto no es un codigo rigido; es una lectura probabilistica con azar y fluctuaciones naturales.',
        '- No asumas que un patron se cumple perfecto; evalua continuidad, desgaste, rebote, ruptura y falsa ruptura.',
        '- Si la mesa fluctua pero mantiene una estructura viva, aun puedes leer ventaja parcial.',
        '',
        'GUIA DE PATRONES W/L (aplica al historial WIN/LOSS de CADA DIRECCION, no a la mesa en general):',
        '- REGLA PRINCIPAL: Los patrones se repiten. Cambia JUSTO ANTES de la perdida esperada.',
        '',
        '- BASICOS REPETITIVOS:',
        '  Racha (WWWL WWWL): 3 W y 1 L, se repite. Cambia antes de la L.',
        '  Alternando (WLWL WLWL): Alterna cada vez. Muy predecible.',
        '  Doble victoria (WWL WWL): 2 W y 1 L, se repite.',
        '  Pasos (WWLWL WWLWL): Patron de 5 pasos que se repite.',
        '  En grupo: Despues de W,L vienen +2W porque el patron se desarrolla.',
        '',
        '- TENDENCIA:',
        '  Ascendente: 1W-L, 2W-L, 3W-L. Las W crecen entre cada L. Sube.',
        '  Descendente: 3W-L, 2W-L, 1W-L. Las W bajan. Peligro, puede venir racha de L.',
        '',
        '- PATRONES PODEROSOS:',
        '  Rodillo (WLWLWL): Ida y vuelta constante. No hay rachas largas.',
        '  Ola (WWLLWWLL): 2 buenas, 2 malas, se repite. Alerta antes de las 2 L.',
        '  Bambu (WWWLLWWWLL): 3 suben, 2 bajan, luego otra vez. Tras 2 L, observa la subida.',
        '  Pico (WWWWLWWWWL): Larga racha de W y 1 L fuerte. Puede venir gran perdida.',
        '  Trampa (WLLWLLWLL): 1 W te atrapa en L. Cuidado despues de la W solitaria.',
        '',
        'OBSERVACIONES ESTRATEGICAS: BLOQUES, TURBULENCIA Y FAROLES (Son patrones a analizar, NO reglas fijas - es una mesa de azar):',
        '- DOMINANCIA Y FAROLES: Cuando hay una dominancia clara (ej: BIG BIG BIG BIG BIG), puede saltar a la contraria (SMALL SMALL), y luego volver a la original. A ese salto temporal le llamamos "farol" o mini-turbulencia.',
        '- El farol NO tiene una longitud exacta (puede ser 2, 3, o indefinidos tiros). Analiza si es un simple farol o si la dominancia realmente ha cambiado.',
        '- BLOQUES Y TURBULENCIA: A veces la mesa entra en modo bloques (ej: DER DER DER DER IZQ IZQ IZQ IZQ).',
        '- Al final de un bloque, suele aparecer una "turbulencia" (patrones cortos y rotos).',
        '- Si es una MINI-turbulencia, la mesa puede volver a seguir en bloques. ¡OJO! El siguiente bloque NO necesariamente es en la direccion contraria, puede mantenerse en la misma direccion.',
        '- Si la turbulencia es GRANDE o prolongada, por lo general los bloques terminan y entras en fase de turbulencia pura (no hay bloques grandes).',
        '- Tu trabajo es ANALIZAR la grafica: si hubo turbulencia y luego estable, puede que toque turbulencia de nuevo, o bloque. Predice leyendo el flujo, no hay nada fijo.',
        '- En fases de turbulencia donde los bloques no te guian, apoyate fuertemente en los PATRONES W/L de cada direccion.',
        '',
        'MODOS DE DECISION:',
        '- SAFE: Opera solo con estructura clara, bloques limpios, dominancia fuerte o patrones repetitivos. Si mesa en ROJO sin ventaja, responde ESPERAR.',
        '- FULL: Siempre elige la mejor opcion, incluso en turbulencia. No buscas certeza total, buscas la mejor lectura relativa.',
        '- En SAFE prioriza VERDE + bloques + patrones fuertes.',
        '- En FULL puedes anticipar, seguir, romper o sostener segun el flujo.',
        '',
        'Elige SOLO entre estas 6 medidas. No inventes numeros.',
        'Tu analysis DEBE mencionar: patron identificado (racha, ola, bambu, rodillo, trampa, pico, bloque, turbulencia, farol, mixto) + razon de la eleccion.',
        'Responde JSON exacto con: {"route":"CW|CCW|ESPERAR","zone":"SMALL|BIG|ESPERAR","n9":"numero o ESPERAR","n4":"numero o ESPERAR","analysis":"max 25 palabras"}.'
    ].join('\n');
}

function normalizeAutoAiResponse(parsed, context, fallback) {
    const cw = context.routes.cw;
    const ccw = context.routes.ccw;
    const allowedN9 = [String(cw.n9), String(ccw.n9)];
    const allowedN4 = [String(cw.n4Small), String(cw.n4Big), String(ccw.n4Small), String(ccw.n4Big)];

    let route = String(parsed.route || parsed.direccion || '').toUpperCase();
    let zone = String(parsed.zone || parsed.zona || '').toUpperCase();
    let n9 = cleanAutoNumber(parsed.n9);
    let n4 = cleanAutoNumber(parsed.n4);
    const analysis = String(parsed.analysis || parsed.reason || fallback.analysis || '').trim();

    if (!allowedN9.includes(n9)) {
        if (route === 'CW') n9 = String(cw.n9);
        else if (route === 'CCW') n9 = String(ccw.n9);
        else n9 = fallback.n9;
    }

    if (!allowedN4.includes(n4)) {
        if (route === 'CW' && zone === 'SMALL') n4 = String(cw.n4Small);
        else if (route === 'CW' && zone === 'BIG') n4 = String(cw.n4Big);
        else if (route === 'CCW' && zone === 'SMALL') n4 = String(ccw.n4Small);
        else if (route === 'CCW' && zone === 'BIG') n4 = String(ccw.n4Big);
        else n4 = fallback.n4;
    }

    if (!allowedN9.includes(n9)) n9 = fallback.n9;
    if (!allowedN4.includes(n4)) n4 = fallback.n4;

    if (n9 === 'ESPERAR' || n4 === 'ESPERAR') {
        return { reply: formatAutoReply('ESPERAR', 'ESPERAR'), analysis: analysis || fallback.analysis };
    }

    return {
        reply: formatAutoReply(n9, n4),
        analysis: analysis || fallback.analysis
    };
}

// ─── AI COLLABORATION ENDPOINTS (V5 GEMINI) ────────────────────────

// ---------------------------------------------------
// Groq LLM endpoint (Llama 4 via Groq API)
// ---------------------------------------------------
app.post('/api/ai/groq', async (req, res) => {
    const { prompt, autoAiContext } = req.body;
    try {
        const fallback = buildAutoAiFallback(autoAiContext);
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) {
            return res.json({
                reply: formatAutoReply(fallback.n9, fallback.n4),
                analysis: fallback.analysis
            });
        }

        const systemPrompt = autoAiContext
            ? [
                'Eres el motor AUTO AI de ROULETTE-CLASSIC.',
                'Trabajas sobre travel, cuadro, grafica, color de estabilidad, hit rate, momentum, patrones W/L y estrategia de bloques.',
                '',
                'REGLAS TECNICAS:',
                '- SMALL = 1-9 casillas. BIG = 10-18 casillas.',
                '- En CW, el objetivo BIG es N4_BIG de CW. En CCW, el objetivo BIG es N4_BIG de CCW.',
                '- Solo puedes elegir entre las 6 medidas calculadas por el motor.',
                '- Compara hit rate CW vs CCW y el momentum de los ultimos 15 tiros.',
                '',
                'COLORES DE ESTABILIDAD (significado real):',
                '- VERDE: La mesa sale en BLOQUES claros (DER DER DER DER IZQ IZQ IZQ IZQ). Tiene doble tendencia o estructura fuerte. Es el mejor momento para operar.',
                '- AMARILLO: Transicion. La mesa esta cambiando de estructura. Puede estar saliendo de bloques a turbulencia o viceversa. Precaucion.',
                '- ROJO: Mesa dificil de leer, no necesariamente caos. Las direcciones no forman bloques grandes, son patrones cortos tipo DER IZQ DER DER IZQ DER IZQ IZQ. Necesita mas lectura de patrones W/L.',
                '',
                'PATRONES W/L DETALLADOS (Guia de Patrones):',
                '- REGLA PRINCIPAL: Los patrones se repiten. Al observar un patron, cambia JUSTO ANTES de que ocurra la perdida o espera.',
                '',
                '1. PATRONES BASICOS REPETITIVOS:',
                '  - Racha de victorias (WWWL): 3 victorias y luego 1 perdida, se repite. Cambia o espera antes de la L.',
                '  - Alternando (WLWL): Alterna cada vez. Muy predecible. Sigue el ritmo.',
                '  - Doble victoria (WWL WWL): 2 victorias y luego 1 perdida, se repite. Cambia antes de la L.',
                '  - Patron de pasos (WWLWL WWLWL): Este patron exacto de 5 pasos se repite.',
                '  - Patron en grupo: Despues de W,L vienen mas de 2 victorias porque el patron se esta desarrollando. Confia en la estructura.',
                '',
                '2. PATRONES DE TENDENCIA:',
                '  - Tendencia ascendente: 1W luego L, 2W luego L, 3W luego L. Las victorias aumentan con una L entre cada grupo. La tendencia sube. Cambia antes de la L.',
                '  - Tendencia descendente: 3W luego L, 2W luego L, 1W luego L. Las victorias disminuyen con una L entre cada grupo. Despues puede venir racha de perdidas. Ten cuidado.',
                '',
                '3. OTROS PATRONES PODEROSOS:',
                '  - El rodillo (WLWLWL): Ida y vuelta. Muy comun. No hay rachas largas.',
                '  - La ola (WWLLWWLL): 2 buenas, 2 malas. Se repite. Mantente alerta antes de las 2 perdidas.',
                '  - El bambu (WWWLLWWWLL): 3 suben, 2 bajan. Luego otra vez. Despues de 2 perdidas, observa el siguiente aumento.',
                '  - El pico (WWWWLWWWWL): Larga racha de victorias y luego 1 perdida fuerte. Puede venir una gran perdida despues.',
                '  - La trampa (WLLWLLWLL): Da una victoria, luego te atrapa en perdidas. Ten cuidado despues de la W.',
                '',
                '4. ESTRATEGIA AVANZADA Y PROBABILIDAD (NO son reglas fijas):',
                '  - FAROLES: Una dominancia (ej: BIG BIG BIG) puede saltar a la contraria (SMALL SMALL) y volver. El "farol" no tiene longitud exacta (2, 3 o mas tiros). Analiza si es farol o cambio real.',
                '  - CICLO DE BLOQUES: Al final de un bloque suele haber turbulencia (patrones rotos). Si es MINI-turbulencia, pueden volver los bloques (en la misma direccion o en la contraria, no hay regla).',
                '  - TURBULENCIA GRANDE: Si la turbulencia es larga, los bloques desaparecen por un tiempo. Aqui usa la lectura de patrones W/L de cada direccion.',
                '  - Nada es rigido, es una mesa de azar. Predice leyendo el flujo actual.',
                '',
                '- Si el string W/L se acerca a una L esperada o a una trampa, reduce confianza o espera.',
                '- Tu analysis DEBE mencionar el patron identificado, no solo hit rate o momentum.',
                '',
                'SAFE = conservador y selectivo. FULL = agresivo y siempre activo, pero aun asi tecnico.',
                'Responde solo JSON valido.'
            ].join('\n')
            : 'Eres un motor de prediccion. RESPONDE SOLO JSON. PROHIBIDO texto extra.';

        const requestBody = {
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                { role: "user", content: autoAiContext ? buildAutoAiUserPrompt(autoAiContext) : prompt }
            ],
            temperature: 0.15,
            max_tokens: autoAiContext ? 140 : 60,
            response_format: { type: "json_object" }
        };

        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", requestBody, {
            headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" }
        });
        
        let result = response.data.choices[0].message.content.trim();
        try {
            const parsed = JSON.parse(result);
            if (autoAiContext) {
                return res.json(normalizeAutoAiResponse(parsed, autoAiContext, fallback));
            }

            let n9 = String(parsed.n9 || '').replace(/[^0-9]/g, '');
            let n4 = String(parsed.n4 || '').replace(/[^0-9]/g, '');
            res.json({ reply: formatAutoReply(n9 || 'ESPERAR', n4 || 'ESPERAR') });
        } catch(e) {
            if (autoAiContext) {
                return res.json({
                    reply: formatAutoReply(fallback.n9, fallback.n4),
                    analysis: fallback.analysis
                });
            }

            res.json({ reply: 'N9: ESPERAR | N4: ESPERAR' });
        }
    } catch (error) {
        console.error('Groq predictor error:', error.message);
        const fallback = buildAutoAiFallback(req.body.autoAiContext);
        res.json({
            reply: formatAutoReply(fallback.n9, fallback.n4),
            analysis: fallback.analysis
        });
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

        const sysPrompt = `Eres el pata de Santi, su colega analista en la web "ROULETTE CLASSIC". 
Tu nombre es Brain. Eres conversacional, directo y casual.
IMPORTANTE: Si Santi te saluda, SALUDALO de vuelta como un amigo. Si te pregunta algo personal, responde normal.
NO eres un robot de datos. Eres un compañero humano que TAMBIEN sabe de ruleta.
Cuando te pregunten sobre la mesa, usas tu conocimiento: SMALL(1-9), BIG(10-18), CW(Derecha), CCW(Izquierda).
Colores: Verde=Dominancia, Amarillo=Tendencia, Rojo=Caos.
Responde CORTO, maximo 2-3 oraciones. Sin listas, sin markdown, sin asteriscos.`;

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
