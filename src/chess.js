import { INITIAL_CASTLING, INITIAL_EN_PASSANT } from './constants.js';

const FILES = 'abcdefgh';

export function cloneBoard(board) {
  return board.map(row => [...row]);
}

export function clonePosition(position) {
  return {
    board: cloneBoard(position.board),
    side: position.side,
    castling: position.castling,
    enPassant: position.enPassant,
  };
}

export function oppositeSide(side) {
  return side === 'w' ? 'b' : 'w';
}

export function sideName(side) {
  return side === 'w' ? 'White to move' : 'Black to move';
}

export function boardToFen(board, side, castling = '', enPassant = INITIAL_EN_PASSANT) {
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

  return `${placement} ${side} ${castling || '-'} ${enPassant || '-'} 0 1`;
}

export function fenToPosition(fen) {
  const parts = fen.trim().split(/\s+/);
  const placement = parts[0] || '';
  const side = parts[1] === 'b' ? 'b' : 'w';
  const castling = normalizeCastling(parts[2] && parts[2] !== '-' ? parts[2] : '');
  const enPassant = normalizeEnPassant(parts[3] || '-');

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

  return { board, side, castling, enPassant };
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

function normalizeEnPassant(value) {
  const ep = String(value || '-');

  if (ep === '-') return '-';
  if (/^[a-h][36]$/.test(ep)) return ep;

  return '-';
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

export function enPassantAfterMove(move) {
  const { piece, fromR, fromC, toR } = move;
  const isPawn = piece === 'P' || piece === 'p';

  if (!isPawn) return '-';

  const movedTwoSquares = Math.abs(toR - fromR) === 2;
  if (!movedTwoSquares) return '-';

  const targetRow = (fromR + toR) / 2;
  return squareName(targetRow, fromC);
}

export function isEnPassantCapture(move, currentEnPassant) {
  const { piece, fromC, toR, toC, capturedPiece } = move;
  const isPawn = piece === 'P' || piece === 'p';
  if (!isPawn || capturedPiece) return false;
  if (Math.abs(toC - fromC) !== 1) return false;

  return squareName(toR, toC) === currentEnPassant;
}

export function enPassantCapturedPawnSquare(piece, toR, toC) {
  return piece === 'P'
    ? [toR + 1, toC]
    : [toR - 1, toC];
}

export function squareName(row, col) {
  return `${FILES[col]}${8 - row}`;
}
