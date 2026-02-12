/**
 * ComplianceRunner - Unified tracker engine test runner
 * 
 * Executes tick-by-tick simulations of the effect handlers
 * and verifies them against expected states.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createFormatHandler } from '../index';
import type { ModuleFormat, TickResult, ChannelState, EnvelopePoints } from '../types';
import { mockConfig } from './harness';
import { TrackerEnvelope } from '../../TrackerEnvelope';

export interface TestStep {
  row: number;
  note?: string | null;
  instrument?: number | null;
  volume?: number | null;
  effect?: string | null;
  initialState?: Partial<ChannelState>;
  expected?: Array<{
    tick: number;
    period?: number;
    frequency?: number;
    volume?: number;
    pan?: number;
    envelopeVolume?: number;
    envelopePanning?: number;
    envelopePitch?: number;
    envelopeVolumePast?: number;
    filterCutoff?: number;
    filterResonance?: number;
    sampleOffset?: number;
    triggerNote?: boolean;
    cutNote?: boolean;
    stopSong?: boolean;
  }>;
}

export interface ComplianceTestCase {
  name: string;
  format: ModuleFormat;
  steps: TestStep[];
  initialState?: Partial<ChannelState>;
  volumeEnvelope?: EnvelopePoints;
  panningEnvelope?: EnvelopePoints;
  pitchEnvelope?: EnvelopePoints;
  fadeout?: number;
}

export class ComplianceRunner {
  static run(testCase: ComplianceTestCase) {
    describe(`${testCase.format} Compliance: ${testCase.name}`, () => {
      const handler = createFormatHandler(testCase.format);
      
      beforeEach(() => {
        handler.init({ 
          ...mockConfig, 
          format: testCase.format,
          linearSlides: (testCase as ComplianceTestCase & { linearSlides?: boolean }).linearSlides ?? (testCase.format === 'XM' || testCase.format === 'IT')
        });
      });

            it('should pass all tick assertions', () => {

              const state = handler.getChannelState(0);

              const { steps } = testCase;

      

              if (testCase.initialState) {

                Object.assign(state, testCase.initialState);

              }

      

                            // Setup voices (stateful across rows)

      

                            interface Voice {

      

                              vol: TrackerEnvelope;

      

                              pan: TrackerEnvelope;

      

                              pitch: TrackerEnvelope;

      

                              fadeout: number;

      

                              fadeoutStep: number;

      

                              isKeyOff: boolean;

      

                            }

      

                            let voices: Voice[] = [];

      

              

      

              steps.forEach((step, stepIdx) => {
                const results: TickResult[] = [];

                if (step.initialState) {
                  Object.assign(state, step.initialState);
                }

                

                // Helper to verify state at a specific tick

                const verify = (t: number, res: TickResult) => {

                  if (step.expected) {

                    const expectations = Array.isArray(step.expected) ? step.expected : [step.expected];

                    

                    expectations.forEach((exp, expIdx) => {

                      if (exp.tick === t) {

                        // ... (verify results as before)

                        if (exp.period !== undefined) {
                          const currentPeriod = res.setPeriod !== undefined ? res.setPeriod : state.period;
                          expect(currentPeriod, `Step ${stepIdx} Exp ${expIdx} Tick ${t}: Period mismatch`).toBe(exp.period);
                        }
                        if (exp.frequency !== undefined) {
                          const currentFreq = res.setFrequency !== undefined ? res.setFrequency : state.frequency;
                          expect(currentFreq, `Step ${stepIdx} Exp ${expIdx} Tick ${t}: Frequency mismatch`).toBeCloseTo(exp.frequency, 1);
                        }

                        if (exp.volume !== undefined) {

                          const currentVol = res.setVolume !== undefined ? res.setVolume : state.volume;

                          expect(currentVol, `Step ${stepIdx} Exp ${expIdx} Tick ${t}: Volume mismatch`).toBe(exp.volume);

                        }

                        if (exp.pan !== undefined) {

                          const currentPan = res.setPan !== undefined ? res.setPan : state.pan;

                          expect(currentPan, `Step ${stepIdx} Exp ${expIdx} Tick ${t}: Panning mismatch`).toBe(exp.pan);

                        }

                        

                        // Use the newest voice for "envelopeVolume" verification if not specified

                        const currentVoice = voices[voices.length - 1];

                        if (exp.envelopeVolume !== undefined && currentVoice) {

                          expect(state.envelopeVolume, `Step ${stepIdx} Exp ${expIdx} Tick ${t}: envelopeVolume mismatch`).toBeCloseTo(exp.envelopeVolume, 1);

                        }

                        if (exp.envelopePanning !== undefined && currentVoice) {

                          expect(state.envelopePanning, `Step ${stepIdx} Exp ${expIdx} Tick ${t}: envelopePanning mismatch`).toBeCloseTo(exp.envelopePanning, 1);

                        }

                                          if (exp.envelopePitch !== undefined && currentVoice) {

                                            expect(state.envelopePitch, `Step ${stepIdx} Exp ${expIdx} Tick ${t}: envelopePitch mismatch`).toBeCloseTo(exp.envelopePitch, 1);

                                          }

                                          if (exp.envelopeVolumePast !== undefined) {
                                            const pastVoice = voices[voices.length - 2];
                                            if (pastVoice) {
                                              const volMult = (pastVoice.fadeout / 65536);
                                              expect(pastVoice.vol.getCurrentValue() * volMult, `Step ${stepIdx} Exp ${expIdx} Tick ${t}: envelopeVolumePast mismatch`).toBeCloseTo(exp.envelopeVolumePast, 1);
                                            }
                                          }

                                          if (exp.filterCutoff !== undefined) {

                          const currentCutoff = res.setFilterCutoff !== undefined ? res.setFilterCutoff : state.filterCutoff;

                          expect(currentCutoff, `Step ${stepIdx} Exp ${expIdx} Tick ${t}: filterCutoff mismatch`).toBe(exp.filterCutoff);

                        }

                      }

                    });

                  }

                };

      

                // Hardware Quirk: ensure handler has access to sample metadata if available
                const inst = state.activeInstrument as Record<string, unknown> | undefined;
                if (inst) {
                  (state as ChannelState & { sampleDefaultVolume?: number }).sampleDefaultVolume = (inst.defaultVolume as number) ?? 64;
                  (state as ChannelState & { sampleDefaultFinetune?: number }).sampleDefaultFinetune = (inst.finetune as number) ?? 0;
                }

                // Row Start (Tick 0)
                results[0] = handler.processRowStart(
                  0,
                  step.note ?? null,
                  step.instrument ?? null,
                  step.volume ?? null,
                  step.effect ?? null,
                  state
                );

                

                                    

                

                                                                        // Trigger Note logic (with NNA support)

                

                                    

                

                                                                        if (results[0].triggerNote) {

                

                                                                          const nnaAction = results[0].nnaAction || 0;

                

                                    

                

                                                                          if (nnaAction === 0) { // CUT

                

                                                                            voices = [];

                

                                                                          } else {

                

                                                                            // Note Off or Fade past voices

                

                                                                            voices.forEach(v => {

                

                                                                              if (nnaAction === 2) {

                

                                                                                v.vol.keyOff();

                

                                                                                v.isKeyOff = true;

                

                                                                              }

                

                                                                              if (nnaAction === 3) {

                

                                                                                v.isKeyOff = true;

                

                                                                                if (v.fadeoutStep === 0) v.fadeoutStep = 1024;

                

                                                                              }

                

                                                                            });

                

                                                                          }

                

                                    

                

                                                                          const newVoice: Voice = {

                

                                                                            vol: new TrackerEnvelope(),

                

                                                                            pan: new TrackerEnvelope(),

                

                                                                            pitch: new TrackerEnvelope(),

                

                                                                            fadeout: 65536,

                

                                                                            fadeoutStep: (inst?.fadeout as number) || testCase.fadeout || 0,

                

                                                                            isKeyOff: false

                

                                                                          };

                

                                    

                

                            

                

                            // Priority: activeInstrument metadata > testCase properties

                

                            const envelopes = inst?.envelopes as Record<string, unknown> | undefined;
                            const volEnvData = (envelopes?.volumeEnvelope as EnvelopePoints | undefined) || testCase.volumeEnvelope;

                

                            const panEnvData = (envelopes?.panningEnvelope as EnvelopePoints | undefined) || testCase.panningEnvelope;

                

                            const pitchEnvData = (envelopes?.pitchEnvelope as EnvelopePoints | undefined) || testCase.pitchEnvelope;

                

                

                

                            if (volEnvData) newVoice.vol.init(volEnvData);

                

                            if (panEnvData) newVoice.pan.init(panEnvData);

                

                            if (pitchEnvData) newVoice.pitch.init(pitchEnvData);

                

                            

                

                            voices.push(newVoice);

                

                          }

      

                                if (results[0].keyOff) {

      

                                  voices.forEach(v => {

      

                                    v.vol.keyOff();

      

                                    v.isKeyOff = true;

      

                                    v.pan.keyOff();

      

                                    v.pitch.keyOff();

      

                                  });

      

                                }

      

                

      

                                    // XM/IT Quirk: Advance position BEFORE evaluating point (Tick 0)
                                    voices.forEach(v => {
                                      v.vol.tickNext();
                                      v.pan.tickNext();
                                      v.pitch.tickNext();
                                      if (v.isKeyOff && v.fadeout > 0) {
                                        v.fadeout = Math.max(0, v.fadeout - v.fadeoutStep);
                                      }
                                    });

                                    // Use the latest voice for state reporting
                                    if (voices.length > 0) {
                                      const v = voices[voices.length - 1];
                                      const volMult = (v.fadeout / 65536);
                                      state.envelopeVolume = v.vol.getCurrentValue() * volMult;
                                      state.envelopePanning = v.pan.getCurrentValue();
                                      state.envelopePitch = v.pitch.getCurrentValue();
                                    }

      

                          

      

                                    console.log(`[Test:${testCase.name}] Step ${stepIdx} Row Start. Voices: ${voices.length}, EnvVol: ${state.envelopeVolume}, Trig: ${results[0].triggerNote}`);

      

                                    verify(0, results[0]);

      

                          

      

                                    // Process Ticks 1..5

      

                                    for (let t = 1; t < 6; t++) {

      

                                      results[t] = handler.processTick(0, t, state);

      

                                      

      

                                      voices.forEach(v => {
                                        v.vol.tickNext();
                                        v.pan.tickNext();
                                        v.pitch.tickNext();
                                        if (v.isKeyOff && v.fadeout > 0) {
                                          v.fadeout = Math.max(0, v.fadeout - v.fadeoutStep);
                                        }
                                      });

                  if (voices.length > 0) {
                    const v = voices[voices.length - 1];
                    const volMult = (v.fadeout / 65536);
                    state.envelopeVolume = v.vol.getCurrentValue() * volMult;
                    state.envelopePanning = v.pan.getCurrentValue();
                    state.envelopePitch = v.pitch.getCurrentValue();
                  }

                  

                  verify(t, results[t]);

                }

              });

            });
    });
  }
}