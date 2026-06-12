import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import './Landing.css';

export default function Landing() {
  const navigate = useNavigate();
  const { socket, connected } = useSocket();

  useEffect(() => {
    if (!socket) return;
    socket.on('room:created', ({ roomId }) => {
      navigate(`/host/${roomId}`);
    });
    return () => {
      socket.off('room:created');
    };
  }, [socket, navigate]);

  const handleHost = () => {
    if (!socket || !connected) {
      alert("Server is not connected. Please try again.");
      return;
    }
    socket.emit('room:create');
  };

  return (
    <div className="landing">
      {/* Background grid */}
      <div className="landing-grid" />
      <div className="landing-glow" />

      <div className="landing-content animate-fadeUp">

        {/* Title */}
        <div className="landing-title">
          <h1>
            <span className="title-main">TAMBOLA</span>
          </h1>
          <p className="title-sub">The official housie game for tambola lovers</p>
        </div>

        {/* Connection status */}
        <div className="conn-status">
          <span className={`dot ${connected ? 'dot-green' : 'dot-red'}`} />
          <span>{connected ? 'Server connected' : 'Connecting...'}</span>
        </div>

        {/* CTA cards */}
        <div className="landing-cards">
          <button className="landing-card landing-card--play" onClick={() => navigate('/play')}>
            <div className="lcard-icon">
              <span className="material-icons">grid_on</span>
            </div>
            <div className="lcard-text">
              <h2>Join Game</h2>
              <p>Enter your name, get your ticket and play!</p>
            </div>
            <span className="material-icons lcard-arrow">arrow_forward</span>
          </button>

          <button className="landing-card landing-card--host" onClick={handleHost}>
            <div className="lcard-icon">
              <span className="material-icons">manage_accounts</span>
            </div>
            <div className="lcard-text">
              <h2>Host Game</h2>
              <p>Control the game, call numbers and manage winners.</p>
            </div>
            <span className="material-icons lcard-arrow">arrow_forward</span>
          </button>
        </div>

        {/* Rules teaser */}
        <div className="rules-strip">
          {[
            { icon: 'looks_one', label: 'Top Line' },
            { icon: 'looks_two', label: 'Middle Line' },
            { icon: 'looks_3', label: 'Bottom Line' },
            { icon: 'crop_square', label: 'Corners' },
            { icon: 'filter_5', label: 'Early Five' },
            { icon: 'home', label: 'Full House' },
          ].map(r => (
            <div className="rule-chip" key={r.label}>
              <span className="material-icons">{r.icon}</span>
              <span>{r.label}</span>
            </div>
          ))}
        </div>

        <p className="footer-note">
          COPYRIGHT © 2026 | HANEESH
        </p>
      </div>
    </div>
  );
}
