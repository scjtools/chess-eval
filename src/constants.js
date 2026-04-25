export const START_BOARD = [
  ['r','n','b','q','k','b','n','r'],
  ['p','p','p','p','p','p','p','p'],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['P','P','P','P','P','P','P','P'],
  ['R','N','B','Q','K','B','N','R'],
];

export const INITIAL_CASTLING = 'KQkq';
export const INITIAL_EN_PASSANT = '-';

export const ENGINE_NAME = 'Stockfish 18 Lite';
export const ENGINE_THREADS = 1;
export const ENGINE_HASH_MB = 16;
export const ENGINE_MOVETIME_MS = 650;

export const PIECE_THEME_BASE = 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150';

export function pieceImageUrl(piece) {
  if (!piece) return '';

  const color = piece === piece.toUpperCase() ? 'w' : 'b';
  const type = piece.toLowerCase();

  return `${PIECE_THEME_BASE}/${color}${type}.png`;
}
