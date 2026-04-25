import React, { useEffect, useMemo, useRef, useState } from 'react';
import { START_FEN, pieceImageUrl } from './constants.js';
import {
  boardFromFen,
  isPromotionMove,
  legalMoveExists,
  makeGame,
  moveFen,
  pieceChar,
  squareName,
  tryParseFen,
} from './chessHelpers.js';
import { engineInfoText, scoreSide, scoreText, whiteShare } from './evalDisplay.js';
import { useStockfish } from './useStockfish.js';

const PROMOTIONS = ['q', 'r', 'b', 'n'];

export default function App() {
  const boardRef = useRef(null);
  const analysisIdRef = useRef(0);

  const [fen, setFen] = useState(START_FEN);
  const [fenText, setFenText] = useState(START_FEN);
  const [history, setHistory] = useState([START_FEN]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [engineKey, setEngineKey] = useState(0);

  const game = useMemo(() => makeGame(fen), [fen]);
  const board = useMemo(() => boardFromFen(fen), [fen]);
  const side = game.turn();

  const { analyse, ready } = useStockfish(engineKey, side);

  const share = whiteShare(evalResult);
  const displayBoard = flipped ? [...Array(64).keys()].reverse() : [...Array(64).keys()];
  const scoreOwner = scoreSide(evalResult);
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  

    ['K','Q','R','B','N','P','k','q','r','b','n','p'].forEach(piece => {
      const image = new Image();
      image.src = pieceImageUrl(piece);
    });
  }, []);

  useEffect(() => {
    setFenText(fen);
  }, [fen]);

  useEffect(() => {
    if (!ready || pendingPromotion) return;

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
  }, [fen, ready, engineKey, pendingPromotion]);

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

      const target = getDropSquare(event, rect);
      setDrag(null);

      if (!target) return;

      const from = squareName(drag.fromR, drag.fromC);
      const to = squareName(target.r, target.c);

      if (!legalMoveExists(fen, from, to)) return;

      if (isPromotionMove(fen, from, to)) {
        setPendingPromotion({
          from,
          to,
          color: drag.piece === drag.piece.toUpperCase() ? 'w' : 'b',
        });
        return;
      }

      const nextFen = moveFen(fen, from, to);
      if (nextFen) commitFen(nextFen);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [drag, fen, flipped, history, historyIndex]);

  function getDropSquare(event, rect) {
    const insideBoard =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    if (!insideBoard) return null;

    const file = Math.floor(((event.clientX - rect.left) / rect.width) * 8);
    const rank = Math.floor(((event.clientY - rect.top) / rect.height) * 8);

    return {
      r: flipped ? 7 - rank : rank,
      c: flipped ? 7 - file : file,
    };
  }

  function commitFen(nextFen) {
    const parsed = tryParseFen(nextFen);
    if (!parsed) return;

    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(parsed);

    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setFen(parsed);
    setEvalResult(null);
  }

  function startDrag(event, row, col, piece) {
    event.preventDefault();

    setDrag({
      piece,
      fromR: row,
      fromC: col,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function choosePromotion(promotion) {
    if (!pendingPromotion) return;

    const nextFen = moveFen(fen, pendingPromotion.from, pendingPromotion.to, promotion);
    setPendingPromotion(null);

    if (nextFen) commitFen(nextFen);
  }

  function reset() {
    setFen(START_FEN);
    setHistory([START_FEN]);
    setHistoryIndex(0);
    setEvalResult(null);
    setPendingPromotion(null);
  }

  function restartEngine() {
    setThinking(false);
    setEvalResult(null);
    setEngineKey(value => value + 1);
  }

  function goBack() {
    if (!canGoBack) return;

    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setFen(history[nextIndex]);
    setEvalResult(null);
    setPendingPromotion(null);
  }

  function goForward() {
    if (!canGoForward) return;

    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setFen(history[nextIndex]);
    setEvalResult(null);
    setPendingPromotion(null);
  }

  function handleFenChange(event) {
    const value = event.target.value;
    setFenText(value);

    const parsed = tryParseFen(value);
    if (!parsed) return;

    setFen(parsed);
    setHistory([parsed]);
    setHistoryIndex(0);
    setEvalResult(null);
    setPendingPromotion(null);
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
          const square = board[r][c];
          const piece = pieceChar(square);
          const dark = (r + c) % 2 === 1;
          const beingDragged = drag && drag.fromR === r && drag.fromC === c;

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
        {engineInfoText(evalResult, thinking, ready, side)}
      </div>

      {pendingPromotion && (
        <section className="promotionOverlay">
          <div className="promotionBox">
            {PROMOTIONS.map(promotion => {
              const piece = pendingPromotion.color === 'w'
                ? promotion.toUpperCase()
                : promotion;

              return (
                <button key={promotion} onClick={() => choosePromotion(promotion)}>
                  <img src={pieceImageUrl(piece)} alt="" draggable="false" />
                </button>
              );
            })}
          </div>
        </section>
      )}

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
