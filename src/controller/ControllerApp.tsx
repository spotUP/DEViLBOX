/**
 * ControllerApp — iPhone remote controller for DEViLBOX DJ mode.
 *
 * Lightweight React app that connects via WebSocket to the desktop
 * and sends DJ control commands. No audio engines, WASM, or WebGL.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as ws from './ControllerWebSocket';
import { ControllerWebRTC } from './ControllerWebRTC';

// ── Types ────────────────────────────────────────────────────────────────────

interface DeckState {
  isPlaying: boolean;
  trackName: string;
  effectiveBPM: number;
  elapsedMs: number;
  durationMs: number;
  volume: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  eqLowKill: boolean;
  eqMidKill: boolean;
  eqHighKill: boolean;
  filterPosition: number;
  musicalKey: string | null;
}

interface DJState {
  decks: { A: DeckState; B: DeckState };
  crossfaderPosition: number;
  masterVolume: number;
  autoDJEnabled: boolean;
  autoDJStatus: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Components ──────────────────────────────────────────────────────────────

const DeckPanel: React.FC<{ deck: DeckState; id: 'A' | 'B' }> = ({ deck, id }) => (
  <div style={{ flex: 1, padding: 8, borderRight: id === 'A' ? '1px solid #333' : 'none' }}>
    <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>DECK {id}</div>
    <div style={{ fontSize: 13, fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {deck.trackName || '—'}
    </div>
    <div style={{ fontSize: 11, color: '#aaa', display: 'flex', gap: 8, marginTop: 2 }}>
      <span>{deck.effectiveBPM > 0 ? `${deck.effectiveBPM.toFixed(1)} BPM` : ''}</span>
      <span>{deck.musicalKey ?? ''}</span>
      <span style={{ marginLeft: 'auto' }}>{formatTime(deck.elapsedMs)}</span>
    </div>
    {/* Transport */}
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
      <Btn label={deck.isPlaying ? '⏸' : '▶'} color={deck.isPlaying ? '#22c55e' : '#555'} onTap={() => ws.call('dj_toggle_play', { deckId: id })} />
      <Btn label="■" color="#555" onTap={() => ws.call('dj_stop', { deckId: id })} />
      <Btn label="SYNC" color="#3b82f6" onTap={() => ws.call('dj_sync', { deckId: id })} />
    </div>
    {/* EQ kills */}
    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
      <KillBtn label="LO" active={deck.eqLowKill} onTap={() => ws.call('dj_eq_kill', { deckId: id, band: 'low', kill: !deck.eqLowKill })} />
      <KillBtn label="MID" active={deck.eqMidKill} onTap={() => ws.call('dj_eq_kill', { deckId: id, band: 'mid', kill: !deck.eqMidKill })} />
      <KillBtn label="HI" active={deck.eqHighKill} onTap={() => ws.call('dj_eq_kill', { deckId: id, band: 'high', kill: !deck.eqHighKill })} />
    </div>
  </div>
);

const Btn: React.FC<{ label: string; color: string; onTap: () => void }> = ({ label, color, onTap }) => (
  <button
    onPointerDown={onTap}
    style={{
      flex: 1, padding: '8px 0', border: `1px solid ${color}`, borderRadius: 6,
      background: `${color}22`, color, fontSize: 13, fontWeight: 'bold',
      cursor: 'pointer', touchAction: 'manipulation',
    }}
  >
    {label}
  </button>
);

const KillBtn: React.FC<{ label: string; active: boolean; onTap: () => void }> = ({ label, active, onTap }) => (
  <button
    onPointerDown={onTap}
    style={{
      flex: 1, padding: '6px 0', borderRadius: 4, fontSize: 10, fontWeight: 'bold',
      background: active ? '#ef4444' : '#222', color: active ? '#fff' : '#888',
      border: `1px solid ${active ? '#ef4444' : '#444'}`, cursor: 'pointer', touchAction: 'manipulation',
    }}
  >
    {label}
  </button>
);

// ── Crossfader ──────────────────────────────────────────────────────────────

const Crossfader: React.FC<{ value: number }> = ({ value }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    ws.call('dj_crossfader', { position: pos });
  }, []);

  const onDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleMove(e.clientX);
  }, [handleMove]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (dragging.current) handleMove(e.clientX);
  }, [handleMove]);

  const onUp = useCallback(() => { dragging.current = false; }, []);

  return (
    <div style={{ padding: '8px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666', marginBottom: 4 }}>
        <span>A</span><span>CROSSFADER</span><span>B</span>
      </div>
      <div
        ref={trackRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          position: 'relative', height: 36, background: '#222', borderRadius: 6,
          border: '1px solid #444', touchAction: 'none', cursor: 'pointer',
        }}
      >
        <div
          style={{
            position: 'absolute', top: 2, width: 40, height: 32, borderRadius: 4,
            background: '#66ccff', left: `calc(${value * 100}% - 20px)`,
            transition: dragging.current ? 'none' : 'left 0.05s',
          }}
        />
      </div>
    </div>
  );
};

