## License
   © 2026 Elhabchi Mohammed. All Rights Reserved.

# StudyMate

StudyMate is a personal study organizer built with MongoDB, Express, React, and Node.js. It helps students manage subjects and tasks, track deadlines and progress, and turn learning goals into reviewable AI study plans.

## Features

- Private student accounts with registration, login, profile editing, and JWT authentication.
- Subject and task CRUD, including priorities, deadlines, estimated durations, and subject associations.
- Task filters for title, subject, status, and priority; sorting by due date, priority, or creation date.
- Dashboard statistics, subject progress, upcoming deadlines, and overdue task alerts.
- AI-generated learning plans with ordered activities, exercises, duration estimates, objectives, and feasibility notes.
- Explicit plan saving and selective import of plan activities into the task list.
- Responsive dashboard and mobile navigation.

## Requirements

- Node.js 20 or newer.
- MongoDB 6 or newer, running locally or hosted (for example, MongoDB Atlas).
- An OpenAI-compatible API key is optional; it is only required for AI plan generation.

## Run locally

1. Install MongoDB and ensure its service is running, or create a MongoDB Atlas database.
2. Copy `.env.example` to `.env`.
3. Set `MONGO_URI` to your MongoDB connection string and replace `JWT_SECRET` with a long random value.
4. To enable plan generation, configure `OPENAI_API_KEY`. The key remains on the Express server and is never sent to the browser.
5. From the project root, run:

   ```sh
   npm install
   npm --prefix client install
   npm run dev
   ```

6. Open the Vite URL printed in the terminal (configured to use `http://localhost:5174`).

The Vite development server proxies `/api` requests to the Express server at `http://localhost:5000`. Without an AI key, account, subject, task, and progress features continue to work; the planner returns a clear configuration message.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Express port (default `5000`) |
| `MONGO_URI` | MongoDB connection URI (default local StudyMate database) |
| `JWT_SECRET` | Secret used to sign session tokens; required in production |
| `CLIENT_URL` | Optional comma-separated frontend origins allowed by CORS |
| `OPENAI_API_KEY` | Optional key used by the server-side study-plan generator |
| `OPENAI_MODEL` | Optional compatible chat model (default `gpt-4o-mini`) |
| `OPENAI_API_URL` | Optional OpenAI-compatible chat completions endpoint |
| `VITE_API_URL` | Frontend build-time API base URL (for example, `https://studymate-api.onrender.com/api`; defaults to `/api`) |

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET/PATCH /api/auth/me`
- `GET /api/dashboard`
- `GET/POST /api/subjects`, `PATCH/DELETE /api/subjects/:id`
- `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id`
- `GET/POST /api/study-plans`, `DELETE /api/study-plans/:id`
- `POST /api/study-plans/:id/tasks` to add one chosen activity to the task list
- `POST /api/ai/generate` to generate (but not automatically save) a plan

All subject, task, and plan routes require a bearer token. Database queries scope records to the authenticated user.

## Production build

```sh
npm run build
npm start
```

## Deploy online (MongoDB Atlas + Render + Vercel)

Deployment is configured for a separate React static site and Express API. The Vercel rewrite preserves React Router routes such as `/tasks` and `/profile`; Render uses the `/healthz` endpoint to check both the API and its MongoDB connection.

1. **Create the MongoDB Atlas database.** Create a cluster and a database user with a strong password. Copy the Node.js connection URI, replacing the password and database name. In Atlas Network Access, allow connections from Render. Render's outbound addresses can change; use a restricted static outbound IP option if your hosting plan offers one, otherwise understand that allowing `0.0.0.0/0` exposes the database endpoint to all IPs and rely on strong database credentials.
2. **Deploy the API to Render.** Create a new Blueprint using this repository and its `render.yaml`. Set `MONGO_URI` to the Atlas URI and `CLIENT_URL` temporarily to `http://localhost:5174`. Render generates a `JWT_SECRET`. Wait until the service is live, then verify `https://<your-render-service>.onrender.com/healthz` returns `{"status":"ok","database":"connected"}`.
3. **Deploy the frontend to Vercel.** Import the repository as a Vercel project, set the project Root Directory to `client`, and set the build command to `npm run build` and output directory to `dist`. Add the build environment variable `VITE_API_URL=https://<your-render-service>.onrender.com/api`, then deploy.
4. **Connect the production origins.** Copy the Vercel deployment origin (for example, `https://studymate.vercel.app`) into Render's `CLIENT_URL` environment variable and redeploy the API. If you later add a custom frontend domain, include each allowed frontend origin as a comma-separated entry.
5. **Enable AI planning if desired.** Add `OPENAI_API_KEY` under the Render service's environment settings only. Never add an AI key to Vercel, `VITE_*` variables, or committed files. This key is optional and is intentionally not a required Blueprint variable.
6. **Smoke-test the live app.** Register an account, create a subject and a task, complete it, check the dashboard updates, save a study plan, and import one selected activity. Verify `/healthz` still reports a connected database.

The checked-in `render.yaml` provides the Render API service configuration, and `client/vercel.json` enables client-side route fallback. Actual hosting requires access to your Render, Vercel, and Atlas accounts and cannot be published from this local workspace without your authorization.
