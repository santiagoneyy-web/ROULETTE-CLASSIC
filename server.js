// server.js — DIR + Analyst + Sniper + Data Pipeline
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const predictor = require('./predictor');
const spinMethod = require('./spin_method');

const app = express();
const PORT = process.env.PORT || 3000;

const sseClients = {};

setInterval(() => {
    Object.keys(sseClients).forEach(tableId => {
        sseClients[tableId].forEach(client => {
            try { client.write('data: {"type":"ping"}\n\n'); } catch (e) {}
        });
    });
}, 25000);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

db.initDB();

app.get('/api/tables', (req, res) => {
    db.getTables((err, tables) => {
        if (err || !tables?.length) {
            return res.json([{ id: 1, name: 'Auto Roulette' }]);
        }
        res.json(tables);
    });
});

app.get('/api/events/:tableId', (req, res) => {
    const tableId = req.params.tableId;
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.write('data: {"type":"connected"}\n\n');
    if (!sseClients[tableId]) sseClients[tableId] = [];
    sseClients[tableId].push(res);
    req.on('close', () => {
        sseClients[tableId] = (sseClients[tableId] || []).filter(c => c !== res);
    });
});

app.get('/api/history/:tableId', (req, res) => {
    db.getHistory(req.params.tableId, 100, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.get('/api/predict/:tableId', async (req, res) => {
    try {
        const rows = await new Promise((resolve, reject) => {
            db.getHistory(req.params.tableId, 100, (err, r) => err ? reject(err) : resolve(r));
        });
        const nums = rows.map(s => s.number);
        if (nums.length < 3) return res.json({ message: 'Need more data' });

        const signature = predictor.computeDealerSignature(nums);
        const signals = predictor.getIAMasterSignals([], signature, nums);

        res.json({ signature, signals });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/spin', async (req, res) => {
    const { table_id, number } = req.body;
    if (table_id == null || number == null) return res.status(400).json({ error: 'Missing fields' });
    if (number < 0 || number > 36) return res.status(400).json({ error: 'Number must be 0-36' });

    res.json({ status: 'received', table_id, number });

    (async () => {
        try {
            await new Promise((resolve, reject) => {
                db.addSpin(table_id, number, 'bot', {}, (err, id) => {
                    if (err) return reject(err);
                    resolve(id);
                });
            });

            if (sseClients[table_id]) {
                sseClients[table_id].forEach(client => {
                    try { client.write(`data: ${JSON.stringify({ type: 'new_spin', number })}\n\n`); } catch (e) {}
                });
            }
        } catch (e) { console.error('[Spin Save Error]', e); }
    })();
});

app.delete('/api/wipe-all', async (req, res) => {
    try {
        db.wipeAllSpins((err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Base operativa vaciada.' });
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/spin-method/analyze/:tableId', async (req, res) => {
    try {
        const results = await spinMethod.analyze(db, req.params.tableId);
        res.json(results);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/spin-method/results', (req, res) => {
    try {
        const file = path.join(__dirname, 'spin_method_results.json');
        if (fs.existsSync(file)) {
            res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
        } else {
            res.json({ status: 'no_data' });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎰 Server running at http://0.0.0.0:${PORT}`);
});
