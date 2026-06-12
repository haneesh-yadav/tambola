import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import Ticket from '../components/Ticket';
import NumberBoard from '../components/NumberBoard';
import WinnerBanner from '../components/WinnerBanner';
import { toast, ToastContainer } from '../components/Toast';
import './Play.css';

const TIMER_DURATION = 30; // seconds

const STATUS_LABEL = {
  waiting: 'Waiting for host',
  running: 'Game Live',
  paused: 'Game Paused',
  ended: 'Game Ended',
};

function NumberTimer({ secondsLeft, total = TIMER_DURATION }) {
  if (secondsLeft === null) return null;

  const pct = (secondsLeft / total) * 100;
  const urgent = secondsLeft <= 5;
  const warn = secondsLeft <= 10 && !urgent;
  const state = urgent ? 'urgent' : warn ? 'warn' : 'ok';

  return (
    <div className="number-timer">
      <div className={`timer-label timer-label--${state}`}>
        <span className="material-icons">timer</span>
        {urgent ? 'Hurry! Mark your number!' : warn ? 'Running out of time!' : 'Mark your number'}
      </div>
      <div className="timer-seconds-row">
        <span className={`timer-seconds timer-seconds--${state}`}>{secondsLeft}</span>
        <span className="timer-seconds-sub">sec left</span>
      </div>
      <div className="timer-bar-track">
        <div
          className={`timer-bar-fill timer-bar-fill--${state}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function Play() {
  const navigate = useNavigate();
  const { roomId: urlRoomId } = useParams();
  const { socket, connected } = useSocket();

  const [playerToken] = useState(() => {
    let token = sessionStorage.getItem('tambola_player_token');
    if (!token) {
      token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('tambola_player_token', token);
    }
    return token;
  });

  const [phase, setPhase] = useState(() => {
    const activeRoom = sessionStorage.getItem('tambola_active_room');
    const activeName = sessionStorage.getItem('tambola_active_name');
    return (activeRoom && activeName) ? 'game' : 'join';
  });

  const [roomId, setRoomId] = useState(() => urlRoomId || sessionStorage.getItem('tambola_active_room') || '');
  const [roomIdError, setRoomIdError] = useState('');
  const [name, setName] = useState(() => sessionStorage.getItem('tambola_active_name') || '');
  const [nameError, setNameError] = useState('');
  const [player, setPlayer] = useState(null);
  const [gameState, setGameState] = useState({
    status: 'waiting',
    calledNumbers: [],
    currentNumber: null,
    winners: {},
    playerCount: 0,
  });
  const [winnerEvent, setWinnerEvent] = useState(null);
  const [claims, setClaims] = useState([]);
  const [currentNumAnim, setCurrentNumAnim] = useState(false);
  const prevNumRef = useRef(null);

  // Timer state
  const [timerSeconds, setTimerSeconds] = useState(null); // null = no active timer
  const timerRef = useRef(null);

  function startTimer() {
    clearInterval(timerRef.current);
    setTimerSeconds(TIMER_DURATION);
    timerRef.current = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerRef.current);
    setTimerSeconds(null);
  }

  // timerActive = timer is running and > 0
  const timerActive = timerSeconds !== null && timerSeconds > 0;

  // Animate number change
  useEffect(() => {
    if (gameState.currentNumber && gameState.currentNumber !== prevNumRef.current) {
      prevNumRef.current = gameState.currentNumber;
      setCurrentNumAnim(false);
      setTimeout(() => setCurrentNumAnim(true), 50);
    }
  }, [gameState.currentNumber]);

  // Cleanup timer on unmount
  useEffect(() => () => clearInterval(timerRef.current), []);

  useEffect(() => {
    if (!socket) return;

    socket.on('player:joined', ({ player, state }) => {
      setPlayer(player);
      setGameState(state);
      setClaims(player.claims || []);
      setPhase('game');
      
      // Persist session details
      sessionStorage.setItem('tambola_active_room', roomId || state.roomId);
      sessionStorage.setItem('tambola_active_name', name || player.name);
    });

    socket.on('error', ({ message }) => {
      setNameError(message);
      toast(message, 'error');
      
      // If error occurs during active game phase, restore join panel
      sessionStorage.removeItem('tambola_active_room');
      sessionStorage.removeItem('tambola_active_name');
      setPhase('join');
      setPlayer(null);
    });

    socket.on('number:called', ({ number, calledNumbers }) => {
      setGameState(prev => ({ ...prev, currentNumber: number, calledNumbers }));
      toast(`Number called: ${number}`, 'info');
      startTimer();
    });

    socket.on('game:started', (state) => {
      setGameState(state);
      setClaims([]);
      stopTimer();
      toast('Game has started! Good luck! 🎯', 'success');
    });

    socket.on('game:paused', () => {
      setGameState(prev => ({ ...prev, status: 'paused' }));
      stopTimer();
      toast('Game paused by host', 'info');
    });

    socket.on('game:resumed', (state) => {
      setGameState(state);
      toast('Game resumed!', 'success');
    });

    socket.on('game:reset', (state) => {
      setGameState(state);
      setClaims([]);
      stopTimer();
      toast('Game has been reset', 'info');
    });

    socket.on('game:ended', ({ message }) => {
      setGameState(prev => ({ ...prev, status: 'ended' }));
      stopTimer();
      toast(message || 'Game ended!', 'info');
    });

    socket.on('game:winner', (data) => {
      setGameState(prev => ({
        ...prev,
        winners: { ...prev.winners, [data.type]: data.player },
      }));
      setWinnerEvent(data);
    });

    socket.on('claim:accepted', ({ type }) => {
      setClaims(prev => [...prev, type]);
      toast('🎉 Claim accepted! You won!', 'gold');
    });

    socket.on('claim:rejected', ({ reason }) => {
      toast(reason || 'Claim rejected', 'error');
    });

    socket.on('game:hostDisconnected', () => {
      toast('⚠️ Host disconnected. Waiting for reconnection...', 'error');
    });

    socket.on('game:roomClosed', ({ message }) => {
      toast(message || 'Room closed by host.', 'error');
      sessionStorage.removeItem('tambola_active_room');
      sessionStorage.removeItem('tambola_active_name');
      setPhase('join');
      setPlayer(null);
    });

    socket.on('state:current', ({ player: p, ...state }) => {
      if (p) {
        setPlayer(p);
        setClaims(p.claims || []);
        setGameState(state);
        setPhase('game');
      }
    });

    return () => {
      socket.off('player:joined');
      socket.off('error');
      socket.off('number:called');
      socket.off('game:started');
      socket.off('game:paused');
      socket.off('game:resumed');
      socket.off('game:reset');
      socket.off('game:ended');
      socket.off('game:winner');
      socket.off('claim:accepted');
      socket.off('claim:rejected');
      socket.off('game:hostDisconnected');
      socket.off('game:roomClosed');
      socket.off('state:current');
    };
  }, [socket, roomId, name]);

  // Session Recovery & Reconnect recovery
  useEffect(() => {
    if (socket && connected && phase === 'game') {
      const activeRoom = sessionStorage.getItem('tambola_active_room');
      const activeName = sessionStorage.getItem('tambola_active_name');
      if (activeRoom && activeName) {
        socket.emit('player:join', { roomId: activeRoom, name: activeName, playerToken });
      } else {
        socket.emit('state:get');
      }
    }
  }, [socket, connected, phase, playerToken]);

  function handleJoin(e) {
    e.preventDefault();
    if (!roomId.trim()) {
      setRoomIdError('Room ID is required');
      return;
    }
    if (!name.trim() || name.trim().length < 2) {
      setNameError('Please enter at least 2 characters');
      return;
    }
    if (!connected) {
      setNameError('Not connected to server. Please wait...');
      return;
    }
    setNameError('');
    setRoomIdError('');
    socket.emit('player:join', { roomId: roomId.trim(), name: name.trim(), playerToken });
  }

  const handleClaim = useCallback((type) => {
    if (!socket) return;
    socket.emit('player:claim', { type });
  }, [socket]);

  const calledCount = gameState.calledNumbers?.length || 0;

  if (phase === 'join') {
    return (
      <div className="play-join">
        <div className="play-join-bg" />
        <div className="join-card animate-fadeUp">
          <button className="back-btn" onClick={() => navigate('/')}>
            <span className="material-icons">arrow_back</span>
          </button>

          <div className="join-logo">
            <span className="material-icons">grid_on</span>
          </div>

          <h1>Join Tambola</h1>
          <p className="join-sub">Enter your name to get your lucky ticket!</p>

          <form onSubmit={handleJoin} className="join-form">
            <div className="input-group" style={{ marginBottom: '16px' }}>
              <label>Room ID</label>
              <input
                className={`input ${roomIdError ? 'input-error' : ''}`}
                placeholder="e.g. 1234"
                value={roomId}
                onChange={e => { setRoomId(e.target.value.trim()); setRoomIdError(''); }}
                disabled={!!urlRoomId}
                maxLength={10}
                required
              />
              {roomIdError && <p className="error-msg">{roomIdError}</p>}
            </div>

            <div className="input-group" style={{ marginBottom: '24px' }}>
              <label>Your Name</label>
              <input
                className={`input ${nameError ? 'input-error' : ''}`}
                placeholder="e.g. Haneesh Yadav"
                value={name}
                onChange={e => { setName(e.target.value); setNameError(''); }}
                autoFocus={!urlRoomId}
                maxLength={30}
                required
              />
              {nameError && <p className="error-msg">{nameError}</p>}
            </div>

            <button
              type="submit"
              className="btn btn-gold btn-lg"
              style={{ width: '100%' }}
              disabled={!connected}
            >
              <span className="material-icons">confirmation_number</span>
              Get My Ticket
            </button>
          </form>

          <div className="join-status">
            <span className={`dot ${connected ? 'dot-green' : 'dot-red'}`} />
            <span>{connected ? 'Server online' : 'Connecting...'}</span>
          </div>
        </div>
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="play-game">
      {/* Header */}
      <header className="play-header">
        <div className="play-header-left">
          <button className="icon-btn" onClick={() => navigate('/')}>
            <span className="material-icons">arrow_back</span>
          </button>
          <div>
            <h1 className="play-title">Tambola</h1>
            <p className="play-welcome">Hey, {player?.name}! 👋</p>
          </div>
        </div>

        <div className="play-header-right">
          <div className={`status-pill status-${gameState.status}`}>
            <span className="dot dot-green" style={{ display: gameState.status === 'running' ? 'inline-block' : 'none' }} />
            {STATUS_LABEL[gameState.status] || gameState.status}
          </div>
        </div>
      </header>

      <div className="play-body">
        {/* Current number */}
        <section className="current-number-section">
          <div className="current-num-label">
            <span className="material-icons">casino</span>
            Current Number
          </div>
          <div className={`current-num-display ${currentNumAnim ? 'animate-pop' : ''}`}>
            {gameState.currentNumber || (
              <span className="num-placeholder">—</span>
            )}
          </div>
          <div className="num-stats">
            <span>{calledCount} called</span>
            <span className="divider">·</span>
            <span>{90 - calledCount} remaining</span>
          </div>

          {/* Timer */}
          <NumberTimer secondsLeft={timerSeconds} />

          {/* Recent numbers */}
          {gameState.calledNumbers?.length > 0 && (
            <div className="recent-nums">
              {[...gameState.calledNumbers].reverse().slice(0, 8).map((n, i) => (
                <span key={i} className={`recent-num ${i === 0 ? 'recent-num--latest' : ''}`}>{n}</span>
              ))}
            </div>
          )}
        </section>

        {/* Ticket */}
        <section className="card animate-fadeUp" style={{ animationDelay: '0.1s' }}>
          <div className="section-header">
            <span className="material-icons">confirmation_number</span>
            My Ticket — Tap your numbers!
          </div>
          <Ticket
            ticket={player?.ticket}
            calledNumbers={gameState.calledNumbers}
            onClaim={gameState.status === 'running' ? handleClaim : null}
            winners={gameState.winners}
            playerClaims={claims}
            timerActive={timerActive}
          />
        </section>

        {/* Number board */}
        <section className="card animate-fadeUp" style={{ animationDelay: '0.2s' }}>
          <div className="section-header">
            <span className="material-icons">grid_4x4</span>
            Number Board
          </div>
          <NumberBoard
            calledNumbers={gameState.calledNumbers}
            currentNumber={gameState.currentNumber}
          />
        </section>

        {/* Winners board */}
        <section className="card animate-fadeUp" style={{ animationDelay: '0.3s' }}>
          <div className="section-header">
            <span className="material-icons">emoji_events</span>
            Winners
          </div>
          <WinnersGrid winners={gameState.winners} />
        </section>
      </div>

      {/* Winner overlay */}
      {winnerEvent && (
        <WinnerBanner
          event={winnerEvent}
          onClose={() => setWinnerEvent(null)}
        />
      )}

      <ToastContainer />
    </div>
  );
}

function WinnersGrid({ winners }) {
  const types = [
    { key: 'topLine', label: 'Top Line', icon: 'looks_one' },
    { key: 'middleLine', label: 'Middle Line', icon: 'looks_two' },
    { key: 'bottomLine', label: 'Bottom Line', icon: 'looks_3' },
    { key: 'corners', label: 'Corners', icon: 'crop_square' },
    { key: 'earlyFive', label: 'Early Five', icon: 'filter_5' },
    { key: 'fullHouse', label: 'Full House', icon: 'home' },
  ];

  return (
    <div className="winners-grid">
      {types.map(({ key, label, icon }) => {
        const w = winners?.[key];
        return (
          <div key={key} className={`winner-row ${w ? 'winner-row--won' : ''}`}>
            <span className="material-icons winner-row-icon">{icon}</span>
            <div className="winner-row-info">
              <span className="winner-row-label">{label}</span>
              {w && <span className="winner-row-name">{w.name}</span>}
            </div>
            {w ? (
              <span className="material-icons" style={{ color: 'var(--gold)', fontSize: 18 }}>verified</span>
            ) : (
              <span className="winner-row-pending">—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
