import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import Landing from './pages/Landing';
import Host from './pages/Host';
import Play from './pages/Play';
import './App.css';

function App() {
  return (
    <SocketProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/host/:roomId" element={<Host />} />
          <Route path="/play" element={<Play />} />
          <Route path="/play/:roomId" element={<Play />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </SocketProvider>
  );
}

export default App;
