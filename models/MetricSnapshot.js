const mongoose = require('mongoose');

const MetricSnapshotSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    table_id: { type: Number, required: true, index: true },
    spin_id: { type: Number, default: null, index: true },
    recent_numbers: [{ type: Number }],
    stability_level: { type: String, default: 'red' },
    pattern_label: { type: String, default: '' },
    dominance8: {
        cw: { type: Number, default: 0 },
        ccw: { type: Number, default: 0 },
        big: { type: Number, default: 0 },
        small: { type: Number, default: 0 }
    },
    momentum15: {
        cw: { type: Number, default: 0 },
        ccw: { type: Number, default: 0 },
        big: { type: Number, default: 0 },
        small: { type: Number, default: 0 }
    },
    performance8: {
        cwN9: { type: String, default: '' },
        cwN4: { type: String, default: '' },
        ccwN9: { type: String, default: '' },
        ccwN4: { type: String, default: '' }
    },
    routes: {
        cw: {
            n9: { type: Number, default: null },
            n4Small: { type: Number, default: null },
            n4Big: { type: Number, default: null },
            hitRate: { type: Number, default: 0 }
        },
        ccw: {
            n9: { type: Number, default: null },
            n4Small: { type: Number, default: null },
            n4Big: { type: Number, default: null },
            hitRate: { type: Number, default: 0 }
        }
    },
    captured_at: { type: Date, default: Date.now, index: true }
});

MetricSnapshotSchema.index({ table_id: 1, captured_at: -1 });

module.exports = mongoose.model('MetricSnapshot', MetricSnapshotSchema);
