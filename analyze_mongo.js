require('dotenv').config();
const mongoose = require('mongoose');
const Spin = require('./models/Spin');

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

async function analyze() {
    console.log('--- CONNECTING TO DB ---');
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB.');

        const tables = await Spin.distinct('table_id');
        console.log('Found tables:', tables.join(', '));

        // We focus on table_id 1 (Auto Speed Roulette)
        const tId = tables.includes(1) ? 1 : tables[0];
        console.log(`\nAnalyzing Table ID: ${tId}`);

        const spins = await Spin.find({ table_id: tId }).sort({ id: 1 }).limit(5000).lean();
        console.log(`Total spins fetched: ${spins.length}`);

        if (spins.length < 2) {
            console.log('Not enough spins for pattern analysis.');
            process.exit(0);
        }

        const numbers = spins.map(s => s.number);
        const numCounts = {};
        numbers.forEach(n => numCounts[n] = (numCounts[n] || 0) + 1);

        console.log('\n--- HOT NUMBERS ---');
        const sortedNums = Object.keys(numCounts).sort((a,b) => numCounts[b] - numCounts[a]);
        console.log(sortedNums.slice(0, 10).map(n => `#${n}: ${numCounts[n]} times`).join(' | '));

        console.log('\n--- COLD NUMBERS ---');
        console.log(sortedNums.slice(-10).reverse().map(n => `#${n}: ${numCounts[n]} times`).join(' | '));

        console.log('\n--- REPEATS & STREAKS ---');
        let backToBack = 0;
        let b2bMap = {};
        for(let i=1; i<numbers.length; i++) {
            if(numbers[i] === numbers[i-1]) {
                backToBack++;
                b2bMap[numbers[i]] = (b2bMap[numbers[i]] || 0) + 1;
            }
        }
        console.log(`Total Back-To-Back Repeats: ${backToBack}`);

        console.log('\n--- TRAVEL / MOMENTUM PATTERNS ---');
        const dists = [];
        for(let i=1; i<numbers.length; i++) dists.push(getDist(numbers[i-1], numbers[i]));
        
        const cw = dists.filter(d => d > 0).length;
        const ccw = dists.filter(d => d < 0).length;
        console.log(`Global Direction Bias (last ${dists.length}): CW=${cw} CCW=${ccw}`);

        const avgDist = dists.reduce((a,b) => a + Math.abs(b), 0) / dists.length;
        console.log(`Average Displacement: ${avgDist.toFixed(1)} slots`);

        // Time analysis
        console.log('\n--- TIME PATTERNS ---');
        let gaps = [];
        for(let i=1; i<spins.length; i++) {
            const d1 = new Date(spins[i-1].timestamp).getTime();
            const d2 = new Date(spins[i].timestamp).getTime();
            if (!isNaN(d1) && !isNaN(d2)) {
                gaps.push((d2 - d1) / 1000);
            }
        }
        
        // Filter out extreme gaps (like when bot was off)
        const validGaps = gaps.filter(g => g > 0 && g < 300); // less than 5 minutes
        if (validGaps.length > 0) {
            const avgG = validGaps.reduce((a,b)=>a+b,0) / validGaps.length;
            console.log(`Average spin interval: ${avgG.toFixed(1)} seconds`);
        }

        // Zone clusters
        const bigCount = dists.filter(d => Math.abs(d) >= 10 && Math.abs(d) <= 19).length;
        const smCount = dists.filter(d => Math.abs(d) >= 1 && Math.abs(d) <= 9).length;
        console.log(`\n--- ZONE TRENDS ---`);
        console.log(`BIG (10-18 slots away) hits: ${bigCount}`);
        console.log(`SMALL (1-9 slots away) hits: ${smCount}`);

    } catch (e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
        process.exit(0);
    }
}
analyze();
