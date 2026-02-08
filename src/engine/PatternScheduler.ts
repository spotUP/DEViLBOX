/**
 * PatternScheduler - Schedule pattern playback with Tone.js Transport
 *
 * Implements tick-level scheduling for accurate effect processing:
 * - Row events trigger notes and initialize effects (tick 0)
 * - Tick events process continuous effects (vibrato, portamento, volume slide, etc.)
 * - Standard tracker timing: 2.5ms per tick at 125 BPM
 */

import * as Tone from 'tone';
import { getToneEngine } from './ToneEngine';
import { createFormatHandler } from './effects';
import { type FormatHandler, type ModuleFormat } from './effects/types';
import { getAutomationPlayer } from './AutomationPlayer';
import { getEffectProcessor } from './EffectCommands';
import { useTransportStore } from '@stores/useTransportStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { notify } from '@stores/useNotificationStore';
import { xmNoteToToneJS, xmEffectToString } from '@/lib/xmConversions';
import type { Pattern } from '@typedefs';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { AutomationCurve } from '@typedefs/automation';
import { getGrooveOffset, getGrooveVelocity } from '@typedefs/audio';

interface AutomationData {
  [patternId: string]: {
    [channelIndex: number]: {
      [parameter: string]: AutomationCurve;
    };
  };
}

/**
 * Encapsulates the state of a specific pattern playback instance
 */
interface PlaybackState {
  rowPart: Tone.Part;
  tickPart: Tone.Part;
  handler: FormatHandler;
  format: ModuleFormat;
}

export class PatternScheduler {
  private currentPlayback: PlaybackState | null = null;
  private nextPlayback: PlaybackState | null = null;
  private activeHandler: FormatHandler | null = null;
  private activeFormat: ModuleFormat | null = null;
  private onRowChange: ((row: number) => void) | null = null;
  private onPatternEnd: (() => void) | null = null;
  private onPatternBreak: ((targetRow: number) => void) | null = null;
  private onPositionJump: ((position: number) => void) | null = null;
  private automation: AutomationData = {};
  private channelNotes: Map<number, Set<string>> = new Map(); // Track active notes per channel
  private channelActiveInstruments: Map<number, number> = new Map(); // Track active instrument per channel
  
  // Error tracking
  private playbackErrors: Map<string, number> = new Map(); // error message -> count
  private errorNotificationShown: boolean = false;
  private readonly ERROR_THRESHOLD = 5; // Show notification after 5 errors
  private automationPlayer = getAutomationPlayer();
  private patternBreakScheduled: boolean = false; // Prevent double pattern breaks
  private currentPatternEndTime: number = 0; // When current pattern ends (transport seconds)
  private nextPatternScheduled: boolean = false; // Track if next pattern is pre-scheduled
  // Deferred pattern control: pattern breaks/jumps execute at END of row, not immediately
  private pendingPatternBreak: { position: number } | null = null;
  private pendingPositionJump: number | null = null;
  private effectProcessor = getEffectProcessor();

  /**
   * Track playback errors and notify user if threshold exceeded
   */
  private trackPlaybackError(note: string, error: Error): void {
    const errorKey = error.message.split(':')[0]; // Group similar errors
    const count = (this.playbackErrors.get(errorKey) || 0) + 1;
    this.playbackErrors.set(errorKey, count);

    console.error(`Failed to trigger note ${note}:`, error);

    // Show notification if error threshold exceeded (only once per session)
    const totalErrors = Array.from(this.playbackErrors.values()).reduce((a, b) => a + b, 0);
    if (totalErrors >= this.ERROR_THRESHOLD && !this.errorNotificationShown) {
      this.errorNotificationShown = true;
      const errorList = Array.from(this.playbackErrors.entries())
        .map(([msg, cnt]) => `${msg} (${cnt}×)`)
        .join(', ');
      notify.error(
        `Playback errors detected: ${errorList}. Check console for details or review SONG_FORMAT.md`,
        15000
      );
    }
  }

