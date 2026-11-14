/** test-fx5 "full linear": slides and portamento under linear pitch 2 (test-fx6 has the same rows at 0). */
import { AY_MACRO, ayInstrument, ayMacro } from '@/lib/export/neogeo/scrambleCompose';
import { A, B, finish, testFxSong } from './test-fx-common';

export function linearSong(name: string, linearPitch: 0 | 1 | 2) {
  const s = testFxSong(name, linearPitch);
  const ins = s.addInstrument('Volume 15', ayInstrument([ayMacro(AY_MACRO.VOL, [15])]));
  const p = s.pattern()
    .put(A, 0x00, { note: 'C-2', ins, fx: [[0x01, 0x04]] })
    .put(A, 0x10, { note: 'C-6', fx: [[0x02, 0x08]] })
    .put(A, 0x18, { note: 'C-3' }).put(A, 0x1c, { note: 'C-5', fx: [[0x03, 0x10]] })
    .put(B, 0x00, { note: 'G-3', ins, fx: [[0x04, 0x46], [0x01, 0x02]] });
  return finish(s, p);
}

export default function () { return linearSong('test-fx5 full linear', 2); }
