import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../shared/protocol.js';
import { EloStore } from './eloStore.js';
import { RoomManager } from './roomManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const ALLOWED_ORIGINS = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : true;

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

const httpServer = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

const eloStore = new EloStore({
  filePath: path.resolve(process.cwd(), 'data/elo-profiles.json'),
});

const roomManager = new RoomManager({
  eloStore,
  onRoomUpdated: (snapshot) => {
    io.to(snapshot.code).emit('room:state', snapshot);
  },
  onProfileUpdated: (socketId, payload) => {
    io.to(socketId).emit('profile:updated', payload);
  },
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

io.on('connection', (socket) => {
  socket.on('profile:fetch', (payload, ack) => {
    const data = roomManager.getPlayerProfile(payload.profileId, payload.pseudo);
    ack?.({ ok: true, data });
  });

  socket.on('room:create', (payload, ack) => {
    try {
      const snapshot = roomManager.createRoom({
        socketId: socket.id,
        playerId: payload.playerId,
        profileId: payload.profileId,
        pseudo: payload.pseudo,
        timeControl: payload.timeControl,
      });
      socket.join(snapshot.code);
      socket.emit('room:state', snapshot);
      ack?.({ ok: true, data: { snapshot } });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erreur lors de la création du salon.';
      ack?.({ ok: false, error: message });
      socket.emit('room:error', { message });
    }
  });

  socket.on('room:peek', (payload, ack) => {
    const result = roomManager.peekRoom(payload.code);
    if (!result.ok) {
      ack?.({ ok: false, error: result.error });
      return;
    }
    ack?.({ ok: true, data: { info: result.info } });
  });

  socket.on('room:join', (payload, ack) => {
    const result = roomManager.joinRoom({
      code: payload.code,
      socketId: socket.id,
      playerId: payload.playerId,
      profileId: payload.profileId,
      pseudo: payload.pseudo,
    });

    if (!result.ok) {
      ack?.({ ok: false, error: result.error });
      socket.emit('room:error', { message: result.error });
      return;
    }

    socket.join(result.snapshot.code);
    io.to(result.snapshot.code).emit('room:state', result.snapshot);
    ack?.({ ok: true, data: { snapshot: result.snapshot } });
  });

  socket.on('room:move', (payload, ack) => {
    const result = roomManager.handleMove({
      code: payload.code,
      socketId: socket.id,
      playerId: payload.playerId,
      move: payload.move,
    });

    if (!result.ok) {
      if (result.snapshot) {
        io.to(result.snapshot.code).emit('room:state', result.snapshot);
      }
      ack?.({ ok: false, error: result.error });
      socket.emit('room:error', { message: result.error });
      return;
    }

    io.to(result.snapshot.code).emit('room:state', result.snapshot);
    ack?.({ ok: true });
  });

  socket.on('room:resign', (payload, ack) => {
    const result = roomManager.resign({
      code: payload.code,
      socketId: socket.id,
      playerId: payload.playerId,
    });

    if (!result.ok) {
      ack?.({ ok: false, error: result.error });
      return;
    }

    io.to(result.snapshot.code).emit('room:state', result.snapshot);
    ack?.({ ok: true });
  });

  socket.on('room:rematch', (payload, ack) => {
    const result = roomManager.requestRematch({
      code: payload.code,
      socketId: socket.id,
      playerId: payload.playerId,
    });

    if (!result.ok) {
      ack?.({ ok: false, error: result.error });
      return;
    }

    io.to(result.snapshot.code).emit('room:state', result.snapshot);
    ack?.({ ok: true });
  });

  socket.on('room:leave', (payload, ack) => {
    const result = roomManager.leaveRoom({
      code: payload.code,
      socketId: socket.id,
      playerId: payload.playerId,
    });
    socket.leave(payload.code.trim().toUpperCase());
    if (result.snapshot) {
      io.to(result.snapshot.code).emit('room:state', result.snapshot);
    }
    ack?.({ ok: true });
  });

  socket.on('matchmaking:join', (payload, ack) => {
    const result = roomManager.joinMatchmaking({
      socketId: socket.id,
      playerId: payload.playerId,
      profileId: payload.profileId,
      pseudo: payload.pseudo,
      timeControl: payload.timeControl,
    });

    if (result.matched) {
      for (const participant of result.participants) {
        const targetSocket = io.sockets.sockets.get(participant.socketId);
        if (targetSocket) {
          targetSocket.join(result.code);
          targetSocket.emit('matchmaking:matched', {
            code: result.code,
            snapshot: result.snapshot,
          });
          targetSocket.emit('matchmaking:status', {
            searching: false,
            queueSize: 0,
          });
        }
      }
      io.to(result.code).emit('room:state', result.snapshot);
      ack?.({ ok: true, data: { queueSize: 0 } });
      return;
    }

    for (const waitingSocketId of result.waitingSockets) {
      io.to(waitingSocketId).emit('matchmaking:status', {
        searching: true,
        timeControl: result.timeControl,
        queueSize: result.queueSize,
      });
    }
    ack?.({ ok: true, data: { queueSize: result.queueSize } });
  });

  socket.on('matchmaking:cancel', (payload, ack) => {
    const removed = roomManager.cancelMatchmaking({
      socketId: socket.id,
      playerId: payload.playerId,
    });
    socket.emit('matchmaking:status', { searching: false, queueSize: 0 });
    if (removed) {
      for (const remainingSocketId of removed.remainingSockets) {
        io.to(remainingSocketId).emit('matchmaking:status', {
          searching: true,
          timeControl: removed.timeControl,
          queueSize: removed.queueSize,
        });
      }
    }
    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const result = roomManager.handleDisconnect(socket.id);
    if (result.snapshot) {
      io.to(result.snapshot.code).emit('room:state', result.snapshot);
    }
    if (result.leftQueue) {
      for (const remainingSocketId of result.leftQueue.remainingSockets) {
        io.to(remainingSocketId).emit('matchmaking:status', {
          searching: true,
          timeControl: result.leftQueue.timeControl,
          queueSize: result.leftQueue.queueSize,
        });
      }
    }
  });
});

// Serve production Vite build when running standalone or after `npm run build`
const candidateDistDirs = [
  path.resolve(__dirname, '../dist'),
  path.resolve(process.cwd(), 'dist'),
];
const distDir = candidateDistDirs.find((dir) =>
  fs.existsSync(path.join(dir, 'index.html')),
);

if (distDir) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io') || req.path.startsWith('/api')) {
      return next();
    }
    return res.sendFile(path.join(distDir, 'index.html'));
  });
}

httpServer.listen(PORT, () => {
  console.log(`Super Morpion server listening on http://localhost:${PORT}`);
});

function shutdown(): void {
  roomManager.dispose();
  httpServer.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
