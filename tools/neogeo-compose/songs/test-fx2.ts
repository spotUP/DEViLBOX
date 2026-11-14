/** test-fx2 "macros": macro delay and speed, fixed arpeggio step, release points, note off and note release. */
import { AY_MACRO, ayInstrument, ayMacro } from '@/lib/export/neogeo/scrambleCompose';
import { A, B, C, finish, testFxSong } from './test-fx-common';

const FIXED = 0x40000000; // arpeggio macro step that is a fixed note (file note number, C-0 = 60)

export default function () {
  const s = testFxSong('test-fx2 macros', 1);
  const slow = s.addInstrument('Volume delay speed', ayInstrument([ayMacro(AY_MACRO.VOL, [15, 12, 9, 6], -1, { delay: 3, speed: 2 })]));
  const fixed = s.addInstrument('Arpeggio fixed C-5', ayInstrument([ayMacro(AY_MACRO.ARP, [0, 12, FIXED | 120], 0)]));
  const rel = s.addInstrument('Volume release', ayInstrument([ayMacro(AY_MACRO.VOL, [15, 14, 13, 10, 8, 6, 4, 2, 0], 0, { release: 2 })]));
  const both = s.addInstrument('Volume and arpeggio release', ayInstrument([
    ayMacro(AY_MACRO.VOL, [15, 15, 12], -1, { release: 2 }), ayMacro(AY_MACRO.ARP, [0, 7], 0, { release: 1 }), ayMacro(AY_MACRO.MIXER, [1]),
  ]));
  const p = s.pattern()
    .put(A, 0x00, { note: 'C-4', ins: slow }).put(A, 0x08, { note: 'E-4', ins: slow }).put(A, 0x10, { note: 'G-4', ins: slow })
    .put(B, 0x00, { note: 'C-3', ins: fixed }).put(B, 0x08, { note: 'D-3', ins: fixed })
    .put(B, 0x10, { note: 'E-4', ins: both, fx: [[0x00, 0x47], [0xe0, 0x02]] })
    .put(C, 0x00, { note: 'C-4', ins: rel }).put(C, 0x06, { note: '===' })
    .put(C, 0x08, { note: 'C-4', ins: rel }).put(C, 0x0c, { note: 'REL' })
    .put(C, 0x10, { note: 'C-4', ins: rel, fx: [[0xe7, 0x05]] })
    .put(C, 0x18, { note: 'C-4', ins: rel, fx: [[0xfc, 0x03]] });
  return finish(s, p);
}
