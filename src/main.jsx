import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const FILES = 'abcdefgh';
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
const PIECES = ['K','Q','R','B','N','P','k','q','r','b','n','p',''];
const UNICODE = {
  K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙',
  k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟', '':''
};

function cloneBoard(b) { return b.map(r => [...r]); }

function boardToFen(board, side='w') {
  const rows = board.map(row => {
    let out = ''; let empties = 0;
    for (const p of row) {
      if (!p) empties++;
      else { if (empties) { out += empties; empties = 0; } out += p; }
    }
    if (empties) out += empties;
    return out;
  });
  // Castling/en-passant unknown from scanned position, so keep them conservative.
  // This is okay for most eval uses. User can paste exact FEN in Advanced if needed.
  return `${rows.join('/')} ${side} - - 0 1`;
}

function fenToBoard(fen) {
  const parts = fen.trim().split(/\s+/);
  const rows = parts[0].split('/');
  if (rows.length !== 8) throw new Error('FEN must have 8 rows.');
  const board = rows.map(row => {
    const out = [];
    for (const ch of row) {
      if (/\d/.test(ch)) out.push(...Array(Number(ch)).fill(''));
      else if ('prnbqkPRNBQK'.includes(ch)) out.push(ch);
      else throw new Error('Invalid FEN piece: ' + ch);
    }
    if (out.length !== 8) throw new Error('Each FEN row must have 8 squares.');
    return out;
  });
  const side = parts[1] === 'b' ? 'b' : 'w';
  return { board, side };
}

function scoreText(ev) {
  if (!ev) return 'Not analysed yet';
  if (ev.type === 'mate') return ev.value > 0 ? `White mate in ${ev.value}` : `Black mate in ${Math.abs(ev.value)}`;
  const pawns = ev.cp / 100;
  if (Math.abs(pawns) < 0.15) return 'Equal';
  return pawns > 0 ? `White +${pawns.toFixed(2)}` : `Black +${Math.abs(pawns).toFixed(2)}`;
}

function whitePercent(ev) {
  if (!ev) return 50;
  if (ev.type === 'mate') return ev.value > 0 ? 100 : 0;
  const pawns = Math.max(-6, Math.min(6, ev.cp / 100));
  return Math.max(2, Math.min(98, 50 + (pawns / 6) * 50));
}

function useStockfish() {
  const workerRef = useRef(null);
  const [status, setStatus] = useState('Engine not loaded');
  const [ready, setReady] = useState(false);
  const currentResolve = useRef(null);
  const lastScore = useRef(null);
  const sideRef = useRef('w');

  useEffect(() => {
    try {
      const worker = new Worker('/vendor/stockfish-18-lite-single.js');
      workerRef.current = worker;
      worker.onmessage = (e) => {
        const line = String(e.data || '');
        if (line.includes('uciok')) {
          worker.postMessage('setoption name Threads value 1');
          worker.postMessage('setoption name Hash value 16');
          worker.postMessage('setoption name MultiPV value 1');
          worker.postMessage('isready');
        }
        if (line.includes('readyok')) { setReady(true); setStatus('Ready'); }
        const m = line.match(/score (cp|mate) (-?\d+)/);
        if (m) {
          const raw = Number(m[2]);
          const sign = sideRef.current === 'w' ? 1 : -1;
          lastScore.current = m[1] === 'cp'
            ? { type: 'cp', cp: raw * sign }
            : { type: 'mate', value: raw * sign };
        }
        if (line.startsWith('bestmove') && currentResolve.current) {
          currentResolve.current(lastScore.current);
          currentResolve.current = null;
        }
      };
      worker.onerror = () => {
        setStatus('Stockfish failed to load. Check /public/vendor files.');
        setReady(false);
      };
      worker.postMessage('uci');
      return () => worker.terminate();
    } catch (err) {
      setStatus('Stockfish missing. Run npm install/build so vendor files are copied.');
    }
  }, []);

  const analyse = (fen, side, movetime=700) => new Promise((resolve, reject) => {
    if (!workerRef.current || !ready) return reject(new Error(status));
    lastScore.current = null;
    sideRef.current = side;
    currentResolve.current = resolve;
    workerRef.current.postMessage('stop');
    workerRef.current.postMessage('ucinewgame');
    workerRef.current.postMessage(`position fen ${fen}`);
    workerRef.current.postMessage(`go movetime ${movetime}`);
  });

  return { analyse, status, ready };
}

