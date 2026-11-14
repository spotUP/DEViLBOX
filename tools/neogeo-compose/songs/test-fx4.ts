/** test-fx4 "legato": EAxx legato on and off, note delay, note cut, retrigger. */
import { AY_MACRO, ayInstrument, ayMacro } from '@/lib/export/neogeo/scrambleCompose';
import { A, B, finish, testFxSong } from './test-fx-common';

export default function () {
  const s = testFxSong('test-fx4 legato', 1);
  const ins = s.addInstrument('Decay octave arpeggio', ayInstrument([
    ayMacro(AY_MACRO.VOL, [15, 13, 11, 9, 7, 5, 3]), ayMacro(AY_MACRO.ARP, [0, 0, 12], 0),
  ]));
  const p = s.pattern()
    .put(A, 0x00, { note: 'C-4', ins }).put(A, 0x04, { fx: [[0xea, 0x01]] })
    .put(A, 0x05, { note: 'D-4' }).put(A, 0x06, { note: 'E-4' }).put(A, 0x07, { note: 'F-4' })
    .put(A, 0x08, { note: 'G-4', fx: [[0xea, 0x00]] })
    .put(A, 0x10, { note: 'C-4', fx: [[0xe6, 0x34]] }).put(A, 0x14, { fx: [[0xe8, 0x23]] }).put(A, 0x18, { fx: [[0xe9, 0x23]] })
    .put(B, 0x00, { note: 'C-3', ins, fx: [[0xe1, 0x34]] }).put(B, 0x02, { note: 'D-3', fx: [[0xea, 0x01]] });
  return finish(s, p);
}
