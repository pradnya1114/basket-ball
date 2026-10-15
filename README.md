# 🏀 AIR BASKETBALL — single player · works offline

Grab. Aim. Shoot. Score! A gesture-controlled arcade basketball game for large
interactive displays (optimised for 1920 × 1080). One player, one 60-second run,
**no controller, no keyboard and no internet required**.

Built with Next.js + React, HTML5 Canvas (front-facing 3D court and physics),
MediaPipe Hands (`@mediapipe/tasks-vision`, bundled locally) and Tailwind CSS.

---

## Run it

```bash
npm install
npm run build && npm start        # → http://localhost:3000
# or: npm run dev
```

Requirements: Node 18+, a webcam, and a modern browser (Chrome / Edge recommended).
Use `localhost` or HTTPS — browsers only allow the camera and offline caching on secure origins.

## Offline

| Piece | How it works offline |
| --- | --- |
| Hand tracking | MediaPipe WASM runtime + `hand_landmarker.task` model ship in `public/mediapipe/` — no CDN is ever contacted |
| App shell | `public/sw.js` service worker precaches the page, every JS/CSS chunk, the tracking engine, the model and the logo on first visit |
| Leaderboard | Stored only in the browser's `localStorage` (`air-basketball.history.v2`) — no server or database calls |
| Fonts, sounds, graphics | System fonts, WebAudio-synthesised sounds, canvas/SVG art — nothing downloaded |

**First run:** open the game once while the server is reachable. The Welcome screen badge
shows **PREPARING OFFLINE…** → **OFFLINE READY** once everything is stored (the badge is
verified against the device cache, not assumed). You can force a pass with the
**📦 STORE FOR OFFLINE** button. From then on the app loads and hand tracking works with
the network unplugged. (`Install app` in Chrome/Edge also works — it ships a web manifest.)

If the app is opened before it was ever stored, the badge shows **OFFLINE · NOT STORED ON
DEVICE** — connect once, wait for OFFLINE READY, then disconnect.

Backup / reset the board from the results page (**⤓ Backup** downloads a JSON file, **⌫ Reset board** clears it).

## Game flow

1. **Welcome** — enter your name, START GAME (validation for empty / over-long names).
2. **How to play** — four animated gesture steps, live camera preview with hand skeleton,
   TEST GESTURES practice court, CALIBRATE CAMERA, BACK, LET'S PLAY.
3. **Game** — 60 seconds, front-facing court, timer, power meter, tracking status, camera preview.
   No score on screen — it is revealed at the end.
4. **Results** — final score, baskets, attempts, accuracy, best streak, deep shots, time played,
   leaderboard rank, personal best, **Top 10 players** board, PLAY AGAIN / RESTART / CHANGE PLAYER / HOW TO PLAY.

### Gestures (front-facing)
| Gesture | Do this |
| --- | --- |
| Grab | Pinch thumb + index finger |
| Aim | Slide your hand left / right, raise it for a higher arc |
| Charge | Pull your hand toward your chest (power meter fills) |
| Throw | Punch toward the screen and open the pinch |

Scoring: basket **+2**, deep launch (≥ 58 % power) **+3**, clean swish **+1**, 3 in a row → **COMBO ×2**.
A basket counts only when the ball falls down through the ring, once per shot.

## Camera trouble?
Press **RETRY CAMERA**, allow camera access in the browser, or **OPEN IN NEW TAB** if embedded.
Use **POINTER MODE** (press & drag on the court) to play without a camera.
**CALIBRATE CAMERA** on page 2 tunes the pinch threshold to your hand.
