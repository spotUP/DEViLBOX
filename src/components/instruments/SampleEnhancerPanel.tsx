import React, { useState, useCallback } from 'react';
import { Sparkles, Zap, Wand2, RefreshCw, Eraser, MoveHorizontal, Hammer, Volume2, Scissors, RotateCcw } from 'lucide-react';
import { 
  applySpectralExciter, 
  applyDenoise, 
  applyPseudoStereo, 
  applyTransientSharpening,
  applyNormalization,
  applyTrimSilence,
  applyReverse,
} from '../../utils/audio/SampleProcessing';
import type { ProcessedResult } from '../../utils/audio/SampleProcessing';
import { runNeuralEnhancement } from '../../utils/audio/NeuralEnhancerWorker';
import { Knob } from '../controls/Knob';
import { Button } from '../ui/Button';
import { notify } from '../../stores/useNotificationStore';

interface SampleEnhancerPanelProps {
  audioBuffer: AudioBuffer | null;
  onBufferProcessed: (result: ProcessedResult) => void;
  isLoading: boolean;
}

export const SampleEnhancerPanel: React.FC<SampleEnhancerPanelProps> = ({
  audioBuffer,
  onBufferProcessed,
  isLoading: parentLoading
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [drive, setDrive] = useState(40);
  const [mix, setMix] = useState(30);
  const [freq, setFreq] = useState(4000);
  const [denoiseThresh, setDenoiseThresh] = useState(-60);
  const [stereoWidth, setStereoWidth] = useState(20);
  const [punchAmount, setPunchAmount] = useState(30);

  const handleProcess = useCallback(async (
    type: 'exciter' | 'denoise' | 'stereo' | 'punch' | 'neural' | 'normalize' | 'trim' | 'reverse'
  ) => {
    if (!audioBuffer) return;
    
    setIsProcessing(true);
    try {
      await new Promise(r => setTimeout(r, 50));
      let result: ProcessedResult;

      switch (type) {
        case 'exciter':
          result = await applySpectralExciter(audioBuffer, { drive, mix, frequency: freq });
          break;
        case 'denoise':
          result = await applyDenoise(audioBuffer, denoiseThresh);
          break;
        case 'stereo':
          result = await applyPseudoStereo(audioBuffer, stereoWidth);
          break;
        case 'punch':
          result = await applyTransientSharpening(audioBuffer, punchAmount);
          break;
        case 'neural':
          result = await runNeuralEnhancement(audioBuffer, { modelType: 'resurrect', strength: 1.0 });
          break;
        case 'normalize':
          result = await applyNormalization(audioBuffer);
          break;
        case 'trim':
          result = await applyTrimSilence(audioBuffer);
          break;
        case 'reverse':
          result = await applyReverse(audioBuffer);
          break;
        default:
          return;
      }
      
      onBufferProcessed(result);
      notify.success(`Sample processed: ${type.toUpperCase()}`);
    } catch (err) {
      console.error('Processing failed:', err);
      notify.error('Processing failed');
    } finally {
      setIsProcessing(false);
    }
  }, [audioBuffer, drive, mix, freq, denoiseThresh, stereoWidth, punchAmount, onBufferProcessed]);

  return (
    <div className="bg-dark-bgSecondary border border-dark-border rounded-lg overflow-hidden mb-4">
      {/* Header */}
      <div className="bg-accent-primary/10 border-b border-dark-border px-4 py-2 flex items-center justify-between">
        <h4 className="font-mono text-xs font-bold text-accent-primary flex items-center gap-2">
          <Sparkles size={12} />
          ENHANCEMENT ENGINE
        </h4>
        {isProcessing && (
          <div className="flex items-center gap-2 text-[10px] text-accent-primary animate-pulse">
            <RefreshCw size={10} className="animate-spin" />
            PROCESSING...
          </div>
        )}
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Tier 2: Restoration Tools */}
        <div className="space-y-6">
          {/* Exciter */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-yellow-400" />
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Harmonic Exciter</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Knob label="DRIVE" value={drive} min={0} max={100} onChange={setDrive} size="sm" color="var(--color-accent)" />
              <Knob label="FREQ" value={freq} min={2000} max={10000} unit="Hz" onChange={setFreq} size="sm" color="var(--color-accent-secondary)" />
              <Knob label="MIX" value={mix} min={0} max={100} unit="%" onChange={setMix} size="sm" color="#10b981" />
            </div>
            <Button variant="primary" size="sm" fullWidth onClick={() => handleProcess('exciter')} disabled={isProcessing || parentLoading} icon={<Wand2 size={12} />}>
              Apply Exciter
            </Button>
          </div>

          {/* Denoise */}
          <div className="space-y-3 pt-4 border-t border-dark-border/50">
            <div className="flex items-center gap-2">
              <Eraser size={14} className="text-cyan-400" />
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Quantization Denoise</span>
            </div>
            <Knob label="THRESH" value={denoiseThresh} min={-100} max={-20} unit="dB" onChange={setDenoiseThresh} size="sm" color="var(--color-synth-modulation)" />
            <Button variant="default" size="sm" fullWidth onClick={() => handleProcess('denoise')} disabled={isProcessing || parentLoading} icon={<Eraser size={12} />}>
              Clean 8-bit Noise
            </Button>
          </div>
        </div>

        {/* Tier 3: Modernizer Tools */}
        <div className="space-y-6">
          {/* Transient Punch */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Hammer size={14} className="text-orange-400" />
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Transient Punch</span>
            </div>
            <Knob label="PUNCH" value={punchAmount} min={0} max={100} onChange={setPunchAmount} size="sm" color="var(--color-accent)" />
            <Button variant="default" size="sm" fullWidth onClick={() => handleProcess('punch')} disabled={isProcessing || parentLoading} icon={<Hammer size={12} />}>
              Sharpen Attacks
            </Button>
          </div>

          {/* Pseudo Stereo */}
          <div className="space-y-3 pt-4 border-t border-dark-border/50">
            <div className="flex items-center gap-2">
              <MoveHorizontal size={14} className="text-blue-400" />
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Pseudo Stereo</span>
            </div>
            <Knob label="WIDTH" value={stereoWidth} min={0} max={100} onChange={setStereoWidth} size="sm" color="var(--color-synth-pan)" />
            <Button variant="default" size="sm" fullWidth onClick={() => handleProcess('stereo')} disabled={isProcessing || parentLoading} icon={<MoveHorizontal size={12} />}>
              Make Stereo
            </Button>
          </div>
        </div>

        {/* Tier 4: Standard Edits */}
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Volume2 size={14} className="text-green-400" />
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Basic Editing</span>
            </div>
            
            <div className="grid grid-cols-1 gap-2">
              <Button variant="default" size="sm" fullWidth onClick={() => handleProcess('normalize')} disabled={isProcessing || parentLoading} icon={<Volume2 size={12} />}>
                Normalize (0dB Peak)
              </Button>
              <Button variant="default" size="sm" fullWidth onClick={() => handleProcess('trim')} disabled={isProcessing || parentLoading} icon={<Scissors size={12} />}>
                Trim Silence
              </Button>
              <Button variant="default" size="sm" fullWidth onClick={() => handleProcess('reverse')} disabled={isProcessing || parentLoading} icon={<RotateCcw size={12} />}>
                Destructive Reverse
              </Button>
            </div>
          </div>
          
          <div className="p-3 bg-dark-bg border border-dark-border rounded text-[9px] text-text-muted font-mono leading-tight">
            NOTE: These edits permanently modify the sample buffer. Use Normalize after Exciter to avoid clipping.
          </div>
        </div>

        {/* Tier 1: Neural (Full Width Footer) */}
        <div className="md:col-span-3 pt-4 border-t border-dark-border space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-violet-400" />
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Tier 1: Neural Super-Res (BEST)</span>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="flex-1">
              <p className="text-[10px] text-text-muted leading-relaxed">
                Uses Deep Learning to hallucinate missing high frequencies and remove 8-bit noise. 
                <span className="text-violet-400 block mt-1 font-bold">WebGPU Acceleration Enabled</span>
              </p>
            </div>
            <div className="w-full md:w-48">
              <Button variant="ft2" size="sm" fullWidth onClick={() => handleProcess('neural')} disabled={isProcessing || parentLoading} icon={<Sparkles size={12} />}>
                AI Resurrect
              </Button>
            </div>
          </div>
          <div className="p-2 bg-dark-bg border border-dark-border rounded text-[9px] text-text-muted font-mono leading-tight">
            PRO TIP: Chain these tools! Denoise first, then AI Resurrect, then add Stereo Width.
          </div>
        </div>
      </div>
    </div>
  );
};
