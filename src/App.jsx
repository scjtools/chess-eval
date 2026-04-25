import React, { useEffect, useMemo, useRef, useState } from 'react';
import { INITIAL_CASTLING, START_BOARD, pieceImageUrl } from './constants.js';
import {
  boardToFen,
  cloneBoard,
  oppositeSide,
  tryFenToPosition,
  updateCastlingRights,
} from './chess.js';
import { engineInfoText, scoreSide, scoreText, whiteShare } from './evalDisplay.js';
import { useStockfish } from './useStockfish.js';

export default function App() {
  const boardRef = useRef(null);
  const analysisIdRef = useRef(0);

  const [board, setBoard] = useState(cloneBoard(START_BOARD));
  const [side, setSide] = useState('w');
  const [castling, setCastling] = useState(INITIAL_CASTLING);
  const [fenText, setFenText] = useState(boardToFen(START_BOARD, 'w', INITIAL_CASTLING));
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [engineKey, setEngineKey] = useState(0);

  const { analyse, ready } = useStockfish(engineKey, side);

  const fen = useMemo(() => boardToFen(board, side, castling), [board, side, castling]);
  const share = whiteShare(evalResult);
  const displayBoard = flipped ? [...Array(64).keys()].reverse() : [...Array(64).keys()];
  const scoreOwner = scoreSide(evalResult);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    setFenText(fen);
  }, [fen]);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;
    const requestId = ++analysisIdRef.current;

    const timer = setTimeout(async () => {
      setThinking(true);

      try {
        const result = await analyse(fen);

        if (!cancelled && requestId === analysisIdRef.current) {
          setEvalResult(result || null);
        }
      } catch {
        if (!cancelled && requestId === analysisIdRef.current) {
          setEvalResult(null);
        }
      } finally {
        if (!cancelled && requestId === analysisIdRef.current) {
          setThinking(false);
        }
      }
    }, 420);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fen, ready, engineKey]);

  useEffect(() => {
    function onPointerMove(event) {
      if (!drag) return;

      setDrag(current => current ? {
        ...current,
        x: event.clientX,
        y: event.clientY,
      } : current);
    }

    function onPointerUp(event) {
      if (!drag) return;

      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) {
        setDrag(null);
        return;
      }

      const insideBoard =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      const next = cloneBoard(board);
      const [fromR, fromC] = drag.from;
      next[fromR][fromC] = '';

      let completedBoardMove = false;
      let nextCastling = castling;

      if (insideBoard) {
        const file = Math.floor(((event.clientX - rect.left) / rect.width) * 8);
        const rank = Math.floor(((event.clientY - rect.top) / rect.height) * 8);
        const toR = flipped ? 7 - rank : rank;
        const toC = flipped ? 7 - file : file;

        if (toR >= 0 && toR < 8 && toC >= 0 && toC < 8) {
          const capturedPiece = board[toR][toC];
          const isKing = drag.piece === 'K' || drag.piece === 'k';
          const isCastle = isKing && fromR === toR && Math.abs(toC - fromC) === 2;

          next[toR][toC] = drag.piece;
          completedBoardMove = toR !== fromR || toC !== fromC;

          if (isCastle) {
            moveCastlingRook(next, drag.piece, toR, toC, fromC);
          }

          if (completedBoardMove) {
            nextCastling = updateCastlingRights(castling, {
              piece: drag.piece,
              fromR,
              fromC,
              toR,
              toC,
              capturedPiece,
            });
          }
        }
      } else {
        nextCastling = updateCastlingRights(castling, {
          piece: drag.piece,
          fromR,
          fromC,
          toR: null,
          toC: null,
          capturedPiece: '',
        });
      }

      setBoard(next);
      setCastling(nextCastling);

      if (completedBoardMove) {
        setSide(current => oppositeSide(current));
      }

      setEvalResult(null);
      setDrag(null);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [drag, board, flipped, castling]);

  function startDrag(event, r, c, piece) {
    event.preventDefault();

    setDrag({
      piece,
      from: [r, c],
      x: event.clientX,
      y: event.clientY,
    });
  }

  function reset() {
    setBoard(cloneBoard(START_BOARD));
    setSide('w');
    setCastling(INITIAL_CASTLING);
    setEvalResult(null);
  }

  function restartEngine() {
    setThinking(false);
    setEvalResult(null);
    setEngineKey(value => value + 1);
  }

  function handleFenChange(event) {
    const value = event.target.value;
    setFenText(value);

    const parsed = tryFenToPosition(value);
    if (!parsed) return;

    setBoard(parsed.board);
    setSide(parsed.side);
    setCastling(parsed.castling);
    setEvalResult(null);
  }

  return (
    <main className="app">
      <section className="eval">
        <div className="evalWhite" style={{ width: `${share}%` }} />
        <div className="evalBlack" />
        <div className={`evalNumber ${scoreOwner === 'black' ? 'blackSide' : 'whiteSide'}`}>
          {scoreText(evalResult, thinking, ready)}
        </div>
      </section>

      <section className="board" ref={boardRef}>
        {displayBoard.map(index => {
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
                  src={pieceImageUrl(piece)}
                  alt=""
                  draggable="false"
                  onPointerDown={event => startDrag(event, r, c, piece)}
                />
              )}
            </div>
          );
        })}
      </section>

      <section className="toolbar">
        <button onClick={() => setFlipped(value => !value)}>Flip</button>
        <button onClick={reset}>Reset</button>
        <button onClick={restartEngine}>Engine</button>
      </section>

      <input
        className="fenInput"
        value={fenText}
        onChange={handleFenChange}
        spellCheck="false"
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="Paste FEN"
      />

      <div className="engineInfo">
        {engineInfoText(evalResult, thinking, ready)}
      </div>

      {drag && (
        <img
          className="dragPiece"
          src={pieceImageUrl(drag.piece)}
          alt=""
          draggable="false"
          style={{
            transform: `translate(${drag.x - 34}px, ${drag.y - 34}px)`,
          }}
        />
      )}
    </main>
  );
}

function moveCastlingRook(board, king, row, kingToC, kingFromC) {
  const kingside = kingToC > kingFromC;
  const rookFromC = kingside ? 7 : 0;
  const rookToC = kingside ? kingToC - 1 : kingToC + 1;
  const expectedRook = king === 'K' ? 'R' : 'r';

  if (board[row][rookFromC] === expectedRook) {
    board[row][rookFromC] = '';
    board[row][rookToC] = expectedRook;
  }
}
