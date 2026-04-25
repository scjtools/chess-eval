import { Chess } from 'chess.js';

export function makeGame(fen) {
  try {
    return new Chess(fen);
  } catch {
    return new Chess();
  }
}

export function sideName(side) {
  return side === 'w' ? 'White to move' : 'Black to move';
}

export function squareName(row, col) {
  return `${'abcdefgh'[col]}${8 - row}`;
}

export function pieceChar(piece) {
  if (!piece) return '';

  return piece.color === 'w'
    ? piece.type.toUpperCase()
    : piece.type;
}

export function boardFromFen(fen) {
  return makeGame(fen).board();
}

export function isPromotionMove(fen, from, to) {
  const game = makeGame(fen);
  const moves = game.moves({ square: from, verbose: true });

  return moves.some(move => move.from === from && move.to === to && move.promotion);
}

export function legalMoveExists(fen, from, to) {
  const game = makeGame(fen);
  const moves = game.moves({ square: from, verbose: true });

  return moves.some(move => move.from === from && move.to === to);
}

export function moveFen(fen, from, to, promotion = 'q') {
  const game = makeGame(fen);
  const move = game.move({ from, to, promotion });

  if (!move) return null;

  return game.fen();
}

export function tryParseFen(value) {
  try {
    const game = new Chess(value);
    return game.fen();
  } catch {
    return null;
  }
}
