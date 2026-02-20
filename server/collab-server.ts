/**
 * DEViLBOX Collaboration Signaling Server
 *
 * Standalone Node.js WebSocket server for WebRTC handshake signaling.
 * Rooms are max 2 users. Server NEVER touches song data — it only
 * relays offer/answer/ICE candidates between peers.
 *
 * Run: npx tsx server/collab-server.ts
 * Or add to package.json scripts: "collab": "tsx server/collab-server.ts"
 */

import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Room {
  creator: WebSocket;
  joiner: WebSocket | null;
}

type ClientMsg =
  | { type: 'create_room' }
  | { type: 'join_room'; roomCode: string }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice_candidate'; candidate: RTCIceCandidateInit };

// ─── State ────────────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>();
const clientRoom = new Map<WebSocket, string>(); // client → roomCode

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude ambiguous 0/O/1/I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function send(ws: WebSocket, msg: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function getPeer(ws: WebSocket): WebSocket | null {
  const roomCode = clientRoom.get(ws);
  if (!roomCode) return null;
  const room = rooms.get(roomCode);
  if (!room) return null;
  return room.creator === ws ? room.joiner : room.creator;
}

function cleanupClient(ws: WebSocket): void {
  const roomCode = clientRoom.get(ws);
  if (!roomCode) return;

  const room = rooms.get(roomCode);
  if (room) {
    const peer = room.creator === ws ? room.joiner : room.creator;
    if (peer) {
      send(peer, { type: 'peer_left' });
      clientRoom.delete(peer);
    }
    rooms.delete(roomCode);
  }

  clientRoom.delete(ws);
}

// ─── Server ───────────────────────────────────────────────────────────────────

const PORT = Number(process.env.COLLAB_PORT ?? 4002);
const server = http.createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  console.log('[collab] Client connected');

  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(data.toString()) as ClientMsg;
    } catch {
      send(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    switch (msg.type) {
      case 'create_room': {
        // Clean up any previous room this client had
        cleanupClient(ws);

        let roomCode: string;
        do {
          roomCode = generateRoomCode();
        } while (rooms.has(roomCode));

        rooms.set(roomCode, { creator: ws, joiner: null });
        clientRoom.set(ws, roomCode);
        send(ws, { type: 'room_created', roomCode });
        console.log(`[collab] Room created: ${roomCode}`);
        break;
      }

      case 'join_room': {
        const { roomCode } = msg;
        const room = rooms.get(roomCode);

        if (!room) {
          send(ws, { type: 'error', message: `Room ${roomCode} not found` });
          return;
        }
        if (room.joiner !== null) {
          send(ws, { type: 'error', message: `Room ${roomCode} is full` });
          return;
        }

        room.joiner = ws;
        clientRoom.set(ws, roomCode);

        // Notify creator that a peer joined
        send(room.creator, { type: 'peer_joined' });
        console.log(`[collab] Peer joined room: ${roomCode}`);
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice_candidate': {
        const peer = getPeer(ws);
        if (peer) {
          send(peer, msg);
        }
        break;
      }

      default:
        send(ws, { type: 'error', message: 'Unknown message type' });
    }
  });

  ws.on('close', () => {
    console.log('[collab] Client disconnected');
    cleanupClient(ws);
  });

  ws.on('error', (err) => {
    console.error('[collab] WebSocket error:', err);
    cleanupClient(ws);
  });
});

server.listen(PORT, () => {
  console.log(`[collab] Signaling server listening on ws://localhost:${PORT}`);
});
