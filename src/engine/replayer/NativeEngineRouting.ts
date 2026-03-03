/**
 * Native engine routing — lifecycle management for UADE, Hively,
 * MusicLine, C64 SID, and JamCracker WASM engines.
 *
 * These functions encapsulate the start/stop/pause/resume/restore
 * logic that was previously inline in TrackerReplayer's play()/stop()/etc.
 */

import * as Tone from 'tone';
import type { TrackerSong } from '../TrackerReplayer';
import { getToneEngine } from '../ToneEngine';
import { getNativeAudioNode } from '@utils/audio-context';
import { HivelyEngine } from '../hively/HivelyEngine';
import { MusicLineEngine } from '../musicline/MusicLineEngine';
import { C64SIDEngine } from '../C64SIDEngine';

export { C64SIDEngine };

/** Result of starting native engines — caller applies to its own state */
export interface NativeEngineStartResult {
  suppressNotes: boolean;
  c64SidEngine: C64SIDEngine | null;
}

// ---------------------------------------------------------------------------
// Start native engines (called from TrackerReplayer.play())
// ---------------------------------------------------------------------------

export async function startNativeEngines(
  song: TrackerSong,
  separationInputTone: Tone.ToneAudioNode,
  isDJDeck: boolean,
  muted: boolean,
  routedNativeEngines: Set<string>,
): Promise<NativeEngineStartResult> {
  const engine = getToneEngine();
  let suppressNotes = false;
  let c64SidEngine: C64SIDEngine | null = null;

  // HVL/AHX: Load the raw tune binary into the HivelyEngine WASM before playback.
  // The WASM engine does all synthesis; TrackerReplayer just triggers play/stop.
  // We pre-create ONE HivelySynth here so the audio graph is connected BEFORE
  // play() is called — otherwise the first few rows could be silent.
  if (song.hivelyFileData && (song.format === 'HVL' || song.format === 'AHX')) {
    try {
      const hivelyEngine = HivelyEngine.getInstance();
      await hivelyEngine.ready();
      const stereoMode = song.hivelyMeta?.stereoMode ?? 2;
      await hivelyEngine.loadTune(song.hivelyFileData.slice(0), stereoMode);

      // Pre-create a HivelySynth so its output is routed through the audio graph
      // before we call play(). This ensures engine.output → synthBus is connected.
      const firstHVL = song.instruments.find(i => i.synthType === 'HivelySynth');
      if (firstHVL) {
        engine.getInstrument(firstHVL.id, firstHVL);
      }

      // Start WASM playback immediately — skip if muted (DJ mode visuals)
      if (!muted) {
        hivelyEngine.play();
        console.log('[TrackerReplayer] HivelyEngine tune loaded & playing for', song.format);
      } else {
        console.log('[TrackerReplayer] HivelyEngine tune loaded but skipping play (muted for DJ visuals)');
      }
    } catch (err) {
      console.error('[TrackerReplayer] Failed to load HVL tune into WASM engine:', err);
    }
  }

  // JamCracker: Load the raw .jam binary into the JamCrackerEngine WASM.
  // The WASM replayer (transpiled 68k + Paula emulation) handles all synthesis.
  if (song.jamCrackerFileData && song.format === 'JamCracker') {
    suppressNotes = true;
    try {
      const { JamCrackerEngine } = await import('@/engine/jamcracker/JamCrackerEngine');
      const jcEngine = JamCrackerEngine.getInstance();
      await jcEngine.ready();
      await jcEngine.loadTune(song.jamCrackerFileData.slice(0));

      // Pre-create a JamCrackerSynth so its output is routed through the audio graph
      const firstJC = song.instruments.find(i => i.synthType === 'JamCrackerSynth');
      if (firstJC) {
        engine.getInstrument(firstJC.id, firstJC);
      }

      if (!muted) {
        jcEngine.play();
        console.log('[TrackerReplayer] JamCrackerEngine tune loaded & playing');
      } else {
        console.log('[TrackerReplayer] JamCrackerEngine tune loaded but skipping play (muted)');
      }
    } catch (err) {
      console.error('[TrackerReplayer] Failed to load JamCracker tune into WASM engine:', err);
    }
  }

  // C64 SID: Load the raw SID file into C64SIDEngine for hardware-accurate playback.
  // Similar to HivelyEngine, the SID engine handles all synthesis.
  if (song.c64SidFileData && song.format === 'SID') {
    // C64SIDEngine handles all audio — suppress pattern note triggers to avoid double synthesis.
    suppressNotes = true;
    try {
      const audioContext = Tone.getContext().rawContext as AudioContext;
      c64SidEngine = new C64SIDEngine(song.c64SidFileData);
      await c64SidEngine.init(audioContext);

      // Start playback immediately — skip if muted (DJ mode visuals)
      if (!muted) {
        await c64SidEngine.play();
        console.log('[TrackerReplayer] C64SIDEngine loaded & playing for SID format');
      } else {
        console.log('[TrackerReplayer] C64SIDEngine loaded but skipping play (muted for DJ visuals)');
      }
    } catch (err) {
      console.error('[TrackerReplayer] Failed to load SID tune into C64SIDEngine:', err);
    }
  }

  // MusicLine Editor: load raw binary into MusicLineEngine WASM before playback.
  if (song.musiclineFileData) {
    // WASM handles all audio for ML songs — suppress Sampler note triggers to avoid double audio.
    suppressNotes = true;
    try {
      const mlEngine = MusicLineEngine.getInstance();
      await mlEngine.ready();
      await mlEngine.loadSong(song.musiclineFileData.slice(0));
      if (!muted) {
        mlEngine.play();
        console.log('[TrackerReplayer] MusicLineEngine loaded & playing');

        // Route ML engine audio through the stereo separation chain.
        // ML songs don't have a 'MusicLineSynth' instrument in their instrument list
        // (parser uses Sampler instruments for display), so we route directly here
        // instead of relying on the instrument-iteration block below.
        if (!isDJDeck && !routedNativeEngines.has('MusicLineSynth')) {
          engine.routeNativeEngineOutput({ name: 'MusicLineSynth', output: mlEngine.output } as any);
          const nativeInput = getNativeAudioNode(separationInputTone as any);
          if (nativeInput) {
            engine.rerouteNativeEngine('MusicLineSynth', nativeInput);
            routedNativeEngines.add('MusicLineSynth');
          }
        }
      }
    } catch (err) {
      console.error('[TrackerReplayer] Failed to load ML tune into WASM:', err);
    }
  }

  // Route UADE/Hively native engine output through the stereo separation chain
  // so the Amiga stereo mix (hard-pan LRRL) gets narrowed by stereoSeparation.
  // In DJ mode, DeckEngine.loadSong() handles this; only do it for tracker view.
  if (!isDJDeck) {
    for (const inst of song.instruments) {
      const st = inst.synthType;
      if ((st === 'UADESynth' || st === 'HivelySynth' || st === 'MusicLineSynth' || st === 'JamCrackerSynth') && !routedNativeEngines.has(st)) {
        const nativeInput = getNativeAudioNode(separationInputTone as any);
        if (nativeInput) {
          engine.rerouteNativeEngine(st, nativeInput);
          routedNativeEngines.add(st);
        }
      }
    }
  }

  return { suppressNotes, c64SidEngine };
}