  /**
   * Reset error tracking (called when stopping playback)
   */
  private resetErrorTracking(): void {
    this.playbackErrors.clear();
    this.errorNotificationShown = false;
  }

  /**
   * Set automation data
   */
  public setAutomation(automation: AutomationData): void {
    this.automation = automation;
    // Debug: log automation data details
    const patternIds = Object.keys(automation);
    if (patternIds.length > 0) {
      patternIds.forEach(pid => {
        const channels = Object.keys(automation[pid] || {});
        channels.forEach(ch => {
          const params = Object.keys(automation[pid][Number(ch)] || {});
          console.log(`[PatternScheduler] Automation set for pattern ${pid}, channel ${ch}:`, params);
        });
      });
    } else {
      console.log('[PatternScheduler] Automation data is empty');
    }
  }

  /**
   * Pre-scan pattern for Fxx effects and compute accurate row timings
   */
  private computeRowTimings(pattern: Pattern, initialSpeed: number, initialBPM: number): Array<{ time: number; speed: number; bpm: number; delay: number }> {
    const engine = getToneEngine();
    const wasm = engine.getWasmInstance();

    // Use WASM if available for speed
    if (wasm && typeof wasm.computePatternTimings === 'function') {
      try {
        const length = pattern.length;
        // Allocate input buffer: header(12) + rows(length * 20)
        const inputSize = 12 + (length * 20);
        const inputPtr = wasm.__new(inputSize, 1);
        
        // Write header
        const view = new DataView(wasm.memory.buffer);
        view.setInt32(inputPtr, length, true);
        view.setInt32(inputPtr + 4, initialSpeed, true);
        view.setFloat32(inputPtr + 8, initialBPM, true);

        // Pre-scan rows for Fxx/EEx
        for (let row = 0; row < length; row++) {
          let hasSpeed = 0;
          let newSpeed = 0;
          let hasBPM = 0;
          let newBPM = 0;
          let rowDelay = 0;

          pattern.channels.forEach((channel) => {
            const cell = channel.rows[row];
            if (cell.effTyp === 0xF && cell.eff !== undefined) {
              const param = cell.eff;
              if (param > 0 && param < 0x20) {
                hasSpeed = 1;
                newSpeed = param;
              } else if (param >= 0x20) {
                hasBPM = 1;
                newBPM = param;
              }
            }
            // Check for row delay (EE1 format)
            const effect1 = (cell.effTyp !== undefined && cell.effTyp !== 0)
              ? xmEffectToString(cell.effTyp, cell.eff ?? 0)
              : null;
            if (effect1) {
              if (effect1.toUpperCase().startsWith('EE') || effect1.toUpperCase().startsWith('SE')) {
                rowDelay = parseInt(effect1[2], 16);
              }
            }
          });

          const rowOffset = inputPtr + 12 + (row * 20);
          view.setInt32(rowOffset, hasSpeed, true);
          view.setInt32(rowOffset + 4, newSpeed, true);
          view.setInt32(rowOffset + 8, hasBPM, true);
          view.setFloat32(rowOffset + 12, newBPM, true);
          view.setInt32(rowOffset + 16, rowDelay, true);
        }

        // Allocate output buffer: length * 16 bytes
        const outputPtr = wasm.__new(length * 16, 1);
        
        // EXECUTE IN WASM
        wasm.computePatternTimings(inputPtr, outputPtr);

        // Read results
        const results: Array<{ time: number; speed: number; bpm: number; delay: number }> = [];
        for (let row = 0; row < length; row++) {
          const outOffset = outputPtr + (row * 16);
          results.push({
            time: view.getFloat32(outOffset, true),
            speed: view.getInt32(outOffset + 4, true),
            bpm: view.getFloat32(outOffset + 8, true),
            delay: view.getInt32(outOffset + 12, true),
          });
        }

        return results;
      } catch (e) {
        console.warn('[PatternScheduler] WASM Timing computation failed, falling back to JS:', e);
      }
    }

    // Fallback to pure JS implementation
    const timings: Array<{ time: number; speed: number; bpm: number; delay: number }> = [];
    let currentSpeed = initialSpeed;
    let currentBPM = initialBPM;
    let currentTime = 0;

    for (let row = 0; row < pattern.length; row++) {
      let rowDelay = 0;

      // First, process any Fxx effects on this row
      pattern.channels.forEach((channel) => {
        const cell = channel.rows[row];

        // Check XM numeric effect format
        if (cell.effTyp === 0xF && cell.eff !== undefined) {
          const param = cell.eff;
          if (param > 0 && param < 0x20) currentSpeed = param;
          else if (param >= 0x20) currentBPM = param;
        }

        // Check for EEx (MOD/XM) or SEx (S3M/IT)
        const effect1 = (cell.effTyp !== undefined && cell.effTyp !== 0)
          ? xmEffectToString(cell.effTyp, cell.eff ?? 0)
          : null;
        if (effect1) {
          if (effect1.toUpperCase().startsWith('EE')) {
            rowDelay = parseInt(effect1[2], 16);
          } else if (effect1.toUpperCase().startsWith('SE')) {
            rowDelay = parseInt(effect1[2], 16);
          }
        }
      });

      // Store timing for this row (delay is multiplier: EE1 = 2 rows duration)
      timings.push({ time: currentTime, speed: currentSpeed, bpm: currentBPM, delay: rowDelay });

      // Calculate duration of this row
      const secondsPerTick = 2.5 / currentBPM;
      const rowDuration = secondsPerTick * currentSpeed * (1 + rowDelay);
      currentTime += rowDuration;
    }

    return timings;
  }

