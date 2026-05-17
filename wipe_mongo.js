require('dotenv').config();
const mongoose = require('mongoose');

async function wipe() {
    try {
        console.log('Connecting to Mongo for WIPE...');
        await mongoose.connect('mongodb+srv://Mylucky:q76n8CDkGPyAsiVR@mylucky.xtvkiqp.mongodb.net/?retryWrites=true&w=majority&appName=Mylucky');
        
        const collections = ['spins', 'metric_snapshots', 'ai_predictions', 'table_state_snapshots', 'patterns'];
        for (const col of collections) {
            try {
                await mongoose.connection.collection(col).deleteMany({});
                console.log(`Cleared collection: ${col}`);
            } catch (e) {
                console.log(`Collection ${col} not found or already empty.`);
            }
        }
        
        console.log('WIPE COMPLETED SUCCESSFULLY.');
        process.exit(0);
    } catch (e) {
        console.error('WIPE FAILED:', e.message);
        process.exit(1);
    }
}

wipe();