// ---------------------------------------------------------------------------
// Stop native engines (called from TrackerReplayer.stop())
// ---------------------------------------------------------------------------

export function stopNativeEngines(
  song: TrackerSong | null,
  routedNativeEngines: Set<string>,
  c64SidEngine: C64SIDEngine | null,
): C64SIDEngine | null {
  // Stop routed native engines (UADE/Hively)
  if (routedNativeEngines.size > 0) {
    const engine = getToneEngine();
    for (const st of routedNativeEngines) {
      try {
        engine.stopNativeEngine(st);
      } catch { /* ignored */ }
    }
  }

  // Stop HivelyEngine if this is an HVL/AHX song
  if (song?.hivelyFileData && (song.format === 'HVL' || song.format === 'AHX')) {
    try {
      if (HivelyEngine.hasInstance()) {
        HivelyEngine.getInstance().stop();
      }
    } catch { /* HivelyEngine may not be loaded */ }
  }

  // Stop JamCrackerEngine if this is a JamCracker song
  if (song?.jamCrackerFileData && song.format === 'JamCracker') {
    try {
      import('@/engine/jamcracker/JamCrackerEngine').then(({ JamCrackerEngine }) => {
        if (JamCrackerEngine.hasInstance()) {
          JamCrackerEngine.getInstance().stop();
        }
      }).catch(() => { /* JamCrackerEngine may not be loaded */ });
    } catch { /* ignore */ }
  }

  // Stop MusicLineEngine if this is an ML song
  if (song?.musiclineFileData && song.format === 'ML') {
    try {
      if (MusicLineEngine.hasInstance()) {
        MusicLineEngine.getInstance().stop();
      }
    } catch { /* MusicLineEngine may not be loaded */ }
  }

  // Stop C64SIDEngine if this is a SID song
  if (c64SidEngine) {
    try {
      c64SidEngine.stop();
      c64SidEngine.dispose();
    } catch (err) {
      console.warn('[TrackerReplayer] Error stopping C64SIDEngine:', err);
    }
    return null;
  }

  return c64SidEngine;
}

// ---------------------------------------------------------------------------
// Pause native engines (called from TrackerReplayer.pause())
// ---------------------------------------------------------------------------

export function pauseNativeEngines(routedNativeEngines: Set<string>): void {
  if (routedNativeEngines.size > 0) {
    const engine = getToneEngine();
    for (const st of routedNativeEngines) {
      try {
        if (st === 'HivelySynth') {
          // Use pause() — not stop() — so the ring buffer is preserved and
          // resume() can restart playback without reloading the tune.
          HivelyEngine.getInstance().pause();
        } else {
          engine.stopNativeEngine(st);
        }
      } catch { /* ignored */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Resume native engines (called from TrackerReplayer.resume())
// ---------------------------------------------------------------------------

export function resumeNativeEngines(
  routedNativeEngines: Set<string>,
  muted: boolean,
): void {
  // Restart WASM playback for HVL/AHX — the worklet won't output audio
  // until play() is called after a pause().
  if (routedNativeEngines.has('HivelySynth') && !muted) {
    HivelyEngine.getInstance().play();
  }
}

// ---------------------------------------------------------------------------
// Restore native engine routing (called from loadSong/dispose)
// ---------------------------------------------------------------------------

export function restoreNativeRouting(routedNativeEngines: Set<string>): void {
  if (routedNativeEngines.size > 0) {
    const engine = getToneEngine();
    for (const key of routedNativeEngines) {
      engine.restoreNativeEngineRouting(key);
    }
    routedNativeEngines.clear();
  }
}

// ---------------------------------------------------------------------------
// Pre-initialize MusicLine WASM (called from loadSong)
// ---------------------------------------------------------------------------

export function preInitMusicLine(musiclineFileData: Uint8Array): void {
  void (async () => {
    try {
      const mlEngine = MusicLineEngine.getInstance();
      await mlEngine.ready();
      await mlEngine.loadSong(musiclineFileData.slice(0));
    } catch (err) {
      console.warn('[TrackerReplayer] ML WASM pre-init failed:', err);
    }
  })();
}
