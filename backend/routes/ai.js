const express = require('express');
const auth = require('../middleware/auth');

const router = express.Router();
const requestTimes = new Map();
const RATE_LIMIT_MS = 60 * 1000;
const MAX_TITLE_LENGTH = 160;

router.use(auth);

router.post('/generate-description', async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';

  if (!title) {
    return res.status(400).json({ error: 'A task title is required.' });
  }

  if (title.length > MAX_TITLE_LENGTH) {
    return res.status(400).json({
      error: `Task titles must be ${MAX_TITLE_LENGTH} characters or fewer.`,
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.json({
      description: '',
      fallback: true,
      message: 'AI suggestions are unavailable until an OpenAI API key is configured. You can still write your description and add the task.',
    });
  }

  const now = Date.now();
  for (const [key, requestedAt] of requestTimes) {
    if (now - requestedAt >= RATE_LIMIT_MS) {
      requestTimes.delete(key);
    }
  }

  const rateLimitKey = `${req.user.id}:${title.toLowerCase()}`;
  const previousRequest = requestTimes.get(rateLimitKey);
  if (previousRequest && now - previousRequest < RATE_LIMIT_MS) {
    return res.status(429).json({
      error: 'A description was already requested for this task. Please wait one minute before trying again.',
    });
  }
  requestTimes.set(rateLimitKey, now);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        max_tokens: 120,
        messages: [
          {
            role: 'system',
            content: 'Write one concise, practical task description based only on the task title. Do not add a deadline or claim facts that were not provided.',
          },
          { role: 'user', content: `Task title: ${title}` },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`[AI] OpenAI request failed with status ${response.status}.`);
      return res.json({
        description: '',
        fallback: true,
        message: 'The AI service could not generate a suggestion right now. You can still write your description and add the task.',
      });
    }

    const result = await response.json();
    const description = result.choices?.[0]?.message?.content?.trim();
    if (!description) {
      console.warn('[AI] OpenAI returned an empty description.');
      return res.json({
        description: '',
        fallback: true,
        message: 'The AI service returned no suggestion. You can still write your description and add the task.',
      });
    }

    return res.json({
      description,
      fallback: false,
      message: 'AI-generated suggestion. Review and edit it before adding the task.',
    });
  } catch (error) {
    const reason = error.name === 'TimeoutError' ? 'request timed out' : error.message;
    console.error(`[AI] Description generation failed: ${reason}`);
    return res.json({
      description: '',
      fallback: true,
      message: 'The AI service is temporarily unavailable. You can still write your description and add the task.',
    });
  }
});

module.exports = router;
