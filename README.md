# Chess Eval

A simple iPhone-first chess evaluation page.

## Current behaviour

- Fixed square chessboard
- Legal moves only
- Castling, en passant, check rules, and promotion are handled through chess.js
- Promotion opens a Q/R/B/N picker
- FEN input updates from board moves
- Pasted FEN updates the board and game state
- Back/forward arrows walk through position history
- Local Stockfish eval runs automatically
- Eval bar only shows the score, no best move

## Commands

```bash
npm install
npm run dev
npm run build
```

## Notes

The app uses local Stockfish through WASM. Piece images are vendored in `public/pieces/neo`.
