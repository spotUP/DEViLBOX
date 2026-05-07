/**
 * NKSSetupWizard — Introduction & setup wizard for NKS (Native Kontrol Standard).
 *
 * Guides users through understanding NKS features: parameter pages,
 * preset export, and hardware controller integration.
 *
 * Triggered from Settings or when first interacting with NKS features.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { X, Check, ChevronRight, Layers, Download, Keyboard, Sliders } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { useMIDIStore } from '@stores/useMIDIStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { notify } from '@stores/useNotificationStore';
import { useModalClose } from '@hooks/useDialogKeyboard';
import { KKLightGuidePanel } from '@components/midi/KKLightGuidePanel';

type WizardStep = 'intro' | 'pages' | 'export' | 'done';

export const NKSSetupWizard: React.FC = () => {
  const modalOpen = useUIStore(s => s.modalOpen);
  const closeModal = useUIStore(s => s.closeModal);
  const isOpen = modalOpen === 'nks-wizard';
  useModalClose({ isOpen, onClose: () => closeModal() });

  const nksKnobAssignments = useMIDIStore(s => s.nksKnobAssignments);
  const nksKnobPage = useMIDIStore(s => s.nksKnobPage);
  const nksKnobTotalPages = useMIDIStore(s => s.nksKnobTotalPages);
  const nksActiveSynthType = useMIDIStore(s => s.nksActiveSynthType);
  const nextKnobPage = useMIDIStore(s => s.nextKnobPage);
  const prevKnobPage = useMIDIStore(s => s.prevKnobPage);
  const showKnobBar = useMIDIStore(s => s.showKnobBar);
  const setShowKnobBar = useMIDIStore(s => s.setShowKnobBar);

  const currentInstrument = useInstrumentStore(s => s.currentInstrument);

  const [step, setStep] = useState<WizardStep>('intro');

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep('intro');
    }
  }, [isOpen]);

  const handleEnableKnobBar = useCallback(() => {
    if (!showKnobBar) setShowKnobBar(true);
    setStep('pages');
  }, [showKnobBar, setShowKnobBar]);

  const handleExportInfo = useCallback(() => {
    setStep('export');
  }, []);

  const handleFinish = useCallback(() => {
    closeModal();
    notify.success('NKS setup complete! Use the knob bar to control parameters.');
  }, [closeModal]);

  const handleClose = useCallback(() => {
    closeModal();
  }, [closeModal]);

  if (!isOpen) return null;

  const steps: WizardStep[] = ['intro', 'pages', 'export', 'done'];
  const stepLabels = ['Intro', 'Pages', 'Export', 'Ready'];

  const overlayClass = 'fixed inset-0 z-[99990] flex items-center justify-center bg-black/70 backdrop-blur-sm';
  const panelClass = 'bg-dark-bgPrimary border border-dark-border rounded-xl shadow-2xl w-full max-w-[90vw] md:max-w-[480px] max-h-[85vh] overflow-hidden';

  const synthName = nksActiveSynthType || currentInstrument?.type || 'Synth';

  return (
    <div className={overlayClass} onClick={handleClose}>
      <div className={panelClass} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border bg-dark-bgSecondary/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Layers className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary">NKS Performance Setup</h2>
              <p className="text-[10px] text-text-muted">Native Kontrol Standard integration</p>
            </div>
          </div>
          <button onClick={handleClose} className="text-text-muted hover:text-text-primary transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-dark-border/50 bg-dark-bgSecondary/30">
          {steps.map((s, i) => {
            const isCurrent = s === step;
            const isPast = steps.indexOf(step) > i;
            return (
              <React.Fragment key={s}>
                {i > 0 && <div className={`flex-1 h-px ${isPast ? 'bg-green-500' : 'bg-dark-border'}`} />}
                <div className={`flex items-center gap-1.5 ${isCurrent ? 'text-text-primary' : isPast ? 'text-green-400' : 'text-text-muted/50'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border ${
                    isPast ? 'bg-green-500/20 border-green-500 text-green-400' :
                    isCurrent ? 'bg-orange-500/20 border-orange-500 text-orange-400' :
                    'border-dark-border text-text-muted/40'
                  }`}>
                    {isPast ? <Check size={10} /> : i + 1}
                  </div>
                  <span className="text-[10px] font-medium">{stepLabels[i]}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Content */}
        <div className="px-5 py-5 space-y-4">

          {/* Step 1: Intro */}
          {step === 'intro' && (
            <>
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center mx-auto">
                  <Layers className="w-8 h-8 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Welcome to NKS</h3>
                  <p className="text-xs text-text-muted mt-1">
                    NKS (Native Kontrol Standard) maps your synth parameters to hardware
                    controller knobs in organized 8-knob pages — the same standard used by
                    Native Instruments Komplete Kontrol and Maschine.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-3 flex items-start gap-3">
                  <Sliders className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-text-secondary font-semibold">Parameter Pages</p>
                    <p className="text-[10px] text-text-muted leading-relaxed">
                      Each synth has pre-configured pages of 8 parameters (Filter, Envelope, Effects, etc.)
                      mapped to your controller's knobs. Page through them like a hardware synth.
                    </p>
                  </div>
                </div>

                <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-3 flex items-start gap-3">
                  <Download className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-text-secondary font-semibold">Preset Export</p>
                    <p className="text-[10px] text-text-muted leading-relaxed">
                      Export your presets as .nksf files — the official NI preset format.
                      Share with other NKS-compatible software or hardware.
                    </p>
                  </div>
                </div>

                <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-3 flex items-start gap-3">
                  <Keyboard className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-text-secondary font-semibold">Hardware Ready</p>
                    <p className="text-[10px] text-text-muted leading-relaxed">
                      Works with any MIDI controller — Akai MPK, Novation Launchkey, Arturia MiniLab,
                      Korg nanoKontrol, and more. Displays parameter names on compatible hardware.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleEnableKnobBar}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-text-primary text-sm font-semibold rounded-lg transition-colors"
              >
                See Parameter Pages
                <ChevronRight size={16} />
              </button>

              <button
                onClick={handleClose}
                className="w-full text-center text-xs text-text-muted hover:text-text-secondary transition-colors py-1"
              >
                Not now — I'll explore later
              </button>
            </>
          )}

          {/* Step 2: Parameter Pages */}
          {step === 'pages' && (
            <>
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center mx-auto">
                  <Sliders className="w-8 h-8 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Parameter Pages</h3>
                  <p className="text-xs text-text-muted mt-1">
                    Your current synth <strong className="text-text-secondary">{synthName}</strong> has {nksKnobTotalPages || 1} page{(nksKnobTotalPages || 1) > 1 ? 's' : ''} of
                    8 knob assignments. Each knob maps to a synth parameter.
                  </p>
                </div>
              </div>

              {/* Current page knobs preview */}
              <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                    Page {(nksKnobPage || 0) + 1} of {nksKnobTotalPages || 1}
                  </p>
                  {(nksKnobTotalPages || 0) > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={prevKnobPage}
                        className="px-2 py-0.5 text-[10px] bg-dark-bgPrimary border border-dark-border rounded hover:border-orange-500/50 transition-colors"
                      >
                        Prev
                      </button>
                      <button
                        onClick={nextKnobPage}
                        className="px-2 py-0.5 text-[10px] bg-dark-bgPrimary border border-dark-border rounded hover:border-orange-500/50 transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(nksKnobAssignments.length > 0
                    ? nksKnobAssignments
                    : Array.from({ length: 8 }, (_, i) => ({ label: `Knob ${i + 1}`, param: '', value: 0 }))
                  ).slice(0, 8).map((assignment, index) => (
                    <div
                      key={index}
                      className="flex flex-col items-center p-2 rounded bg-dark-bgPrimary border border-dark-border"
                    >
                      <div className="w-8 h-8 rounded-full border-2 border-orange-500/40 bg-orange-500/5 flex items-center justify-center mb-1">
                        <span className="text-[8px] font-mono text-orange-400">K{index + 1}</span>
                      </div>
                      <span className="text-[9px] font-bold text-orange-300 uppercase truncate w-full text-center">
                        {assignment.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                <p className="text-[10px] text-orange-300 leading-relaxed">
                  <strong>How it works:</strong> Move a knob on your MIDI controller — the corresponding
                  parameter changes in real-time. Use <strong>Pad Bank B</strong> buttons (or the page
                  buttons in the knob bar) to switch between pages.
                </p>
              </div>

              <button
                onClick={handleExportInfo}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-text-primary text-sm font-semibold rounded-lg transition-colors"
              >
                Learn About Export
                <ChevronRight size={16} />
              </button>
            </>
          )}

          {/* Step 3: Export */}
          {step === 'export' && (
            <>
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center mx-auto">
                  <Download className="w-8 h-8 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">NKS Preset Export</h3>
                  <p className="text-xs text-text-muted mt-1">
                    Export your DEViLBOX presets as .nksf files — the official Native Instruments
                    preset format used by Komplete Kontrol and Maschine.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-text-secondary font-semibold">How to Export</p>
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <div className="w-4 h-4 rounded-full bg-orange-500/20 flex items-center justify-center text-[8px] font-bold text-orange-400 shrink-0 mt-0.5">1</div>
                      <p className="text-[10px] text-text-muted leading-relaxed">
                        Open the <strong className="text-text-secondary">Instrument Editor</strong> and design your sound
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-4 h-4 rounded-full bg-orange-500/20 flex items-center justify-center text-[8px] font-bold text-orange-400 shrink-0 mt-0.5">2</div>
                      <p className="text-[10px] text-text-muted leading-relaxed">
                        Click <strong className="text-text-secondary">Save Preset</strong> and check the <strong className="text-text-secondary">"Export as NKS"</strong> option
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-4 h-4 rounded-full bg-orange-500/20 flex items-center justify-center text-[8px] font-bold text-orange-400 shrink-0 mt-0.5">3</div>
                      <p className="text-[10px] text-text-muted leading-relaxed">
                        Add NKS metadata (category, tags, author) and download the .nksf file
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-text-secondary font-semibold">Batch Export</p>
                  <p className="text-[10px] text-text-muted leading-relaxed">
                    Open the <strong className="text-text-secondary">Preset Browser</strong> and use the
                    <strong className="text-text-secondary"> "Export All Presets"</strong> button to download
                    all your presets as .nksf files at once.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setStep('done')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-text-primary text-sm font-semibold rounded-lg transition-colors"
              >
                Got It
                <ChevronRight size={16} />
              </button>
            </>
          )}

          {/* Step 4: Done */}
          {step === 'done' && (
            <>
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8 text-green-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">NKS Ready!</h3>
                  <p className="text-xs text-text-muted mt-1">
                    Your NKS parameter pages are active. Connect a MIDI controller
                    to start tweaking synth parameters from hardware.
                  </p>
                </div>
              </div>

              <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Current synth</span>
                  <span className="text-orange-400 font-mono">{synthName}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Parameter pages</span>
                  <span className="text-text-primary font-mono">{nksKnobTotalPages || 1}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Knob bar</span>
                  <span className="text-green-400 font-mono">{showKnobBar ? 'Visible' : 'Hidden'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Export format</span>
                  <span className="text-text-primary font-mono">.nksf (NI SDK v2.0.2)</span>
                </div>
              </div>

              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                <p className="text-[10px] text-orange-300 leading-relaxed">
                  <strong>Tip:</strong> Parameter pages auto-switch when you change instruments.
                  Each synth type (TB-303, OB-Xd, Dexed, etc.) has its own optimized NKS mapping.
                </p>
              </div>

              {/* Light Guide configuration */}
              <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-3 space-y-2">
                <p className="text-xs text-text-secondary font-semibold flex items-center gap-2">
                  <Keyboard size={12} className="text-orange-400" />
                  Key Light Guide
                </p>
                <KKLightGuidePanel />
              </div>

              <button
                onClick={handleFinish}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-text-primary text-sm font-semibold rounded-lg transition-colors"
              >
                <Check size={16} />
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
