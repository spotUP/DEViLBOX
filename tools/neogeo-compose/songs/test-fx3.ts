/** test-fx3 "chip": fine volume slides, volume slide, hardware envelope, auto-envelope, noise, phase reset. */
import { AY_MACRO, ayInstrument, ayMacro } from '@/lib/export/neogeo/scrambleCompose';
import { A, B, C, finish, testFxSong } from './test-fx-common';

export default function () {
  const s = testFxSong('test-fx3 chip', 1);
  const tone = s.addInstrument('Tone', ayInstrument([ayMacro(AY_MACRO.VOL, [15]), ayMacro(AY_MACRO.MIXER, [1])]));
  const buzz = s.addInstrument('Auto envelope buzz', ayInstrument([
    ayMacro(AY_MACRO.ENV_SHAPE, [8]), ayMacro(AY_MACRO.MIXER, [5]), ayMacro(AY_MACRO.AUTO_ENV_NUM, [1]), ayMacro(AY_MACRO.AUTO_ENV_DEN, [2]),
  ]));
  const noise = s.addInstrument('Noise', ayInstrument([ayMacro(AY_MACRO.NOISE, [10]), ayMacro(AY_MACRO.MIXER, [2])]));
  const saw = s.addInstrument('Envelope saw reset', ayInstrument([
    ayMacro(AY_MACRO.ENV_SHAPE, [12]), ayMacro(AY_MACRO.MIXER, [4]), ayMacro(AY_MACRO.PHASE_RESET, [1, 0, 0, 0], 0),
  ]));
  const p = s.pattern()
    .put(A, 0x00, { note: 'C-4', ins: tone, fx: [[0xf3, 0x10]] }).put(A, 0x04, { fx: [[0xf4, 0x04]] })
    .put(A, 0x08, { fx: [[0xf8, 0x02]] }).put(A, 0x09, { fx: [[0xf9, 0x03]] })
    .put(A, 0x0c, { fx: [[0xfa, 0x03]] }).put(A, 0x10, { fx: [[0xfa, 0x30]] })
    .put(A, 0x14, { fx: [[0x20, 0x02]] }).put(A, 0x18, { fx: [[0x20, 0x05]] }).put(A, 0x1c, { fx: [[0x20, 0x01]] })
    .put(B, 0x00, { note: 'C-3', ins: buzz }).put(B, 0x08, { fx: [[0x29, 0x21]] })
    .put(B, 0x10, { fx: [[0x29, 0x14]] }).put(B, 0x18, { fx: [[0x29, 0x00]] })
    .put(C, 0x00, { note: 'C-4', ins: noise, fx: [[0x21, 0x08]] }).put(C, 0x08, { fx: [[0x21, 0x15]] })
    .put(C, 0x10, { note: 'A-2', ins: saw }).put(C, 0x18, { fx: [[0x20, 0x41]] });
  return finish(s, p);
}