  /**
   * Calculate timing offset for a given row using groove template or swing
   * Groove templates provide per-row timing offsets for complex rhythmic feels
   * @param row The row number
   * @param rowDuration Duration of this row in seconds (for accurate per-row timing)
   * @returns Time offset in seconds
   */
  private getGrooveOrSwingOffset(row: number, rowDuration: number): number {
    const transportState = useTransportStore.getState();

    // First check for groove template (takes priority over swing)
    const grooveTemplate = transportState.getGrooveTemplate();
    const intensity = transportState.swing / 100;

    if (grooveTemplate && grooveTemplate.id !== 'straight') {
      return getGrooveOffset(grooveTemplate, row, rowDuration) * intensity;
    }

    // Fall back to legacy swing behavior
    const swingAmount = transportState.swing;

    // No swing at 100 (neutral)
    if (swingAmount === 100) return 0;

    // Swing affects every other row (odd rows in 2-row groupings)
    const grooveSteps = transportState.grooveSteps || 2;
    const isSwungRow = (row % grooveSteps) === (grooveSteps - 1);

    if (!isSwungRow) return 0;

    // Normalize: 100 -> 0, 200 -> 1, 0 -> -1
    const normalizedSwing = (swingAmount - 100) / 100;
    const maxSwingOffset = rowDuration * 0.5;

    return normalizedSwing * maxSwingOffset;
  }

