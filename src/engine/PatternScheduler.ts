import { getToneEngine } from './ToneEngine';
/**
 * PatternScheduler - Schedule pattern playback with Tone.js Transport
 *
 * Implements tick-level scheduling for accurate effect processing:
 * - Row events trigger notes and initialize effects (tick 0)
 * - Tick events process continuous effects (vibrato, portamento, volume slide, etc.)
 * - Standard tracker timing: 2.5ms per tick at 125 BPM
 */

import * as Tone from 'tone';
import { getEffectProcessor } from './EffectCommands';
import { getAutomationPlayer } from './AutomationPlayer';
import { useTransportStore } from '@stores/useTransportStore';
import type { Pattern } from '@typedefs';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { AutomationCurve } from '@typedefs/automation';

interface AutomationData {
  [patternId: string]: {
    [channelIndex: number]: {
      [parameter: string]: AutomationCurve;
    };
  };
}

/**
 * Convert tracker note format (C-4) to Tone.js format (C4)
 */
function convertNoteFormat(note: string): string {
  // Handle note off
  if (note === '===' || note === '...') return note;

  // Remove dash from note format: "C-4" -> "C4", "C#-4" -> "C#4"
  return note.replace('-', '');
}

export class PatternScheduler {
  private partsPool: Array<{ part: Tone.Part; tickPart: Tone.Part; endTime: number }> = [];

  private onRowChange: ((row: number) => void) | null = null;
  private onPatternEnd: (() => void) | null = null;
  private onPatternBreak: ((targetRow: number) => void) | null = null;
  private onPositionJump: ((position: number) => void) | null = null;
  private automation: AutomationData = {};
  private channelNotes: Map<number, Set<string>> = new Map(); // Track active notes per channel
  private channelActiveInstruments: Map<number, number> = new Map(); // Track active instrument per channel
  private effectProcessor = getEffectProcessor();
  private automationPlayer = getAutomationPlayer();
  private currentPatternEndTime: number = 0; // When current pattern ends (transport seconds)
  private nextPatternScheduled: boolean = false; // Track if next pattern is pre-scheduled
  private patternBreakScheduled: boolean = false; // Prevent double pattern breaks

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
   * Get current speed (ticks per row)
   */
  private getTicksPerRow(): number {
    return this.effectProcessor.getTicksPerRow();
  }

  /**
   * Get seconds per tick based on BPM
   * Classic Amiga/ProTracker formula: tickDuration = 2.5 / BPM
   * At 125 BPM: 2.5 / 125 = 0.02 seconds = 20ms per tick
   * With speed 6: 20ms * 6 = 120ms per row
   */
  private getSecondsPerTick(): number {
    const engine = getToneEngine();
    const bpm = engine.getBPM();
    return 2.5 / bpm;
  }

  /**
   * Get seconds per row based on current BPM and speed
   */
  private getSecondsPerRow(): number {
    return this.getSecondsPerTick() * this.getTicksPerRow();
  }

  /**
   * Calculate swing offset for a given row
   * Swing delays off-beat rows by a percentage of the row duration
   * @param row The row number
   * @param swingAmount Swing amount (0-100, where 50 = no swing, 100 = full triplet feel)
   * @returns Time offset in seconds
   */
  private getSwingOffset(row: number, swingAmount: number): number {
    // No swing at 0 or 50 (neutral)
    if (swingAmount === 0 || swingAmount === 50) return 0;

    // Swing affects every other row (odd rows in 2-row groupings)
    // In standard 4-row beat: rows 1, 3 get swing; rows 0, 2 are on-beat
    const rowsPerSwingGroup = 2;
    const isSwungRow = (row % rowsPerSwingGroup) === 1;

    if (!isSwungRow) return 0;

    // Calculate swing ratio (50 = no swing, 100 = full delay, 0 = early)
    // swing > 50: delay the off-beat
    // swing < 50: play off-beat earlier (less common but supported)
    const secondsPerRow = this.getSecondsPerRow();

    // Max swing is half a row's duration (creates triplet feel at 100)
    const maxSwingOffset = secondsPerRow * 0.5;

    // Normalize swing from 0-100 to -1 to 1 (50 = 0)
    const normalizedSwing = (swingAmount - 50) / 50;

    return normalizedSwing * maxSwingOffset;
  }

