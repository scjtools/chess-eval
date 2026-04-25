import { useEffect, useRef, useState } from 'react';
import { ENGINE_HASH_MB, ENGINE_MOVETIME_MS, ENGINE_THREADS } from './constants.js';

export function useStockfish(engineKey, side) {
  const workerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [engineError, setEngineError] = useState('');
  const resolveRef = useRef(null);
  const timeoutRef = useRef(null);
  const lastScoreRef = useRef(null);
  const lastInfoRef = useRef({ depth: null, timeMs: null, nodes: null });
  const sideRef = useRef(side);

  useEffect(() => {
    sideRef.current = side;
  }, [side]);

  useEffect(() => {
    let worker;

    setReady(false);
    setEngineError('');
    lastScoreRef.current = null;
    lastInfoRef.current = { depth: null, timeMs: null, nodes: null };

    try {
      worker = new Worker('/vendor/stockfish-18-lite-single.js');
      workerRef.current = worker;

      worker.onmessage = event => {
        const line = String(event.data || '');

        if (line.includes('uciok')) {
          worker.postMessage(`setoption name Threads value ${ENGINE_THREADS}`);
          worker.postMessage(`setoption name Hash value ${ENGINE_HASH_MB}`);
          worker.postMessage('setoption name MultiPV value 1');
          worker.postMessage('isready');
        }

        if (line.includes('readyok')) {
          setReady(true);
        }

        updateLastInfo(line, lastInfoRef);
        updateLastScore(line, sideRef.current, lastScoreRef);

        if (line.startsWith('bestmove') && resolveRef.current) {
          clearTimeout(timeoutRef.current);
          resolveRef.current(buildResult(lastScoreRef.current, lastInfoRef.current));
          resolveRef.current = null;
        }
      };

      worker.onerror = () => {
        setEngineError('engine');
        setReady(false);
      };

      worker.postMessage('uci');
    } catch {
      setEngineError('engine');
    }

    return () => {
      clearTimeout(timeoutRef.current);

      if (resolveRef.current) {
        resolveRef.current(null);
        resolveRef.current = null;
      }

      if (worker) worker.terminate();
    };
  }, [engineKey]);

  function analyse(fen) {
    return new Promise((resolve, reject) => {
      if (!workerRef.current || !ready) {
        reject(new Error(engineError || 'loading'));
        return;
      }

      clearTimeout(timeoutRef.current);
      lastScoreRef.current = null;
      lastInfoRef.current = { depth: null, timeMs: null, nodes: null };
      resolveRef.current = resolve;

      timeoutRef.current = setTimeout(() => {
        if (!resolveRef.current) return;

        resolveRef.current(buildResult(lastScoreRef.current, lastInfoRef.current));
        resolveRef.current = null;
      }, 2600);

      workerRef.current.postMessage('stop');
      workerRef.current.postMessage('ucinewgame');
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage(`go movetime ${ENGINE_MOVETIME_MS}`);
    });
  }

  return { analyse, ready, engineError };
}

function updateLastInfo(line, lastInfoRef) {
  const depth = line.match(/\bdepth (\d+)/);
  const time = line.match(/\btime (\d+)/);
  const nodes = line.match(/\bnodes (\d+)/);

  if (!depth && !time && !nodes) return;

  lastInfoRef.current = {
    depth: depth ? Number(depth[1]) : lastInfoRef.current.depth,
    timeMs: time ? Number(time[1]) : lastInfoRef.current.timeMs,
    nodes: nodes ? Number(nodes[1]) : lastInfoRef.current.nodes,
  };
}

function updateLastScore(line, side, lastScoreRef) {
  const score = line.match(/score (cp|mate) (-?\d+)/);
  if (!score) return;

  const raw = Number(score[2]);
  const sign = side === 'w' ? 1 : -1;

  lastScoreRef.current = score[1] === 'cp'
    ? { type: 'cp', cp: raw * sign }
    : { type: 'mate', value: raw * sign };
}

function buildResult(score, info) {
  if (!score) return null;

  return {
    ...score,
    ...info,
  };
}
