const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'practical-13-test-secret';

const app = require('./app');

const authHeader = () => `Bearer ${jwt.sign({ id: 'test-user' }, process.env.JWT_SECRET)}`;

describe('Task Management API', () => {
  test('GET /api/tasks rejects requests without authentication', async () => {
    const response = await request(app).get('/api/tasks');

    expect(response.statusCode).toBe(401);
    expect(response.body.error).toMatch(/no token/i);
  });

  test('POST /api/auth/register rejects invalid registration data', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Student' });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(response.body.details.map((detail) => detail.field)).toEqual(
      expect.arrayContaining(['email', 'password'])
    );
  });
});

describe('AI description endpoint', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-api-key';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
  });

  test('requires authentication', async () => {
    const response = await request(app)
      .post('/api/ai/generate-description')
      .send({ title: 'Prepare presentation' });

    expect(response.statusCode).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects missing task titles', async () => {
    const response = await request(app)
      .post('/api/ai/generate-description')
      .set('Authorization', authHeader())
      .send({ title: '   ' });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(/title is required/i);
  });

  test('returns an editable description from Gemini', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: 'Gather the key points and prepare clear presentation slides.' }],
          },
        }],
      }),
    });

    const response = await request(app)
      .post('/api/ai/generate-description')
      .set('Authorization', authHeader())
      .send({ title: 'Prepare presentation for class' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      description: 'Gather the key points and prepare clear presentation slides.',
      fallback: false,
      message: 'AI-generated suggestion. Review and edit it before adding the task.',
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-api-key');
    expect(global.fetch.mock.calls[0][0]).toContain('/models/gemini-3.8-flash:generateContent');
  });

  test('returns a useful fallback when the API key is not configured', async () => {
    delete process.env.GEMINI_API_KEY;

    const response = await request(app)
      .post('/api/ai/generate-description')
      .set('Authorization', authHeader())
      .send({ title: 'Prepare presentation without API key' });

    expect(response.statusCode).toBe(200);
    expect(response.body.fallback).toBe(true);
    expect(response.body.description).toBe('');
    expect(response.body.message).toMatch(/Gemini API key is configured/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('explains when Gemini rejects the configured API key without exposing provider details', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'sensitive provider response', status: 'API_KEY_INVALID' } }),
    });
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await request(app)
      .post('/api/ai/generate-description')
      .set('Authorization', authHeader())
      .send({ title: 'Prepare presentation with a rejected Gemini key' });

    expect(response.statusCode).toBe(200);
    expect(response.body.fallback).toBe(true);
    expect(response.body.message).toMatch(/Gemini rejected the configured API key/i);
    expect(JSON.stringify(response.body)).not.toContain('sensitive provider response');
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('API_KEY_INVALID'));
  });

  test('explains when the Gemini project has exhausted its API quota', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'sensitive provider response', status: 'RESOURCE_EXHAUSTED' } }),
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await request(app)
      .post('/api/ai/generate-description')
      .set('Authorization', authHeader())
      .send({ title: 'Prepare presentation with unavailable Gemini quota' });

    expect(response.statusCode).toBe(200);
    expect(response.body.fallback).toBe(true);
    expect(response.body.message).toMatch(/Gemini reports that the API quota is exhausted/i);
    expect(JSON.stringify(response.body)).not.toContain('sensitive provider response');
  });

  test('explains when Google denies Gemini generation access to the project', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'sensitive provider response', status: 'PERMISSION_DENIED' } }),
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await request(app)
      .post('/api/ai/generate-description')
      .set('Authorization', authHeader())
      .send({ title: 'Prepare presentation with denied project access' });

    expect(response.statusCode).toBe(200);
    expect(response.body.fallback).toBe(true);
    expect(response.body.message).toMatch(/Google denied this project access to Gemini generation/i);
    expect(JSON.stringify(response.body)).not.toContain('sensitive provider response');
  });

  test('gracefully handles a timed-out Gemini request', async () => {
    global.fetch.mockRejectedValue(new Error('request timed out'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(app)
      .post('/api/ai/generate-description')
      .set('Authorization', authHeader())
      .send({ title: 'Prepare presentation after timeout' });

    expect(response.statusCode).toBe(200);
    expect(response.body.fallback).toBe(true);
    expect(response.body.message).toMatch(/temporarily unavailable/i);
  });

  test('limits repeated requests for the same task title to one per minute', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: 'Review the project requirements and outline the implementation steps.' }],
          },
        }],
      }),
    });

    const sendRequest = () => request(app)
      .post('/api/ai/generate-description')
      .set('Authorization', authHeader())
      .send({ title: 'Unique rate limit test task' });

    const firstResponse = await sendRequest();
    const secondResponse = await sendRequest();

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(429);
    expect(secondResponse.body.error).toMatch(/wait one minute/i);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
