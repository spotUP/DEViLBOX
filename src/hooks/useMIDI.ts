/**
 * useMIDI - Web MIDI API hook for MIDI input handling
 *
 * Provides MIDI device access, input monitoring, and CC message parsing
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface MIDIMessage {
  type: 'noteon' | 'noteoff' | 'cc' | 'pitchbend' | 'aftertouch' | 'unknown';
  channel: number;
  note?: number;
  velocity?: number;
  controller?: number;
  value?: number;
  raw: Uint8Array;
}

export interface MIDIDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
}

export interface UseMIDIReturn {
  devices: MIDIDevice[];
  isSupported: boolean;
  isEnabled: boolean;
  lastMessage: MIDIMessage | null;
  enableMIDI: () => Promise<void>;
  disableMIDI: () => void;
  onMessage: (callback: (message: MIDIMessage) => void) => () => void;
}

/**
 * Parse MIDI message bytes into structured format
 */
function parseMIDIMessage(data: Uint8Array): MIDIMessage {
  // Validate minimum message length
  if (data.length < 1) {
    return {
      type: 'unknown',
      channel: 0,
      raw: data,
    };
  }

  const [status, byte1 = 0, byte2 = 0] = data;
  const messageType = (status >> 4) & 0x0f;
  const channel = status & 0x0f;

  switch (messageType) {
    case 0x09: // Note On
      return {
        type: byte2 > 0 ? 'noteon' : 'noteoff', // velocity 0 = note off
        channel,
        note: byte1,
        velocity: byte2,
        raw: data,
      };

    case 0x08: // Note Off
      return {
        type: 'noteoff',
        channel,
        note: byte1,
        velocity: byte2,
        raw: data,
      };

    case 0x0b: // Control Change (CC)
      return {
        type: 'cc',
        channel,
        controller: byte1,
        value: byte2,
        raw: data,
      };

    case 0x0e: // Pitch Bend
      const pitchValue = (byte2 << 7) | byte1;
      return {
        type: 'pitchbend',
        channel,
        value: pitchValue,
        raw: data,
      };

    case 0x0d: // Channel Aftertouch
      return {
        type: 'aftertouch',
        channel,
        value: byte1,
        raw: data,
      };

    default:
      return {
        type: 'unknown',
        channel,
        raw: data,
      };
  }
}

/**
 * Hook for Web MIDI API access and input handling
 */
export function useMIDI(): UseMIDIReturn {
  const [devices, setDevices] = useState<MIDIDevice[]>([]);
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [lastMessage, setLastMessage] = useState<MIDIMessage | null>(null);

  const midiAccessRef = useRef<any>(null);
  const stateChangeHandlerRef = useRef<(() => void) | null>(null);
  const messageListenersRef = useRef<Set<(message: MIDIMessage) => void>>(new Set());

  // Check for Web MIDI API support
  useEffect(() => {
    setIsSupported('requestMIDIAccess' in navigator);
  }, []);

  // Handle MIDI input message
  const handleMIDIMessage = useCallback((event: any) => {
    const message = parseMIDIMessage(event.data);
    setLastMessage(message);

    // Notify all listeners
    messageListenersRef.current.forEach((listener) => {
      listener(message);
    });
  }, []);

  // Update device list from MIDI access
  const updateDevices = useCallback((midiAccess: any) => {
    const deviceList: MIDIDevice[] = [];

    midiAccess.inputs.forEach((input: any) => {
      deviceList.push({
        id: input.id,
        name: input.name || 'Unknown Device',
        manufacturer: input.manufacturer || 'Unknown',
        state: input.state as 'connected' | 'disconnected',
      });
    });

    setDevices(deviceList);
  }, []);

  // Enable MIDI access
  const enableMIDI = useCallback(async () => {
    if (!isSupported) {
      throw new Error('Web MIDI API not supported in this browser');
    }

    // Prevent duplicate initialization
    if (isEnabled) {
      return;
    }

    try {
      const midiAccess = await navigator.requestMIDIAccess();
      midiAccessRef.current = midiAccess;

      // Listen to all inputs
      midiAccess.inputs.forEach((input) => {
        input.addEventListener('midimessage', handleMIDIMessage as EventListener);
      });

      // Create and store state change handler to prevent memory leaks
      const stateChangeHandler = () => {
        updateDevices(midiAccess);

        // Only attach listeners to new inputs that don't have them
        midiAccess.inputs.forEach((input) => {
          // Check if listener already exists by removing/re-adding
          input.removeEventListener('midimessage', handleMIDIMessage as EventListener);
          input.addEventListener('midimessage', handleMIDIMessage as EventListener);
        });
      };

      stateChangeHandlerRef.current = stateChangeHandler;
      midiAccess.addEventListener('statechange', stateChangeHandler);

      updateDevices(midiAccess);
      setIsEnabled(true);
    } catch (error) {
      throw error;
    }
  }, [isSupported, isEnabled, handleMIDIMessage, updateDevices]);

  // Disable MIDI access
  const disableMIDI = useCallback(() => {
    if (midiAccessRef.current) {
      // Remove all input listeners
      midiAccessRef.current.inputs.forEach((input: any) => {
        input.removeEventListener('midimessage', handleMIDIMessage as EventListener);
      });

      // Remove statechange listener to prevent memory leak
      if (stateChangeHandlerRef.current) {
        midiAccessRef.current.removeEventListener('statechange', stateChangeHandlerRef.current);
        stateChangeHandlerRef.current = null;
      }

      midiAccessRef.current = null;
    }
    setIsEnabled(false);
    setDevices([]);
    setLastMessage(null);
  }, [handleMIDIMessage]);

  // Register message listener
  const onMessage = useCallback((callback: (message: MIDIMessage) => void) => {
    messageListenersRef.current.add(callback);

    // Return cleanup function
    return () => {
      messageListenersRef.current.delete(callback);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disableMIDI();
    };
  }, [disableMIDI]);

  return {
    devices,
    isSupported,
    isEnabled,
    lastMessage,
    enableMIDI,
    disableMIDI,
    onMessage,
  };
}
