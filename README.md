# Practical 13 — AI API Integration

This is a separate Practical 13 copy of the Task Management application. It
keeps the previous React frontend and adds an authenticated backend endpoint
that asks OpenAI to suggest a short description for a task title. The suggestion
is placed in the normal editable description field; the user remains in
control of the final task.

## Run with Docker Compose

Requirements: Docker Desktop with Compose v2 and an OpenAI API key for live AI
suggestions. Create/manage a key in the
[OpenAI API dashboard](https://platform.openai.com/api-keys). API usage may
require available billing or credits. The rest of the task app still works when
the key is not configured.

In PowerShell, from the project root:

```powershell
Copy-Item .env.example .env
node -e "const fs=require('node:fs'); const p='.env'; const s=fs.readFileSync(p,'utf8').replace(/^JWT_SECRET=.*$/m,'JWT_SECRET='+require('node:crypto').randomBytes(64).toString('hex')); fs.writeFileSync(p,s)"
notepad .env
```

Paste your key after `OPENAI_API_KEY=` in `.env`. Keep the key private; `.env`
is ignored by Git and excluded from Docker build contexts. Never put it in React
code, a `VITE_` variable, screenshots, or a commit. If no key is available, leave
it blank to exercise the fallback behavior.

Start the application:

```powershell
docker compose up --build -d
docker compose ps
```

Open <http://localhost:5173>, register or sign in, enter a task title, then
choose **Generate description**. Review and edit the suggestion before adding
the task. Stop the containers with:

```powershell
docker compose down
```

## Demonstrate graceful fallback

To test without contacting OpenAI, leave `OPENAI_API_KEY` blank in `.env`,
recreate the backend, and request a description. The UI displays the
unavailable message while manual task entry continues to work:

```powershell
docker compose up -d --force-recreate backend
```

To demonstrate an upstream authentication failure, temporarily set
`OPENAI_API_KEY=invalid-test-key` in `.env`, then run the same command. The
backend returns a fallback message instead of exposing the provider error or
crashing. Restore your real key afterward and recreate the backend again. Never
commit the real key.

## Troubleshooting OpenAI responses

- **Key rejected:** create a new key in the intended OpenAI project and replace
  `OPENAI_API_KEY` in `.env`. Recreate the backend with
  `docker compose up -d --force-recreate backend`.
- **Quota or billing message:** check the project's API usage limits and billing
  in the OpenAI platform. Having a ChatGPT subscription does not necessarily
  include API credit.
- **Model access message:** check that the selected project can use the model
  named in `OPENAI_MODEL`.
- **Changed `.env` but behavior did not change:** recreate the backend as shown
  above so Compose reloads its environment.

## Local tests and frontend build

The tests mock the OpenAI request; they do not use a real API key or make paid
API calls.

```powershell
npm --prefix backend ci
npm --prefix backend test
npm --prefix frontend ci
npm --prefix frontend run build
```

## API behavior

- `POST /api/ai/generate-description` requires the existing bearer-token
  authentication and accepts `{ "title": "..." }`.
- The backend sends only the task title to OpenAI. The API key remains in the
  backend environment.
- Each authenticated user can request a description once per normalized task
  title every minute. The in-memory rate limit is intended for this practical,
  single-process application.
- Missing keys, provider errors, empty responses, and timeouts return a
  user-readable fallback while leaving manual description entry and task
  creation available. Invalid input returns `400`; a rate-limited request
  returns `429`.
- Provider authentication errors, quota exhaustion, rate limits, missing model
  access, and temporary outages have distinct user-readable fallback messages.
  The backend logs only the provider status and a sanitized error code, never
  the key or full provider response.

## Responsible AI and privacy

Task titles are sent to OpenAI when a user requests a description. Do not submit
personal, confidential, regulated, or otherwise sensitive information. The
suggestion can be inaccurate or unsuitable: review and edit it before use. The
feature is optional, and ordinary task management continues to work if the
third-party service is unavailable.
