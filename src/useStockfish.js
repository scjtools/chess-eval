import { useCallback, useEffect, useRef, useState } from 'react';
import { ENGINE_HASH_MB, ENGINE_MOVETIME_MS, ENGINE_THREADS } from './constants.js';

const ENGINE_PATH = '/vendor/stockfish-18-lite-single.js';
const HANG_TIMEOUT_MS = Math.max(1100, ENGINE_MOVETIME_MS + 850);

export function useStockfish(engineKey, side) {
  const workerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [restartTick, setRestartTick] = useState(0);
  const [engineError, setEngineError] = useState('');
  const resolveRef = useRef(null);
  const timeoutRef = useRef(null);
  const lastScoreRef = useRef(null);
  const lastInfoRef = useRef({ depth: null, timeMs: null, nodes: null });
  const sideRef = useRef(side);

  useEffect(() => {
    sideRef.current = side;
  }, [side]);

  const clearPendingAnalysis = useCallback((value = null) => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;

    if (resolveRef.current) {
      const resolve = resolveRef.current;
      resolveRef.current = null;
      resolve(value);
    }
  }, []);

  const restartWorker = useCallback(() => {
    try {
      workerRef.current?.postMessage('stop');
    } catch {}

    workerRef.current?.terminate();
    workerRef.current = null;
    setReady(false);
    setRestartTick(value => value + 1);
  }, []);

  useEffect(() => {
    let worker;

    clearPendingAnalysis(null);
    setReady(false);
    setEngineError('');
    lastScoreRef.current = null;
    lastInfoRef.current = { depth: null, timeMs: null, nodes: null };

    try {
      worker = new Worker(ENGINE_PATH);
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

        if (line.startsWith('bestmove')) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;

          if (resolveRef.current) {
            const resolve = resolveRef.current;
            resolveRef.current = null;
            resolve(buildResult(lastScoreRef.current, lastInfoRef.current));
          }
        }
      };

      worker.onerror = () => {
        setEngineError('engine');
        clearPendingAnalysis(null);
        restartWorker();
      };

      worker.postMessage('uci');
    } catch {
      setEngineError('engine');
      clearPendingAnalysis(null);
      restartWorker();
    }

    return () => {
      clearPendingAnalysis(null);

      if (worker) {
        try {
          worker.postMessage('stop');
        } catch {}

        worker.terminate();
      }

      if (workerRef.current === worker) {
        workerRef.current = null;
      }
    };
  }, [engineKey, restartTick, clearPendingAnalysis, restartWorker]);

  function analyse(fen) {
    return new Promise((resolve, reject) => {
      if (!workerRef.current || !ready) {
        reject(new Error(engineError || 'loading'));
        return;
      }

      // Cancel any previous search before starting the next one.
      try {
        workerRef.current.postMessage('stop');
      } catch {}

      clearPendingAnalysis(null);

      lastScoreRef.current = null;
      lastInfoRef.current = { depth: null, timeMs: null, nodes: null };
      resolveRef.current = resolve;

      timeoutRef.current = setTimeout(() => {
        // No trustworthy final result arrived. Resolve null so the UI shows "...",
        // then restart the worker so the next ready cycle retries cleanly.
        clearPendingAnalysis(null);
        restartWorker();
      }, HANG_TIMEOUT_MS);

      try {
        workerRef.current.postMessage('ucinewgame');
        workerRef.current.postMessage(`position fen ${fen}`);
        workerRef.current.postMessage(`go movetime ${ENGINE_MOVETIME_MS}`);
      } catch {
        clearPendingAnalysis(null);
        restartWorker();
      }
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
