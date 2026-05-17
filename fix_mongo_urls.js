require('dotenv').config();
const mongoose = require('mongoose');

async function fixMongo() {
    try {
        console.log('Connecting to Mongo to FIX URL...');
        await mongoose.connect('mongodb+srv://Mylucky:q76n8CDkGPyAsiVR@mylucky.xtvkiqp.mongodb.net/?retryWrites=true&w=majority&appName=Mylucky');
        
        const Table = mongoose.connection.collection('tables');
        await Table.updateOne({ id: 1 }, { $set: { url: 'https://gamblingcounting.com/evolution-auto-roulette' } });
        await Table.updateOne({ id: 2 }, { $set: { url: 'https://gamblingcounting.com/evolution-immersive-roulette' } });
        
        console.log('MONGO DATABASE FIXED: URLs updated to GamblingCounting.');
        process.exit(0);
    } catch (e) {
        console.error('MONGO FIX FAILED:', e.message);
        process.exit(1);
    }
}

fixMongo();
