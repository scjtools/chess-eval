import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const FILES = 'abcdefgh';
const RANKS = '87654321';
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
const WHITE_PIECES = ['K','Q','R','B','N','P'];
const BLACK_PIECES = ['k','q','r','b','n','p'];
const UNICODE = {
  K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙',
  k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟', '':''
};

function cloneBoard(b) { return b.map(r => [...r]); }

function boardToFen(board, side='w') {
  const rows = board.map(row => {
    let out = '';
    let empties = 0;
    for (const p of row) {
      if (!p) empties++;
      else {
        if (empties) {
          out += empties;
          empties = 0;
        }
        out += p;
      }
    }
    if (empties) out += empties;
    return out;
  });
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

function formatScore(ev) {
  if (!ev) return { title: 'Not analysed', sub: 'Tap Analyse to get the current advantage.' };
  if (ev.type === 'mate') {
    const isWhite = ev.value > 0;
    return {
      title: isWhite ? `White mate in ${ev.value}` : `Black mate in ${Math.abs(ev.value)}`,
      sub: 'Forced mate found.'
    };
  }
  const pawns = ev.cp / 100;
  if (Math.abs(pawns) < 0.15) return { title: 'Equal', sub: 'Position is roughly balanced.' };
  return pawns > 0
    ? { title: `White +${pawns.toFixed(2)}`, sub: 'White is better.' }
    : { title: `Black +${Math.abs(pawns).toFixed(2)}`, sub: 'Black is better.' };
}

function whitePercent(ev) {
  if (!ev) return 50;
  if (ev.type === 'mate') return ev.value > 0 ? 100 : 0;
  const pawns = Math.max(-6, Math.min(6, ev.cp / 100));
  return Math.max(3, Math.min(97, 50 + (pawns / 6) * 50));
}

function pieceCount(board) {
  return board.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
}

function useStockfish() {
  const workerRef = useRef(null);
  const [status, setStatus] = useState('Engine loading');
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

        if (line.includes('readyok')) {
          setReady(true);
          setStatus('Offline engine ready');
        }

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
        setStatus('Engine failed to load');
        setReady(false);
      };

      worker.postMessage('uci');
      return () => worker.terminate();
    } catch {
      setStatus('Stockfish missing');
    }
  }, []);

  const analyse = (fen, side, movetime = 700) => new Promise((resolve, reject) => {
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const { analyse, status, ready } = useStockfish();
  const fen = useMemo(() => boardToFen(board, side), [board, side]);
  const score = formatScore(evalResult);
  const wp = whitePercent(evalResult);
  const totalPieces = pieceCount(board);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  function setSquare(r, c, piece) {
    const next = cloneBoard(board);
    next[r][c] = piece;
    setBoard(next);
    setEvalResult(null);
  }

  async function runEval() {
    setBusy(true);
    try {
      const ev = await analyse(fen, side, 700);
      setEvalResult(ev || { type: 'cp', cp: 0 });
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  function loadFen() {
    try {
      const parsed = fenToBoard(fenInput);
      setBoard(parsed.board);
      setSide(parsed.side);
      setEvalResult(null);
      setShowAdvanced(false);
    } catch (e) {
      alert(e.message);
    }
  }

  const rowOrder = flipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
  const colOrder = flipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
  const selectedLabel = selected ? `${FILES[selected[1]]}${8 - selected[0]}` : 'No square selected';

  return (
    <div className="appShell">
      <div className="topBar">
        <div>
          <div className="eyebrow">Offline chess evaluator</div>
          <h1>Chess Eval</h1>
          <p className="subcopy">Scan or reference a board, correct it manually, then see only the advantage.</p>
        </div>
        <div className={`statusPill ${ready ? 'ready' : ''}`}>{ready ? 'Engine ready' : status}</div>
      </div>

      <div className="contentGrid">
        <section className="boardCard panelCard">
          <div className="cardHeader compactHeader">
            <div>
              <h2>Board</h2>
              <p>{totalPieces} pieces on board</p>
            </div>
            <button className="ghostButton" onClick={() => setFlipped(!flipped)}>Flip board</button>
          </div>

          <div className="boardFrame">
            <div className="fileLabels top">
              {colOrder.map(c => <span key={`top-${c}`}>{FILES[c]}</span>)}
            </div>
            <div className="boardRow">
              <div className="rankLabels left">
                {rowOrder.map(r => <span key={`left-${r}`}>{RANKS[r]}</span>)}
              </div>
              <div className="boardSurface">
                <div className="board">
                  {rowOrder.map(r => colOrder.map(c => {
                    const dark = (r + c) % 2;
                    const isSel = selected?.[0] === r && selected?.[1] === c;
                    return (
                      <button
                        key={`${r}-${c}`}
                        className={`sq ${dark ? 'dark' : 'light'} ${isSel ? 'sel' : ''}`}
                        onClick={() => setSelected([r, c])}
                        aria-label={`${FILES[c]}${8 - r}`}
                      >
                        <span>{UNICODE[board[r][c]]}</span>
                      </button>
                    );
                  }))}
                </div>
              </div>
              <div className="rankLabels right">
                {rowOrder.map(r => <span key={`right-${r}`}>{RANKS[r]}</span>)}
              </div>
            </div>
            <div className="fileLabels bottom">
              {colOrder.map(c => <span key={`bottom-${c}`}>{FILES[c]}</span>)}
            </div>
          </div>

          <div className="boardMeta">
            <div className="metaChip">Selected: <strong>{selectedLabel}</strong></div>
            <div className="metaChip">Turn: <strong>{side === 'w' ? 'White' : 'Black'}</strong></div>
          </div>

          <div className="actionGrid">
            <label className="actionButton primaryAction">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setPhoto(URL.createObjectURL(f));
                  setShowPhoto(true);
                }}
              />
              <span className="actionTitle">Scan / photo</span>
              <span className="actionHint">Use camera or screenshot as reference</span>
            </label>
            <button className="actionButton" onClick={() => { setBoard(cloneBoard(START)); setEvalResult(null); }}>
              <span className="actionTitle">Start position</span>
              <span className="actionHint">Reset to normal chess setup</span>
            </button>
            <button className="actionButton" onClick={() => { setBoard(cloneBoard(EMPTY)); setEvalResult(null); }}>
              <span className="actionTitle">Empty board</span>
              <span className="actionHint">Build a position from scratch</span>
            </button>
            <button className="actionButton" onClick={() => setShowAdvanced(v => !v)}>
              <span className="actionTitle">Advanced</span>
              <span className="actionHint">FEN backup tools</span>
            </button>
          </div>
        </section>

        <section className="sideStack">
          <section className="panelCard evalCard">
            <div className="cardHeader">
              <div>
                <h2>Evaluation</h2>
                <p>Stockfish runs locally on your phone.</p>
              </div>
              <div className="moveToggle">
                <button className={side === 'w' ? 'active' : ''} onClick={() => { setSide('w'); setEvalResult(null); }}>White</button>
                <button className={side === 'b' ? 'active' : ''} onClick={() => { setSide('b'); setEvalResult(null); }}>Black</button>
              </div>
            </div>

            <div className="evalBarWrap">
              <div className="evalBarScale">
                <span>Black</span>
                <span>White</span>
              </div>
              <div className="evalBar" aria-label="Evaluation bar">
                <div className="whiteFill" style={{ width: `${wp}%` }} />
                <div className="barDivider" style={{ left: `${wp}%` }} />
              </div>
            </div>

            <div className="scoreBlock">
              <div className="scoreTitle">{score.title}</div>
              <div className="scoreSub">{score.sub}</div>
            </div>

            <button className="analyseButton" disabled={!ready || busy} onClick={runEval}>
              {busy ? 'Analysing…' : 'Analyse'}
            </button>

            <div className="engineNote">
              0.7s search • 1 thread • 16 MB hash • no best move shown
            </div>
          </section>

          <section className="panelCard pickerCard">
            <div className="cardHeader compactHeader">
              <div>
                <h2>Piece picker</h2>
                <p>Tap a square, then choose a piece.</p>
              </div>
              <button className="ghostButton" disabled={!selected} onClick={() => selected && setSquare(selected[0], selected[1], '')}>Clear square</button>
            </div>

            <div className="pickerSectionLabel">White</div>
            <div className="pieceGrid six">
              {WHITE_PIECES.map(piece => (
                <button key={piece} className="pieceButton" disabled={!selected} onClick={() => selected && setSquare(selected[0], selected[1], piece)}>
                  <span>{UNICODE[piece]}</span>
                </button>
              ))}
            </div>

            <div className="pickerSectionLabel">Black</div>
            <div className="pieceGrid six">
              {BLACK_PIECES.map(piece => (
                <button key={piece} className="pieceButton" disabled={!selected} onClick={() => selected && setSquare(selected[0], selected[1], piece)}>
                  <span>{UNICODE[piece]}</span>
                </button>
              ))}
            </div>
          </section>
        </section>
      </div>

      {showPhoto && photo && (
        <section className="panelCard photoCard">
          <div className="cardHeader compactHeader">
            <div>
              <h2>Reference image</h2>
              <p>Use it while correcting the board manually.</p>
            </div>
            <button className="ghostButton" onClick={() => setShowPhoto(false)}>Hide</button>
          </div>
          <img src={photo} alt="Board reference" />
        </section>
      )}

      {showAdvanced && (
        <section className="panelCard advancedCard">
          <div className="cardHeader compactHeader">
            <div>
              <h2>Advanced backup</h2>
              <p>FEN is hidden here so it does not clutter the main app.</p>
            </div>
            <button className="ghostButton" onClick={() => setShowAdvanced(false)}>Close</button>
          </div>
          <textarea value={fenInput} onChange={e => setFenInput(e.target.value)} placeholder="Paste FEN here" />
          <div className="advancedActions">
            <button className="ghostButton strong" onClick={loadFen}>Load FEN</button>
            <button className="ghostButton strong" onClick={() => navigator.clipboard?.writeText(fen)}>Copy current FEN</button>
          </div>
          <code>{fen}</code>
        </section>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
