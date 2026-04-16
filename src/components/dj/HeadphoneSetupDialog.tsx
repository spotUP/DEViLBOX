/**
 * HeadphoneSetupDialog — 3-step wizard for configuring headphone cue output.
 *
 * Step 1: Grant audio device permission (needed for device labels)
 * Step 2: Select headphone device + test tone
 * Step 3: Done — brief PFL/cue mix explanation
 */

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Headphones, Volume2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useDJStore } from '@/stores/useDJStore';
import { DJCueEngine } from '@/engine/dj/DJCueEngine';

interface HeadphoneSetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'permission' | 'select-device' | 'done';

export const HeadphoneSetupDialog: React.FC<HeadphoneSetupDialogProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<Step>('permission');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [testingDeviceId, setTestingDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setPermissionGranted] = useState(false);

  const supportsMultiOutput = DJCueEngine.supportsSetSinkId();

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setTestingDeviceId(null);
      // Check if we already have permission (devices have labels)
      void checkExistingPermission();
    }
  }, [isOpen]);

  const checkExistingPermission = async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const outputs = devs.filter(d => d.kind === 'audiooutput');
      const hasLabels = outputs.some(d => d.label && d.label !== '');
      if (hasLabels && outputs.length > 0) {
        setDevices(outputs);
        setPermissionGranted(true);
        setStep('select-device');
      } else {
        setStep('permission');
      }
    } catch {
      setStep('permission');
    }
  };

  const handleGrantPermission = useCallback(async () => {
    setError(null);
    try {
      // Request microphone access — this triggers the browser permission prompt
      // and allows enumerateDevices() to return device labels
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());

      const devs = await navigator.mediaDevices.enumerateDevices();
      const outputs = devs.filter(d => d.kind === 'audiooutput');
      setDevices(outputs);
      setPermissionGranted(true);
      setStep('select-device');
    } catch (err) {
      setError('Permission denied. Please allow microphone access in your browser settings, then try again.');
    }
  }, []);

  const handleTestDevice = useCallback(async (deviceId: string) => {
    if (!supportsMultiOutput) return;
    setTestingDeviceId(deviceId);
    try {
      await DJCueEngine.playTestTone(deviceId);
    } catch (err) {
      console.warn('[HeadphoneSetup] Test tone failed:', err);
    } finally {
      setTestingDeviceId(null);
    }
  }, [supportsMultiOutput]);

  const handleConfirmDevice = useCallback(() => {
    if (!selectedDeviceId) return;
    const device = devices.find(d => d.deviceId === selectedDeviceId);
    const deviceName = device?.label || 'Unknown Device';

    useDJStore.getState().setCueDevice(selectedDeviceId, deviceName);
    useDJStore.getState().setHeadphoneSetupDone(true);
    setStep('done');
  }, [selectedDeviceId, devices]);

  const handleDone = useCallback(() => {
    onClose();
  }, [onClose]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[999999]"
      onClick={onClose}
    >
      <div
        className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-[420px] max-w-[95vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <div className="flex items-center gap-2">
            <Headphones size={18} className="text-accent-primary" />
            <h3 className="text-sm font-semibold text-text-primary">Headphone Setup</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-bgTertiary rounded"
          >
            <X size={14} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-dark-border/50">
          {(['permission', 'select-device', 'done'] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <div className="h-px flex-1 bg-dark-borderLight" />}
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                  ${step === s ? 'bg-accent-primary text-text-inverse' :
                    (['permission', 'select-device', 'done'].indexOf(step) > i
                      ? 'bg-accent-success/20 text-accent-success border border-accent-success/40'
                      : 'bg-dark-bgTertiary text-text-muted border border-dark-borderLight')
                  }`}
              >
                {['permission', 'select-device', 'done'].indexOf(step) > i ? '✓' : i + 1}
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Content */}
        <div className="p-4">
          {!supportsMultiOutput && (
            <div className="mb-3 p-2 rounded bg-accent-warning/10 border border-accent-warning/30 text-accent-warning text-xs">
              <div className="flex items-start gap-1.5">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <div>
                  Your browser doesn't support multi-output audio routing.
                  Use Chrome or Edge for headphone cueing, or use a Y-splitter cable
                  (main → speakers, cue → headphones).
                </div>
              </div>
            </div>
          )}

          {/* STEP 1: Permission */}
          {step === 'permission' && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                To route cue audio to your headphones, DEViLBOX needs access to your audio devices.
              </p>
              <p className="text-xs text-text-muted">
                Your browser will ask for microphone permission — this is needed to see your audio device names.
                No audio is recorded.
              </p>
              {error && (
                <div className="p-2 rounded bg-accent-error/10 border border-accent-error/30 text-accent-error text-xs">
                  {error}
                </div>
              )}
              <button
                onClick={handleGrantPermission}
                className="w-full px-4 py-2.5 rounded-md bg-accent-primary text-text-inverse
                         hover:bg-accent-primary/80 transition-colors text-sm font-medium"
              >
                Allow Device Access
              </button>
            </div>
          )}

          {/* STEP 2: Device Selection */}
          {step === 'select-device' && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Select your headphone output. Use "Test" to play a beep and confirm.
              </p>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {devices.map((device) => {
                  const isDefault = device.deviceId === 'default' || device.deviceId === '';
                  const isSelected = selectedDeviceId === device.deviceId;
                  const isTesting = testingDeviceId === device.deviceId;
                  return (
                    <div
                      key={device.deviceId}
                      className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-all
                        ${isSelected
                          ? 'border-accent-primary bg-accent-primary/10'
                          : 'border-dark-borderLight bg-dark-bgTertiary hover:border-text-muted'
                        }`}
                      onClick={() => setSelectedDeviceId(device.deviceId)}
                    >
                      <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 transition-colors
                        ${isSelected ? 'border-accent-primary bg-accent-primary' : 'border-text-muted'}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-text-primary truncate">
                          {device.label || 'Unknown Device'}
                        </div>
                        {isDefault && (
                          <div className="text-[10px] text-text-muted">System default (likely speakers)</div>
                        )}
                      </div>
                      {supportsMultiOutput && (
                        <button
                          onClick={(e) => { e.stopPropagation(); void handleTestDevice(device.deviceId); }}
                          disabled={isTesting}
                          className={`px-2 py-1 text-[10px] font-mono rounded border transition-all flex-shrink-0
                            ${isTesting
                              ? 'border-accent-primary bg-accent-primary/20 text-accent-primary animate-pulse'
                              : 'border-dark-borderLight text-text-secondary hover:text-accent-primary hover:border-accent-primary'
                            }`}
                        >
                          {isTesting ? '♪♪♪' : 'Test'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {devices.length === 0 && (
                <div className="text-xs text-text-muted text-center py-3">
                  No audio output devices found.
                </div>
              )}
              <button
                onClick={handleConfirmDevice}
                disabled={!selectedDeviceId}
                className={`w-full px-4 py-2.5 rounded-md text-sm font-medium transition-colors
                  ${selectedDeviceId
                    ? 'bg-accent-primary text-text-inverse hover:bg-accent-primary/80'
                    : 'bg-dark-bgTertiary text-text-muted cursor-not-allowed'
                  }`}
              >
                Use This Device for Headphones
              </button>
            </div>
          )}

          {/* STEP 3: Done */}
          {step === 'done' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-accent-success">
                <CheckCircle2 size={20} />
                <span className="text-sm font-medium">Headphones configured!</span>
              </div>
              <div className="p-3 rounded bg-dark-bgTertiary border border-dark-borderLight space-y-2">
                <div className="text-xs text-text-primary font-medium">How to use:</div>
                <div className="flex items-start gap-2 text-xs text-text-secondary">
                  <Volume2 size={14} className="flex-shrink-0 mt-0.5 text-accent-warning" />
                  <div>
                    Press the <span className="font-mono bg-accent-warning/20 text-accent-warning px-1 rounded">A</span> or{' '}
                    <span className="font-mono bg-accent-warning/20 text-accent-warning px-1 rounded">B</span> button
                    next to the headphone icon to preview that deck in your headphones (PFL).
                  </div>
                </div>
                <div className="flex items-start gap-2 text-xs text-text-secondary">
                  <Headphones size={14} className="flex-shrink-0 mt-0.5 text-[#66ccff]" />
                  <div>
                    Use the <span className="font-mono text-[#66ccff]">CUE ↔ MST</span> slider
                    to blend between your cued deck and the main mix in your headphones.
                  </div>
                </div>
              </div>
              <button
                onClick={handleDone}
                className="w-full px-4 py-2.5 rounded-md bg-accent-primary text-text-inverse
                         hover:bg-accent-primary/80 transition-colors text-sm font-medium"
              >
                Got It
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
