# Chess Eval

A simple iPhone-first chess evaluation page.

## Current behaviour

- Fixed square chessboard
- Drag pieces to move
- Castling moves the rook automatically
- Side to move alternates after each board move
- FEN input updates from board moves
- Pasted FEN updates the board and side to move
- Local Stockfish eval runs automatically
- Eval bar only shows the score, no best move

## Commands

```bash
npm install
npm run dev
npm run build
```

## Notes

The app uses Stockfish locally through WASM. Piece images are loaded from the Chess.com Neo piece theme URL.
