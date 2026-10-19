/**
 * Import this module (for its side effects) before `await import('../MCPBridge')`
 * in a test that covers the bridge's own logic: the relay socket, request
 * dispatch, the handler map. MCPBridge's handler modules and the transport,
 * oscilloscope and DJ stores drag ToneEngine and every WASM wrapper into the
 * import graph; that import alone measured 50 to 55 seconds and, on a loaded
 * machine, crossed a 60 second timeout and aborted every pre-commit run
 * (2026-10-19). Here each of those modules becomes a Proxy of no-op functions
 * and the import takes milliseconds.
 *
 * The mocks register when this module is evaluated, so the test must import
 * MCPBridge dynamically, after this import, not with a static import that
 * vitest would hoist above it.
 */
import { vi } from 'vitest';

const { spyModule, storeModule } = vi.hoisted(() => ({
  spyModule: () => new Proxy({}, {
    has: () => true,
    get: (_t, key) => (key === '__esModule' ? true : key === 'then' ? undefined : () => ({})),
  }),
  storeModule: (name: string) => ({
    [name]: Object.assign(() => ({}), { getState: () => ({ isPlaying: false, isActive: false, decks: {} }) }),
  }),
}));

vi.mock('../handlers/readHandlers', spyModule);
vi.mock('../handlers/writeHandlers', spyModule);
vi.mock('../handlers/analysisHandlers', spyModule);
vi.mock('../handlers/voiceHandlers', spyModule);
vi.mock('../handlers/generatorHandlers', spyModule);
vi.mock('../handlers/engineHandlers', spyModule);
vi.mock('../handlers/djHandlers', spyModule);
vi.mock('../handlers/furnaceCmdLog', spyModule);
vi.mock('@stores/useTransportStore', () => storeModule('useTransportStore'));
vi.mock('@stores/useOscilloscopeStore', () => storeModule('useOscilloscopeStore'));
vi.mock('@stores/useDJStore', () => storeModule('useDJStore'));
