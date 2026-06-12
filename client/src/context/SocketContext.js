import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

const SERVER_URL = process.env.NODE_ENV === 'production'
  ? "https://vitstellar-tambola.onrender.com"
  : `${window.location.protocol}//${window.location.hostname}:3001`;

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
  const socket = io(SERVER_URL, {
    transports: ['polling', 'websocket'],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 60000,
  });

  socketRef.current = socket;
  socket.on('connect', () => setConnected(true));
  socket.on('disconnect', () => setConnected(false));

  return () => socket.disconnect();
}, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
