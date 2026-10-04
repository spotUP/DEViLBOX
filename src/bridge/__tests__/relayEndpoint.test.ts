/**
 * The status badges probe the relay where the bridge connects to it.
 *
 * On the HTTPS live page the badges opened `ws://devilbox.uprough.net:4003/probe`
 * every 15 s and the browser refused each one as Mixed Content (40+ console
 * lines per session, ledger F17). The bridge itself connects to
 * `ws://localhost:4003`, which an HTTPS page may open: localhost is a
 * potentially trustworthy origin. One spelling, in relayEndpoint.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { RELAY_PROBE_URL, RELAY_WS_URL } from '../relayEndpoint';

// The badges read one field of the audio store; the real store drags the
// engine graph into the test for nothing.
vi.mock('@stores/useAudioStore', () => {
  const state = { contextState: 'running' };
  const useAudioStore = Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state });
  return { useAudioStore };
});

describe('the relay address', () => {
  it('is localhost, which an HTTPS page may reach over ws://', () => {
    expect(new URL(RELAY_WS_URL).hostname).toBe('localhost');
    expect(RELAY_PROBE_URL).toBe(`${RELAY_WS_URL}/probe`);
  });
});

describe('the status badges', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('probe the bridge address, not the page host', { timeout: 30000 }, async () => {
    const opened: string[] = [];
    class FakeSocket { onopen: (() => void) | null = null; onerror: (() => void) | null = null; constructor(url: string) { opened.push(url); } close() {} }
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));
    // The live page: a public HTTPS host, where ws://<host> is Mixed Content.
    (window as unknown as { happyDOM?: { setURL(u: string): void } }).happyDOM?.setURL('https://devilbox.uprough.net/');
    const { ServerStatusBadges } = await import('@/components/layout/ServerStatusBadges');
    render(React.createElement(ServerStatusBadges));
    await vi.waitFor(() => expect(opened.length).toBeGreaterThan(0));
    expect(opened).toEqual([RELAY_PROBE_URL]);
    for (const url of opened) expect(url).not.toContain(window.location.hostname === 'localhost' ? 'nohost' : window.location.hostname);
  });
});
