# ARIA — local backend

Runs the ARIA frontend (`public/aria.html`, unchanged) together with a small
Node/Express backend that holds the real AI provider API key. The browser
never sees the key — it only talks to `/api/chat` and `/api/vision` on the
same origin. This is what `AIService` in `aria.html` already expects; no
frontend changes were needed for this.

Active provider: **OpenRouter**, model `google/gemma-4-31b-it:free` (free,
supports both text and image input, so vision questions about the camera
feed work too).

## File structure

```
aria-assistant/
├── public/
│   └── aria.html        the frontend — UI, camera, hand tracking, zoom, state machine (untouched)
├── providers/
│   ├── index.js          picks the active provider from AI_PROVIDER
│   ├── anthropic.js       Anthropic Messages API implementation (chat + vision)
│   └── openrouter.js      OpenRouter implementation (chat + vision) — active by default
├── server.js              Express app: serves public/, exposes /api/health, /api/chat, /api/vision
├── package.json
├── .env.example           copy to .env and fill in your real key — never commit .env
├── .gitignore             keeps .env and node_modules out of git
└── README.md
```

## Setup (Termux)

```bash
pkg install nodejs-lts        # skip if Node 18+ is already installed
cd aria-assistant
npm install
cp .env.example .env
nano .env                     # paste your real OPENROUTER_API_KEY, save with Ctrl+O, exit with Ctrl+X
```

## Run

```bash
npm start
```

Then open, on the same device:

```
http://localhost:8000/aria.html
```

`localhost` matters here — it's a secure context, so the mic and camera
permissions work. A LAN IP over plain `http://` will not.

## Quick test without the browser

```bash
curl http://localhost:8000/api/health

curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Say hello in one short sentence.","history":[]}'
```

If both return JSON with no `error` field, the backend and your API key are
working — open the page and the HUD should read **AI LINKED**.

## About the free model

`google/gemma-4-31b-it:free` costs $0 on OpenRouter, but the free tier is
rate-limited: 50 requests/day and 20/minute, rising to 1,000/day once you've
added at least $10 in credits once (you don't have to spend it). If a
request gets rate-limited, the backend returns an error and `AIService` in
`aria.html` automatically falls back to a local canned reply — ARIA keeps
working, just without a real answer for that one turn.

## Switching AI providers or models later

- To change the model on the current provider: edit `OPENROUTER_MODEL` in
  `.env` (any OpenRouter model slug works, e.g. a paid one for better
  quality — check it supports image input if you want vision to keep
  working).
- To switch to Anthropic instead: set `AI_PROVIDER=anthropic` in `.env` and
  fill in `ANTHROPIC_API_KEY` (already scaffolded in `.env.example` and
  `providers/anthropic.js`).
- To add a brand-new provider:
  1. Create `providers/<name>.js` exporting the same two functions:
     ```js
     async function chat(message, history) { /* -> { text } */ }
     async function vision(imageBuffer, mimeType, question) { /* -> { text } */ }
     module.exports = { chat, vision };
     ```
  2. Set `AI_PROVIDER=<name>` in `.env`.

`server.js` and `aria.html` never need to change for any of this — they
only know about `/api/chat` and `/api/vision`, not which provider answers.

## Notes

- `.env` is git-ignored. Only `.env.example` (placeholders) should ever be
  committed.
- `aria.html`'s `AIService` already has a three-tier fallback: the Claude
  Artifact "sample" capability first, then this backend, then a local
  canned reply if neither is reachable — so opening `aria.html` without this
  server still runs, just without real reasoning.
- The HUD shows **AI LINKED** as soon as `/api/health` responds, and stays
  that way once a real `/api/chat` or `/api/vision` call succeeds.
- Snapshot downloads, camera, zoom, and hand tracking are all unchanged by
  this backend — they don't touch these endpoints at all.

## Suggested commit message

```
feat: add local Express backend/proxy for ARIA's AI provider

- providers/ abstraction (Anthropic + OpenRouter implemented) so
  switching AI providers or models never touches server.js or aria.html
- OpenRouter set active by default: google/gemma-4-31b-it:free
  (free, supports vision)
- /api/health, /api/chat, /api/vision matching the fallback chain
  already built into AIService in aria.html
- .env.example + .gitignore so the real API key never reaches git
```