  /**
   * Apply tick effect results to a channel
   * @param channelIndex The channel to apply effects to
   * @param tickResult The result from the effect processor
   * @param handler The format handler for this playback
   */
  private applyTickEffects(
    channelIndex: number,
    tickResult: any,
    handler: FormatHandler
  ): void {
    const engine = getToneEngine();

    // Apply pitch/frequency changes
    if (tickResult.setFrequency !== undefined) {
      engine.setChannelFrequency(channelIndex, tickResult.setFrequency);
    } else if (tickResult.setPeriod !== undefined && tickResult.setPeriod > 0) {
      // Periodic playback logic: convert period to frequency for ToneEngine
      const periodMult = (handler as any).config?.periodMultiplier || 3546895;
      const frequency = periodMult / tickResult.setPeriod;
      engine.setChannelFrequency(channelIndex, frequency);
    } else if (tickResult.setPeriod === 0) {
      // Hardware bug: period 0 usually results in silence or extreme high pitch
      engine.setChannelVolume(channelIndex, -Infinity);
    }

    if (tickResult.setVolume !== undefined) {
      // 1:1 Gain Mapping: volume 64 = 0dB, 0 = -Infinity
      const volumeDb = tickResult.setVolume === 0 ? -Infinity : 20 * Math.log10(tickResult.setVolume / 64);
      engine.setChannelVolume(channelIndex, volumeDb);
    }

    // Apply panning changes
    if (tickResult.setPan !== undefined) {
      // Convert 0-255 to -100 to 100 for ToneEngine
      const pan = ((tickResult.setPan - 128) / 128) * 100;
      engine.setChannelPan(channelIndex, pan);
    }

    // Note control
    if (tickResult.cutNote) {
      engine.setChannelVolume(channelIndex, -Infinity);
    }

    // Apply filter changes (IT/S3M)
    if (tickResult.setFilterCutoff !== undefined) {
      engine.setChannelFilterCutoff(channelIndex, tickResult.setFilterCutoff);
    }
    if (tickResult.setFilterResonance !== undefined) {
      engine.setChannelFilterResonance(channelIndex, tickResult.setFilterResonance);
    }

    // Hardware Quirk: apply new BPM/Speed immediately
    if (tickResult.setBPM !== undefined) {
      engine.setBPM(tickResult.setBPM);
    }
    if (tickResult.setSpeed !== undefined) {
      (handler as any).speed = tickResult.setSpeed;
    }

    if (tickResult.funkRepeat !== undefined) {
      engine.setChannelFunkRepeat(channelIndex, tickResult.funkRepeat);
    }
  }

  /**
   * Stop playback and clear schedule
   */
  public stop(): void {
    Tone.getTransport().stop();
    this.clearSchedule();
  }

