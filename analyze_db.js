const Database = require('better-sqlite3');
const db = new Database('./roulette.db', { readonly: true });

function analyze() {
    console.log('--- TABLES ---');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log(tables.map(t => t.name).join(', '));

    let historyTable = tables.find(t => t.name.toLowerCase().includes('spin') || t.name === 'history' || t.name === 'results');
    if (!historyTable) {
        // Let's just find the first table that's not sqlite_sequence
        historyTable = tables.find(t => t.name !== 'sqlite_sequence');
    }
    
    if (!historyTable) {
        console.log('No data table found.');
        return;
    }

    const tName = historyTable.name;
    const count = db.prepare(`SELECT COUNT(*) as c FROM [${tName}]`).get().c;
    console.log(`\nTable: [${tName}] | Rows: ${count}`);

    const cols = db.prepare(`PRAGMA table_info([${tName}])`).all();
    console.log('Columns:', cols.map(c => c.name).join(', '));

    // Get all records ordered by ID or whatever implicit order
    const records = db.prepare(`SELECT * FROM [${tName}]`).all();
    if (records.length === 0) {
        console.log('No records to analyze.');
        return;
    }

    // Numbers count
    const numCounts = {};
    const numbers = [];
    const timeGaps = [];
    let lastTime = null;

    records.forEach(r => {
        let n = r.number;
        if (n === undefined && r.result !== undefined) n = r.result;
        if (n !== undefined) {
            numbers.push(n);
            numCounts[n] = (numCounts[n] || 0) + 1;
        }

        // Time check
        const t = r.timestamp || r.created_at || r.time;
        if (t) {
            const dt = new Date(t).getTime();
            if (lastTime && !isNaN(dt)) {
                timeGaps.push((dt - lastTime) / 1000); // seconds
            }
            lastTime = dt;
        }
    });

    console.log('\n--- TOP HOT NUMBERS ---');
    const sortedNums = Object.keys(numCounts).sort((a,b) => numCounts[b] - numCounts[a]);
    console.log(sortedNums.slice(0, 10).map(n => `#${n}: ${numCounts[n]} times`).join(' | '));

    console.log('\n--- COLD NUMBERS ---');
    console.log(sortedNums.slice(-10).reverse().map(n => `#${n}: ${numCounts[n]} times`).join(' | '));

    console.log('\n--- CONSECUTIVE REPEATS ---');
    let repeats = 0;
    const repMap = {};
    for (let i = 1; i < numbers.length; i++) {
        if (numbers[i] === numbers[i-1]) {
            repeats++;
            repMap[numbers[i]] = (repMap[numbers[i]] || 0) + 1;
        }
    }
    console.log(`Total back-to-back repeats: ${repeats}`);
    if (Object.keys(repMap).length > 0) {
        console.log('Numbers that repeated back-to-back most:', Object.keys(repMap).sort((a,b) => repMap[b] - repMap[a]).map(n => `#${n} (${repMap[n]} times)`).join(', '));
    }

    if (timeGaps.length > 0) {
        const avgGap = timeGaps.reduce((a,b) => a+b, 0) / timeGaps.length;
        const minGap = Math.min(...timeGaps);
        const maxGap = Math.max(...timeGaps);
        console.log(`\n--- TIME ANALYSIS ---`);
        console.log(`Average time between spins: ${avgGap.toFixed(2)} seconds`);
        console.log(`Shortest gap: ${minGap} seconds`);
        console.log(`Longest gap: ${maxGap} seconds`);
    }

    // DISTANCE PATTERNS (using classic wheel)
    const WHEEL_NUMS = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
    function getDist(n1, n2) {
        const i1 = WHEEL_NUMS.indexOf(n1);
        const i2 = WHEEL_NUMS.indexOf(n2);
        if (i1 === -1 || i2 === -1) return 0;
        let d = i2 - i1;
        if (d > 18) d -= 37;
        if (d < -18) d += 37;
        return d;
    }

    const dists = [];
    for (let i = 1; i < numbers.length; i++) {
        const d = getDist(numbers[i-1], numbers[i]);
        dists.push(d);
    }

    console.log('\n--- MOMENTUM & DIRECTION ---');
    const cwCount = dists.filter(d => d > 0).length;
    const ccwCount = dists.filter(d => d < 0).length;
    console.log(`CW Moves: ${cwCount} | CCW Moves: ${ccwCount} | Zero Moves: ${dists.length - cwCount - ccwCount}`);

    // Clusters of distances (are they jumping 10-15 steps often?)
    const distGroups = { '1-9 (Small)': 0, '10-18 (Big)': 0 };
    dists.forEach(d => {
        const absD = Math.abs(d);
        if (absD >= 1 && absD <= 9) distGroups['1-9 (Small)']++;
        if (absD >= 10 && absD <= 18) distGroups['10-18 (Big)']++; // fixed bound to 18
    });
    console.log(`Distance clusters: Small jumps (1-9): ${distGroups['1-9 (Small)']}, Big jumps (10-18): ${distGroups['10-18 (Big)']}`);
}

analyze();
