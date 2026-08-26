# CTF Lab — Full-Stack Cybersecurity Training Platform

A real, separate frontend and backend, connected over HTTP:

- **backend/** — Node.js + Express + SQLite API. Owns all data: users, challenges,
  hints, files, solves. Passwords and flags are hashed with bcrypt and never sent
  back to the browser. This is the only place that can validate a flag.
- **frontend/** — React (Vite) single-page app. Talks to the backend only through
  `fetch` calls in `frontend/src/api.js`. It has no database and no secrets of its
  own — refreshing the page just re-asks the backend for everything.

They are two independent programs. The backend can run on its own server; the
frontend just needs to know its URL (`VITE_API_URL`).

## 1. Requirements

- Node.js 18+ (check with `node -v`)

## 2. First-time setup

```bash
cd ctf-platform
cp backend/.env.example backend/.env    # edit JWT_SECRET / admin password if you like
npm run install:all                     # installs both backend and frontend deps
```

## 3. Run both together

```bash
npm run dev
```

This starts:
- backend at **http://localhost:4000**
- frontend at **http://localhost:5173**

Open **http://localhost:5173** in your browser. That's the site.

(To run them separately instead: `npm run dev --prefix backend` and
`npm run dev --prefix frontend` in two terminals.)

## 4. Logging in

The backend seeds one admin account on first run, from `backend/.env`:

- username: `ADMIN_USERNAME` (default `admin`)
- password: `ADMIN_PASSWORD` (default `admin123`) — **change this in `.env` before
  using this anywhere real.**

Anyone else can register their own account from the site.

## 5. How the connection actually works

1. Frontend calls `POST /api/auth/login` with a username/password.
2. Backend checks the password against the bcrypt hash in `ctf.db`, and if it
   matches, signs a JWT and returns it.
3. Frontend stores that JWT in `localStorage` and sends it as
   `Authorization: Bearer <token>` on every request that needs a login (submitting
   a flag, viewing your dashboard, anything under `/api/admin/*`).
4. Backend verifies the JWT on each request (`backend/src/middleware/auth.js`) and
   rejects anything without a valid one — including admin routes, which additionally
   check `isAdmin`.
5. Flags are stored only as bcrypt hashes (`backend/src/db.js`,
   `backend/src/routes/admin.js`). Submitting a flag
   (`backend/src/routes/challenges.js` → `POST /:id/submit`) hashes your guess
   server-side and compares — the real flag text never leaves the backend after
   an admin creates the challenge.

## 6. Making the platform "editable"

Log in as admin → **Admin Dashboard → Add Challenge**. Fill in the fields, hit
**Publish Challenge**. It's written straight into `backend/ctf.db` and appears on
`/challenges` for every visitor immediately — no code changes, no redeploy.
**Manage Challenges** lets you edit, archive, or delete anything the same way.

## 7. Known limitations (by design, worth knowing)

- **File/image/audio attachments are URL-based**, not a file-upload button. Paste
  a link to a hosted file. Adding real file uploads means adding disk or object
  storage (e.g. `multer` + a local `/uploads` folder, or S3) — happy to add that
  if you need it.
- **SQLite** is used for simplicity (`backend/ctf.db`, a single file, git-ignored).
  It's genuinely fine for a training platform's scale. If you outgrow it, the SQL
  in `backend/src/db.js` is close enough to Postgres/MySQL to port.
- **Rate limiting** on flag submission is a basic in-memory per-user cooldown
  (`backend/src/routes/challenges.js`). Fine for one server instance; swap for
  Redis if you ever run more than one backend process.
- **CORS** is locked to `CORS_ORIGIN` in `backend/.env` (defaults to the Vite dev
  server). Update it when you deploy the frontend somewhere else.

## 8. Deploying for real

- Backend: run `node src/server.js` behind a process manager (pm2, systemd, or a
  platform like Railway/Render/Fly). Set real `JWT_SECRET`, `ADMIN_PASSWORD`, and
  `CORS_ORIGIN` env vars.
- Frontend: `npm run build --prefix frontend` produces static files in
  `frontend/dist/`. Serve those from any static host (Vercel, Netlify, nginx) and
  set `VITE_API_URL` at build time to your backend's public URL, e.g.:
  ```bash
  VITE_API_URL=https://api.yourdomain.com/api npm run build --prefix frontend
  ```