  /**
   * Apply tick effect results to a channel
   * Note: Some effects (frequency changes) require synth-level support
   * that may not be fully implemented in ToneEngine yet.
   * @param channelIndex The channel to apply effects to
   * @param tickResult The result from the effect processor
   */
  private applyTickEffects(
    channelIndex: number,
    tickResult: ReturnType<typeof this.effectProcessor.processTick>
  ): void {
    const engine = getToneEngine();
    const instrumentId = this.channelActiveInstruments.get(channelIndex);

    if (instrumentId === undefined) return;

    // Apply frequency changes using automation system
    // Note: Real-time frequency changes for active notes is limited in Tone.js
    // Vibrato/tremolo effects would ideally use synth-level oscillators
    if (tickResult.frequencySet !== undefined || tickResult.frequencyMult !== undefined) {
      // Store frequency for next note trigger - the frequency effect will
      // affect the next note or be applied via portamento
      // Full implementation would need synth-level frequency control
    }

    // Apply volume changes (for volume slide, tremolo, tremor)
    // Convert 0-64 tracker volume to dB for ToneEngine
    if (tickResult.volumeSet !== undefined) {
      const volumeDb = tickResult.volumeSet === 0 ? -Infinity : -24 + (tickResult.volumeSet / 64) * 24;
      engine.setChannelVolume(channelIndex, volumeDb);
    }

    if (tickResult.volumeAdd !== undefined) {
      const currentVol = this.effectProcessor.getCurrentVolume(channelIndex);
      const newVol = Math.max(0, Math.min(64, currentVol + tickResult.volumeAdd));
      const volumeDb = newVol === 0 ? -Infinity : -24 + (newVol / 64) * 24;
      engine.setChannelVolume(channelIndex, volumeDb);
    }

    // Apply panning changes
    if (tickResult.panSet !== undefined) {
      // Convert 0-255 to -100 to 100 for ToneEngine
      const pan = ((tickResult.panSet - 128) / 128) * 100;
      engine.setChannelPan(channelIndex, pan);
    }

    // Handle note cut
    if (tickResult.cutNote) {
      engine.setChannelVolume(channelIndex, -Infinity);
    }

    // Handle note retrigger
    // This would need additional ToneEngine support to retrigger active notes
    if (tickResult.triggerNote) {
      // Retrigger not fully implemented - would need synth-level support
      // to retrigger without releasing the previous note
    }
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

    console.log('[PatternScheduler] Scheduling pattern:', pattern.name, 'at offset', startOffset, 'with', instruments.length, 'instruments');
    instruments.forEach(inst => console.log(`  - Instrument ${inst.id}: ${inst.name} (${inst.synthType})`));

    // Set pattern in automation player
    this.automationPlayer.setPattern(pattern);
    this.automationPlayer.setAutomationData(this.automation);

    const engine = getToneEngine();
    const events: Array<{ time: number; audioCallback: (time: number) => void; uiCallback: () => void }> = [];

    const secondsPerRow = this.getSecondsPerRow();

    // Schedule each row - use seconds directly (Tone.js accepts numbers as seconds)
    // Rows per beat for metronome (4 rows = 1 beat in standard tracker timing)
    const rowsPerBeat = 4;

    // Get swing amount from transport store
    const swingAmount = useTransportStore.getState().swing;

    for (let row = 0; row < pattern.length; row++) {
      // Apply swing offset to off-beat rows
      const swingOffset = this.getSwingOffset(row, swingAmount);
      const time = startOffset + row * secondsPerRow + swingOffset; // Time in seconds with swing

      events.push({
        time,
        // Audio callback receives precise Transport time for sample-accurate scheduling
        audioCallback: (transportTime: number) => {
          // Trigger metronome click on beat boundaries
          if (row % rowsPerBeat === 0 && engine.isMetronomeEnabled()) {
            const isDownbeat = row === 0; // First row of pattern is downbeat
            engine.triggerMetronomeClick(transportTime, isDownbeat);
          }
          // Process automation for all channels at this row
          this.automationPlayer.processPatternRow(row);

          // First pass: Process notes and effects for all channels
          pattern.channels.forEach((channel, channelIndex) => {
            const cell = channel.rows[row];
            const instrumentId = cell.instrument !== null ? cell.instrument : channel.instrumentId;

            // Skip empty cells
            if (!cell.note || cell.note === '...') return;

            // Handle note off
            if (cell.note === '===') {
              // Release all notes on this channel at precise time
              const activeNotes = this.channelNotes.get(channelIndex);
              if (activeNotes && instrumentId !== null) {
                activeNotes.forEach((activeNote) => {
                  engine.releaseNote(instrumentId, activeNote, transportTime, channelIndex);
                });
                activeNotes.clear();
              }
              return;
            }

            // Check if instrument exists
            if (instrumentId === null) return;

            const instrument = instruments.find((i) => i.id === instrumentId);
            if (!instrument) return;

            // Calculate velocity from volume
            let velocity = 0.8; // Default velocity
            if (cell.volume !== null) {
              velocity = cell.volume / 0x40; // Normalize 0x00-0x40 to 0-1
            }

            // Calculate note duration (until next note or end of pattern)
            let duration = secondsPerRow;
            for (let nextRow = row + 1; nextRow < pattern.length; nextRow++) {
              const nextCell = pattern.channels[channelIndex].rows[nextRow];
              if (nextCell.note && nextCell.note !== '...') {
                duration = (nextRow - row) * secondsPerRow;
                break;
              }
            }
            // Ensure minimum duration to prevent clipping at high BPMs
            // 50ms minimum allows envelope to trigger properly
            duration = Math.max(duration, 0.05);

            // Convert note format from tracker (C-4) to Tone.js (C4)
            const toneNote = convertNoteFormat(cell.note);

            // Track active notes for this channel
            if (!this.channelNotes.has(channelIndex)) {
              this.channelNotes.set(channelIndex, new Set());
            }
            this.channelNotes.get(channelIndex)!.add(toneNote);

            // Check if this is a tone portamento effect (3xx)
            // For TB-303, we should slide to the note instead of skipping it
            let useSlide = cell.slide || false;
            const effectCmd = cell.effect && cell.effect !== '...' ? parseInt(cell.effect[0], 16) : -1;
            const effectCmd2 = cell.effect2 && cell.effect2 !== '...' ? parseInt(cell.effect2[0], 16) : -1;
            if (effectCmd === 0x3 || effectCmd2 === 0x3) {
              // Tone portamento - use slide instead of preventing trigger
              useSlide = true;
            }

            // Process effect commands if present (supports dual effects)
            const effects = [cell.effect, cell.effect2].filter(e => e && e !== '...');
            let preventNoteTrigger = false;
            for (const effect of effects) {
              if (effect && effect !== '...') {
                const effectResult = this.effectProcessor.processRowStart(
                  channelIndex,
                  cell.note,
                  effect,
                  cell.volume
                );

                // Handle effect results
                if (effectResult.setVolume !== undefined) {
                  // Apply volume to note (convert 0-64 to 0-1 velocity)
                  velocity = effectResult.setVolume / 64;
                }

                if (effectResult.setBPM !== undefined) {
                  console.log(`[PatternScheduler] Effect Fxx: Setting BPM to ${effectResult.setBPM}`);
                  engine.setBPM(effectResult.setBPM);
                }

                if (effectResult.patternBreak && !this.patternBreakScheduled) {
                  // Dxx - Pattern break: jump to next pattern at specified row
                  console.log(`[PatternScheduler] Effect Dxx: Pattern break to row ${effectResult.patternBreak.position}`);
                  this.patternBreakScheduled = true;
                  if (this.onPatternBreak) {
                    this.onPatternBreak(effectResult.patternBreak.position);
                  } else if (this.onPatternEnd) {
                    // Fallback: just advance to next pattern (row 0)
                    this.onPatternEnd();
                  }
                }

                if (effectResult.jumpToPosition !== undefined) {
                  // Bxx - Jump to song position
                  console.log(`[PatternScheduler] Effect Bxx: Jump to position ${effectResult.jumpToPosition}`);
                  if (this.onPositionJump) {
                    this.onPositionJump(effectResult.jumpToPosition);
                  }
                }

                const effectCmdNum = parseInt(effect[0], 16);
                if (effectResult.preventNoteTrigger && effectCmdNum !== 0x3) {
                  // Effect prevents note trigger (but not 3xx - handled via slide)
                  preventNoteTrigger = true;
                }
              }
            }

            // If any effect prevents note trigger, return early
            if (preventNoteTrigger) {
              return;
            }

            // Check if channel is muted/solo'd
            if (engine.isChannelMuted(channelIndex)) {
              return;
            }

            // Track active instrument for this channel (for tick effects)
            this.channelActiveInstruments.set(channelIndex, instrumentId);

            // Trigger note at precise Transport time
            try {
              engine.triggerNote(
                instrumentId,
                toneNote,
                duration,
                transportTime, // Use precise Transport time
                velocity,
                instrument,
                cell.accent || false,
                useSlide, // Use slide flag (includes 3xx tone portamento)
                channelIndex // Per-channel instrument instance
              );

              // Trigger VU meter for this channel (real-time visual feedback)
              engine.triggerChannelMeter(channelIndex, velocity);

              // Remove note from active set after duration
              setTimeout(() => {
                this.channelNotes.get(channelIndex)?.delete(toneNote);
              }, duration * 1000);
            } catch (error) {
              console.error(`Failed to trigger note ${toneNote}:`, error);
            }
          });

          // NOTE: Automation is handled by AutomationPlayer.processPatternRow() above
          // which uses the correct value mappings for all parameters.
          // Do NOT add duplicate automation handling here - ToneEngine uses different
          // formulas that don't match the UI control ranges.
        },
        // UI callback for visual updates (row highlighting)
        uiCallback: () => {
          if (this.onRowChange) {
            this.onRowChange(row);
          }
        },
      });
    }

    // Schedule tick events for effect processing (ticks 1 to ticksPerRow-1)
    // Tick 0 is handled by the row events above
    const tickEvents: Array<{ time: number; callback: (time: number) => void }> = [];
    const secondsPerTick = this.getSecondsPerTick();
    const ticksPerRow = this.getTicksPerRow();

    for (let row = 0; row < pattern.length; row++) {
      // Apply swing offset to tick events too
      const swingOffset = this.getSwingOffset(row, swingAmount);
      const rowStartTime = startOffset + row * secondsPerRow + swingOffset;

      // Schedule ticks 1 through ticksPerRow-1
      for (let tick = 1; tick < ticksPerRow; tick++) {
        const tickTime = rowStartTime + tick * secondsPerTick;

        tickEvents.push({
          time: tickTime,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          callback: (_transportTime: number) => {
            // Process tick effects for all channels at precise transport time
            pattern.channels.forEach((_, channelIndex) => {
              const tickResult = this.effectProcessor.processTick(channelIndex, tick);
              this.applyTickEffects(channelIndex, tickResult);
            });
          },
        });
      }
    }

    // Calculate pattern timing
    const patternDuration = pattern.length * secondsPerRow;
    const absolutePatternEnd = startOffset + patternDuration;
    this.currentPatternEndTime = absolutePatternEnd;

    // Clean up finished parts from pool before adding new ones
    const now = Tone.now();
    this.partsPool = this.partsPool.filter(p => {
      if (p.endTime < now - 2) { // 2 second buffer for release tails
        p.part.dispose();
        p.tickPart.dispose();
        return false;
      }
      return true;
    });

    console.log(`[PatternScheduler] Pattern duration: ${patternDuration}s, ends at: ${absolutePatternEnd}s, onPatternEnd set: ${!!this.onPatternEnd}`);

    // Capture callback reference to avoid issues with 'this' changing
    const patternEndCallback = this.onPatternEnd;
    if (patternEndCallback && !this.nextPatternScheduled) {
      // Fire callback 500ms before end to give React/Audio engine plenty of time to queue the next loop
      const callbackTime = Math.max(0, absolutePatternEnd - 0.5);
      console.log(`[PatternScheduler] Scheduling pattern end callback at ${callbackTime}s (lookahead)`);
      events.push({
        time: callbackTime,
        audioCallback: () => {
          if (!this.nextPatternScheduled) {
            console.log(`[PatternScheduler] Lookahead callback fired! Queuing next pattern for ${absolutePatternEnd}s`);
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

    // Create Tone.Part for row events - audio triggers at precise time, UI updates via Draw
    const newPart = new Tone.Part((time, event) => {
      // Trigger audio at exact Transport time
      (event as { audioCallback: (time: number) => void; uiCallback: () => void }).audioCallback(time);
      // Schedule UI update separately to not block audio
      Tone.Draw.schedule(() => {
        (event as { audioCallback: (time: number) => void; uiCallback: () => void }).uiCallback();
      }, time);
    }, events.map(e => [e.time, { audioCallback: e.audioCallback, uiCallback: e.uiCallback }]));

    newPart.loop = false;
    newPart.start(0);

    // Create Tone.Part for tick events (effect processing)
    const newTickPart = new Tone.Part((time, event) => {
      (event as { callback: (time: number) => void }).callback(time);
    }, tickEvents.map(e => [e.time, { callback: e.callback }]));

    newTickPart.loop = false;
    newTickPart.start(0);

    // Track the Parts in the pool
    this.partsPool.push({
      part: newPart,
      tickPart: newTickPart,
      endTime: absolutePatternEnd
    });

    // Start transport if not running
    if (transport.state !== 'started') {
      transport.start();
    }

    console.log(`Scheduled ${events.length} rows for pattern ${pattern.name} at offset ${startOffset}`);
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

    this.partsPool.forEach(p => {
      p.part.stop();
      p.part.dispose();
      p.tickPart.stop();
      p.tickPart.dispose();
    });
    this.partsPool = [];

    // Disable Transport loop
    const transport = Tone.getTransport();
    transport.loop = false;

    // Clear effect processor
    this.effectProcessor.clearAll();

    // Clear channel notes tracking
    this.channelNotes.clear();
    this.channelActiveInstruments.clear();

    // Reset flags
    this.patternBreakScheduled = false;
    this.nextPatternScheduled = false;
    this.currentPatternEndTime = 0;
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