// ── PTT Button ──────────────────────────────────────────────────────────────

const PTTButton: React.FC<{ duckEnabled: boolean; webrtc: ControllerWebRTC | null }> = ({ duckEnabled, webrtc }) => {
  const [live, setLive] = useState(false);
  const liveRef = useRef(false); // avoid stale closure in touch handlers

  const onDown = useCallback(() => {
    if (liveRef.current) return; // already live
    liveRef.current = true;
    setLive(true);
    console.log('[PTT] DOWN — duck:', duckEnabled);
    webrtc?.setMicEnabled(true);
    if (duckEnabled) ws.call('dj_duck', {}).catch(() => {});
  }, [duckEnabled, webrtc]);

  const onUp = useCallback(() => {
    if (!liveRef.current) return; // already released
    liveRef.current = false;
    setLive(false);
    console.log('[PTT] UP — unduck:', duckEnabled);
    webrtc?.setMicEnabled(false);
    if (duckEnabled) ws.call('dj_unduck', {}).catch(() => {});
  }, [duckEnabled, webrtc]);

  return (
    <button
      onTouchStart={(e) => { e.preventDefault(); onDown(); }}
      onTouchEnd={(e) => { e.preventDefault(); onUp(); }}
      onTouchCancel={onUp}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
      style={{
        width: '100%', padding: '18px 0', borderRadius: 8, fontSize: 18, fontWeight: 'bold',
        border: 'none', cursor: 'pointer', touchAction: 'manipulation',
        background: live ? '#22c55e' : '#333', color: live ? '#fff' : '#aaa',
        boxShadow: live ? '0 0 20px rgba(34,197,94,0.4)' : 'none',
        transition: 'all 0.05s',
      }}
    >
      {live ? 'LIVE' : 'TALK'}
    </button>
  );
};

// ── Pairing Screen ──────────────────────────────────────────────────────────

const PairingScreen: React.FC<{ onConnect: (host: string, roomCode?: string) => void }> = ({ onConnect }) => {
  const [host, setHost] = useState('');
  const [error, setError] = useState('');

  // Try to auto-detect from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const h = params.get('host');
    const room = params.get('room') || undefined;
    if (h) {
      setHost(h);
      onConnect(h, room);
    }
  }, [onConnect]);

  const handleConnect = () => {
    if (!host) { setError('Enter the desktop IP'); return; }
    setError('');
    onConnect(host);  // No room code for manual entry — mic needs QR pairing
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: 24 }}>
      <div style={{ fontSize: 24, fontWeight: 'bold' }}>DEViLBOX</div>
      <div style={{ fontSize: 14, color: '#888' }}>Remote Controller</div>
      <input
        type="text"
        placeholder="Desktop IP (e.g. 192.168.1.42)"
        value={host}
        onChange={(e) => setHost(e.target.value)}
        style={{
          width: '100%', maxWidth: 300, padding: '12px 16px', borderRadius: 8,
          border: '1px solid #444', background: '#222', color: '#eee', fontSize: 16,
          textAlign: 'center',
        }}
      />
      <button
        onClick={handleConnect}
        style={{
          width: '100%', maxWidth: 300, padding: '14px 0', borderRadius: 8,
          border: 'none', background: '#3b82f6', color: '#fff', fontSize: 16,
          fontWeight: 'bold', cursor: 'pointer',
        }}
      >
        Connect
      </button>
      {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}
    </div>
  );
};

// ── Main App ────────────────────────────────────────────────────────────────

