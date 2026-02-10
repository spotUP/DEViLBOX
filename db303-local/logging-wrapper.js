/**
 * DB303 Logging Wrapper
 * Wraps the WASM engine to log all note events and sequencer activity
 */

(function() {
  'use strict';
  
  // Wait for the engine to be created, then wrap it
  const originalCreateDB303Module = window.createDB303Module;
  
  if (!originalCreateDB303Module) {
    console.warn('[DB303-LOG] createDB303Module not found, will try to wrap later');
  }
  
  // Store reference to wrapped engine
  let wrappedEngine = null;
  
  // Log styles
  const LOG_STYLES = {
    noteOn: 'color: #00ff00; font-weight: bold',
    noteOff: 'color: #ff6600',
    slide: 'color: #00ffff; font-weight: bold',
    accent: 'color: #ff00ff; font-weight: bold',
    sequencer: 'color: #ffff00',
    param: 'color: #888'
  };
  
  // Track current state
  const state = {
    currentNote: -1,
    lastStep: -1,
    stepData: [],
    isPlaying: false
  };
  
  // Format note number to note name
  function midiToNoteName(midi) {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const note = notes[midi % 12];
    return `${note}${octave}`;
  }
  
  // Wrap the DB303Engine class
  function wrapEngine(engine) {
    if (!engine || wrappedEngine === engine) return engine;
    
    console.log('%c[DB303-LOG] Wrapping engine for logging...', 'color: #00ff00; font-size: 14px');
    
    // Store original methods
    const originalNoteOn = engine.noteOn?.bind(engine);
    const originalNoteOff = engine.noteOff?.bind(engine);
    const originalAllNotesOff = engine.allNotesOff?.bind(engine);
    const originalSetSequencerStep = engine.setSequencerStep?.bind(engine);
    const originalStartSequencer = engine.startSequencer?.bind(engine);
    const originalStopSequencer = engine.stopSequencer?.bind(engine);
    const originalGetCurrentStep = engine.getCurrentStep?.bind(engine);
    
    // Wrap noteOn
    if (originalNoteOn) {
      engine.noteOn = function(note, velocity) {
        const noteName = midiToNoteName(note);
        const isSameNote = note === state.currentNote;
        
        if (isSameNote) {
          console.log(`%c[DB303] noteOn(${note}) ${noteName} vel=${velocity} - SAME NOTE AS CURRENT`, LOG_STYLES.slide);
        } else {
          console.log(`%c[DB303] noteOn(${note}) ${noteName} vel=${velocity}`, LOG_STYLES.noteOn);
        }
        
        state.currentNote = note;
        return originalNoteOn(note, velocity);
      };
    }
    
    // Wrap noteOff
    if (originalNoteOff) {
      engine.noteOff = function(note) {
        const noteName = midiToNoteName(note);
        console.log(`%c[DB303] noteOff(${note}) ${noteName}`, LOG_STYLES.noteOff);
        state.currentNote = -1;
        return originalNoteOff(note);
      };
    }
    
    // Wrap allNotesOff
    if (originalAllNotesOff) {
      engine.allNotesOff = function() {
        console.log(`%c[DB303] allNotesOff()`, LOG_STYLES.noteOff);
        state.currentNote = -1;
        return originalAllNotesOff();
      };
    }
    
    // Wrap setSequencerStep
    if (originalSetSequencerStep) {
      engine.setSequencerStep = function(index, key, octave, accent, slide, gate, mute, hammer) {
        const flags = [];
        if (accent) flags.push('ACCENT');
        if (slide) flags.push('SLIDE');
        if (mute) flags.push('MUTE');
        if (hammer) flags.push('HAMMER');
        if (!gate) flags.push('REST');
        
        const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
        
        // Store step data for later reference
        state.stepData[index] = { key, octave, accent, slide, gate, mute, hammer };
        
        console.log(
          `%c[DB303] setSequencerStep(${index}) key=${key} oct=${octave}${flagStr}`,
          LOG_STYLES.sequencer
        );
        
        return originalSetSequencerStep(index, key, octave, accent, slide, gate, mute, hammer);
      };
    }
    
    // Wrap startSequencer
    if (originalStartSequencer) {
      engine.startSequencer = function() {
        console.log('%c[DB303] startSequencer()', 'color: #00ff00; font-size: 12px; font-weight: bold');
        state.isPlaying = true;
        state.lastStep = -1;
        return originalStartSequencer();
      };
    }
    
    // Wrap stopSequencer
    if (originalStopSequencer) {
      engine.stopSequencer = function() {
        console.log('%c[DB303] stopSequencer()', 'color: #ff0000; font-size: 12px; font-weight: bold');
        state.isPlaying = false;
        return originalStopSequencer();
      };
    }
    
    // Poll getCurrentStep to log step changes
    if (originalGetCurrentStep) {
      setInterval(() => {
        if (!state.isPlaying) return;
        
        const step = originalGetCurrentStep();
        if (step !== state.lastStep && step >= 0) {
          const stepInfo = state.stepData[step];
          if (stepInfo) {
            const flags = [];
            if (stepInfo.accent) flags.push('ACC');
            if (stepInfo.slide) flags.push('SLD');
            if (stepInfo.mute) flags.push('MUT');
            if (stepInfo.hammer) flags.push('HAM');
            if (!stepInfo.gate) flags.push('REST');
            
            const flagStr = flags.length > 0 ? ` [${flags.join(' ')}]` : '';
            const prevSlide = state.lastStep >= 0 && state.stepData[state.lastStep]?.slide;
            
            console.log(
              `%c[DB303] → Step ${step}: key=${stepInfo.key} oct=${stepInfo.octave}${flagStr}${prevSlide ? ' (prev had SLIDE)' : ''}`,
              prevSlide ? LOG_STYLES.slide : LOG_STYLES.sequencer
            );
          }
          state.lastStep = step;
        }
      }, 10);
    }
    
    wrappedEngine = engine;
    return engine;
  }
  
  // Hook into DB303Engine creation
  // The minified code creates engine with: new this.wasmModule.DB303Engine(sampleRate)
  // We need to intercept after it's created
  
  // Search all window properties for an object with an engine
  let attempts = 0;
  const maxAttempts = 100;
  
  const checkAndWrap = setInterval(() => {
    attempts++;
    
    // Check known locations first
    const knownPaths = ['db303App', 'app', 'synth', 'engine'];
    for (const path of knownPaths) {
      if (window[path]?.engine && typeof window[path].engine.noteOn === 'function') {
        console.log(`%c[DB303-LOG] Found engine at window.${path}.engine`, 'color: #00ff00');
        wrapEngine(window[path].engine);
        clearInterval(checkAndWrap);
        return;
      }
    }
    
    // Scan all window properties for objects with engine
    for (const key in window) {
      try {
        const obj = window[key];
        if (obj && typeof obj === 'object' && obj !== window && 
            obj.engine && typeof obj.engine.noteOn === 'function' && !wrappedEngine) {
          console.log(`%c[DB303-LOG] Found engine at window.${key}.engine`, 'color: #00ff00');
          wrapEngine(obj.engine);
          clearInterval(checkAndWrap);
          return;
        }
      } catch (e) {
        // Ignore property access errors
      }
    }
    
    if (attempts >= maxAttempts) {
      console.warn('[DB303-LOG] Could not auto-find engine after', maxAttempts, 'attempts');
      console.log('[DB303-LOG] You can manually wrap: wrapDB303Engine(yourEngineReference)');
      clearInterval(checkAndWrap);
    }
  }, 100);
  
  // Also expose manual wrap function
  window.wrapDB303Engine = wrapEngine;
  window.db303LogState = state;
  
  // Make the state available globally for inspection
  window.getDb303State = () => ({
    currentNote: state.currentNote,
    currentNoteName: state.currentNote >= 0 ? midiToNoteName(state.currentNote) : 'none',
    lastStep: state.lastStep,
    isPlaying: state.isPlaying,
    stepData: [...state.stepData]
  });
  
  console.log('%c[DB303-LOG] Logging wrapper loaded. Use getDb303State() to inspect state.', 'color: #00ffff');
})();
