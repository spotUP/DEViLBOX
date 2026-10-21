/**
 * The instrument type store without its classifier Worker (jsdom has none), for tests that load a song through
 * applySong. Use as `vi.mock('@stores/useInstrumentTypeStore', () => import('@/test/mocks/inertInstrumentTypeStore'))`.
 */
const state = { results: {}, resetClassified: (): void => undefined, classifyInstruments: (): void => undefined };
const hook = <T>(sel: (s: typeof state) => T): T => sel(state);

export const useInstrumentTypeStore = Object.assign(hook, { getState: () => state });