export const ControllerApp: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [paired, setPaired] = useState(false);
  const [state, setState] = useState<DJState | null>(null);
  const [duckEnabled, setDuckEnabled] = useState(false);
  const [micStatus, setMicStatus] = useState<string>('');
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const webrtcRef = useRef<ControllerWebRTC | null>(null);

  // Wake lock to prevent screen sleep
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock?.request('screen').then(l => { lock = l; }).catch(() => {});
    return () => { lock?.release(); };
  }, []);

  ws.setStatusCallback(setConnected);

  const handleConnect = useCallback(async (host: string, roomCode?: string) => {
    try {
      await ws.connect(host, 4003);
      setPaired(true);

      // Start polling DJ state
      pollRef.current = setInterval(async () => {
        try {
          const data = await ws.call('dj_get_state') as DJState;
          setState(data);
        } catch { /* ignore poll errors */ }
      }, 200);

      // Connect WebRTC for mic audio if room code provided
      if (roomCode) {
        try {
          const rtc = new ControllerWebRTC();
          rtc.onStatusChange = (s) => setMicStatus(s);
          await rtc.connect(host, roomCode, 4002);
          webrtcRef.current = rtc;
          setMicStatus('connected');
        } catch (err) {
          console.warn('[Controller] WebRTC mic failed (controls still work):', err);
          setMicStatus('failed');
        }
      }
    } catch (err) {
      console.error('[Controller] Connection failed:', err);
    }
  }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  if (!paired) {
    return <PairingScreen onConnect={handleConnect} />;
  }

  const s = state;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#111' }}>
      {/* Status bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: '#1a1a1a', borderBottom: '1px solid #333', fontSize: 11 }}>
        <span style={{ color: '#888' }}>DEViLBOX Controller</span>
        <span style={{ color: connected ? '#22c55e' : '#ef4444' }}>{connected ? '● Connected' : '● Disconnected'}</span>
      </div>

      {/* Decks */}
      <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
        <DeckPanel deck={s?.decks.A ?? emptyDeck} id="A" />
        <DeckPanel deck={s?.decks.B ?? emptyDeck} id="B" />
      </div>

      {/* Crossfader */}
      <Crossfader value={s?.crossfaderPosition ?? 0.5} />

      {/* FX Pads */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, padding: '4px 12px' }}>
        <FXPad label="HPF A" onDown={() => ws.call('dj_filter', { deckId: 'A', position: -0.8 })} onUp={() => ws.call('dj_filter', { deckId: 'A', position: 0 })} />
        <FXPad label="LPF A" onDown={() => ws.call('dj_filter', { deckId: 'A', position: 0.8 })} onUp={() => ws.call('dj_filter', { deckId: 'A', position: 0 })} />
        <FXPad label="HPF B" onDown={() => ws.call('dj_filter', { deckId: 'B', position: -0.8 })} onUp={() => ws.call('dj_filter', { deckId: 'B', position: 0 })} />
        <FXPad label="LPF B" onDown={() => ws.call('dj_filter', { deckId: 'B', position: 0.8 })} onUp={() => ws.call('dj_filter', { deckId: 'B', position: 0 })} />
      </div>

      {/* Auto DJ */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 12px' }}>
        <button
          onPointerDown={() => s?.autoDJEnabled ? ws.call('dj_auto_dj_disable') : ws.call('dj_auto_dj_enable')}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 6, fontSize: 12, fontWeight: 'bold',
            border: 'none', cursor: 'pointer', touchAction: 'manipulation',
            background: s?.autoDJEnabled ? '#22c55e' : '#333', color: s?.autoDJEnabled ? '#fff' : '#aaa',
          }}
        >
          {s?.autoDJEnabled ? 'STOP AUTO DJ' : 'AUTO DJ'}
        </button>
        {s?.autoDJEnabled && (
          <button
            onPointerDown={() => ws.call('dj_auto_dj_skip')}
            style={{
              padding: '10px 16px', borderRadius: 6, fontSize: 12, fontWeight: 'bold',
              border: '1px solid #444', background: '#222', color: '#aaa', cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            SKIP
          </button>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* PTT + Duck */}
      <div style={{ padding: '8px 12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#888', cursor: 'pointer' }}>
            <input type="checkbox" checked={duckEnabled} onChange={() => setDuckEnabled(!duckEnabled)} />
            Duck music while talking
          </label>
        </div>
        {micStatus && <div style={{ fontSize: 10, color: micStatus === 'connected' ? '#22c55e' : '#888', marginBottom: 4 }}>Mic: {micStatus}</div>}
        <PTTButton duckEnabled={duckEnabled} webrtc={webrtcRef.current} />
      </div>
    </div>
  );
};

// ── FX Pad (momentary) ──────────────────────────────────────────────────────

const FXPad: React.FC<{ label: string; onDown: () => void; onUp: () => void }> = ({ label, onDown, onUp }) => {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onTouchStart={(e) => { e.preventDefault(); setPressed(true); onDown(); }}
      onTouchEnd={(e) => { e.preventDefault(); setPressed(false); onUp(); }}
      onTouchCancel={() => { setPressed(false); onUp(); }}
      onPointerDown={() => { setPressed(true); onDown(); }}
      onPointerUp={() => { setPressed(false); onUp(); }}
      onPointerLeave={() => { if (pressed) { setPressed(false); onUp(); } }}
      onPointerCancel={() => { if (pressed) { setPressed(false); onUp(); } }}
      style={{
        padding: '12px 0', borderRadius: 6, fontSize: 10, fontWeight: 'bold',
        border: `1px solid ${pressed ? '#66ccff' : '#444'}`,
        background: pressed ? '#66ccff22' : '#1a1a1a',
        color: pressed ? '#66ccff' : '#888',
        cursor: 'pointer', touchAction: 'manipulation',
      }}
    >
      {label}
    </button>
  );
};

// ── Empty state ─────────────────────────────────────────────────────────────

const emptyDeck: DeckState = {
  isPlaying: false, trackName: '', effectiveBPM: 0, elapsedMs: 0, durationMs: 0,
  volume: 1, eqLow: 0, eqMid: 0, eqHigh: 0, eqLowKill: false, eqMidKill: false,
  eqHighKill: false, filterPosition: 0, musicalKey: null,
};