function App() {
  const [board, setBoard] = useState(cloneBoard(START));
  const [side, setSide] = useState('w');
  const [selected, setSelected] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [fenInput, setFenInput] = useState('');
  const [showFen, setShowFen] = useState(false);
  const { analyse, status, ready } = useStockfish();
  const fen = useMemo(() => boardToFen(board, side), [board, side]);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  function setSquare(r, c, piece) {
    const nb = cloneBoard(board); nb[r][c] = piece; setBoard(nb); setEvalResult(null); setSelected(null);
  }

  async function runEval() {
    setBusy(true);
    try {
      const ev = await analyse(fen, side, 700);
      setEvalResult(ev || { type: 'cp', cp: 0 });
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  function loadFen() {
    try { const parsed = fenToBoard(fenInput); setBoard(parsed.board); setSide(parsed.side); setEvalResult(null); setShowFen(false); }
    catch (e) { alert(e.message); }
  }

  const rows = flipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
  const cols = flipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
  const wp = whitePercent(evalResult);

  return <div className="app">
    <header>
      <div>
        <h1>EvalCam</h1>
        <p>Offline chess position evaluation. No best moves.</p>
      </div>
      <span className={ready ? 'pill ok' : 'pill'}>{ready ? 'Offline engine ready' : status}</span>
    </header>

    <section className="card actions">
      <label className="primary fileBtn">
        Scan / Photo
        <input type="file" accept="image/*" capture="environment" onChange={e => {
          const f = e.target.files?.[0]; if (!f) return;
          setPhoto(URL.createObjectURL(f));
        }} />
      </label>
      <button onClick={() => { setBoard(cloneBoard(START)); setEvalResult(null); }}>Start position</button>
      <button onClick={() => { setBoard(cloneBoard(EMPTY)); setEvalResult(null); }}>Empty board</button>
      <button onClick={() => setFlipped(!flipped)}>Flip</button>
      <button onClick={() => setShowFen(!showFen)}>FEN</button>
    </section>

    {photo && <section className="card photoCard">
      <div className="photoHead"><strong>Reference photo</strong><button onClick={() => setPhoto(null)}>Hide</button></div>
      <img src={photo} alt="Board reference" />
      <p className="hint">Use the photo as reference, then tap squares below to correct the board. Auto-recognition comes after the core app is stable.</p>
    </section>}

    {showFen && <section className="card fenBox">
      <textarea value={fenInput} onChange={e => setFenInput(e.target.value)} placeholder="Paste FEN here" />
      <div className="row"><button onClick={loadFen}>Load FEN</button><button onClick={() => navigator.clipboard?.writeText(fen)}>Copy current FEN</button></div>
      <code>{fen}</code>
    </section>}

    <main className="mainGrid">
      <section className="boardWrap">
        <div className="board">
          {rows.map(r => cols.map(c => {
            const dark = (r + c) % 2;
            return <button key={`${r}-${c}`} className={`sq ${dark ? 'dark' : 'light'} ${selected?.[0]===r&&selected?.[1]===c?'sel':''}`} onClick={() => setSelected([r,c])}>
              <span>{UNICODE[board[r][c]]}</span>
            </button>
          }))}
        </div>
      </section>

      <section className="panel card">
        <div className="sideToggle">
          <button className={side==='w'?'active':''} onClick={() => {setSide('w'); setEvalResult(null)}}>White to move</button>
          <button className={side==='b'?'active':''} onClick={() => {setSide('b'); setEvalResult(null)}}>Black to move</button>
        </div>
        <div className="evalBar" aria-label="Evaluation bar">
          <div className="black" style={{width: `${100-wp}%`}}></div>
          <div className="white" style={{width: `${wp}%`}}></div>
        </div>
        <div className="score">{scoreText(evalResult)}</div>
        <button className="primary wide" disabled={!ready || busy} onClick={runEval}>{busy ? 'Analysing...' : 'Analyse'}</button>
        <p className="hint">Runs local Stockfish for about 0.7s, 1 thread, 16 MB hash. It does not show the best move.</p>
      </section>
    </main>

    <section className="card picker">
      <strong>{selected ? `Set square ${FILES[selected[1]]}${8-selected[0]}` : 'Tap a square, then choose piece'}</strong>
      <div className="pieces">
        {PIECES.map((p, i) => <button key={i} disabled={!selected} onClick={() => selected && setSquare(selected[0], selected[1], p)}>{p ? UNICODE[p] : 'Clear'}</button>)}
      </div>
    </section>
  </div>
}

createRoot(document.getElementById('root')).render(<App />);
