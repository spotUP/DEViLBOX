/**
 * USBSIDWizard — Setup wizard for USB-SID-Pico hardware.
 *
 * Automatically shown when a USB-SID-Pico device is detected via WebUSB.
 * Guides the user through: pair → connect → set jsSID engine → play.
 *
 * Can also be opened manually from Settings.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { X, Usb, Check, ChevronRight, Zap, Volume2, AlertTriangle } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { SID_ENGINES } from '@engine/deepsid/DeepSIDEngineManager';
import { notify } from '@stores/useNotificationStore';
import { useModalClose } from '@hooks/useDialogKeyboard';

type WizardStep = 'detect' | 'connect' | 'engine' | 'done';

export const USBSIDWizard: React.FC = () => {
  const modalOpen = useUIStore(s => s.modalOpen);
  const closeModal = useUIStore(s => s.closeModal);
  const isOpen = modalOpen === 'usb-sid-wizard';
  useModalClose({ isOpen, onClose: () => closeModal() });

  const sidEngine = useSettingsStore(s => s.sidEngine);
  const setSidEngine = useSettingsStore(s => s.setSidEngine);
  const sidHwMode = useSettingsStore(s => s.sidHardwareMode);
  const setSidHardwareMode = useSettingsStore(s => s.setSidHardwareMode);

  const [step, setStep] = useState<WizardStep>('detect');
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [firmware, setFirmware] = useState<string | null>(null);
  const [chips, setChips] = useState<Array<{ slot: number; detected: boolean; type?: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state when wizard opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setConnecting(false);
      // If already connected, skip to engine step
      if (sidHwMode === 'webusb') {
        import('@lib/sid/SIDHardwareManager').then(({ getSIDHardwareManager }) => {
          const mgr = getSIDHardwareManager();
          const st = mgr.getStatus();
          if (st.connected) {
            setConnected(true);
            setDeviceName(st.deviceName);
            setFirmware(st.firmwareVersion ?? null);
            setChips(st.detectedChips ?? null);
            setStep('engine');
          } else {
            setStep('detect');
          }
        });
      } else {
        setStep('detect');
        setConnected(false);
        setDeviceName(null);
        setFirmware(null);
        setChips(null);
        setNeedsPairing(false);
        setCheckingPaired(false);
      }
    }
  }, [isOpen, sidHwMode]);

  // Try to auto-connect to already-paired device (no browser picker needed)
  const [needsPairing, setNeedsPairing] = useState(false);
  const [checkingPaired, setCheckingPaired] = useState(false);

  const tryAutoConnect = useCallback(async () => {
    setCheckingPaired(true);
    setError(null);
    try {
      const { getSIDHardwareManager } = await import('@lib/sid/SIDHardwareManager');
      const mgr = getSIDHardwareManager();
      // Try reconnect first — uses getDevices() which needs no picker
      const ok = await mgr.setMode('webusb');
      if (ok) {
        setConnected(true);
        setSidHardwareMode('webusb');
        const st = mgr.getStatus();
        setDeviceName(st.deviceName);
        setFirmware(st.firmwareVersion ?? null);
        setChips(st.detectedChips ?? null);
        setStep('engine');
      } else {
        // Device not previously paired — need the browser picker
        setNeedsPairing(true);
      }
    } catch {
      setNeedsPairing(true);
    } finally {
      setCheckingPaired(false);
    }
  }, [setSidHardwareMode]);

  // Auto-try on entering connect step
  useEffect(() => {
    if (step === 'connect' && !connected && !needsPairing && !checkingPaired) {
      tryAutoConnect();
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const { getSIDHardwareManager } = await import('@lib/sid/SIDHardwareManager');
      const mgr = getSIDHardwareManager();
      const ok = await mgr.connectWebUSB();
      if (ok) {
        setConnected(true);
        setSidHardwareMode('webusb');
        const st = mgr.getStatus();
        setDeviceName(st.deviceName);
        setFirmware(st.firmwareVersion ?? null);
        setChips(st.detectedChips ?? null);
        setStep('engine');
      } else {
        setError('Connection cancelled. Click the button to try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  }, [setSidHardwareMode]);

  const handleSetEngine = useCallback(() => {
    if (sidEngine !== 'jssid') {
      setSidEngine('jssid');
      notify.success('SID engine set to jsSID (hardware compatible)');
    }
    setStep('done');
  }, [sidEngine, setSidEngine]);

  const handleFinish = useCallback(() => {
    closeModal();
    notify.success('USB-SID-Pico ready! Load a .sid file and press play.');
  }, [closeModal]);

  const handleClose = useCallback(() => {
    closeModal();
  }, [closeModal]);

  if (!isOpen) return null;

  const overlayClass = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm';
  const panelClass = 'bg-dark-bgPrimary border border-dark-border rounded-xl shadow-2xl w-full max-w-[90vw] md:max-w-[440px] max-h-[85vh] overflow-hidden';

  return (
    <div className={overlayClass} onClick={handleClose}>
      <div className={panelClass} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border bg-dark-bgSecondary/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Usb className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary">USB-SID-Pico Setup</h2>
              <p className="text-[10px] text-text-muted">Real SID chip hardware output</p>
            </div>
          </div>
          <button onClick={handleClose} className="text-text-muted hover:text-text-primary transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-dark-border/50 bg-dark-bgSecondary/30">
          {(['detect', 'connect', 'engine', 'done'] as WizardStep[]).map((s, i) => {
            const labels = ['Detect', 'Connect', 'Engine', 'Ready'];
            const isCurrent = s === step;
            const isPast = ['detect', 'connect', 'engine', 'done'].indexOf(step) > i;
            return (
              <React.Fragment key={s}>
                {i > 0 && <div className={`flex-1 h-px ${isPast ? 'bg-green-500' : 'bg-dark-border'}`} />}
                <div className={`flex items-center gap-1.5 ${isCurrent ? 'text-text-primary' : isPast ? 'text-green-400' : 'text-text-muted/50'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border ${
                    isPast ? 'bg-green-500/20 border-green-500 text-green-400' :
                    isCurrent ? 'bg-blue-500/20 border-blue-500 text-blue-400' :
                    'border-dark-border text-text-muted/40'
                  }`}>
                    {isPast ? <Check size={10} /> : i + 1}
                  </div>
                  <span className="text-[10px] font-medium">{labels[i]}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Content */}
        <div className="px-5 py-5 space-y-4">

          {/* Step 1: Detect */}
          {step === 'detect' && (
            <>
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto">
                  <Usb className="w-8 h-8 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">USB-SID-Pico Detected</h3>
                  <p className="text-xs text-text-muted mt-1">
                    A USB-SID-Pico device is connected to your computer.
                    This device lets you play SID music through real MOS 6581/8580 chips.
                  </p>
                </div>
              </div>

              <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-3 space-y-2">
                <p className="text-[10px] text-text-muted leading-relaxed">
                  <strong className="text-text-secondary">What this does:</strong> DEViLBOX will send SID register
                  writes directly to your hardware via USB with cycle-exact timing — the same timing the
                  original C64 used. You'll hear authentic SID sound from real chips.
                </p>
              </div>

              <button
                onClick={() => setStep('connect')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-text-primary text-sm font-semibold rounded-lg transition-colors"
              >
                Set Up Hardware Output
                <ChevronRight size={16} />
              </button>

              <button
                onClick={handleClose}
                className="w-full text-center text-xs text-text-muted hover:text-text-secondary transition-colors py-1"
              >
                Not now — I'll set it up later in Settings
              </button>
            </>
          )}

          {/* Step 2: Connect */}
          {step === 'connect' && (
            <>
              <div className="text-center space-y-3">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto border ${
                  connected
                    ? 'bg-green-500/10 border-green-500/30'
                    : checkingPaired
                      ? 'bg-blue-500/10 border-blue-500/30'
                      : 'bg-yellow-500/10 border-yellow-500/30'
                }`}>
                  {checkingPaired ? (
                    <div className="w-8 h-8 border-3 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                  ) : (
                    <Usb className={`w-8 h-8 ${connected ? 'text-green-400' : 'text-yellow-400'}`} />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">
                    {connected ? 'Connected!' : checkingPaired ? 'Connecting...' : 'Pair Your Device'}
                  </h3>
                  <p className="text-xs text-text-muted mt-1">
                    {connected
                      ? `${deviceName || 'USB-SID-Pico'} is ready.`
                      : checkingPaired
                        ? 'Checking for previously paired device...'
                        : 'This is a one-time step. Your browser needs permission to access the USB device.'
                    }
                  </p>
                </div>
              </div>

              {/* Explain the browser dialog before they see it */}
              {needsPairing && !connected && !connecting && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 space-y-2">
                  <p className="text-[10px] text-blue-300 leading-relaxed">
                    <strong>What happens next:</strong> When you click the button below, your browser will
                    open a device selection dialog. Select <strong>"USB-SID-Pico"</strong> from the list
                    and click <strong>"Connect"</strong>.
                  </p>
                  <p className="text-[10px] text-text-muted leading-relaxed">
                    This is a browser security requirement for USB access. You only need to do this once —
                    next time, DEViLBOX will reconnect automatically.
                  </p>
                </div>
              )}

              {connected && firmware && (
                <div className="bg-dark-bgSecondary/50 border border-green-500/20 rounded-lg p-3 space-y-1">
                  <p className="text-[10px] text-green-400 font-mono">
                    Firmware: {firmware}
                  </p>
                  {chips && chips.length > 0 && (
                    <p className="text-[10px] text-green-400 font-mono">
                      SID chips: {chips.filter(c => c.detected).map(c => `Slot ${c.slot}${c.type ? ` (${c.type})` : ''}`).join(', ') || 'Detecting...'}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-red-400 leading-relaxed">{error}</p>
                </div>
              )}

              {connected ? (
                <button
                  onClick={() => setStep('engine')}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-text-primary text-sm font-semibold rounded-lg transition-colors"
                >
                  Continue
                  <ChevronRight size={16} />
                </button>
              ) : needsPairing ? (
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                    connecting
                      ? 'bg-dark-bgSecondary text-text-muted cursor-wait'
                      : 'bg-blue-600 hover:bg-blue-500 text-text-primary'
                  }`}
                >
                  {connecting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Waiting for browser dialog...
                    </>
                  ) : (
                    <>
                      <Usb size={16} />
                      Pair USB-SID-Pico
                    </>
                  )}
                </button>
              ) : null}
            </>
          )}

          {/* Step 3: Engine */}
          {step === 'engine' && (
            <>
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto">
                  <Zap className="w-8 h-8 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Select SID Engine</h3>
                  <p className="text-xs text-text-muted mt-1">
                    Hardware output requires the <strong className="text-text-secondary">jsSID</strong> engine.
                    It sends register writes to your USB-SID-Pico with cycle-exact timing.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {sidEngine === 'jssid' ? (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 flex items-center gap-3">
                    <Check className="w-5 h-5 text-green-400 shrink-0" />
                    <div>
                      <p className="text-xs text-green-400 font-semibold">jsSID is already selected</p>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        {SID_ENGINES.jssid.description}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-yellow-400 font-semibold">
                        Current engine: {SID_ENGINES[sidEngine].name}
                      </p>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        This engine does not support hardware output. Switch to jsSID to hear
                        music through your USB-SID-Pico.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleSetEngine}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-text-primary text-sm font-semibold rounded-lg transition-colors"
              >
                {sidEngine === 'jssid' ? 'Continue' : 'Switch to jsSID & Continue'}
                <ChevronRight size={16} />
              </button>
            </>
          )}

          {/* Step 4: Done */}
          {step === 'done' && (
            <>
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto">
                  <Volume2 className="w-8 h-8 text-green-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">You're All Set!</h3>
                  <p className="text-xs text-text-muted mt-1">
                    Your USB-SID-Pico is connected and ready. Load any <strong className="text-text-secondary">.sid</strong> file
                    and press play to hear it through real SID hardware.
                  </p>
                </div>
              </div>

              <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Device</span>
                  <span className="text-green-400 font-mono">{deviceName || 'USB-SID-Pico'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Engine</span>
                  <span className="text-text-primary font-mono">jsSID ★ HW</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Transport</span>
                  <span className="text-text-primary font-mono">WebUSB (cycle-exact)</span>
                </div>
                {firmware && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">Firmware</span>
                    <span className="text-text-primary font-mono">{firmware}</span>
                  </div>
                )}
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-[10px] text-blue-300 leading-relaxed">
                  <strong>Tip:</strong> Audio will play through both your computer speakers and the
                  USB-SID-Pico simultaneously. Use the SID engine settings to adjust hardware-specific
                  options like clock rate and stereo output.
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
