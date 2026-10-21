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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.json({
      description: '',
      fallback: true,
      message: 'AI suggestions are unavailable until a Gemini API key is configured. You can still write your description and add the task.',
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
    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: 'Write one concise, practical task description based only on the task title. Do not add a deadline or claim facts that were not provided.',
            }],
          },
          contents: [{
            role: 'user',
            parts: [{ text: `Task title: ${title}` }],
          }],
          generationConfig: { maxOutputTokens: 120 },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      let errorCode = '';
      try {
        const errorBody = await response.json();
        const providerCode = errorBody.error?.status || errorBody.error?.reason;
        if (typeof providerCode === 'string') {
          errorCode = providerCode.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
        }
      } catch (error) {
        console.warn('[AI] Gemini returned an unreadable error response.');
      }

      console.warn(`[AI] Gemini request failed with status ${response.status}${errorCode ? ` (${errorCode})` : ''}.`);
      let message = 'The AI service could not generate a suggestion right now. You can still write your description and add the task.';

      if ((response.status === 400 && errorCode === 'API_KEY_INVALID') || response.status === 401) {
        message = 'Gemini rejected the configured API key. Replace it with a valid key in .env, then recreate the backend service.';
      } else if (response.status === 403) {
        message = 'Google denied this project access to Gemini generation. Check that the key belongs to an AI Studio project with Gemini API access and that its API restrictions allow the Generative Language API.';
      } else if (response.status === 429 && ['RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED'].includes(errorCode)) {
        message = 'Gemini reports that the API quota is exhausted. Check the Google AI Studio project quota and try again later.';
      } else if (response.status === 429) {
        message = 'Gemini is rate-limiting requests. Wait a little and try again.';
      } else if (response.status === 404) {
        message = 'The configured Gemini model is unavailable. Check GEMINI_MODEL in .env.';
      }

      return res.json({
        description: '',
        fallback: true,
        message,
      });
    }

    const result = await response.json();
    const description = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();
    if (!description) {
      console.warn('[AI] Gemini returned an empty description.');
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
