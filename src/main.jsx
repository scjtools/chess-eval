import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const START = [
  ['r','n','b','q','k','b','n','r'],
  ['p','p','p','p','p','p','p','p'],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['P','P','P','P','P','P','P','P'],
  ['R','N','B','Q','K','B','N','R'],
];

const EMPTY = Array.from({ length: 8 }, () => Array(8).fill(''));

const PIECES = ['K','Q','R','B','N','P','k','q','r','b','n','p'];

const UNICODE = {
  K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙',
  k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟', '':''
};

function cloneBoard(board) {
  return board.map(row => [...row]);
}

function boardToFen(board, side) {
  const rows = board.map(row => {
    let out = '';
    let empty = 0;

    for (const piece of row) {
      if (!piece) {
        empty++;
      } else {
        if (empty) {
          out += empty;
          empty = 0;
        }
        out += piece;
      }
    }

    if (empty) out += empty;
    return out;
  });

  return `${rows.join('/')} ${side} - - 0 1`;
}

function scoreLabel(ev) {
  if (!ev) return '0.00';

  if (ev.type === 'mate') {
    return ev.value > 0 ? `M${ev.value}` : `M-${Math.abs(ev.value)}`;
  }

  const score = ev.cp / 100;
  if (Math.abs(score) < 0.05) return '0.00';

  return score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
}

function detailLabel(ev) {
  if (!ev) return 'Equal';

  if (ev.type === 'mate') {
    return ev.value > 0 ? `White mate in ${ev.value}` : `Black mate in ${Math.abs(ev.value)}`;
  }

  const score = ev.cp / 100;
  if (Math.abs(score) < 0.15) return 'Equal';

  return score > 0 ? `White +${score.toFixed(2)}` : `Black +${Math.abs(score).toFixed(2)}`;
}

function whiteShare(ev) {
  if (!ev) return 50;

  if (ev.type === 'mate') return ev.value > 0 ? 98 : 2;

  const pawns = Math.max(-6, Math.min(6, ev.cp / 100));
  return Math.max(3, Math.min(97, 50 + (pawns / 6) * 50));
}

function useStockfish() {
  const workerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [engineError, setEngineError] = useState('');
  const resolveRef = useRef(null);
  const lastScoreRef = useRef(null);
  const sideRef = useRef('w');

  useEffect(() => {
    let worker;

    try {
      worker = new Worker('/vendor/stockfish-18-lite-single.js');
      workerRef.current = worker;

      worker.onmessage = (event) => {
        const line = String(event.data || '');

        if (line.includes('uciok')) {
          worker.postMessage('setoption name Threads value 1');
          worker.postMessage('setoption name Hash value 16');
          worker.postMessage('setoption name MultiPV value 1');
          worker.postMessage('isready');
        }

        if (line.includes('readyok')) {
          setReady(true);
        }

        const match = line.match(/score (cp|mate) (-?\d+)/);
        if (match) {
          const raw = Number(match[2]);
          const sign = sideRef.current === 'w' ? 1 : -1;

          lastScoreRef.current = match[1] === 'cp'
            ? { type: 'cp', cp: raw * sign }
            : { type: 'mate', value: raw * sign };
        }

        if (line.startsWith('bestmove') && resolveRef.current) {
          resolveRef.current(lastScoreRef.current || { type: 'cp', cp: 0 });
          resolveRef.current = null;
        }
      };

      worker.onerror = () => {
        setEngineError('Engine failed to load');
        setReady(false);
      };

      worker.postMessage('uci');
    } catch {
      setEngineError('Engine missing');
    }

    return () => {
      if (worker) worker.terminate();
    };
  }, []);

  function analyse(fen, side) {
    return new Promise((resolve, reject) => {
      if (!workerRef.current || !ready) {
        reject(new Error(engineError || 'Engine loading'));
        return;
      }

      sideRef.current = side;
      lastScoreRef.current = null;
      resolveRef.current = resolve;

      workerRef.current.postMessage('stop');
      workerRef.current.postMessage('ucinewgame');
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage('go movetime 700');
    });
  }

  return { analyse, ready, engineError };
}

