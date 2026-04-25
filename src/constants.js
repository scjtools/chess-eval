export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const ENGINE_NAME = 'Stockfish 18 Lite';
export const ENGINE_THREADS = 1;
export const ENGINE_HASH_MB = 16;
export const ENGINE_MOVETIME_MS = 250;

export function pieceImageUrl(piece) {
  if (!piece) return '';

  const color = piece === piece.toUpperCase() ? 'w' : 'b';
  const type = piece.toLowerCase();

  return `/pieces/neo/${color}${type}.png`;
}
