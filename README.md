# Practical 13 — AI API Integration

This is a separate Practical 13 copy of the Task Management application. It
keeps the previous React frontend and adds an authenticated backend endpoint
that asks Gemini to suggest a short description for a task title. The suggestion
is placed in the normal editable description field; the user remains in
control of the final task.

## Run with Docker Compose

Requirements: Docker Desktop with Compose v2 and a Gemini API key for live AI
suggestions. Create/manage a key in
[Google AI Studio](https://aistudio.google.com/app/apikey). Availability and
quotas depend on the selected Google project and region. The rest of the task
app still works when the key is not configured.

In PowerShell, from the project root:

```powershell
Copy-Item .env.example .env
node -e "const fs=require('node:fs'); const p='.env'; const s=fs.readFileSync(p,'utf8').replace(/^JWT_SECRET=.*$/m,'JWT_SECRET='+require('node:crypto').randomBytes(64).toString('hex')); fs.writeFileSync(p,s)"
notepad .env
```

Paste your key after `GEMINI_API_KEY=` in `.env`. Keep the key private; `.env`
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

To test without contacting Gemini, leave `GEMINI_API_KEY` blank in `.env`,
recreate the backend, and request a description. The UI displays the
unavailable message while manual task entry continues to work:

```powershell
docker compose up -d --force-recreate backend
```

To demonstrate an upstream authentication failure, temporarily set
`GEMINI_API_KEY=invalid-test-key` in `.env`, then run the same command. The
backend returns a fallback message instead of exposing the provider error or
crashing. Restore your valid key afterward and recreate the backend again.
Never commit the real key.

## Troubleshooting Gemini responses

- **Key rejected:** create a new key in the intended Google AI Studio project
  and replace `GEMINI_API_KEY` in `.env`. Recreate the backend with
  `docker compose up -d --force-recreate backend`.
- **Quota or usage-limit message:** check the selected Gemini project's quota
  and usage limits in Google AI Studio.
- **Project access denied:** verify the key comes from a Google AI Studio
  project with Gemini API access. If the key has API restrictions, allow the
  Generative Language API for server-side requests.
- **Model access message:** check that the selected project and region can use
  the model named in `GEMINI_MODEL`.
- **Changed `.env` but behavior did not change:** recreate the backend as shown
  above so Compose reloads its environment.

## Local tests and frontend build

The tests mock the Gemini request; they do not use a real API key or call the
external service.

```powershell
npm --prefix backend ci
npm --prefix backend test
npm --prefix frontend ci
npm --prefix frontend run build
```

## API behavior

- `POST /api/ai/generate-description` requires the existing bearer-token
  authentication and accepts `{ "title": "..." }`.
- The backend sends only the task title to Gemini. The API key remains in the
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

Task titles are sent to Gemini when a user requests a description. Do not submit
personal, confidential, regulated, or otherwise sensitive information. The
suggestion can be inaccurate or unsuitable: review and edit it before use. The
feature is optional, and ordinary task management continues to work if the
third-party service is unavailable.
