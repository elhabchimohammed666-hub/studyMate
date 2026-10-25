const test = require('node:test');
const assert = require('node:assert/strict');
const { generateStudyPlan, validatePlan } = require('./studyPlanService');

test('validates and normalizes a structured study plan', () => {
  const plan = validatePlan({
    learningObjective: '  Write basic SQL queries  ',
    expectedOutcome: ' Build simple reports ',
    feasibilityNote: '',
    activities: [{
      title: '  Practice SELECT  ',
      description: ' Query a sample table ',
      durationMinutes: 30,
      exercises: [' Find all active users ', '']
    }]
  });

  assert.equal(plan.learningObjective, 'Write basic SQL queries');
  assert.equal(plan.activities[0].title, 'Practice SELECT');
  assert.deepEqual(plan.activities[0].exercises, ['Find all active users']);
});

test('rejects plans with missing objectives or invalid activities', () => {
  assert.throws(() => validatePlan({ activities: [] }), /incomplete study plan/i);
  assert.throws(() => validatePlan({
    learningObjective: 'Learn SQL',
    expectedOutcome: 'Write queries',
    feasibilityNote: '',
    activities: [{ title: 'Practice', description: 'Try queries', durationMinutes: 1.5, exercises: [] }]
  }), /invalid study activity/i);
});

test('reports missing AI configuration without making a network request', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(
      generateStudyPlan({ topic: 'SQL', goal: 'Learn queries', currentLevel: 'Beginner', availableTime: '1 hour/day' }),
      (error) => error.status === 503 && /OPENAI_API_KEY/.test(error.message)
    );
  } finally {
    if (previousKey !== undefined) process.env.OPENAI_API_KEY = previousKey;
  }
});
