/**
 * DJStreamControl — Live stream DJ set to YouTube Live.
 *
 * Captures the current visual source + audio, streams via WebSocket
 * to the server which relays to YouTube's RTMP ingest.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { DJVideoCapture, getCaptureCanvas, type VideoSource } from '@/engine/dj/streaming/DJVideoCapture';
import { DJLiveStream } from '@/engine/dj/streaming/DJLiveStream';

export const DJStreamControl: React.FC = () => {
  const [isLive, setIsLive] = useState(false);
  const [streamKey, setStreamKey] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [duration, setDuration] = useState(0);
  const captureRef = useRef<DJVideoCapture | null>(null);
  const streamRef = useRef<DJLiveStream | null>(null);
  const timerRef = useRef<number>(0);

  useEffect(() => {
    if (!isLive) return;
    timerRef.current = window.setInterval(() => {
      if (streamRef.current) setDuration(streamRef.current.durationMs);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isLive]);

  const handleGoLive = useCallback(async () => {
    if (!streamKey.trim()) {
      alert('Enter your YouTube stream key first (from YouTube Studio → Go Live)');
      return;
    }

    try {
      // Auto-detect source
      const source: VideoSource = getCaptureCanvas('vj') ? 'vj' : 'dj-ui';
      if (!getCaptureCanvas(source)) {
        alert('No capture canvas available. Switch to VJ View or enable the DJ UI.');
        return;
      }

      setStatus('Connecting...');
      const capture = new DJVideoCapture();
      const mediaStream = capture.startCapture(source, source === 'vj' ? 60 : 30);

      const liveStream = new DJLiveStream();
      liveStream.onStatusChange = (s) => {
        setStatus(s === 'live' ? 'LIVE' : s === 'connecting' ? 'Connecting...' : s);
        if (s === 'error' || s === 'stopped') {
          setIsLive(false);
          capture.stopCapture();
        }
      };
      liveStream.onError = (err) => setStatus(`Error: ${err}`);

      await liveStream.startStream(mediaStream, streamKey.trim());

      captureRef.current = capture;
      streamRef.current = liveStream;
      setIsLive(true);
      setShowSetup(false);
    } catch (err) {
      setStatus(`Failed: ${(err as Error).message}`);
      setIsLive(false);
    }
  }, [streamKey]);

  const handleStop = useCallback(() => {
    streamRef.current?.stopStream();
    captureRef.current?.stopCapture();
    streamRef.current = null;
    captureRef.current = null;
    setIsLive(false);
    setDuration(0);
    setStatus('');
  }, []);

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
  };

  return (
    <div className="relative">
      {isLive ? (
        <button
          onClick={handleStop}
          className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold bg-red-600 text-white animate-pulse"
          title="End live stream"
        >
          <span className="w-2 h-2 rounded-full bg-white" />
          LIVE {formatDuration(duration)}
        </button>
      ) : (
        <button
          onClick={() => setShowSetup(!showSetup)}
          className="px-3 py-1.5 rounded text-xs font-bold bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-secondary hover:text-text-primary transition-all"
          title="Go live on YouTube"
        >
          LIVE
        </button>
      )}

      {/* Stream key setup dropdown */}
      {showSetup && !isLive && (
        <div className="absolute bottom-full mb-1 left-0 bg-dark-bgSecondary border border-dark-border rounded shadow-xl z-50 p-3 min-w-[250px]">
          <p className="text-[10px] text-text-muted mb-2">
            Paste your YouTube stream key from YouTube Studio → Go Live → Stream
          </p>
          <input
            type="password"
            value={streamKey}
            onChange={e => setStreamKey(e.target.value)}
            placeholder="xxxx-xxxx-xxxx-xxxx"
            className="w-full px-2 py-1 bg-dark-bg border border-dark-border rounded text-xs text-text-primary mb-2"
          />
          <button
            onClick={handleGoLive}
            disabled={!streamKey.trim()}
            className="w-full px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded text-xs font-bold transition-colors"
          >
            Go Live
          </button>
          {status && <p className="text-[10px] text-text-muted mt-1">{status}</p>}
        </div>
      )}
    </div>
  );
};
