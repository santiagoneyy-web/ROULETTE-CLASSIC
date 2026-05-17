// server.js — Simplified: DIR + Analyst + Sniper only
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const Spin = require('./models/Spin');
const predictor = require('./predictor');
const spinMethod = require('./spin_method');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

db.initDB();

// Basic endpoints
app.get('/api/tables', (req, res) => {
    db.getTables((err, tables) => {
        if (err || !tables?.length) {
            return res.json([{ id: 1, name: 'Auto Roulette' }]);
        }
        res.json(tables);
    });
});

app.get('/api/history/:tableId', (req, res) => {
    db.getHistory(req.params.tableId, 100, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
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
    
    res.json({ status: 'received', table_id, number });
    
    // Background processing
    (async () => {
        try {
            const maxSpin = await Spin.findOne().sort('-id').exec();
            const newId = maxSpin ? maxSpin.id + 1 : 1;
            const newSpin = new Spin({
                id: newId, table_id, number,
                source: 'bot', ingested_at: new Date()
            });
            await newSpin.save();
        } catch(e) { console.error('[Spin Save Error]', e); }
    })();
});

// Spin Method Analysis
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎰 Server running at http://0.0.0.0:${PORT}`);
});
