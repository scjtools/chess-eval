import { ENGINE_HASH_MB, ENGINE_MOVETIME_MS, ENGINE_NAME, ENGINE_THREADS } from './constants.js';

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

export function engineInfoText(evalResult, thinking, ready) {
  const base = `${ENGINE_NAME} • ${ENGINE_THREADS} thread • ${ENGINE_HASH_MB} MB`;

  if (!ready) return `${base} • loading`;
  if (thinking) return `${base} • analysing`;
  if (!evalResult) return `${base} • ${(ENGINE_MOVETIME_MS / 1000).toFixed(2)}s`;

  const time = evalResult.timeMs
    ? `${(evalResult.timeMs / 1000).toFixed(2)}s`
    : `${(ENGINE_MOVETIME_MS / 1000).toFixed(2)}s`;

  const depth = evalResult.depth ? `depth ${evalResult.depth}` : 'depth —';
  const nodes = evalResult.nodes ? ` • ${evalResult.nodes.toLocaleString()} nodes` : '';

  return `${base} • ${time} • ${depth}${nodes}`;
}
