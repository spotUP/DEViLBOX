/**
 * DJVideoExport — Record DJ set as a downloadable video file.
 *
 * Captures a visual source (VJ visualizer or DJ UI) combined with
 * the master audio output, and records to WebM.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { DJVideoCapture, type VideoSource, getCaptureCanvas } from '@/engine/dj/streaming/DJVideoCapture';
import { DJVideoRecorder } from '@/engine/dj/streaming/DJVideoRecorder';

const captureRef = { current: null as DJVideoCapture | null };
const recorderRef = { current: null as DJVideoRecorder | null };

export const DJVideoExport: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [source, setSource] = useState<VideoSource>('vj');
  const [duration, setDuration] = useState(0);
  const [fileSize, setFileSize] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const timerRef = useRef<number>(0);

  // Available sources
  const sources: { id: VideoSource; label: string }[] = [
    { id: 'vj', label: 'VJ Visualizer' },
    { id: 'dj-ui', label: 'DJ Interface' },
  ];

  // Duration update timer
  useEffect(() => {
    if (!isRecording) return;
    timerRef.current = window.setInterval(() => {
      if (recorderRef.current) {
        setDuration(recorderRef.current.durationMs);
        setFileSize(recorderRef.current.totalBytes);
      }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  const handleStart = useCallback(async () => {
    try {
      // Check if source canvas is available
      if (!getCaptureCanvas(source)) {
        alert(`The ${source === 'vj' ? 'VJ View' : 'DJ UI'} must be active to capture video. Switch to that view first.`);
        return;
      }

      const capture = new DJVideoCapture();
      const stream = capture.startCapture(source, source === 'vj' ? 60 : 30);

      const recorder = new DJVideoRecorder();
      recorder.onDataAvailable = (bytes, ms) => {
        setFileSize(bytes);
        setDuration(ms);
      };
      recorder.startRecording(stream);

      captureRef.current = capture;
      recorderRef.current = recorder;
      setIsRecording(true);
      setShowMenu(false);
    } catch (err) {
      console.error('[DJVideoExport] Start failed:', err);
      alert(`Failed to start video capture: ${(err as Error).message}`);
    }
  }, [source]);

  const handleStop = useCallback(async () => {
    if (!recorderRef.current || !captureRef.current) return;

    const blob = await recorderRef.current.stopRecording();
    captureRef.current.stopCapture();

    captureRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
    setDuration(0);
    setFileSize(0);

    if (blob.size > 0) {
      const filename = `dj-set-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.webm`;
      DJVideoRecorder.download(blob, filename);
    }
  }, []);

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(m)}:${pad(s % 60)}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  return (
    <div className="relative">
      {isRecording ? (
        <button
          onClick={handleStop}
          className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white animate-pulse transition-all"
          title="Stop video recording"
        >
          <span className="w-2 h-2 rounded-sm bg-white" />
          {formatDuration(duration)} ({formatSize(fileSize)})
        </button>
      ) : (
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="px-3 py-1.5 rounded text-xs font-bold bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-secondary hover:text-text-primary transition-all"
          title="Record video of DJ set"
        >
          VIDEO
        </button>
      )}

      {/* Source picker dropdown */}
      {showMenu && !isRecording && (
        <div className="absolute bottom-full mb-1 left-0 bg-dark-bgSecondary border border-dark-border rounded shadow-xl z-[99990] min-w-[160px]">
          {sources.map(s => (
            <button
              key={s.id}
              onClick={() => { setSource(s.id); handleStart(); }}
              className={`
                block w-full text-left px-3 py-2 text-xs hover:bg-dark-bgHover transition-colors
                ${source === s.id ? 'text-accent-primary' : 'text-text-secondary'}
                ${!getCaptureCanvas(s.id) ? 'opacity-40 cursor-not-allowed' : ''}
              `}
              disabled={!getCaptureCanvas(s.id)}
            >
              {s.label}
              {!getCaptureCanvas(s.id) && <span className="ml-1 text-text-muted">(inactive)</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
