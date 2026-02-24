/**
 * ProjectMCanvas — React component wrapping the projectM v4 WASM Milkdrop renderer.
 *
 * Uses Emscripten + SDL2 + WebGL2 to render Milkdrop presets with higher fidelity
 * than butterchurn (~95%+ preset compatibility vs ~80%).
 *
 * The component:
 *  - Injects public/projectm/ProjectM.js + .wasm
 *  - Creates an SDL2/WebGL2 canvas owned by Emscripten
 *  - Pushes PCM audio from ToneEngine each frame
 *  - Exposes next/random/load imperative API (same as VJCanvasHandle)
 *
 * Milkdrop presets are loaded from public/projectm/presets/ (user can drop .milk files there).
 * The component also ships a curated set of ~20 built-in presets as embedded strings.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ProjectMEngine } from '@engine/vj/ProjectMEngine';
import { AudioDataBus } from '@engine/vj/AudioDataBus';
import type { VJCanvasHandle } from './VJView';

// ── Built-in preset collection (Milkdrop .milk format strings) ──────────────
// We ship a small curated set; users can add more to public/projectm/presets/.
// Each preset is a name → .milk file content string.

const BUILTIN_PRESETS: Record<string, string> = {
  'Bass Pulse Tunnel': `[preset00]
fRating=4
fGammaAdj=1.8
fDecay=0.96
fVideoEchoZoom=1.01
fVideoEchoAlpha=0.3
nVideoEchoOrientation=0
nWaveMode=0
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=1
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=1.0
fWaveScale=1.5
fWaveSmoothing=0.6
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.5
fWarpScale=1.2
fZoomExponent=1.0
fShader=0
zoom=1.0
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=0.5
sx=1
sy=1
wave_r=0.0
wave_g=0.5
wave_b=1.0
wave_x=0.5
wave_y=0.5
ob_size=0.01
ob_r=0.0
ob_g=0.0
ob_b=0.0
ob_a=0.5
ib_size=0.01
ib_r=0.1
ib_g=0.3
ib_b=0.6
ib_a=0.3
per_frame_1=zoom = 1.0 + 0.1*bass;
per_frame_2=rot = 0.02*sin(time*0.3) + 0.01*treb;
per_frame_3=warp = 0.5 + 0.5*bass;
per_frame_4=wave_r = 0.5 + 0.5*sin(time*1.1);
per_frame_5=wave_g = 0.5 + 0.5*sin(time*1.3 + 2.0);
per_frame_6=wave_b = 0.5 + 0.5*sin(time*1.7 + 4.0);
per_frame_7=decay = 0.94 + 0.04*bass;
per_frame_8=ob_a = 0.3 + 0.3*bass;
per_pixel_1=zoom = zoom + 0.02*rad*bass;
per_pixel_2=rot = rot + 0.01*sin(ang*6.0)*treb;`,

  'Neon Waveform': `[preset00]
fRating=4
fGammaAdj=2.0
fDecay=0.92
fVideoEchoZoom=1.0
fVideoEchoAlpha=0.0
nVideoEchoOrientation=0
nWaveMode=5
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=0
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=1.0
fWaveScale=2.0
fWaveSmoothing=0.5
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.0
fWarpScale=1.0
fZoomExponent=1.0
fShader=0
zoom=1.0
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=0
sx=1
sy=1
wave_r=0.0
wave_g=1.0
wave_b=0.5
wave_x=0.5
wave_y=0.5
ob_size=0
ob_r=0
ob_g=0
ob_b=0
ob_a=0
ib_size=0
ib_r=0
ib_g=0
ib_b=0
ib_a=0
per_frame_1=wave_r = 0.5+0.5*sin(time*2.0);
per_frame_2=wave_g = 0.5+0.5*cos(time*1.5);
per_frame_3=wave_b = 0.5+0.5*sin(time*3.0+1.0);
per_frame_4=wave_x = 0.5;
per_frame_5=wave_y = 0.5;
per_frame_6=zoom = 0.98 + 0.02*bass;
per_frame_7=rot = 0.005*sin(time*0.2);`,

  'Spiral Galaxy': `[preset00]
fRating=4
fGammaAdj=1.9
fDecay=0.97
fVideoEchoZoom=1.0
fVideoEchoAlpha=0.4
nVideoEchoOrientation=3
nWaveMode=0
bAdditiveWaves=1
bWaveDots=1
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=0.9
fWaveScale=1.0
fWaveSmoothing=0.7
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=2.0
fWarpScale=2.0
fZoomExponent=1.0
fShader=0
zoom=0.99
rot=0.03
cx=0.5
cy=0.5
dx=0
dy=0
warp=1.0
sx=1
sy=1
wave_r=1.0
wave_g=0.5
wave_b=0.0
wave_x=0.5
wave_y=0.5
ob_size=0.005
ob_r=0.0
ob_g=0.0
ob_b=0.2
ob_a=0.8
ib_size=0.005
ib_r=0.2
ib_g=0.0
ib_b=0.2
ib_a=0.3
per_frame_1=rot = 0.03 + 0.02*bass;
per_frame_2=zoom = 0.985 + 0.015*mid;
per_frame_3=warp = 1.0 + 2.0*treb;
per_frame_4=wave_r = 0.8 + 0.2*bass;
per_frame_5=wave_g = 0.3 + 0.3*mid;
per_frame_6=wave_b = 0.5 + 0.5*treb;
per_frame_7=decay = 0.96 + 0.02*bass;
per_pixel_1=rot = rot + 0.03*sin(rad*3.14159*4.0)*bass;
per_pixel_2=zoom = zoom + 0.01*sin(ang*4.0)*mid;`,

  'Heartbeat Rings': `[preset00]
fRating=4
fGammaAdj=2.0
fDecay=0.95
fVideoEchoZoom=1.005
fVideoEchoAlpha=0.5
nVideoEchoOrientation=0
nWaveMode=3
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=1
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=1.0
fWaveScale=1.8
fWaveSmoothing=0.5
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.0
fWarpScale=1.0
fZoomExponent=1.0
fShader=0
zoom=1.0
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=0
sx=1.0
sy=1.0
wave_r=1.0
wave_g=0.2
wave_b=0.4
wave_x=0.5
wave_y=0.5
ob_size=0
ob_r=0
ob_g=0
ob_b=0
ob_a=0
ib_size=0
ib_r=0
ib_g=0
ib_b=0
ib_a=0
per_frame_1=zoom = 1.0 + 0.15*bass - 0.05*mid;
per_frame_2=sx = 1.0 + 0.05*sin(time*2.0)*bass;
per_frame_3=sy = 1.0 + 0.05*cos(time*2.0)*bass;
per_frame_4=wave_r = 1.0;
per_frame_5=wave_g = 0.2 + 0.4*mid;
per_frame_6=wave_b = 0.4 + 0.6*treb;
per_frame_7=decay = 0.93 + 0.05*bass;
per_pixel_1=zoom = zoom + 0.1*sin(rad*3.14159*6.0)*bass;`,

  'Electric Storm': `[preset00]
fRating=5
fGammaAdj=1.7
fDecay=0.94
fVideoEchoZoom=1.01
fVideoEchoAlpha=0.35
nVideoEchoOrientation=1
nWaveMode=6
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=1.0
fWaveScale=1.0
fWaveSmoothing=0.6
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=2.0
fWarpScale=1.5
fZoomExponent=1.0
fShader=0
zoom=0.98
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=1.0
sx=1
sy=1
wave_r=0.3
wave_g=0.5
wave_b=1.0
wave_x=0.5
wave_y=0.5
ob_size=0.01
ob_r=0.0
ob_g=0.0
ob_b=0.0
ob_a=0.8
ib_size=0.005
ib_r=0.0
ib_g=0.2
ib_b=0.5
ib_a=0.5
per_frame_1=warp = 1.0 + 3.0*bass;
per_frame_2=zoom = 0.97 + 0.03*mid;
per_frame_3=rot = 0.01*sin(time*0.5)*treb;
per_frame_4=cx = 0.5 + 0.1*sin(time*0.7);
per_frame_5=cy = 0.5 + 0.1*cos(time*0.9);
per_frame_6=wave_r = 0.3 + 0.7*treb;
per_frame_7=wave_g = 0.3 + 0.4*mid;
per_frame_8=wave_b = 0.8 + 0.2*bass;
per_frame_9=decay = 0.92 + 0.06*bass;
per_pixel_1=warp = warp + 0.5*sin(ang*3.0 + time)*treb;
per_pixel_2=zoom = zoom + 0.02*cos(rad*8.0)*bass;`,

  'Deep Ocean': `[preset00]
fRating=4
fGammaAdj=1.6
fDecay=0.985
fVideoEchoZoom=1.0
fVideoEchoAlpha=0.2
nVideoEchoOrientation=2
nWaveMode=2
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=0
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=0.7
fWaveScale=1.2
fWaveSmoothing=0.8
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=0.5
fWarpScale=2.0
fZoomExponent=1.0
fShader=0
zoom=1.005
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=0.5
sx=1
sy=1
wave_r=0.0
wave_g=0.3
wave_b=0.8
wave_x=0.5
wave_y=0.5
ob_size=0.005
ob_r=0.0
ob_g=0.05
ob_b=0.15
ob_a=1.0
ib_size=0
ib_r=0
ib_g=0
ib_b=0
ib_a=0
per_frame_1=zoom = 1.003 + 0.005*bass;
per_frame_2=warp = 0.3 + 0.8*mid;
per_frame_3=rot = 0.003*sin(time*0.15);
per_frame_4=dx = 0.002*sin(time*0.2);
per_frame_5=dy = 0.003*cos(time*0.15);
per_frame_6=wave_r = 0.0 + 0.3*treb;
per_frame_7=wave_g = 0.3 + 0.3*mid;
per_frame_8=wave_b = 0.7 + 0.3*bass;
per_frame_9=decay = 0.98 + 0.015*bass;
per_pixel_1=zoom = zoom + 0.005*sin(rad*6.28*2.0 + time*0.5)*mid;
per_pixel_2=warp = warp + 0.3*sin(ang*2.0 + time*0.3)*bass;`,

  'Fire Dance': `[preset00]
fRating=5
fGammaAdj=2.2
fDecay=0.93
fVideoEchoZoom=1.02
fVideoEchoAlpha=0.25
nVideoEchoOrientation=0
nWaveMode=4
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=1.0
fWaveScale=1.5
fWaveSmoothing=0.5
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=3.0
fWarpScale=1.0
fZoomExponent=1.0
fShader=0
zoom=0.99
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=-0.005
warp=0.5
sx=1
sy=1
wave_r=1.0
wave_g=0.5
wave_b=0.0
wave_x=0.5
wave_y=0.5
ob_size=0.01
ob_r=0.0
ob_g=0.0
ob_b=0.0
ob_a=1.0
ib_size=0
ib_r=0
ib_g=0
ib_b=0
ib_a=0
per_frame_1=zoom = 0.98 + 0.04*bass;
per_frame_2=dy = -0.005 - 0.01*bass;
per_frame_3=warp = 0.5 + 1.5*mid;
per_frame_4=rot = 0.005*sin(time*0.4)*treb;
per_frame_5=wave_r = 0.9 + 0.1*bass;
per_frame_6=wave_g = 0.3 + 0.4*mid;
per_frame_7=wave_b = 0.0 + 0.3*treb;
per_frame_8=decay = 0.91 + 0.07*bass;
per_pixel_1=dy = dy - 0.01*sin(x*3.14159*2.0)*bass;
per_pixel_2=dx = 0.003*sin(y*3.14159*4.0 + time)*treb;`,

  'Cosmic Warp': `[preset00]
fRating=5
fGammaAdj=1.8
fDecay=0.96
fVideoEchoZoom=0.99
fVideoEchoAlpha=0.5
nVideoEchoOrientation=3
nWaveMode=7
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=0.8
fWaveScale=1.0
fWaveSmoothing=0.6
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.5
fWarpScale=3.0
fZoomExponent=1.0
fShader=0
zoom=1.01
rot=0.02
cx=0.5
cy=0.5
dx=0
dy=0
warp=2.0
sx=1
sy=1
wave_r=0.6
wave_g=0.2
wave_b=1.0
wave_x=0.5
wave_y=0.5
ob_size=0.005
ob_r=0.1
ob_g=0.0
ob_b=0.2
ob_a=0.5
ib_size=0.005
ib_r=0.2
ib_g=0.0
ib_b=0.3
ib_a=0.3
per_frame_1=zoom = 1.005 + 0.02*bass;
per_frame_2=rot = 0.02 + 0.03*treb;
per_frame_3=warp = 2.0 + 3.0*mid;
per_frame_4=cx = 0.5 + 0.15*sin(time*0.3);
per_frame_5=cy = 0.5 + 0.15*cos(time*0.4);
per_frame_6=wave_r = 0.4 + 0.6*sin(time*0.7);
per_frame_7=wave_g = 0.2 + 0.4*sin(time*1.1 + 2.0);
per_frame_8=wave_b = 0.8 + 0.2*cos(time*0.9);
per_frame_9=decay = 0.95 + 0.03*bass;
per_pixel_1=zoom = zoom + 0.03*sin(ang*5.0 + time*0.5)*bass;
per_pixel_2=rot = rot + 0.04*sin(rad*3.14*3.0)*mid;
per_pixel_3=warp = warp + sin(ang*3.0)*treb;`,

  'Strobelight': `[preset00]
fRating=4
fGammaAdj=2.5
fDecay=0.5
fVideoEchoZoom=1.0
fVideoEchoAlpha=0.0
nVideoEchoOrientation=0
nWaveMode=0
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=0
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=1.0
fWaveScale=3.0
fWaveSmoothing=0.3
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.0
fWarpScale=1.0
fZoomExponent=1.0
fShader=0
zoom=1.0
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=0
sx=1
sy=1
wave_r=1.0
wave_g=1.0
wave_b=1.0
wave_x=0.5
wave_y=0.5
ob_size=0.01
ob_r=0.0
ob_g=0.0
ob_b=0.0
ob_a=1.0
ib_size=0
ib_r=0
ib_g=0
ib_b=0
ib_a=0
per_frame_1=decay = 0.2 + 0.6*bass;
per_frame_2=wave_r = 0.5+0.5*sin(time*5.0);
per_frame_3=wave_g = 0.5+0.5*sin(time*5.0+2.0);
per_frame_4=wave_b = 0.5+0.5*sin(time*5.0+4.0);
per_frame_5=zoom = 1.0 + 0.3*bass;
per_frame_6=rot = 0.1*treb*sin(time);`,

  'Kaleidoscope': `[preset00]
fRating=5
fGammaAdj=1.8
fDecay=0.97
fVideoEchoZoom=1.005
fVideoEchoAlpha=0.6
nVideoEchoOrientation=2
nWaveMode=1
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=0.6
fWaveScale=1.0
fWaveSmoothing=0.7
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.0
fWarpScale=2.0
fZoomExponent=1.0
fShader=0
zoom=0.99
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=1.5
sx=1
sy=1
wave_r=0.8
wave_g=0.4
wave_b=1.0
wave_x=0.5
wave_y=0.5
ob_size=0.005
ob_r=0.0
ob_g=0.0
ob_b=0.1
ob_a=0.6
ib_size=0.005
ib_r=0.1
ib_g=0.0
ib_b=0.1
ib_a=0.4
per_frame_1=rot = 0.05*bass;
per_frame_2=zoom = 0.98 + 0.03*mid;
per_frame_3=warp = 1.0 + 2.0*treb;
per_frame_4=wave_r = 0.5 + 0.5*sin(time*1.5);
per_frame_5=wave_g = 0.5 + 0.5*sin(time*1.5 + 2.09);
per_frame_6=wave_b = 0.5 + 0.5*sin(time*1.5 + 4.19);
per_frame_7=decay = 0.96 + 0.03*bass;
per_pixel_1=rot = rot + 0.1*sin(ang*6.0)*bass;
per_pixel_2=zoom = zoom + 0.02*sin(ang*8.0 + time)*mid;
per_pixel_3=warp = warp + sin(rad*4.0)*treb;`,

  'Hypnotic Zoom': `[preset00]
fRating=4
fGammaAdj=2.0
fDecay=0.98
fVideoEchoZoom=1.0
fVideoEchoAlpha=0.0
nVideoEchoOrientation=0
nWaveMode=0
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=1
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=0.9
fWaveScale=1.2
fWaveSmoothing=0.6
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.0
fWarpScale=1.0
fZoomExponent=1.0
fShader=0
zoom=1.04
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=0
sx=1
sy=1
wave_r=1.0
wave_g=1.0
wave_b=1.0
wave_x=0.5
wave_y=0.5
ob_size=0.01
ob_r=0.0
ob_g=0.0
ob_b=0.0
ob_a=0.3
ib_size=0.01
ib_r=0.2
ib_g=0.1
ib_b=0.5
ib_a=0.6
per_frame_1=zoom = 1.02 + 0.06*bass;
per_frame_2=rot = 0.01*sin(time*0.25) + 0.005*treb;
per_frame_3=cx = 0.5 + 0.05*sin(time*0.3);
per_frame_4=cy = 0.5 + 0.05*cos(time*0.4);
per_frame_5=wave_r = 0.8 + 0.2*bass;
per_frame_6=wave_g = 0.6 + 0.4*mid;
per_frame_7=wave_b = 1.0;
per_frame_8=decay = 0.97 + 0.02*bass;
per_frame_9=ib_r = 0.2 + 0.3*sin(time*0.5);
per_frame_10=ib_g = 0.1 + 0.2*sin(time*0.7);
per_frame_11=ib_b = 0.5 + 0.3*sin(time*0.3);`,

  'Motion Vectors': `[preset00]
fRating=4
fGammaAdj=1.9
fDecay=0.96
fVideoEchoZoom=1.0
fVideoEchoAlpha=0.0
nVideoEchoOrientation=0
nWaveMode=0
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=1
bRedBlueStereo=0
nMotionVectorsX=32
nMotionVectorsY=24
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=0.5
fWaveScale=1.0
fWaveSmoothing=0.5
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.0
fWarpScale=1.5
fZoomExponent=1.0
fShader=0
zoom=1.0
rot=0.02
cx=0.5
cy=0.5
dx=0
dy=0
warp=0.5
sx=1
sy=1
wave_r=0.5
wave_g=1.0
wave_b=0.5
wave_x=0.5
wave_y=0.5
ob_size=0
ob_r=0
ob_g=0
ob_b=0
ob_a=0
ib_size=0
ib_r=0
ib_g=0
ib_b=0
ib_a=0
per_frame_1=rot = 0.02 + 0.03*bass;
per_frame_2=zoom = 0.99 + 0.02*mid;
per_frame_3=warp = 0.5 + 1.5*treb;
per_frame_4=decay = 0.95 + 0.04*bass;
per_frame_5=wave_r = 0.3 + 0.7*treb;
per_frame_6=wave_g = 0.8 + 0.2*mid;
per_frame_7=wave_b = 0.3 + 0.4*bass;
per_pixel_1=rot = rot + 0.05*sin(rad*6.28*3.0)*bass;
per_pixel_2=dx = 0.005*cos(ang*4.0+time)*mid;
per_pixel_3=dy = 0.005*sin(ang*4.0+time)*mid;`,

  'Acid Trip': `[preset00]
fRating=5
fGammaAdj=1.5
fDecay=0.99
fVideoEchoZoom=1.01
fVideoEchoAlpha=0.7
nVideoEchoOrientation=1
nWaveMode=5
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=0
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=1
bInvert=0
fWaveAlpha=0.6
fWaveScale=1.0
fWaveSmoothing=0.6
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=2.0
fWarpScale=3.0
fZoomExponent=1.0
fShader=0
zoom=1.0
rot=0.01
cx=0.5
cy=0.5
dx=0
dy=0
warp=2.0
sx=1
sy=1
wave_r=1.0
wave_g=0.0
wave_b=1.0
wave_x=0.5
wave_y=0.5
ob_size=0.01
ob_r=0.1
ob_g=0.0
ob_b=0.1
ob_a=0.3
ib_size=0.01
ib_r=0.0
ib_g=0.1
ib_b=0.0
ib_a=0.3
per_frame_1=zoom = 0.99 + 0.02*bass;
per_frame_2=rot = 0.01 + 0.02*treb*sin(time*0.3);
per_frame_3=warp = 2.0 + 4.0*mid;
per_frame_4=cx = 0.5 + 0.2*sin(time*0.2)*bass;
per_frame_5=cy = 0.5 + 0.2*cos(time*0.3)*bass;
per_frame_6=wave_r = 0.5+0.5*sin(time*2.0);
per_frame_7=wave_g = 0.5+0.5*sin(time*2.0+2.09);
per_frame_8=wave_b = 0.5+0.5*sin(time*2.0+4.19);
per_frame_9=decay = 0.985 + 0.01*bass;
per_pixel_1=warp = warp + 2.0*sin(ang*3.0+time*0.5)*bass;
per_pixel_2=rot = rot + 0.05*cos(rad*6.28*2.0)*treb;
per_pixel_3=zoom = zoom + 0.01*sin(ang*7.0)*mid;`,

  'Minimal Pulse': `[preset00]
fRating=3
fGammaAdj=2.0
fDecay=0.8
fVideoEchoZoom=1.0
fVideoEchoAlpha=0.0
nVideoEchoOrientation=0
nWaveMode=0
bAdditiveWaves=0
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=0
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=1.0
fWaveScale=2.5
fWaveSmoothing=0.4
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.0
fWarpScale=1.0
fZoomExponent=1.0
fShader=0
zoom=1.0
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=0
sx=1
sy=1
wave_r=0.0
wave_g=1.0
wave_b=0.0
wave_x=0.5
wave_y=0.5
ob_size=0.005
ob_r=0.0
ob_g=0.0
ob_b=0.0
ob_a=1.0
ib_size=0
ib_r=0
ib_g=0
ib_b=0
ib_a=0
per_frame_1=decay = 0.5 + 0.4*bass;
per_frame_2=wave_r = bass;
per_frame_3=wave_g = mid;
per_frame_4=wave_b = treb;
per_frame_5=zoom = 1.0 + 0.05*bass;`,
};

const PRESET_NAMES = Object.keys(BUILTIN_PRESETS);

interface ProjectMCanvasProps {
  onReady?: (presetCount: number) => void;
  onPresetChange?: (idx: number, name: string) => void;
}

export const ProjectMCanvas = React.forwardRef<VJCanvasHandle, ProjectMCanvasProps>(
  ({ onReady, onPresetChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<ProjectMEngine | null>(null);
    const rafRef = useRef<number>(0);
    const currentIdxRef = useRef(0);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const audioBusRef = useRef<AudioDataBus | null>(null);

    // Init — wait until canvas has real dimensions (layout complete)
    useEffect(() => {
      let cancelled = false;
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Give Emscripten/SDL2 an id so it can find the canvas for event registration
      if (!canvas.id) canvas.id = 'projectm-canvas';

      const doInit = async () => {
        try {
          const engine = new ProjectMEngine();
          const cw = canvas.clientWidth;
          const ch = canvas.clientHeight;
          const w = Math.round(Math.max(cw, 320) * devicePixelRatio);
          const h = Math.round(Math.max(ch, 240) * devicePixelRatio);
          canvas.width = w;
          canvas.height = h;

          await engine.init(canvas, w, h);
          if (cancelled) { engine.destroy(); return; }

          engineRef.current = engine;

          // Connect audio analysis via AudioDataBus (proven tap on Tone.Destination)
          const bus = new AudioDataBus();
          bus.enable();
          audioBusRef.current = bus;

          // Load initial preset
          if (PRESET_NAMES.length > 0) {
            const startIdx = 0;
            engine.loadPresetData(BUILTIN_PRESETS[PRESET_NAMES[startIdx]], false);
            currentIdxRef.current = startIdx;
            onPresetChange?.(startIdx, PRESET_NAMES[startIdx]);
          }

          setReady(true);
          onReady?.(PRESET_NAMES.length);
        } catch (err) {
          console.error('[ProjectMCanvas] Failed to initialize:', err);
          setError(err instanceof Error ? err.message : String(err));
        }
      };

      // Wait for next frame so canvas has layout dimensions
      const raf = requestAnimationFrame(() => {
        if (!cancelled) doInit();
      });

      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
        cancelAnimationFrame(rafRef.current);
        audioBusRef.current?.disable();
        audioBusRef.current = null;
        engineRef.current?.destroy();
        engineRef.current = null;
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Render loop
    useEffect(() => {
      if (!ready) return;
      const render = () => {
        const engine = engineRef.current;
        const bus = audioBusRef.current;
        if (engine && bus) {
          // Get audio frame from AudioDataBus (proven tap on Tone.Destination)
          const frame = bus.update();
          const waveform = frame.waveform;
          // Create stereo interleaved buffer (duplicate mono → stereo)
          const stereo = new Float32Array(waveform.length * 2);
          for (let i = 0; i < waveform.length; i++) {
            stereo[i * 2] = waveform[i];
            stereo[i * 2 + 1] = waveform[i];
          }
          engine.pushAudio(stereo, waveform.length);
          engine.renderFrame();
        }
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);
      return () => cancelAnimationFrame(rafRef.current);
    }, [ready]);

    // Resize
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !engineRef.current) return;
      const handleResize = () => {
        const w = Math.round(canvas.clientWidth * devicePixelRatio);
        const h = Math.round(canvas.clientHeight * devicePixelRatio);
        canvas.width = w;
        canvas.height = h;
        engineRef.current?.setSize(w, h);
      };
      const observer = new ResizeObserver(handleResize);
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [ready]);

    // Load preset by index
    const doLoadPreset = useCallback((idx: number) => {
      if (!engineRef.current || PRESET_NAMES.length === 0) return;
      const wrappedIdx = ((idx % PRESET_NAMES.length) + PRESET_NAMES.length) % PRESET_NAMES.length;
      const name = PRESET_NAMES[wrappedIdx];
      engineRef.current.loadPresetData(BUILTIN_PRESETS[name], true);
      currentIdxRef.current = wrappedIdx;
      onPresetChange?.(wrappedIdx, name);
    }, [onPresetChange]);

    // Imperative API
    React.useImperativeHandle(ref, () => ({
      nextPreset: () => doLoadPreset(currentIdxRef.current + 1),
      randomPreset: () => doLoadPreset(Math.floor(Math.random() * PRESET_NAMES.length)),
      loadPresetByIndex: (idx: number) => doLoadPreset(idx),
      loadPresetByName: (name: string) => {
        const idx = PRESET_NAMES.indexOf(name);
        if (idx >= 0) doLoadPreset(idx);
      },
      getPresetNames: () => PRESET_NAMES,
      getCurrentIndex: () => currentIdxRef.current,
    }), [doLoadPreset]);

    return (
      <div ref={containerRef} className="w-full h-full relative">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ imageRendering: 'auto' }}
        />
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-white/60 font-mono text-sm">Loading projectM (WASM)...</div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-red-400/80 font-mono text-sm text-center px-8">
              <div>projectM failed to load</div>
              <div className="text-xs mt-1 text-white/40">{error}</div>
              <div className="text-xs mt-2 text-white/30">Falling back to Butterchurn is recommended</div>
            </div>
          </div>
        )}
      </div>
    );
  }
);
ProjectMCanvas.displayName = 'ProjectMCanvas';
