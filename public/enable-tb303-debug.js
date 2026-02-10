/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TB-303 PLAYBACK DEBUG HELPER
 *  Enable detailed runtime logging for TB-303 playback debugging
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * TO USE:
 * 1. Open DEViLBOX in browser
 * 2. Open browser console (F12 → Console tab)
 * 3. Paste this entire file OR run:  window.TB303_DEBUG_ENABLED = true
 * 4. Import/load a TB-303 pattern
 * 5. Press play - you'll see detailed logs for every step
 * 
 * TO DISABLE:
 *   window.TB303_DEBUG_ENABLED = false
 * 
 * LOG FORMAT LEGEND:
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Row logs (from TrackerReplayer):
 *   [Row XX] NOTE  ●ACC ►SLD [prev:X curr:X] → ACTION
 *   
 *   - Row XX: Current row number (0-15 for 16-step)
 *   - NOTE: Note being played (e.g., F#2, C3, etc.)
 *   - ●ACC: Purple = Accent is active for this note
 *   - ►SLD: Yellow = Slide is active (pitch glides from previous)
 *   - prev:X: Previous row's slide flag (1=slide was set)
 *   - curr:X: Current row's slide flag (1=slide is set)
 *   - ACTION: TRIGGER (new note) or SLIDE (pitch glide)
 * 
 * Synth call logs (from ToneEngine):
 *   └─► DB303.triggerAttack("note", t=X.XXX, vel=X.XX, acc=X, sld=X, ham=X)
 *   
 *   - note: Note name sent to synth
 *   - t: Audio time (Tone.js seconds)
 *   - vel: Velocity (0.0-1.0)
 *   - acc: accent boolean
 *   - sld: slide boolean (controls pitch glide)
 *   - ham: hammer boolean (legato without glide)
 * 
 * Worklet message logs (from DB303Synth):
 *   └─► WORKLET: noteOn(midi=XX (NOTE), vel=XXX, slide=X, accent=X, hammer=X)
 *   
 *   - midi: MIDI note number (36=C2, 42=F#2, etc.)
 *   - NOTE: Note name
 *   - vel: Velocity 0-127 (127=accent)
 *   - slide: Whether this note should slide from previous
 *   - accent: Whether accent is active
 *   - hammer: TT-303 hammer (legato, no glide)
 * 
 * Note-off logs:
 *   [Row XX] ===   NOTE OFF (prevSlide cleared)
 *   
 *   - Row XX: Row where note-off occurs
 *   - === : Visual indicator for note off (like in trackers)
 *   - prevSlide cleared: The slide chain is broken
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * UNDERSTANDING TB-303 SLIDE SEMANTICS
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * The TB-303's slide works as follows:
 * 
 * 1. Slide flag on step N causes pitch to GLIDE from step N to step N+1
 * 2. The envelope does NOT retrigger when sliding
 * 3. Gate stays HIGH through the slide
 * 
 * In the logs, you'll see:
 * - prev:1 curr:0 → SLIDE  (previous row had slide, so this note glides)
 * - prev:1 curr:1 → SLIDE  (continuous slide chain)
 * - prev:0 curr:1 → TRIGGER (new note, but NEXT note will slide)
 * - prev:0 curr:0 → TRIGGER (normal note, no slide)
 * 
 * REST/Note-off BREAKS the slide chain (prev becomes 0)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// Enable debug logging
window.TB303_DEBUG_ENABLED = true;

console.log(`
%c╔═══════════════════════════════════════════════════════════════════════════════╗
%c║                    TB-303 DEBUG LOGGING ENABLED                               ║
%c╚═══════════════════════════════════════════════════════════════════════════════╝

%cYou will now see detailed logs for every TB-303 step:
  • Row processing (from TrackerReplayer)
  • Synth calls (from ToneEngine)  
  • Worklet messages (from DB303Synth)

%cTo disable: %cwindow.TB303_DEBUG_ENABLED = false
`,
'color: #0ff',
'color: #0ff; font-weight: bold',
'color: #0ff',
'color: #aaa',
'color: #888',
'color: #0f0'
);
