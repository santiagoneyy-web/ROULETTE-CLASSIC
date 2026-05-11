const mongoose = require('mongoose');

const AiPredictionSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    table_id: { type: Number, required: true, index: true },
    spin_id: { type: Number, default: null, index: true },
    mode: { type: String, enum: ['SAFE', 'FULL'], default: 'SAFE' },
    route: { type: String, enum: ['CW', 'CCW', 'ESPERAR'], default: 'ESPERAR' },
    zone: { type: String, enum: ['SMALL', 'BIG', 'ESPERAR'], default: 'ESPERAR' },
    n9: { type: String, default: 'ESPERAR' },
    n4: { type: String, default: 'ESPERAR' },
    analysis: { type: String, default: '' },
    strategy_refs: [{ type: String }],
    result: { type: String, enum: ['pending', 'win', 'loss', 'skip'], default: 'pending', index: true },
    resolved_number: { type: Number, default: null },
    created_at: { type: Date, default: Date.now, index: true },
    resolved_at: { type: Date, default: null }
});

AiPredictionSchema.index({ table_id: 1, created_at: -1 });

module.exports = mongoose.model('AiPrediction', AiPredictionSchema);
