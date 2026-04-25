import { INITIAL_CASTLING } from './constants.js';

export function cloneBoard(board) {
  return board.map(row => [...row]);
}

export function oppositeSide(side) {
  return side === 'w' ? 'b' : 'w';
}

export function boardToFen(board, side, castling = '') {
  const placement = board.map(row => {
    let fenRow = '';
    let empties = 0;

    for (const piece of row) {
      if (!piece) {
        empties += 1;
        continue;
      }

      if (empties) {
        fenRow += empties;
        empties = 0;
      }

      fenRow += piece;
    }

    if (empties) fenRow += empties;
    return fenRow;
  }).join('/');

  return `${placement} ${side} ${castling || '-'} - 0 1`;
}

export function fenToPosition(fen) {
  const parts = fen.trim().split(/\s+/);
  const placement = parts[0] || '';
  const side = parts[1] === 'b' ? 'b' : 'w';
  const castling = normalizeCastling(parts[2] && parts[2] !== '-' ? parts[2] : '');

  const rows = placement.split('/');
  if (rows.length !== 8) {
    throw new Error('FEN needs 8 rows');
  }

  const board = rows.map(row => {
    const out = [];

    for (const ch of row) {
      if (/\d/.test(ch)) {
        out.push(...Array(Number(ch)).fill(''));
      } else if ('prnbqkPRNBQK'.includes(ch)) {
        out.push(ch);
      } else {
        throw new Error('Invalid FEN piece');
      }
    }

    if (out.length !== 8) {
      throw new Error('Each FEN row needs 8 squares');
    }

    return out;
  });

  return { board, side, castling };
}

export function tryFenToPosition(fen) {
  try {
    return fenToPosition(fen);
  } catch {
    return null;
  }
}

export function normalizeCastling(value) {
  const order = ['K', 'Q', 'k', 'q'];
  const set = new Set(String(value || '').split(''));

  return order.filter(ch => set.has(ch)).join('');
}

function removeCastlingRight(castling, right) {
  return normalizeCastling(String(castling || '').replace(right, ''));
}

export function updateCastlingRights(castling, move) {
  let rights = normalizeCastling(castling || INITIAL_CASTLING);
  const { piece, fromR, fromC, toR, toC, capturedPiece } = move;

  if (piece === 'K') {
    rights = removeCastlingRight(removeCastlingRight(rights, 'K'), 'Q');
  }

  if (piece === 'k') {
    rights = removeCastlingRight(removeCastlingRight(rights, 'k'), 'q');
  }

  if (piece === 'R' && fromR === 7 && fromC === 7) rights = removeCastlingRight(rights, 'K');
  if (piece === 'R' && fromR === 7 && fromC === 0) rights = removeCastlingRight(rights, 'Q');
  if (piece === 'r' && fromR === 0 && fromC === 7) rights = removeCastlingRight(rights, 'k');
  if (piece === 'r' && fromR === 0 && fromC === 0) rights = removeCastlingRight(rights, 'q');

  if (capturedPiece === 'R' && toR === 7 && toC === 7) rights = removeCastlingRight(rights, 'K');
  if (capturedPiece === 'R' && toR === 7 && toC === 0) rights = removeCastlingRight(rights, 'Q');
  if (capturedPiece === 'r' && toR === 0 && toC === 7) rights = removeCastlingRight(rights, 'k');
  if (capturedPiece === 'r' && toR === 0 && toC === 0) rights = removeCastlingRight(rights, 'q');

  return rights;
}
