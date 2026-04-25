import { ENGINE_NAME } from './constants.js';
import { sideName } from './chessHelpers.js';

export function whiteShare(evalResult) {
  if (!evalResult) return 50;
  if (evalResult.type === 'mate') return evalResult.value > 0 ? 98 : 2;

  const pawns = Math.max(-6, Math.min(6, evalResult.cp / 100));
  return Math.max(2, Math.min(98, 50 + (pawns / 6) * 50));
}

export function scoreText(evalResult, thinking, ready) {
  if (!ready || thinking) return '...';
  if (!evalResult) return '0.00';

  if (evalResult.type === 'mate') {
    return evalResult.value > 0 ? `M${evalResult.value}` : `M-${Math.abs(evalResult.value)}`;
  }

  const pawns = evalResult.cp / 100;
  if (Math.abs(pawns) < 0.05) return '0.00';

  return pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
}

export function scoreSide(evalResult) {
  if (!evalResult) return 'white';
  if (evalResult.type === 'mate') return evalResult.value < 0 ? 'black' : 'white';

  return evalResult.cp < -15 ? 'black' : 'white';
}

export function engineInfoText(evalResult, thinking, ready, side) {
  const turn = sideName(side);

  if (!ready) return `${ENGINE_NAME} • ${turn} • loading`;
  if (thinking) return `${ENGINE_NAME} • ${turn} • analysing`;

  const depth = evalResult?.depth ? `depth ${evalResult.depth}` : 'depth —';

  return `${ENGINE_NAME} • ${depth} • ${turn}`;
}
