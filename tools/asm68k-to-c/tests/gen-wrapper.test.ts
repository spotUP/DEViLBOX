import { genWrapper, genCMake } from '../src/gen-wrapper.js';

test('wrapper contains all required exported symbols', () => {
  const w = genWrapper({ playerName: 'sonix', exports: ['InitPlay', 'PlayMusic'] });
  expect(w).toContain('player_init(');
  expect(w).toContain('player_load(');
  expect(w).toContain('player_render(');
  expect(w).toContain('player_stop(');
  expect(w).toContain('player_is_finished(');
  expect(w).toContain('InitPlay()');
  expect(w).toContain('PlayMusic()');
});

test('cmake contains emscripten exported functions', () => {
  const cmake = genCMake({ playerName: 'sonix', playerFile: 'sonix.c', runtimeDir: '../../runtime' });
  expect(cmake).toContain('_player_init');
  expect(cmake).toContain('_player_render');
  expect(cmake).toContain('emcmake');
});

test('cmake builds the shared runtime Paula, not a local copy', () => {
  const cmake = genCMake({ playerName: 'sonix', playerFile: 'sonix.c', runtimeDir: '../../runtime' });
  expect(cmake).toContain('set(PAULA_RUNTIME_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../runtime")');
  expect(cmake).toContain('${PAULA_RUNTIME_DIR}/paula_soft.c');
  expect(cmake).not.toMatch(/^\s+paula_soft\.c$/m);
});
