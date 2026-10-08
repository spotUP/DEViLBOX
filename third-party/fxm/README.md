# FXM / ZXAYAMAD player (FXM.c)

Source: arnaud-neny/rePlayer, `source/Replays/Ayumi/webAyumi/FXM.c`
(fetched 2026-10-07, vendored unmodified). It is Juergen Wothke's webAyumi
adaptation of Pavel Dovgalyuk's ArduinoFXMPlayer
(https://github.com/Dovgalyuk/ArduinoFXMPlayer, Fuxoft AY Language player),
patched to return the AY register settings per frame (`fxm_get_registers`)
and to read the "Amadeus" ZXAYAMAD container (`amad_load`).

Used by `aylet-wasm/` (compiled into Aylet.wasm): `fxm_loop()` runs once per
1/50 s frame and its 14 registers go to aylet's AY emulation (sound.c), the
same chip model that plays ZXAY EMUL files.

## Licence - UNRESOLVED

- FXM.c's own header says "Author (probably): Pavel Dovgalyuk. License: unknown".
- The upstream repo (Dovgalyuk/ArduinoFXMPlayer) declares no licence file
  (GitHub reports none), so by default all rights are reserved by the author.
- rePlayer's webAyumi README credits true-grue/ayumi (MIT) for the AY core;
  that core is NOT used here (aylet's sound.c, GPL-2.0-or-later, is).

Redistribution rights for this file are not established. The owner decides
whether to keep it vendored, ask Pavel Dovgalyuk for a licence, or replace it
with a clean-room FXM interpreter written from the FXM format description
(Dovgalyuk's FXM.md).
