/**
 * ServerStatusBadges — compact status indicators for all DEViLBOX services.
 * Renders in the NavBar header between the version badge and the action buttons.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Server,
  Wifi,
  Volume2,
  Activity,
  ChevronDown,
} from 'lucide-react';
import { useAudioStore } from '@stores/useAudioStore';

// ── Types ─────────────────────────────────────────────────────────────

type ServiceStatus = 'ok' | 'warn' | 'error' | 'checking';

interface ServiceState {
  label: string;
  status: ServiceStatus;
  detail: string;
}

// ── Health check helpers ──────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const WS_PORT = 4003;

async function checkExpressHealth(): Promise<ServiceState> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return { label: 'API', status: 'ok', detail: 'Express server running' };
    return { label: 'API', status: 'error', detail: `HTTP ${res.status}` };
  } catch {
    return { label: 'API', status: 'error', detail: 'Express server unreachable' };
  }
}

function checkWebSocket(): Promise<ServiceState> {
  return new Promise((resolve) => {
    try {
      const host = window.location.hostname || 'localhost';
      const ws = new WebSocket(`ws://${host}:${WS_PORT}`);
      const timeout = setTimeout(() => {
        ws.close();
        resolve({ label: 'WS', status: 'error', detail: 'WebSocket relay timeout' });
      }, 3000);

      ws.onopen = () => {
        clearTimeout(timeout);
        ws.close();
        resolve({ label: 'WS', status: 'ok', detail: 'MCP relay connected' });
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        resolve({ label: 'WS', status: 'error', detail: 'MCP relay unreachable' });
      };
    } catch {
      resolve({ label: 'WS', status: 'error', detail: 'WebSocket not available' });
    }
  });
}

function getAudioState(contextState: string): ServiceState {
  if (contextState === 'running')
    return { label: 'Audio', status: 'ok', detail: 'AudioContext running' };
  if (contextState === 'suspended')
    return { label: 'Audio', status: 'warn', detail: 'AudioContext suspended — click to unlock' };
  return { label: 'Audio', status: 'error', detail: `AudioContext ${contextState}` };
}

// ── Status dot color ──────────────────────────────────────────────────

const STATUS_COLORS: Record<ServiceStatus, string> = {
  ok: 'bg-accent-success',
  warn: 'bg-accent-warning',
  error: 'bg-accent-error',
  checking: 'bg-text-muted animate-pulse',
};

const STATUS_TEXT_COLORS: Record<ServiceStatus, string> = {
  ok: 'text-accent-success',
  warn: 'text-accent-warning',
  error: 'text-accent-error',
  checking: 'text-text-muted',
};

// ── Component ─────────────────────────────────────────────────────────

const POLL_INTERVAL = 15_000; // 15s

export const ServerStatusBadges: React.FC = () => {
  const contextState = useAudioStore((s) => s.contextState);

  const [services, setServices] = useState<ServiceState[]>([
    { label: 'API', status: 'checking', detail: 'Checking...' },
    { label: 'WS', status: 'checking', detail: 'Checking...' },
    getAudioState(contextState),
  ]);
  const [expanded, setExpanded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runChecks = useCallback(async () => {
    const [apiState, wsState] = await Promise.all([
      checkExpressHealth(),
      checkWebSocket(),
    ]);
    setServices((prev) => {
      const audio = getAudioState(useAudioStore.getState().contextState);
      // Only update if something actually changed
      if (
        prev[0].status === apiState.status &&
        prev[1].status === wsState.status &&
        prev[2].status === audio.status
      ) {
        return prev;
      }
      return [apiState, wsState, audio];
    });
  }, []);

  // Initial check + polling
  useEffect(() => {
    runChecks();
    pollRef.current = setInterval(runChecks, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [runChecks]);

  // Update audio state reactively (no polling needed)
  useEffect(() => {
    setServices((prev) => {
      const audio = getAudioState(contextState);
      if (prev[2].status === audio.status && prev[2].detail === audio.detail) return prev;
      return [prev[0], prev[1], audio];
    });
  }, [contextState]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!expanded) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [expanded]);

  // Aggregate status: worst of all services
  const worstStatus: ServiceStatus = services.some((s) => s.status === 'error')
    ? 'error'
    : services.some((s) => s.status === 'warn')
      ? 'warn'
      : services.some((s) => s.status === 'checking')
        ? 'checking'
        : 'ok';

  const allOk = worstStatus === 'ok';

  const ICONS: Record<string, React.ReactNode> = {
    API: <Server size={10} />,
    WS: <Wifi size={10} />,
    Audio: <Volume2 size={10} />,
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Collapsed badge — shows aggregate dot + count of issues */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
          allOk
            ? 'bg-accent-success/10 hover:bg-accent-success/20'
            : 'bg-accent-error/10 hover:bg-accent-error/20'
        }`}
        title={allOk ? 'All services OK' : 'Some services have issues'}
      >
        {/* Individual dots */}
        <div className="flex items-center gap-1">
          {services.map((s) => (
            <span
              key={s.label}
              className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[s.status]}`}
              title={`${s.label}: ${s.detail}`}
            />
          ))}
        </div>
        <span className={`text-[9px] font-mono font-bold uppercase ${STATUS_TEXT_COLORS[worstStatus]}`}>
          {allOk ? 'OK' : `${services.filter((s) => s.status !== 'ok').length} ⚠`}
        </span>
        <ChevronDown size={10} className={`text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded dropdown — detailed status per service */}
      {expanded && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-dark-bgTertiary border border-dark-border rounded-lg shadow-lg z-[99999] overflow-hidden">
          <div className="px-3 py-1.5 border-b border-dark-border">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono font-bold text-text-muted uppercase tracking-wider">
                Service Status
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  runChecks();
                }}
                className="text-[9px] font-mono text-accent-primary hover:text-accent-highlight transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
          {services.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-dark-bgHover transition-colors"
            >
              <span className={`${STATUS_TEXT_COLORS[s.status]}`}>{ICONS[s.label] || <Activity size={10} />}</span>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[s.status]}`} />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-mono font-bold text-text-primary">{s.label}</div>
                <div className="text-[9px] font-mono text-text-muted truncate">{s.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