  /**
   * Schedule a pattern for playback
   * @param startOffset - Transport time offset to start the pattern (default 0)
   */
  public schedulePattern(
    pattern: Pattern,
    instruments: InstrumentConfig[],
    onRowChange?: (row: number) => void,
    startOffset: number = 0
  ): void {
    // Only clear if starting fresh (offset 0)
    if (startOffset === 0) {
      this.clearSchedule();
    }
    this.onRowChange = onRowChange || null;
    this.nextPatternScheduled = false;

    // Detect format and maintain persistent handler
    const format = pattern.importMetadata?.sourceFormat || 'NATIVE';
    
    if (!this.activeHandler || this.activeFormat !== format || startOffset === 0) {
      this.activeHandler = createFormatHandler(format);
      this.activeFormat = format;
      
      const initialBPM = pattern.importMetadata?.modData?.initialBPM || 125;
      const initialSpeed = pattern.importMetadata?.modData?.initialSpeed || 6;
      const { amigaLimits } = useSettingsStore.getState();
      
      this.activeHandler.init({
        format: format,
        initialSpeed,
        initialTempo: initialBPM,
        numChannels: pattern.channels.length,
        emulatePTBugs: true,
        linearSlides: pattern.importMetadata?.xmData?.frequencyType === 'linear',
        amigaLimits,
      });
    }
    
    const localHandler = this.activeHandler;
    const engine = getToneEngine();

    console.log(`[PatternScheduler] Scheduling ${format} pattern (Handler persistent: ${startOffset > 0}):`, pattern.name);

    // Set pattern in automation player
    this.automationPlayer.setPattern(pattern);
    this.automationPlayer.setAutomationData(this.automation);
    const events: Array<{ time: number; audioCallback: (time: number) => void; uiCallback: () => void }> = [];
    const tickEvents: Array<{ time: number; callback: (time: number) => void }> = [];

    // Pre-compute row timings using CURRENT speed/BPM from persistent handler if available
    const currentSpeed = (localHandler as any).speed ?? pattern.importMetadata?.modData?.initialSpeed ?? 6;
    const currentBPM = Tone.getTransport().bpm.value;
    const rowTimings = this.computeRowTimings(pattern, currentSpeed, currentBPM);

    for (let row = 0; row < pattern.length; row++) {
      const rowTiming = rowTimings[row];
      const rowSecondsPerTick = 2.5 / rowTiming.bpm;
      const rowDuration = rowSecondsPerTick * rowTiming.speed;

      // Hardware Quirk: Each row repetition (delay+1) restarts the tick counter
      for (let rep = 0; rep <= rowTiming.delay; rep++) {
        // Apply groove template or swing timing offset
        const repStartTime = startOffset + rowTiming.time + rep * rowDuration + this.getGrooveOrSwingOffset(row, rowDuration);

        events.push({
          time: repStartTime,
          audioCallback: (time) => {
            // Process instrument macros for Tick 0
            engine.processInstrumentTicks(time);

            pattern.channels.forEach((channel, channelIndex) => {
              // Process envelopes for this tick (Tick 0)
              engine.updateChannelEnvelopes(channelIndex);

              const cell = channel.rows[row];
              const cellInstrument = cell.instrument ?? 0;
              const instrumentId = cellInstrument !== 0 ? cellInstrument : (channel.instrumentId ?? 0);

              // Resolve note name for handler
              const noteName = cell.note > 0 && cell.note <= 96 
                ? xmNoteToToneJS(cell.note) 
                : cell.note === 97 ? '===' : null;

              // Resolve effect string for handler - FIX: include type 0
              const effectStr = (cell.effTyp !== undefined && cell.effTyp !== null)
                ? xmEffectToString(cell.effTyp, cell.eff ?? 0)
                : null;

              // Resolve volume for handler - FIX: use 255 as 'empty' sentinel
              // cell.volume 0x00 can be a valid 'set volume to 0' in some formats (like MOD C00)
              // but in our pattern data it often means 'empty'.
              // We'll treat 0 as potentially empty if it's not explicitly formatted.
              // For S3M/XM volume columns, 0..64 are values.
              const volumeValue = (cell.volume === 0) ? 255 : cell.volume;

              // Call format-aware handler
              const state = localHandler.getChannelState(channelIndex);
              
              // Hardware Quirk: ensure handler has access to sample metadata if available
              const instrument = instruments.find(i => i.id === instrumentId);
              if (instrument?.metadata?.modPlayback) {
                (state as any).sampleDefaultVolume = instrument.metadata.modPlayback.defaultVolume;
                (state as any).sampleDefaultFinetune = instrument.metadata.modPlayback.finetune;
              }

              // Pass active instrument metadata for Auto-Vibrato
              if (instrument) {
                (state as any).activeInstrument = instrument.metadata?.preservedSample ? instrument.metadata : instrument;
              }

              const effectResult = localHandler.processRowStart(
                channelIndex,
                noteName,
                cellInstrument > 0 ? cellInstrument : null,
                volumeValue,
                effectStr,
                state
              );

              // Apply results to engine using unified helper
              // If we are NOT triggering a note, apply effects immediately.
              // If we ARE triggering a note, we'll apply them after initChannelPitch.
              if (!effectResult.triggerNote) {
                this.applyTickEffects(channelIndex, effectResult, localHandler);
              }

              if (effectResult.stopSong) {
                this.stop();
                return;
              }

              if (effectResult.patternBreak !== undefined && !this.pendingPatternBreak) {
                this.pendingPatternBreak = { position: effectResult.patternBreak };
              }

              if (effectResult.positionJump !== undefined && this.pendingPositionJump === null) {
                this.pendingPositionJump = effectResult.positionJump;
              }

              // Handle IT Past Note Actions (S77-S79)
              if (effectResult.pastNoteAction !== undefined) {
                engine.handlePastNoteAction(channelIndex, effectResult.pastNoteAction);
              }

              // Handle note off
              if (cell.note === 97 || effectResult.keyOff) {
                engine.setChannelKeyOff(channelIndex);
                const activeNotes = this.channelNotes.get(channelIndex);
                if (activeNotes && instrumentId !== 0) {
                  activeNotes.forEach((activeNote) => {
                    engine.releaseNote(instrumentId, activeNote, time, channelIndex);
                  });
                  activeNotes.clear();
                }
                return;
              }

              // Trigger note if requested (skip if channel is muted)
              if (effectResult.triggerNote && !effectResult.preventNoteTrigger && !engine.isChannelMuted(channelIndex)) {
                if (instrument) {
                  // --- Groove Velocity/Dynamics ---
                  const transportState = useTransportStore.getState();
                  const grooveTemplate = transportState.getGrooveTemplate();
                  const intensity = transportState.swing / 100;
                  
                  let velocityOffset = 0;
                  if (grooveTemplate) {
                    velocityOffset = getGrooveVelocity(grooveTemplate, row) * intensity;
                  }

                  // Use effectResult.setVolume if available, else default to volumeValue or 0.8
                  let velocity = effectResult.setVolume !== undefined 
                    ? effectResult.setVolume / 64 
                    : (volumeValue !== null && volumeValue <= 64 ? volumeValue / 64 : 0.8);
                  
                  // Apply groove dynamics
                  velocity = Math.max(0, Math.min(1, velocity + velocityOffset));
                  
                  const toneNote = xmNoteToToneJS(cell.note);
                  
                  if (toneNote) {
                    if (!this.channelNotes.has(channelIndex)) {
                      this.channelNotes.set(channelIndex, new Set());
                    }
                    this.channelNotes.get(channelIndex)!.add(toneNote);
                    this.channelActiveInstruments.set(channelIndex, instrumentId);

                    const duration = 999; // Tracker samples play until released

                    try {
                      const triggerPeriod = (effectResult.setPeriod || cell.period || 0) as number;
                      
                      engine.triggerNote(
                        instrumentId,
                        toneNote,
                        duration,
                        time,
                        velocity,
                        instrument,
                        (cell.flag1 === 1 || cell.flag2 === 1),
                        (cell.flag1 === 2 || cell.flag2 === 2),
                        channelIndex,
                        triggerPeriod,
                        effectResult.sampleOffset,
                        effectResult.nnaAction // Pass IT NNA Action
                      );

                      engine.triggerChannelMeter(channelIndex, velocity);
                    } catch (error) {
                      this.trackPlaybackError(toneNote, error as Error);
                    }
                  }
                }
              }

              // Always ensure pitch state is initialized if we have a valid period/note,
              // even if we didn't trigger a new note this row (for slides during swaps)
              const activePeriod = effectResult.setPeriod || state.period;
              if (activePeriod > 0 || (cell.note > 0 && cell.note <= 96)) {
                let baseFrequency: number;
                if (activePeriod > 0) {
                  const periodMult = instrument?.metadata?.modPlayback?.periodMultiplier || 3546895;
                  baseFrequency = periodMult / activePeriod;
                } else {
                  const toneNote = xmNoteToToneJS(cell.note);
                  baseFrequency = toneNote ? Tone.Frequency(toneNote).toFrequency() : 0;
                }

                if (baseFrequency > 0) {
                  engine.initChannelPitch(channelIndex, `${instrumentId}-${channelIndex}`, baseFrequency, 1);
                }
              }

              // Apply results to engine (if we triggered a note, this re-applies any Tick 0 changes)
              this.applyTickEffects(channelIndex, effectResult, localHandler);
            });

            // Deferred control
            if (this.pendingPositionJump !== null) {
              if (this.onPositionJump) this.onPositionJump(this.pendingPositionJump);
              this.pendingPositionJump = null;
            }

            if (this.pendingPatternBreak && !this.patternBreakScheduled) {
              this.patternBreakScheduled = true;
              if (this.onPatternBreak) {
                this.onPatternBreak(this.pendingPatternBreak.position);
              } else if (this.onPatternEnd) {
                this.onPatternEnd();
              }
              this.pendingPatternBreak = null;
            }
          },
          uiCallback: () => {
            if (rep === 0 && this.onRowChange) {
              this.onRowChange(row);
            }
          },
        });

        // Schedule ticks 1..speed-1 for this repetition
        for (let tick = 1; tick < rowTiming.speed; tick++) {
          const tickTime = repStartTime + tick * rowSecondsPerTick;
          tickEvents.push({
            time: tickTime,
            callback: () => {
              // Process instrument macros and state
              engine.processInstrumentTicks(tickTime);
              
              pattern.channels.forEach((_, channelIndex) => {
                engine.updateChannelEnvelopes(channelIndex);
                const tickResult = localHandler.processTick(channelIndex, tick, localHandler.getChannelState(channelIndex));
                this.applyTickEffects(channelIndex, tickResult, localHandler);
              });
            },
          });
        }
      }
    }

    // Calculate pattern duration from the last row timing plus its duration
    const lastRow = pattern.length - 1;
    const lastRowTiming = rowTimings[lastRow];
    const lastRowDuration = (2.5 / lastRowTiming.bpm) * lastRowTiming.speed;
    const patternDuration = lastRowTiming.time + lastRowDuration;
    const absolutePatternEnd = startOffset + patternDuration;
    this.currentPatternEndTime = absolutePatternEnd;

    console.log(`[PatternScheduler] Pattern duration: ${patternDuration}s, ends at: ${absolutePatternEnd}s, onPatternEnd set: ${!!this.onPatternEnd}`);

    // Capture callback reference to avoid issues with 'this' changing
    const patternEndCallback = this.onPatternEnd;
    if (patternEndCallback && !this.nextPatternScheduled) {
      // Fire callback at the EXACT last row to prevent premature pattern switching
      // Use the pre-computed last row start time
      const callbackTime = startOffset + lastRowTiming.time; // Fire at the start of the last row
      console.log(`[PatternScheduler] Scheduling pattern end callback at ${callbackTime}s (last row start)`);
      events.push({
        time: callbackTime,
        audioCallback: () => {
          if (!this.nextPatternScheduled) {
            console.log(`[PatternScheduler] Pattern end callback fired! Next pattern should start at ${absolutePatternEnd}s`);
            this.nextPatternScheduled = true;
            patternEndCallback();
          }
        },
        uiCallback: () => {}, // No UI update needed
      });
    }

    // Disable Transport looping - we'll handle pattern advancement manually
    const transport = Tone.getTransport();
    transport.loop = false;

    // Determine if we need to reset transport or append to running transport
    const isTransitioningPattern = startOffset > 0;

    if (!isTransitioningPattern) {
      // Fresh start - reset transport to 0
      if (transport.state === 'started') {
        transport.stop();
      }
      transport.position = 0;
    }
    // If transitioning, don't stop transport - just add new Part

    // Clean up old Playback if starting fresh
    if (!isTransitioningPattern && this.currentPlayback) {
      this.currentPlayback.rowPart.stop();
      this.currentPlayback.rowPart.dispose();
      this.currentPlayback.tickPart.dispose();
      this.currentPlayback = null;
    }

    // Create Tone.Part for row events - audio triggers at precise time, UI updates via Draw
    const rowPart = new Tone.Part((time, event: any) => {
      // Trigger audio at exact Transport time
      event.audioCallback(time);
      // Schedule UI update separately to not block audio
      Tone.Draw.schedule(() => {
        event.uiCallback();
      }, time);
    }, events.map(e => [e.time, { audioCallback: e.audioCallback, uiCallback: e.uiCallback }]));

    // Part doesn't loop
    rowPart.loop = false;
    rowPart.start(0);

    // Create Tone.Part for tick events (effect processing)
    const tickPart = new Tone.Part((time, event: any) => {
      event.callback(time);
    }, tickEvents.map(e => [e.time, { callback: e.callback }]));

    tickPart.loop = false;
    tickPart.start(0);

    const newPlayback: PlaybackState = {
      rowPart,
      tickPart,
      handler: localHandler,
      format
    };

    // Track the Playbacks
    if (isTransitioningPattern) {
      // Keep old playback running for overlap, store new one as next
      if (this.nextPlayback) {
        this.nextPlayback.rowPart.dispose();
        this.nextPlayback.tickPart.dispose();
      }
      this.nextPlayback = newPlayback;
    } else {
      // Dispose existing if starting fresh
      if (this.currentPlayback) {
        this.currentPlayback.rowPart.dispose();
        this.currentPlayback.tickPart.dispose();
      }
      this.currentPlayback = newPlayback;
    }

    // Start transport if not running
    if (transport.state !== 'started') {
      transport.start();
    }

    console.log(`Scheduled ${events.length} rows for pattern ${pattern.name}`);
  }

