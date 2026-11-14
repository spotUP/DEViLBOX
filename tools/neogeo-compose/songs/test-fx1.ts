/** test-fx1 "pitch": vibrato, slides, portamento, fine pitch, pitch macros; linear pitch 1, order 1 an octave lower. */
import { AY_MACRO, ayInstrument, ayMacro } from '@/lib/export/neogeo/scrambleCompose';
import { A, B, C, finish, oct, testFxSong } from './test-fx-common';

export default function () {
  const s = testFxSong('test-fx1 pitch', 1);
  const plain = s.addInstrument('Volume 15', ayInstrument([ayMacro(AY_MACRO.VOL, [15])]));
  const wobble = s.addInstrument('Pitch absolute', ayInstrument([ayMacro(AY_MACRO.PITCH, [0, 4, 8, 4, 0, -4, -8, -4], 0)]));
  const rise = s.addInstrument('Pitch relative', ayInstrument([ayMacro(AY_MACRO.PITCH, [2], -1, { mode: 1 })]));
  const pattern = (d: number) => s.pattern()
    .put(A, 0x00, { note: oct('C-4', d), ins: plain, fx: [[0xe5, 0x90]] })
    .put(A, 0x04, { fx: [[0xe5, 0x70]] })
    .put(A, 0x08, { note: oct('G-4', d), fx: [[0x04, 0x46]] })
    .put(A, 0x0c, { fx: [[0xe3, 0x01], [0xe4, 0x08], [0x04, 0x46]] })
    .put(A, 0x10, { note: oct('C-5', d), fx: [[0x01, 0x10]] })
    .put(A, 0x14, { fx: [[0x02, 0x10]] })
    .put(A, 0x18, { note: oct('A-3', d), fx: [[0xe1, 0x34]] })
    .put(A, 0x1c, { fx: [[0xe2, 0x34]] })
    .put(B, 0x00, { note: oct('C-3', d), ins: wobble })
    .put(B, 0x10, { note: oct('E-3', d), ins: rise })
    .put(B, 0x18, { note: oct('D-3', d), ins: plain, fx: [[0xf1, 0x08]] })
    .put(B, 0x1a, { fx: [[0xf2, 0x08]] })
    .put(C, 0x00, { note: oct('C-2', d), ins: plain })
    .put(C, 0x08, { note: oct('G-2', d), fx: [[0x03, 0x08]] })
    .put(C, 0x10, { note: oct('C-3', d), fx: [[0x03, 0x04]] });
  return finish(s, pattern(0), pattern(-1));
}
