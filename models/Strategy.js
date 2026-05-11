const mongoose = require('mongoose');

const StrategySchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    table_id: { type: String, default: 'global', index: true },
    name: { type: String, required: true },
    summary: { type: String, required: true },
    source: { type: String, enum: ['human', 'ai', 'system'], default: 'human', index: true },
    origin: { type: String, default: 'manual' },
    status: { type: String, enum: ['candidate', 'active', 'validated', 'inactive'], default: 'active', index: true },
    pattern: { type: String, default: '' },
    trigger: { type: String, default: '' },
    action: { type: String, default: '' },
    tags: [{ type: String }],
    confidence_weight: { type: Number, default: 1 },
    success_hits: { type: Number, default: 0 },
    fail_hits: { type: Number, default: 0 },
    last_used_at: { type: Date, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

StrategySchema.index({ table_id: 1, source: 1, status: 1 });

StrategySchema.pre('save', function updateTimestamp(next) {
    this.updated_at = new Date();
    next();
});

module.exports = mongoose.model('Strategy', StrategySchema);
