/**
 * A ToneEngine with no audio for jsdom tests that load a song through applySong: every method is a no-op, and
 * preloadInstruments resolves. Use as `vi.mock('@engine/ToneEngine', () => import('@/test/mocks/silentToneEngine'))`.
 */
const engine: unknown = new Proxy({}, { get: (_t, k) => () => (k === 'preloadInstruments' ? Promise.resolve() : undefined) });

export const getToneEngine = (): unknown => engine;
export const ToneEngine = { getInstance: (): unknown => engine };
