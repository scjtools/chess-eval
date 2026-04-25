import React, { useEffect, useMemo, useRef, useState } from 'react';
import { INITIAL_CASTLING, INITIAL_EN_PASSANT, START_BOARD, pieceImageUrl } from './constants.js';
import {
  boardToFen,
  cloneBoard,
  clonePosition,
  enPassantAfterMove,
  enPassantCapturedPawnSquare,
  isEnPassantCapture,
  oppositeSide,
  tryFenToPosition,
  updateCastlingRights,
} from './chess.js';
import { engineInfoText, scoreSide, scoreText, whiteShare } from './evalDisplay.js';
import { useStockfish } from './useStockfish.js';

function initialPosition() {
  return {
    board: cloneBoard(START_BOARD),
    side: 'w',
    castling: INITIAL_CASTLING,
    enPassant: INITIAL_EN_PASSANT,
  };
}

export default function App() {
  const boardRef = useRef(null);
  const analysisIdRef = useRef(0);

  const [position, setPosition] = useState(initialPosition);
  const [history, setHistory] = useState([initialPosition()]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [fenText, setFenText] = useState(boardToFen(START_BOARD, 'w', INITIAL_CASTLING, INITIAL_EN_PASSANT));
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [engineKey, setEngineKey] = useState(0);

  const { analyse, ready } = useStockfish(engineKey, position.side);

  const fen = useMemo(
    () => boardToFen(position.board, position.side, position.castling, position.enPassant),
    [position]
  );

  const share = whiteShare(evalResult);
  const displayBoard = flipped ? [...Array(64).keys()].reverse() : [...Array(64).keys()];
  const scoreOwner = scoreSide(evalResult);
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

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

      const nextPosition = buildDroppedPosition(event, rect);
      setDrag(null);

      if (!nextPosition) return;

      commitPosition(nextPosition);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [drag, position, flipped, history, historyIndex]);

  function buildDroppedPosition(event, rect) {
    const insideBoard =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    const nextBoard = cloneBoard(position.board);
    const [fromR, fromC] = drag.from;
    const movingPiece = drag.piece;

    nextBoard[fromR][fromC] = '';

    if (!insideBoard) {
      return {
        board: nextBoard,
        side: position.side,
        castling: updateCastlingRights(position.castling, {
          piece: movingPiece,
          fromR,
          fromC,
          toR: null,
          toC: null,
          capturedPiece: '',
        }),
        enPassant: '-',
      };
    }

    const file = Math.floor(((event.clientX - rect.left) / rect.width) * 8);
    const rank = Math.floor(((event.clientY - rect.top) / rect.height) * 8);
    const toR = flipped ? 7 - rank : rank;
    const toC = flipped ? 7 - file : file;

    if (toR < 0 || toR > 7 || toC < 0 || toC > 7) return null;

    if (toR === fromR && toC === fromC) {
      nextBoard[fromR][fromC] = movingPiece;
      return null;
    }

    let capturedPiece = position.board[toR][toC];

    const epCapture = isEnPassantCapture({
      piece: movingPiece,
      fromR,
      fromC,
      toR,
      toC,
      capturedPiece,
    }, position.enPassant);

    if (epCapture) {
      const [capR, capC] = enPassantCapturedPawnSquare(movingPiece, toR, toC);
      capturedPiece = nextBoard[capR][capC];
      nextBoard[capR][capC] = '';
    }

    const isKing = movingPiece === 'K' || movingPiece === 'k';
    const isCastle = isKing && fromR === toR && Math.abs(toC - fromC) === 2;

    nextBoard[toR][toC] = movingPiece;

    if (isCastle) {
      moveCastlingRook(nextBoard, movingPiece, toR, toC, fromC);
    }

    const move = {
      piece: movingPiece,
      fromR,
      fromC,
      toR,
      toC,
      capturedPiece,
    };

    return {
      board: nextBoard,
      side: oppositeSide(position.side),
      castling: updateCastlingRights(position.castling, move),
      enPassant: enPassantAfterMove(move),
    };
  }

  function commitPosition(nextPosition) {
    const clean = clonePosition(nextPosition);
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(clean);

    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setPosition(clean);
    setEvalResult(null);
  }

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
    const fresh = initialPosition();

    setPosition(fresh);
    setHistory([fresh]);
    setHistoryIndex(0);
    setEvalResult(null);
  }

  function restartEngine() {
    setThinking(false);
    setEvalResult(null);
    setEngineKey(value => value + 1);
  }

  function goBack() {
    if (!canGoBack) return;

    const nextIndex = historyIndex - 1;
    const nextPosition = clonePosition(history[nextIndex]);

    setHistoryIndex(nextIndex);
    setPosition(nextPosition);
    setEvalResult(null);
  }

  function goForward() {
    if (!canGoForward) return;

    const nextIndex = historyIndex + 1;
    const nextPosition = clonePosition(history[nextIndex]);

    setHistoryIndex(nextIndex);
    setPosition(nextPosition);
    setEvalResult(null);
  }

  function handleFenChange(event) {
    const value = event.target.value;
    setFenText(value);

    const parsed = tryFenToPosition(value);
    if (!parsed) return;

    const clean = clonePosition(parsed);

    setPosition(clean);
    setHistory([clean]);
    setHistoryIndex(0);
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
          const piece = position.board[r][c];
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
        <button onClick={goBack} disabled={!canGoBack}>←</button>
        <button onClick={goForward} disabled={!canGoForward}>→</button>
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
        {engineInfoText(evalResult, thinking, ready, position.side)}
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