function App() {
  const [board, setBoard] = useState(cloneBoard(START));
  const [side, setSide] = useState('w');
  const [evalResult, setEvalResult] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [tapPiece, setTapPiece] = useState('');
  const { analyse, ready, engineError } = useStockfish();

  const fen = useMemo(() => boardToFen(board, side), [board, side]);
  const share = whiteShare(evalResult);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    function onMove(event) {
      if (!dragging) return;
      setDragging(d => d ? { ...d, x: event.clientX, y: event.clientY } : d);
    }

    function onUp(event) {
      if (!dragging) return;

      const target = document.elementFromPoint(event.clientX, event.clientY);
      const square = target?.closest?.('[data-square]');
      const trash = target?.closest?.('[data-trash]');

      if (square) {
        const [r, c] = square.dataset.square.split(',').map(Number);
        const next = cloneBoard(board);

        if (dragging.from) {
          const [fromR, fromC] = dragging.from;
          next[fromR][fromC] = '';
        }

        next[r][c] = dragging.piece;
        setBoard(next);
        setEvalResult(null);
      } else if (trash && dragging.from) {
        const next = cloneBoard(board);
        const [fromR, fromC] = dragging.from;
        next[fromR][fromC] = '';
        setBoard(next);
        setEvalResult(null);
      }

      setDragging(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, board]);

  function beginDrag(event, piece, from = null) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setTapPiece(piece);
    setDragging({
      piece,
      from,
      x: event.clientX,
      y: event.clientY
    });
  }

  function placeByTap(r, c) {
    if (!tapPiece) return;

    const next = cloneBoard(board);
    next[r][c] = tapPiece;
    setBoard(next);
    setEvalResult(null);
  }

  async function runEval() {
    setThinking(true);

    try {
      const result = await analyse(fen, side);
      setEvalResult(result);
    } catch (error) {
      alert(error.message);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="page">
      <main className="shell">
        <section className="evalBar" aria-label="Evaluation bar">
          <div className="whiteEval" style={{ width: `${share}%` }} />
          <div className="blackEval" />
          <div className="evalText">
            <strong>{scoreLabel(evalResult)}</strong>
            <span>{detailLabel(evalResult)}</span>
          </div>
        </section>

        <section className="board">
          {board.map((row, r) => row.map((piece, c) => {
            const dark = (r + c) % 2 === 1;

            return (
              <button
                key={`${r}-${c}`}
                className={`square ${dark ? 'dark' : 'light'}`}
                data-square={`${r},${c}`}
                onClick={() => placeByTap(r, c)}
              >
                {piece && (
                  <span
                    className="piece"
                    onPointerDown={(event) => beginDrag(event, piece, [r, c])}
                  >
                    {UNICODE[piece]}
                  </span>
                )}
              </button>
            );
          }))}
        </section>

        <section className="controls">
          <div className="turnToggle">
            <button className={side === 'w' ? 'active' : ''} onClick={() => { setSide('w'); setEvalResult(null); }}>
              White to move
            </button>
            <button className={side === 'b' ? 'active' : ''} onClick={() => { setSide('b'); setEvalResult(null); }}>
              Black to move
            </button>
          </div>

          <button className="analyse" onClick={runEval} disabled={!ready || thinking}>
            {thinking ? 'Analysing…' : ready ? 'Analyse' : (engineError || 'Loading engine…')}
          </button>

          <div className="smallButtons">
            <button onClick={() => { setBoard(cloneBoard(START)); setEvalResult(null); }}>Start</button>
            <button onClick={() => { setBoard(cloneBoard(EMPTY)); setEvalResult(null); }}>Empty</button>
            <button data-trash>Drag here to remove</button>
          </div>
        </section>

        <section className="pieceTray">
          {PIECES.map(piece => (
            <button
              key={piece}
              className={`trayPiece ${tapPiece === piece ? 'selected' : ''}`}
              onClick={() => setTapPiece(piece)}
              onPointerDown={(event) => beginDrag(event, piece, null)}
            >
              {UNICODE[piece]}
            </button>
          ))}
        </section>
      </main>

      {dragging && (
        <div
          className="dragGhost"
          style={{
            transform: `translate(${dragging.x - 28}px, ${dragging.y - 34}px)`
          }}
        >
          {UNICODE[dragging.piece]}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
