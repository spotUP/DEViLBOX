/**
 * MIDIControllerWizard — Setup wizard for MIDI controllers.
 *
 * Automatically shown when a new MIDI controller is detected.
 * Guides the user through: detect → select device → match profile → done.
 *
 * Can also be opened manually from Settings.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { X, Check, ChevronRight, Music, Sliders, Keyboard, Zap } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { useMIDIStore } from '@stores/useMIDIStore';
import {
  detectControllerProfile,
  getAllControllerProfiles,
  type ControllerProfile,
  type ControllerKnob,
} from '../../midi/controllerProfiles';
import { notify } from '@stores/useNotificationStore';
import { useModalClose } from '@hooks/useDialogKeyboard';

type WizardStep = 'detect' | 'select' | 'profile' | 'done';

export const MIDIControllerWizard: React.FC = () => {
  const modalOpen = useUIStore(s => s.modalOpen);
  const closeModal = useUIStore(s => s.closeModal);
  const isOpen = modalOpen === 'midi-wizard';
  useModalClose({ isOpen, onClose: () => closeModal() });

  const inputDevices = useMIDIStore(s => s.inputDevices);
  const outputDevices = useMIDIStore(s => s.outputDevices);
  const selectInput = useMIDIStore(s => s.selectInput);
  const selectOutput = useMIDIStore(s => s.selectOutput);

  const [step, setStep] = useState<WizardStep>('detect');
  const [chosenInputId, setChosenInputId] = useState<string | null>(null);
  const [chosenOutputId, setChosenOutputId] = useState<string | null>(null);
  const [matchedProfile, setMatchedProfile] = useState<ControllerProfile | null>(null);
  const [manualProfileId, setManualProfileId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // All available profiles for manual selection
  const allProfiles = useMemo(() => getAllControllerProfiles(), []);

  // The device name for the chosen input
  const chosenDevice = useMemo(
    () => inputDevices.find(d => d.id === chosenInputId),
    [inputDevices, chosenInputId],
  );

  // Reset state when wizard opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setInitializing(false);
      setManualProfileId(null);

      // If devices already present, pre-select
      if (inputDevices.length > 0) {
        const firstInput = inputDevices[0];
        setChosenInputId(firstInput.id);
        setMatchedProfile(detectControllerProfile(firstInput.name));
        if (outputDevices.length > 0) {
          setChosenOutputId(outputDevices[0].id);
        }
        setStep('select');
      } else {
        setChosenInputId(null);
        setChosenOutputId(null);
        setMatchedProfile(null);
        setStep('detect');
      }
    }
  }, [isOpen, inputDevices, outputDevices]);

  // Init MIDI if not yet initialized
  const handleInit = useCallback(async () => {
    setInitializing(true);
    setError(null);
    try {
      const store = useMIDIStore.getState();
      if (!store.isInitialized) {
        const ok = await store.init();
        if (!ok) {
          setError(store.lastError || 'Failed to initialize MIDI. Check browser permissions.');
          return;
        }
      }
      // Refresh after init
      const state = useMIDIStore.getState();
      if (state.inputDevices.length > 0) {
        const firstInput = state.inputDevices[0];
        setChosenInputId(firstInput.id);
        setMatchedProfile(detectControllerProfile(firstInput.name));
        if (state.outputDevices.length > 0) {
          setChosenOutputId(state.outputDevices[0].id);
        }
        setStep('select');
      } else {
        setError('No MIDI devices found. Connect a controller and try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'MIDI initialization failed');
    } finally {
      setInitializing(false);
    }
  }, []);

  // When user picks an input device, auto-detect profile
  const handleInputSelect = useCallback((id: string) => {
    setChosenInputId(id);
    const dev = inputDevices.find(d => d.id === id);
    if (dev) {
      const profile = detectControllerProfile(dev.name);
      setMatchedProfile(profile);
      setManualProfileId(null);
    }
  }, [inputDevices]);

  // Apply selection and go to profile step
  const handleConfirmDevice = useCallback(async () => {
    if (chosenInputId) {
      await selectInput(chosenInputId);
    }
    if (chosenOutputId) {
      selectOutput(chosenOutputId);
    }
    setStep('profile');
  }, [chosenInputId, chosenOutputId, selectInput, selectOutput]);

  // Finish wizard
  const handleFinish = useCallback(() => {
    closeModal();
    const deviceName = chosenDevice?.name || 'MIDI controller';
    const profileName = matchedProfile?.name
      || (manualProfileId ? allProfiles.find((p: ControllerProfile) => p.id === manualProfileId)?.name : null)
      || 'Generic';
    notify.success(`${deviceName} ready! Profile: ${profileName}`);
  }, [closeModal, chosenDevice, matchedProfile, manualProfileId, allProfiles]);

  const handleClose = useCallback(() => {
    closeModal();
  }, [closeModal]);

  if (!isOpen) return null;

  const steps: WizardStep[] = ['detect', 'select', 'profile', 'done'];
  const stepLabels = ['Detect', 'Device', 'Profile', 'Ready'];

  const overlayClass = 'fixed inset-0 z-[99990] flex items-center justify-center bg-black/70 backdrop-blur-sm';
  const panelClass = 'bg-dark-bgPrimary border border-dark-border rounded-xl shadow-2xl w-full max-w-[90vw] md:max-w-[480px] max-h-[85vh] overflow-hidden';

  return (
    <div className={overlayClass} onClick={handleClose}>
      <div className={panelClass} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border bg-dark-bgSecondary/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Sliders className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary">MIDI Controller Setup</h2>
              <p className="text-[10px] text-text-muted">Connect and configure your controller</p>
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
                    isCurrent ? 'bg-purple-500/20 border-purple-500 text-purple-400' :
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
        <div className="px-5 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 120px)' }}>

          {/* Step 1: Detect */}
          {step === 'detect' && (
            <>
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto">
                  <Keyboard className="w-8 h-8 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">MIDI Controller Detected</h3>
                  <p className="text-xs text-text-muted mt-1">
                    A MIDI controller has been connected. Let's set it up for use with DEViLBOX —
                    control knobs, faders, pads, and transport from your hardware.
                  </p>
                </div>
              </div>

              <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-3 space-y-2">
                <p className="text-[10px] text-text-muted leading-relaxed">
                  <strong className="text-text-secondary">What this does:</strong> DEViLBOX will detect your
                  controller model and apply optimized mappings for its knobs, pads, and faders. You can
                  always customize mappings later using MIDI Learn.
                </p>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
                  <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-red-400 leading-relaxed">{error}</p>
                </div>
              )}

              <button
                onClick={handleInit}
                disabled={initializing}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                  initializing
                    ? 'bg-dark-bgSecondary text-text-muted cursor-wait'
                    : 'bg-purple-600 hover:bg-purple-500 text-text-primary'
                }`}
              >
                {initializing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Scanning for devices...
                  </>
                ) : (
                  <>
                    Connect MIDI
                    <ChevronRight size={16} />
                  </>
                )}
              </button>

              <button
                onClick={handleClose}
                className="w-full text-center text-xs text-text-muted hover:text-text-secondary transition-colors py-1"
              >
                Not now — I'll set it up later in Settings
              </button>
            </>
          )}

          {/* Step 2: Select device */}
          {step === 'select' && (
            <>
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto">
                  <Music className="w-8 h-8 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Select Your Controller</h3>
                  <p className="text-xs text-text-muted mt-1">
                    {inputDevices.length === 1
                      ? 'One MIDI device found. Confirm below to continue.'
                      : `${inputDevices.length} MIDI devices found. Select the one you want to use.`}
                  </p>
                </div>
              </div>

              {/* Input devices */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Input (knobs, pads, keys)</p>
                {inputDevices.map(dev => (
                  <button
                    key={dev.id}
                    onClick={() => handleInputSelect(dev.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      chosenInputId === dev.id
                        ? 'bg-purple-500/10 border-purple-500/40 text-text-primary'
                        : 'bg-dark-bgSecondary/50 border-dark-border/50 text-text-secondary hover:border-dark-border'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${chosenInputId === dev.id ? 'bg-purple-400' : 'bg-dark-border'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{dev.name}</p>
                      {dev.manufacturer && (
                        <p className="text-[10px] text-text-muted truncate">{dev.manufacturer}</p>
                      )}
                    </div>
                    {chosenInputId === dev.id && matchedProfile && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium shrink-0">
                        {matchedProfile.name}
                      </span>
                    )}
                    {dev.isTD3 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium shrink-0">
                        TD-3
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Output devices */}
              {outputDevices.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Output (optional, for LEDs/displays)</p>
                  {outputDevices.map(dev => (
                    <button
                      key={dev.id}
                      onClick={() => setChosenOutputId(dev.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                        chosenOutputId === dev.id
                          ? 'bg-purple-500/10 border-purple-500/40 text-text-primary'
                          : 'bg-dark-bgSecondary/50 border-dark-border/50 text-text-secondary hover:border-dark-border'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${chosenOutputId === dev.id ? 'bg-purple-400' : 'bg-dark-border'}`} />
                      <p className="text-xs truncate">{dev.name}</p>
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={handleConfirmDevice}
                disabled={!chosenInputId}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                  chosenInputId
                    ? 'bg-purple-600 hover:bg-purple-500 text-text-primary'
                    : 'bg-dark-bgSecondary text-text-muted cursor-not-allowed'
                }`}
              >
                Continue
                <ChevronRight size={16} />
              </button>
            </>
          )}

          {/* Step 3: Profile */}
          {step === 'profile' && (
            <>
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto">
                  <Sliders className="w-8 h-8 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Controller Profile</h3>
                  <p className="text-xs text-text-muted mt-1">
                    {matchedProfile
                      ? `Detected: ${matchedProfile.name}. Optimized mappings will be applied.`
                      : 'Select a profile or use generic mappings. You can customize with MIDI Learn later.'}
                  </p>
                </div>
              </div>

              {matchedProfile ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-400" />
                    <p className="text-xs text-green-400 font-semibold">{matchedProfile.name}</p>
                  </div>
                  <p className="text-[10px] text-text-muted leading-relaxed">
                    {matchedProfile.manufacturer} • {matchedProfile.knobs.length} knobs
                    {matchedProfile.pads.length > 0 ? ` • ${matchedProfile.pads.length} pads` : ''}
                    {matchedProfile.extras?.faders ? ` • ${matchedProfile.extras.faders.length} faders` : ''}
                  </p>
                  {matchedProfile.suggestedLayout && (
                    <div className="mt-2 grid grid-cols-4 gap-1">
                      {matchedProfile.knobs.slice(0, 8).map((knob: ControllerKnob, i: number) => (
                        <div key={i} className="flex flex-col items-center p-1 rounded bg-dark-bgPrimary/50">
                          <span className="text-[8px] font-mono text-text-muted">K{i+1}</span>
                          <span className="text-[9px] text-purple-300 truncate w-full text-center">
                            {knob.defaultMapping || knob.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">Choose a profile</p>
                  <div className="max-h-[180px] overflow-y-auto space-y-1">
                    {allProfiles.map((profile: ControllerProfile) => (
                      <button
                        key={profile.id}
                        onClick={() => {
                          setManualProfileId(profile.id);
                          setMatchedProfile(profile);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                          manualProfileId === profile.id
                            ? 'bg-purple-500/10 border-purple-500/40 text-text-primary'
                            : 'bg-dark-bgSecondary/50 border-dark-border/50 text-text-secondary hover:border-dark-border'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{profile.name}</p>
                          <p className="text-[10px] text-text-muted truncate">
                            {profile.manufacturer} • {profile.knobs.length} knobs
                            {profile.pads.length > 0 ? ` • ${profile.pads.length} pads` : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setManualProfileId(null);
                      setMatchedProfile(null);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                      !manualProfileId && !matchedProfile
                        ? 'bg-purple-500/10 border-purple-500/40 text-text-primary'
                        : 'bg-dark-bgSecondary/50 border-dark-border/50 text-text-secondary hover:border-dark-border'
                    }`}
                  >
                    <p className="text-xs font-medium">Generic (use MIDI Learn)</p>
                  </button>
                </div>
              )}

              <button
                onClick={() => setStep('done')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-text-primary text-sm font-semibold rounded-lg transition-colors"
              >
                {matchedProfile ? 'Apply Profile & Finish' : 'Continue with Generic'}
                <ChevronRight size={16} />
              </button>
            </>
          )}

          {/* Step 4: Done */}
          {step === 'done' && (
            <>
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto">
                  <Zap className="w-8 h-8 text-green-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">You're All Set!</h3>
                  <p className="text-xs text-text-muted mt-1">
                    Your MIDI controller is connected and ready to use.
                  </p>
                </div>
              </div>

              <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Device</span>
                  <span className="text-purple-400 font-mono truncate ml-2">{chosenDevice?.name || 'MIDI Controller'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Profile</span>
                  <span className="text-text-primary font-mono">{matchedProfile?.name || 'Generic'}</span>
                </div>
                {matchedProfile && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">Controls</span>
                    <span className="text-text-primary font-mono">
                      {matchedProfile.knobs.length} knobs
                      {matchedProfile.pads.length > 0 ? ` • ${matchedProfile.pads.length} pads` : ''}
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 space-y-1.5">
                <p className="text-[10px] text-purple-300 leading-relaxed">
                  <strong>Tip:</strong> Use <strong>MIDI Learn</strong> to customize which knob controls which
                  parameter. Right-click any knob in the synth panel and move a controller knob to map it.
                </p>
                <p className="text-[10px] text-text-muted leading-relaxed">
                  The <strong>Knob Bar</strong> at the bottom shows your current controller mappings in real-time.
                  Switch between synth pages using Pad Bank B or the page buttons.
                </p>
              </div>

              <button
                onClick={handleFinish}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-text-primary text-sm font-semibold rounded-lg transition-colors"
              >
                <Check size={16} />
                Done — Start Playing
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
