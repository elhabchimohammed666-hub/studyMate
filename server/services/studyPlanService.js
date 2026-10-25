const SYSTEM_PROMPT = `You are StudyMate, a realistic educational planning assistant. Create a progressive, practical study plan tailored to the learner. Do not promise mastery or exam success. If the goal is unrealistic for the time available, explain why and narrow the scope. Return only valid JSON with this exact shape:
{
  "learningObjective": "string",
  "expectedOutcome": "string",
  "feasibilityNote": "string (empty if realistic)",
  "activities": [
    {
      "title": "specific activity",
      "description": "what to learn and do",
      "durationMinutes": 30,
      "exercises": ["concrete practice exercise"]
    }
  ]
}
Include 4-10 ordered activities, with realistic positive integer durationMinutes values. Use useful, topic-specific exercises.`;

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object' ||
      typeof plan.learningObjective !== 'string' || !plan.learningObjective.trim() ||
      typeof plan.expectedOutcome !== 'string' || !plan.expectedOutcome.trim() ||
      typeof plan.feasibilityNote !== 'string' ||
      !Array.isArray(plan.activities) || plan.activities.length < 1 || plan.activities.length > 20) {
    throw new Error('The AI returned an incomplete study plan.');
  }
  const activities = plan.activities.map((activity) => {
    const durationMinutes = Number(activity.durationMinutes);
    if (typeof activity.title !== 'string' || !activity.title.trim() ||
        typeof activity.description !== 'string' || !activity.description.trim() ||
        !Number.isInteger(durationMinutes) || durationMinutes < 1 ||
        !Array.isArray(activity.exercises) ||
        activity.exercises.some((exercise) => typeof exercise !== 'string')) {
      throw new Error('The AI returned an invalid study activity.');
    }
    return {
      title: activity.title.trim(),
      description: activity.description.trim(),
      durationMinutes,
      exercises: activity.exercises.map((exercise) => exercise.trim()).filter(Boolean).slice(0, 5)
    };
  });
  return {
    learningObjective: plan.learningObjective.trim(),
    expectedOutcome: plan.expectedOutcome.trim(),
    feasibilityNote: plan.feasibilityNote.trim(),
    activities
  };
}

async function generateStudyPlan(input) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('Study plan generation is not configured. Add OPENAI_API_KEY to the server environment.');
    error.status = 503;
    throw error;
  }

  const response = await fetch(process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            topic: input.topic,
            learningGoal: input.goal,
            currentLevel: input.currentLevel,
            availableStudyTime: input.availableTime,
            deadline: input.deadline || 'No deadline'
          })
        }
      ]
    }),
    signal: AbortSignal.timeout(45000)
  });

  if (!response.ok) {
    const details = await response.text();
    console.error('AI provider request failed:', response.status, details.slice(0, 500));
    const error = new Error(response.status === 429
      ? 'The AI service is busy. Please try again shortly.'
      : 'The AI service could not generate a plan right now.');
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('The AI returned an empty response.');
  try {
    return validatePlan(JSON.parse(content));
  } catch (error) {
    console.error('AI response validation failed:', error.message);
    throw new Error('The AI returned a plan in an unsupported format. Please try again.');
  }
}

module.exports = { generateStudyPlan, validatePlan };
