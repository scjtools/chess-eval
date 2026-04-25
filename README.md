# EvalCam

Offline iPhone-first chess evaluation PWA.

What it does now:

- manual board setup
- photo/screenshot reference input
- FEN backup
- local Stockfish eval
- chess.com-style horizontal eval bar
- no best move, no arrows, no cloud, no accounts

## Install on iPhone

Easiest route:

1. Create a GitHub repo and upload this folder.
2. Import the repo into Vercel.
3. Vercel will run `npm install` and `npm run build`.
4. Open the Vercel URL in Safari on your iPhone.
5. Tap Share → Add to Home Screen.
6. Open EvalCam once while online so Safari caches the files.
7. After that, it should run offline.

## Local run on Mac

```bash
npm install
npm run dev
```

Then open the shown local URL.

## Current limitation

The camera/photo button currently attaches a reference image. It does not yet auto-detect the pieces. That is the next stage. The correct product flow is still already there:

photo → manual correction → local eval.

## Stockfish licensing

Stockfish is GPL-3.0. For private personal use this is fine. If you distribute the app publicly, handle GPL compliance properly.
