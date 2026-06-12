import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import NumberBoard from '../components/NumberBoard';
import WinnerBanner from '../components/WinnerBanner';
import { toast, ToastContainer } from '../components/Toast';
import './Host.css';

const WIN_LABELS = {
  topLine: 'Top Line',
  middleLine: 'Middle Line',
  bottomLine: 'Bottom Line',
  corners: 'Four Corners',
  earlyFive: 'Early Five',
  fullHouse: 'Full House',
};

const MAX_WINNERS = {
  topLine: 4,
  middleLine: 4,
  bottomLine: 4,
  corners: 4,
  earlyFive: 5,
  fullHouse: 3,
};

export default function Host() {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const { socket, connected } = useSocket();

  const [gameState, setGameState] = useState({
    status: 'waiting',
    calledNumbers: [],
    currentNumber: null,
    winners: {},
    playerCount: 0,
    autoCallDelay: 5000,
  });
  const [players, setPlayers] = useState([]);
  const [autoCall, setAutoCall] = useState(false);
  const [autoDelay, setAutoDelay] = useState(5);
  const [winnerEvent, setWinnerEvent] = useState(null);
  const [currentNumAnim, setCurrentNumAnim] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const prevNumRef = useRef(null);

  function copyInviteLink() {
    const link = `${window.location.origin}/play/${roomId}`;
    navigator.clipboard.writeText(link).then(() => {
      toast('📋 Invite link copied to clipboard!', 'success');
    }).catch(() => {
      toast('❌ Failed to copy link', 'error');
    });
  }

  useEffect(() => {
    if (gameState.currentNumber && gameState.currentNumber !== prevNumRef.current) {
      prevNumRef.current = gameState.currentNumber;
      setCurrentNumAnim(false);
      setTimeout(() => setCurrentNumAnim(true), 50);
    }
  }, [gameState.currentNumber]);

  useEffect(() => {
    if (!socket || !roomId || !connected) return;

    socket.emit('host:join', { roomId });

    socket.on('host:joined', ({ state }) => {
      setGameState(state);
      setAutoDelay((state.autoCallDelay || 5000) / 1000);
    });

    socket.on('host:playerUpdate', ({ playerCount, players: pl }) => {
      setGameState(prev => ({ ...prev, playerCount }));
      setPlayers(pl || []);
    });

    socket.on('host:autoCallStatus', ({ enabled }) => {
      setAutoCall(enabled);
    });

    socket.on('number:called', ({ number, calledNumbers, remaining }) => {
      setGameState(prev => ({ ...prev, currentNumber: number, calledNumbers }));
    });

    socket.on('game:started', (state) => {
      setGameState(state);
      setAutoCall(false);
      toast('Game started!', 'success');
    });

    socket.on('game:paused', () => {
      setGameState(prev => ({ ...prev, status: 'paused' }));
      setAutoCall(false);
      toast('Game paused', 'info');
    });

    socket.on('game:resumed', (state) => {
      setGameState(state);
      toast('Game resumed', 'success');
    });

    socket.on('game:reset', (state) => {
      setGameState(state);
      setAutoCall(false);
      setPlayers([]);
      toast('Game reset', 'info');
    });

    socket.on('game:ended', ({ message }) => {
      setGameState(prev => ({ ...prev, status: 'ended' }));
      setAutoCall(false);
      toast(message || 'All numbers called!', 'gold');
    });

    socket.on('game:winner', (data) => {
      setGameState(prev => ({
        ...prev,
        winners: { ...prev.winners, [data.type]: data.winners },
      }));
      setWinnerEvent(data);
      toast(`🏆 ${data.player.name} won ${WIN_LABELS[data.type]}!`, 'gold');
    });

    return () => {
      socket.off('host:joined');
      socket.off('host:playerUpdate');
      socket.off('host:autoCallStatus');
      socket.off('number:called');
      socket.off('game:started');
      socket.off('game:paused');
      socket.off('game:resumed');
      socket.off('game:reset');
      socket.off('game:ended');
      socket.off('game:winner');
    };
  }, [socket, roomId, connected]);

  function startGame() {
    socket?.emit('host:startGame');
  }

  function callNumber() {
    socket?.emit('host:callNumber');
  }

  function togglePause() {
    socket?.emit('host:pauseGame');
  }

  function toggleAutoCall() {
    const newVal = !autoCall;
    socket?.emit('host:toggleAutoCall', { enabled: newVal, delay: autoDelay * 1000 });
    setAutoCall(newVal);
  }

  function handleDelayChange(val) {
    const d = Math.max(3, Math.min(30, Number(val)));
    setAutoDelay(d);
    if (autoCall) {
      socket?.emit('host:toggleAutoCall', { enabled: true, delay: d * 1000 });
    }
  }

  function resetGame() {
    socket?.emit('host:resetGame');
    setShowReset(false);
  }

  const calledCount = gameState.calledNumbers?.length || 0;
  const isRunning = gameState.status === 'running';
  const isPaused = gameState.status === 'paused';
  const isWaiting = gameState.status === 'waiting';
  const isEnded = gameState.status === 'ended';
  const canCall = isRunning && !autoCall;

  const winTypes = [
    { key: 'topLine', label: 'Top Line', icon: 'looks_one' },
    { key: 'middleLine', label: 'Middle Line', icon: 'looks_two' },
    { key: 'bottomLine', label: 'Bottom Line', icon: 'looks_3' },
    { key: 'corners', label: 'Corners', icon: 'crop_square' },
    { key: 'earlyFive', label: 'Early Five', icon: 'filter_5' },
    { key: 'fullHouse', label: 'Full House', icon: 'home' },
  ];

  return (
    <div className="host-page">
      {/* Header */}
      <header className="host-header">
        <div className="host-header-left">
          <button className="icon-btn" onClick={() => navigate('/')}>
            <span className="material-icons">arrow_back</span>
          </button>
          <div>
            <h1 className="host-title">Host Panel</h1>
            <p className="host-sub">Multiplayer Tambola</p>
          </div>
        </div>
        <div className="host-header-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="room-id-badge" style={{
            background: 'rgba(212, 175, 55, 0.1)',
            border: '1px solid rgba(212, 175, 55, 0.3)',
            color: 'var(--gold)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 12px',
            fontSize: '14px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }} onClick={copyInviteLink} title="Click to copy invite link">
            <span className="material-icons" style={{ fontSize: '16px' }}>share</span>
            <span>Room: {roomId}</span>
          </div>
          <div className={`conn-dot ${connected ? 'conn-dot--on' : 'conn-dot--off'}`}>
            <span className={`dot ${connected ? 'dot-green' : 'dot-red'}`} />
            {connected ? 'Live' : 'Offline'}
          </div>
          <div className="player-count-badge" onClick={() => setShowPlayers(true)}>
            <span className="material-icons">group</span>
            {gameState.playerCount}
          </div>
        </div>
      </header>

      <div className="host-body">
        {/* Status bar */}
        <div className="status-bar">
          <div className={`status-indicator status-${gameState.status}`}>
            <span className="material-icons">
              {isWaiting ? 'hourglass_empty' : isRunning ? 'play_circle' : isPaused ? 'pause_circle' : 'check_circle'}
            </span>
            <span>
              {isWaiting ? 'Waiting to Start' : isRunning ? 'Game Running' : isPaused ? 'Paused' : 'Game Ended'}
            </span>
          </div>
          <div className="status-stats">
            <span><b>{calledCount}</b> called</span>
            <span className="dot-sep">·</span>
            <span><b>{90 - calledCount}</b> left</span>
            <span className="dot-sep">·</span>
            <span><b>{gameState.playerCount}</b> players</span>
          </div>
        </div>

        {/* Current number hero */}
        <div className="host-number-hero">
          <div className="num-hero-label">
            <span className="material-icons">casino</span>
            Current Number
          </div>
          <div className={`num-hero-display ${currentNumAnim ? 'animate-pop' : ''}`}>
            {gameState.currentNumber || <span className="num-placeholder">—</span>}
          </div>

          {gameState.calledNumbers?.length > 0 && (
            <div className="host-recent-nums">
              {[...gameState.calledNumbers].reverse().slice(0, 10).map((n, i) => (
                <span key={i} className={`recent-num ${i === 0 ? 'recent-num--latest' : ''}`}>{n}</span>
              ))}
            </div>
          )}
        </div>

        {/* Game controls */}
        <section className="card">
          <div className="section-header">
            <span className="material-icons">tune</span>
            Game Controls
          </div>

          <div className="controls-grid">
            {isWaiting && (
              <button className="btn btn-gold btn-lg ctrl-btn" onClick={startGame} disabled={!connected}>
                <span className="material-icons">play_arrow</span>
                Start Game
              </button>
            )}

            {(isRunning || isPaused) && (
              <>
                <button
                  className="btn btn-gold btn-lg ctrl-btn"
                  onClick={callNumber}
                  disabled={!canCall}
                >
                  <span className="material-icons">skip_next</span>
                  Call Number
                </button>

                <button
                  className={`btn btn-lg ctrl-btn ${isPaused ? 'btn-gold' : 'btn-outline'}`}
                  onClick={togglePause}
                  disabled={!connected}
                >
                  <span className="material-icons">{isPaused ? 'play_arrow' : 'pause'}</span>
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
              </>
            )}

            {isEnded && (
              <div className="ended-msg">
                <span className="material-icons">celebration</span>
                All 90 numbers have been called!
              </div>
            )}
          </div>

          {/* Auto-call controls */}
          {(isRunning || isPaused) && (
            <div className="autocall-section">
              <div className="autocall-header">
                <div>
                  <p className="autocall-title">Auto-Call Numbers</p>
                  <p className="autocall-sub">Automatically call numbers at set intervals</p>
                </div>
                <button
                  className={`toggle-btn ${autoCall ? 'toggle-btn--on' : ''}`}
                  onClick={toggleAutoCall}
                  disabled={isPaused}
                >
                  <span className="toggle-knob" />
                </button>
              </div>

              <div className="delay-control">
                <label className="delay-label">
                  <span className="material-icons">timer</span>
                  Interval: <b>{autoDelay}s</b>
                </label>
                <input
                  type="range"
                  min={3} max={30} step={1}
                  value={autoDelay}
                  onChange={e => handleDelayChange(e.target.value)}
                  className="delay-slider"
                />
                <div className="delay-ticks">
                  <span>3s</span><span>15s</span><span>30s</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Number board */}
        <section className="card">
          <div className="section-header">
            <span className="material-icons">grid_4x4</span>
            Number Board
          </div>
          <NumberBoard
            calledNumbers={gameState.calledNumbers}
            currentNumber={gameState.currentNumber}
          />
        </section>

        {/* Winners */}
        <section className="card">
          <div className="section-header">
            <span className="material-icons">emoji_events</span>
            Winners Board
          </div>
          <div className="host-winners">
            {winTypes.map(({ key, label, icon }) => {
              const w = Array.isArray(gameState.winners?.[key]) ? gameState.winners[key] : [];
              const isFull = w.length >= MAX_WINNERS[key];
              return (
                <div key={key} className={`hw-row ${w.length > 0 ? 'hw-row--won' : ''}`}>
                  <div className="hw-left">
                    <span className="material-icons hw-icon">{icon}</span>
                    <div>
                      <span className="hw-label">{label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 6 }}>
                        {w.length}/{MAX_WINNERS[key]}
                      </span>
                    </div>
                  </div>
                  <div className="hw-right">
                    {w.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                        {w.map((winner, i) => (
                          <span key={i} className="hw-name">
                            <span className="material-icons" style={{ fontSize: 13, color: 'var(--gold)' }}>verified</span>
                            {winner.name}
                          </span>
                        ))}
                        {!isFull && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Still open...</span>}
                      </div>
                    ) : (
                      <span className="hw-empty">Unclaimed</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Danger zone */}
        <section className="card card-danger">
          <div className="section-header">
            <span className="material-icons">warning</span>
            Danger Zone
          </div>
          <p className="danger-desc">Resetting will clear all players, tickets, and called numbers. This cannot be undone.</p>
          <button className="btn btn-danger" onClick={() => setShowReset(true)}>
            <span className="material-icons">restart_alt</span>
            Reset Game
          </button>

        </section>
      </div>

      {/* Players modal */}
      {showPlayers && (
        <div className="modal-overlay" onClick={() => setShowPlayers(false)}>
          <div className="modal-card animate-fadeUp" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Players ({players.length})</h2>
              <button className="icon-btn" onClick={() => setShowPlayers(false)}>
                <span className="material-icons">close</span>
              </button>
            </div>
            <div className="players-list">
              {players.length === 0 ? (
                <p className="empty-msg">No players have joined yet.</p>
              ) : (
                players.map((p, i) => (
                  <div key={p.id} className="player-item">
                    <div className="player-avatar">{p.name[0].toUpperCase()}</div>
                    <span className="player-name">{p.name}</span>
                    <span className="player-num">#{i + 1}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reset confirm modal */}
      {showReset && (
        <div className="modal-overlay" onClick={() => setShowReset(false)}>
          <div className="modal-card animate-fadeUp" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Reset Game?</h2>
              <button className="icon-btn" onClick={() => setShowReset(false)}>
                <span className="material-icons">close</span>
              </button>
            </div>
            <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 20 }}>
              All players, tickets, and called numbers will be cleared. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowReset(false)}>Cancel</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={resetGame}>
                <span className="material-icons">restart_alt</span>
                Yes, Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Winner overlay */}
      {winnerEvent && (
        <WinnerBanner event={winnerEvent} onClose={() => setWinnerEvent(null)} />
      )}

      <ToastContainer />
    </div>
  );
}
