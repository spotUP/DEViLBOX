/**
 * NKS Settings Panel Component
 *
 * UI for configuring NKS hardware and presets
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNKSStore } from '@/midi/nks/NKSManager';
import { getNKSHardwareController, isNKSHardwareAvailable } from '@/midi/nks/NKSHardwareController';
import { formatNKSValue } from '@/midi/nks/synthParameterMaps';
import type { NKSControllerInfo } from '@/midi/nks/types';
import {
  sendMPKLCDDisplay,
  setMPKRainbowPattern,
  clearMPKPadLEDs,
  sendMPKOLEDBitmap,
  sendMPKTestPattern,
  canvasToBitmap,
} from '@/midi/nks/AkaiMIDIProtocol';
import { useNKSCurrentInstrumentSync } from '@hooks/useNKSIntegration';
import { Knob } from '@components/controls/Knob';

export const NKSSettingsPanel: React.FC = () => {
  const [deviceInfo, setDeviceInfo] = useState<NKSControllerInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Enable bidirectional sync with current instrument
  useNKSCurrentInstrumentSync();

  const {
    currentPreset,
    currentPage,
    totalPages,
    currentSynthType,
    pages,
    parameterValues,
    setParameterValue,
  } = useNKSStore();
  
  const controller = getNKSHardwareController();
  
  // Check for already-connected device on mount
  useEffect(() => {
    const info = controller.getDeviceInfo();
    if (info) {
      setDeviceInfo(info);
    }
  }, []);
  
  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      const success = await controller.requestConnection();
      
      if (success) {
        const info = controller.getDeviceInfo();
        setDeviceInfo(info);
      } else {
        setError('Failed to connect to device');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsConnecting(false);
    }
  };
  
  const handleDisconnect = async () => {
    await controller.disconnect();
    setDeviceInfo(null);
  };
  
  const handlePreviousPage = () => {
    useNKSStore.getState().prevPage();
  };
  
  const handleNextPage = () => {
    useNKSStore.getState().nextPage();
  };
  
  const handleExportPreset = () => {
    const state = useNKSStore.getState();
    if (state.currentPreset) {
      state.exportPreset();
    }
  };
  
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const img = new Image();
    img.onload = async () => {
      // Create canvas to resize/convert image to 128x64 monochrome
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return;
      
      // Draw image scaled to fit
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, 128, 64);
      
      const scale = Math.min(128 / img.width, 64 / img.height);
      const x = (128 - img.width * scale) / 2;
      const y = (64 - img.height * scale) / 2;
      
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      
      // Convert to monochrome bitmap
      const bitmap = canvasToBitmap(canvas);
      await sendMPKOLEDBitmap(bitmap);
      
      setError(null);
    };
    
    img.onerror = () => {
      setError('Failed to load image');
    };
    
    img.src = URL.createObjectURL(file);
  };
  
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  if (!isNKSHardwareAvailable()) {
    return (
      <div className="nks-settings-panel p-4 bg-gray-800 rounded-lg">
        <h3 className="text-lg font-semibold mb-2 text-red-400">
          Web HID Not Supported
        </h3>
        <p className="text-sm text-gray-300">
          Your browser does not support Web HID API. Please use Chrome/Edge 89+ or Opera 75+.
        </p>
      </div>
    );
  }
  
  return (
    <div className="nks-settings-panel p-4 bg-gray-800 rounded-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Native Kontrol Standard</h3>
          <div className="text-xs text-cyan-400 mt-0.5">{currentSynthType}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${deviceInfo ? 'bg-green-500' : 'bg-gray-500'}`} />
          <span className="text-xs text-gray-400">
            {deviceInfo ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>
      
      {/* Device Info */}
      {deviceInfo ? (
        <div className="space-y-2">
          <div className="bg-gray-700 rounded p-3">
            <div className="text-sm font-medium text-white">{deviceInfo.name}</div>
            <div className="text-xs text-gray-400">{deviceInfo.vendor}</div>
            <div className="flex gap-4 mt-2 text-xs text-gray-400">
              {deviceInfo.hasDisplay && <span>✓ Display</span>}
              {deviceInfo.hasLightGuide && <span>✓ Light Guide ({deviceInfo.lightGuideKeys} keys)</span>}
              {deviceInfo.hasKnobs && <span>✓ {deviceInfo.knobCount} Knobs</span>}
              {deviceInfo.hasTransport && <span>✓ Transport</span>}
            </div>
          </div>
          
          <button
            onClick={handleDisconnect}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-300">
            Connect a Native Instruments controller to enable hardware control.
          </p>
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded transition-colors"
          >
            {isConnecting ? 'Connecting...' : 'Connect Hardware'}
          </button>
          {error && (
            <div className="text-xs text-red-400 bg-red-900/20 rounded p-2">
              {error}
            </div>
          )}
        </div>
      )}
      
      {/* Current Preset */}
      {currentPreset && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-400 uppercase">Current Preset</div>
          <div className="bg-gray-700 rounded p-3">
            <div className="text-sm font-medium text-white">{currentPreset.metadata.name}</div>
            {currentPreset.metadata.author && (
              <div className="text-xs text-gray-400">by {currentPreset.metadata.author}</div>
            )}
            {currentPreset.metadata.comment && (
              <div className="text-xs text-gray-500 mt-1">{currentPreset.metadata.comment}</div>
            )}
          </div>
          <button
            onClick={handleExportPreset}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors text-sm"
          >
            Export .nksf File
          </button>
        </div>
      )}
      
      {/* Page Navigation */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-400 uppercase">
          Parameter Pages - {pages[currentPage]?.name || 'Page'}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePreviousPage}
            disabled={currentPage === 0}
            className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded transition-colors text-sm"
          >
            ← Previous
          </button>
          <div className="px-4 py-2 bg-gray-700 rounded text-white text-sm font-mono">
            {currentPage + 1} / {totalPages}
          </div>
          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages - 1}
            className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded transition-colors text-sm"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Current Page Parameters */}
      {pages[currentPage] && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-400 uppercase">Parameters</div>
          <div className="bg-gray-700/50 rounded-lg p-3">
            <div className="grid grid-cols-4 gap-3">
              {pages[currentPage].parameters.slice(0, 8).map((param) => {
                const value = parameterValues[param.id] ?? param.defaultValue;
                const displayValue = formatNKSValue(param, value);

                return (
                  <div key={param.id} className="flex flex-col items-center">
                    <Knob
                      value={value * (param.max - param.min) + param.min}
                      min={param.min}
                      max={param.max}
                      onChange={(v) => {
                        // Normalize to 0-1 range for NKS
                        const normalized = (v - param.min) / (param.max - param.min);
                        setParameterValue(param.id, normalized);
                      }}
                      label={param.name}
                      color="#00ffff"
                      size="sm"
                    />
                    <div className="text-[10px] text-gray-400 mt-1 text-center truncate w-full">
                      {displayValue}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      
      {/* Light Guide Controls */}
      {deviceInfo?.hasLightGuide && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-400 uppercase">
            {deviceInfo.vendor.toLowerCase().includes('akai') ? 'Pad LEDs' : 'Light Guide'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {deviceInfo.vendor.toLowerCase().includes('akai') ? (
              // Akai MPK Mini pad LED controls
              <>
                <button
                  onClick={() => setMPKRainbowPattern()}
                  className="px-3 py-2 bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 hover:opacity-80 text-white rounded transition-colors text-xs font-medium"
                >
                  Rainbow
                </button>
                <button
                  onClick={() => clearMPKPadLEDs()}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors text-xs"
                >
                  Clear LEDs
                </button>
              </>
            ) : (
              // Native Instruments light guide controls
              <>
                <button
                  onClick={() => {
                    controller.setScaleLights(0, [0, 2, 4, 5, 7, 9, 11]); // C Major
                  }}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors text-xs"
                >
                  C Major Scale
                </button>
                <button
                  onClick={() => {
                    controller.setScaleLights(0, [0, 2, 3, 5, 7, 8, 10]); // C Minor
                  }}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors text-xs"
                >
                  C Minor Scale
                </button>
                <button
                  onClick={() => {
                    controller.setScaleLights(0, [0, 3, 5, 7, 10]); // C Minor Pentatonic
                  }}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors text-xs"
                >
                  Pentatonic
                </button>
                <button
                  onClick={() => {
                    controller.clearLightGuide();
                  }}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors text-xs"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      )}
      
      {/* Display Test (for devices with displays) */}
      {deviceInfo?.hasDisplay && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-400 uppercase">
            {deviceInfo.vendor.toLowerCase().includes('akai') ? 'OLED Display (128x64)' : 'Display Test'}
          </div>
          
          {deviceInfo.vendor.toLowerCase().includes('akai') ? (
            // Akai MPK Mini OLED controls
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => sendMPKLCDDisplay('  DEViLBOX  ', '  Tracker DAW  ')}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors text-xs"
                >
                  Test Text
                </button>
                <button
                  onClick={() => sendMPKTestPattern()}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors text-xs"
                >
                  Test Pattern
                </button>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              
              <button
                onClick={handleUploadClick}
                className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors text-xs font-medium"
              >
                📷 Upload Custom Image (128x64)
              </button>
              
              <div className="text-[10px] text-gray-500 italic">
                Tip: Upload any image - it will be auto-converted to monochrome 128×64
              </div>
            </div>
          ) : (
            // Native Instruments display test
            <button
              onClick={() => {
                useNKSStore.getState().setDisplayInfo([
                  '    DEViLBOX    ',
                  '  Tracker DAW   ',
                  '  NKS Active    ',
                  '  Connected!    '
                ]);
              }}
              className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors text-xs"
            >
              Test Display
            </button>
          )}
        </div>
      )}
      
      {/* Info */}
      <div className="pt-2 border-t border-gray-700">
        <div className="text-xs text-gray-500">
          <p>NKS enables deep hardware integration with Native Instruments controllers.</p>
          <p className="mt-1">Knobs, displays, and light guides sync automatically.</p>
        </div>
      </div>
    </div>
  );
};
