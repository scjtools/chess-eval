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

function cloneBoard(board) {
  return board.map(row => [...row]);
}

function boardToFen(board) {
  const rows = board.map(row => {
    let out = '';
    let empties = 0;

    for (const piece of row) {
      if (!piece) {
        empties += 1;
      } else {
        if (empties) {
          out += empties;
          empties = 0;
        }
        out += piece;
      }
    }

    if (empties) out += empties;
    return out;
  });

  // Minimal position evaluator: white to move. No castling/en-passant state.
  return `${rows.join('/')} w - - 0 1`;
}

function imgCode(piece) {
  if (!piece) return '';
  const color = piece === piece.toUpperCase() ? 'w' : 'b';
  return `${color}${piece.toLowerCase()}`;
}

function pieceSrc(piece) {
  return `https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${imgCode(piece)}.png`;
}

function whiteShare(ev) {
  if (!ev) return 50;
  if (ev.type === 'mate') return ev.value > 0 ? 98 : 2;

  const pawns = Math.max(-6, Math.min(6, ev.cp / 100));
  return Math.max(2, Math.min(98, 50 + (pawns / 6) * 50));
}

function scoreText(ev, thinking, ready) {
  if (!ready) return '...';
  if (thinking) return '...';
  if (!ev) return '0.00';

  if (ev.type === 'mate') {
    return ev.value > 0 ? `M${ev.value}` : `M-${Math.abs(ev.value)}`;
  }

  const pawns = ev.cp / 100;
  if (Math.abs(pawns) < 0.05) return '0.00';
  return pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
}

function useStockfish() {
  const workerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [engineError, setEngineError] = useState('');
  const resolveRef = useRef(null);
  const lastScoreRef = useRef(null);

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

        const score = line.match(/score (cp|mate) (-?\d+)/);
        if (score) {
          const raw = Number(score[2]);
          lastScoreRef.current = score[1] === 'cp'
            ? { type: 'cp', cp: raw }
            : { type: 'mate', value: raw };
        }

        if (line.startsWith('bestmove') && resolveRef.current) {
          resolveRef.current(lastScoreRef.current || { type: 'cp', cp: 0 });
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
      if (worker) worker.terminate();
    };
  }, []);

  function analyse(fen) {
    return new Promise((resolve, reject) => {
      if (!workerRef.current || !ready) {
        reject(new Error(engineError || 'loading'));
        return;
      }

      lastScoreRef.current = null;
      resolveRef.current = resolve;

      workerRef.current.postMessage('stop');
      workerRef.current.postMessage('ucinewgame');
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage('go movetime 650');
    });
  }

  return { analyse, ready };
}

function App() {
  const boardRef = useRef(null);
  const [board, setBoard] = useState(cloneBoard(START));
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [thinking, setThinking] = useState(false);
  const { analyse, ready } = useStockfish();

  const fen = useMemo(() => boardToFen(board), [board]);
  const share = whiteShare(evalResult);
  const displayBoard = flipped ? [...Array(64).keys()].reverse() : [...Array(64).keys()];

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setThinking(true);

      try {
        const result = await analyse(fen);
        if (!cancelled) setEvalResult(result);
      } catch {
        if (!cancelled) setEvalResult(null);
      } finally {
        if (!cancelled) setThinking(false);
      }
    }, 420);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fen, ready]);

  useEffect(() => {
    function onPointerMove(event) {
      if (!drag) return;
      setDrag(current => current ? { ...current, x: event.clientX, y: event.clientY } : current);
    }

    function onPointerUp(event) {
      if (!drag) return;

      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) {
        setDrag(null);
        return;
      }

      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      const next = cloneBoard(board);
      const [fromR, fromC] = drag.from;
      next[fromR][fromC] = '';

      if (inside) {
        const file = Math.floor(((event.clientX - rect.left) / rect.width) * 8);
        const rank = Math.floor(((event.clientY - rect.top) / rect.height) * 8);
        const boardR = flipped ? 7 - rank : rank;
        const boardC = flipped ? 7 - file : file;

        if (boardR >= 0 && boardR < 8 && boardC >= 0 && boardC < 8) {
          next[boardR][boardC] = drag.piece;
        }
      }

      setBoard(next);
      setEvalResult(null);
      setDrag(null);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [drag, board, flipped]);

  function startDrag(event, r, c, piece) {
    event.preventDefault();

    setDrag({
      piece,
      from: [r, c],
      x: event.clientX,
      y: event.clientY
    });
  }

  function reset() {
    setBoard(cloneBoard(START));
    setEvalResult(null);
  }

  return (
    <main className="app">
      <section className="eval">
        <div className="evalWhite" style={{ width: `${share}%` }} />
        <div className="evalBlack" />
        <div className="evalNumber">{scoreText(evalResult, thinking, ready)}</div>
      </section>

      <section className="board" ref={boardRef}>
        {displayBoard.map((index) => {
          const r = Math.floor(index / 8);
          const c = index % 8;
          const piece = board[r][c];
          const dark = (r + c) % 2 === 1;
          const beingDragged = drag && drag.from[0] === r && drag.from[1] === c;

          return (
            <div key={`${r}-${c}`} className={`square ${dark ? 'dark' : 'light'}`}>
              {piece && !beingDragged && (
                <img
                  className="piece"
                  src={pieceSrc(piece)}
                  alt=""
                  draggable="false"
                  onPointerDown={(event) => startDrag(event, r, c, piece)}
                />
              )}
            </div>
          );
        })}
      </section>

      <section className="toolbar">
        <button onClick={() => setFlipped(value => !value)}>Flip</button>
        <button onClick={reset}>Reset</button>
      </section>

      {drag && (
        <img
          className="dragPiece"
          src={pieceSrc(drag.piece)}
          alt=""
          draggable="false"
          style={{
            transform: `translate(${drag.x - 34}px, ${drag.y - 34}px)`
          }}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);

