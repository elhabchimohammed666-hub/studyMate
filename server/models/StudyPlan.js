const mongoose = require('mongoose');

const studyPlanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  topic: { type: String, required: true, trim: true, maxlength: 120 },
  goal: { type: String, required: true, trim: true, maxlength: 500 },
  currentLevel: { type: String, required: true },
  availableTime: { type: String, required: true },
  deadline: { type: Date, default: null },
  learningObjective: { type: String, required: true },
  expectedOutcome: { type: String, required: true },
  feasibilityNote: { type: String, default: '' },
  activities: [{
    title: { type: String, required: true },
    description: { type: String, required: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    exercises: { type: [String], default: [] }
  }],
}, { timestamps: true });

module.exports = mongoose.model('StudyPlan', studyPlanSchema);
