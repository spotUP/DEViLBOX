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
  const cmake = genCMake({ playerName: 'sonix', playerFile: 'sonix.c' });
  expect(cmake).toContain('_player_init');
  expect(cmake).toContain('_player_render');
  expect(cmake).toContain('emcmake');
});