  /**
   * Get the transport time when the current pattern ends
   */
  public getPatternEndTime(): number {
    return this.currentPatternEndTime;
  }

  /**
   * Clear current schedule
   */
  public clearSchedule(): void {
    // CRITICAL: Release all active notes to prevent hanging notes
    try {
      const engine = getToneEngine();
      engine.releaseAll();
    } catch (e) {
      console.warn('[PatternScheduler] Could not release notes:', e);
    }

    if (this.currentPlayback) {
      this.currentPlayback.rowPart.dispose();
      this.currentPlayback.tickPart.dispose();
      this.currentPlayback = null;
    }
    if (this.nextPlayback) {
      this.nextPlayback.rowPart.dispose();
      this.nextPlayback.tickPart.dispose();
      this.nextPlayback = null;
    }

    // Disable Transport loop
    const transport = Tone.getTransport();
    transport.loop = false;

    // Reset error tracking when stopping
    this.resetErrorTracking();

    // Clear effect processor
    this.effectProcessor.clearAll();

    // Clear channel notes tracking
    this.channelNotes.clear();
    this.channelActiveInstruments.clear();

    // Reset flags
    this.patternBreakScheduled = false;
    this.nextPatternScheduled = false;
    this.currentPatternEndTime = 0;
    this.pendingPatternBreak = null;
    this.pendingPositionJump = null;
  }

  /**
   * Update row change callback
   */
  public setOnRowChange(callback: (row: number) => void): void {
    this.onRowChange = callback;
  }

  /**
   * Set callback for when pattern ends (for advancing to next pattern)
   */
  public setOnPatternEnd(callback: (() => void) | null): void {
    this.onPatternEnd = callback;
  }

  /**
   * Set callback for pattern break (Dxx command)
   */
  public setOnPatternBreak(callback: ((targetRow: number) => void) | null): void {
    this.onPatternBreak = callback;
  }

  /**
   * Set callback for position jump (Bxx command)
   */
  public setOnPositionJump(callback: ((position: number) => void) | null): void {
    this.onPositionJump = callback;
  }

  /**
   * Dispose scheduler
   */
  public dispose(): void {
    this.clearSchedule();
    this.onRowChange = null;
  }
}

// Singleton instance
let schedulerInstance: PatternScheduler | null = null;

export const getPatternScheduler = (): PatternScheduler => {
  if (!schedulerInstance) {
    schedulerInstance = new PatternScheduler();
  }
  return schedulerInstance;
};
