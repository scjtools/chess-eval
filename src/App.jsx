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
  const ghostRef = useRef(null);

  const [fen, setFen] = useState(START_FEN);
  const [fenText, setFenText] = useState(START_FEN);
  const [history, setHistory] = useState([START_FEN]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
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
      setEvalResult(null);
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
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fen, ready, engineKey, pendingPromotion]);

  function getDropSquare(point, rect) {
    const x = point.clientX ?? point.x;
    const y = point.clientY ?? point.y;

    const insideBoard =
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom;

    if (!insideBoard) return null;

    const file = Math.floor(((x - rect.left) / rect.width) * 8);
    const rank = Math.floor(((y - rect.top) / rect.height) * 8);

    return {
      r: flipped ? 7 - rank : rank,
      c: flipped ? 7 - file : file,
    };
  }

  function startDrag(event, row, col, piece) {
    event.preventDefault();

    const from = squareName(row, col);
    const src = pieceImageUrl(piece);
    const ghost = document.createElement('img');

    ghost.src = src;
    ghost.alt = '';
    ghost.draggable = false;
    ghost.className = 'dragPiece';
    document.body.appendChild(ghost);
    ghostRef.current = ghost;

    moveGhost(event.clientX, event.clientY);

    function moveGhost(x, y) {
      if (!ghostRef.current) return;
      ghostRef.current.style.transform = `translate3d(${x - 34}px, ${y - 34}px, 0)`;
    }

    function onPointerMove(moveEvent) {
      moveEvent.preventDefault();
      moveGhost(moveEvent.clientX, moveEvent.clientY);
    }

    function onPointerUp(upEvent) {
      upEvent.preventDefault();

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);

      const rect = boardRef.current?.getBoundingClientRect();

      removeGhost();

      if (!rect) return;

      const target = getDropSquare(upEvent, rect);
      if (!target) return;

      const to = squareName(target.r, target.c);

      if (!legalMoveExists(fen, from, to)) return;

      if (isPromotionMove(fen, from, to)) {
        setPendingPromotion({
          from,
          to,
          color: piece === piece.toUpperCase() ? 'w' : 'b',
        });
        return;
      }

      const nextFen = moveFen(fen, from, to);
      if (nextFen) commitFen(nextFen);
    }

    function onPointerCancel() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      removeGhost();
    }

    function removeGhost() {
      if (ghostRef.current) {
        ghostRef.current.remove();
        ghostRef.current = null;
      }
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: false });
    window.addEventListener('pointercancel', onPointerCancel, { passive: false });
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

          return (
            <div key={`${r}-${c}`} className={`square ${dark ? 'dark' : 'light'}`}>
              {piece && (
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
              const promotionPiece = pendingPromotion.color === 'w'
                ? promotion.toUpperCase()
                : promotion;

              return (
                <button key={promotion} onClick={() => choosePromotion(promotion)}>
                  <img src={pieceImageUrl(promotionPiece)} alt="" draggable="false" />
                </button>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
