/**
 * RUNTIME PLAYBACK LOGGER
 * This patches TrackerReplayer to add extensive logging during actual playback
 * Run this in the browser console to see what's happening in real-time
 */

// Logger state
window.TB303_DEBUG = {
  enabled: true,
  events: [],
  logRow: function(row, data) {
    if (!this.enabled) return;
    this.events.push({ row, ...data, timestamp: performance.now() });
    
    const prefix = `[Row ${row.toString().padStart(2)}]`;
    const noteStr = data.note || '...';
    const accentStr = data.accent ? '●ACC' : '    ';
    const slideStr = data.slideActive ? '►SLD' : '    ';
    const currentSlideStr = data.currentSlide ? 'S' : '-';
    const prevSlideStr = data.prevSlideFlag ? 'P' : '-';
    
    console.log(
      `%c${prefix} %c${noteStr.padEnd(5)} %c${accentStr} %c${slideStr} %c[prev:${prevSlideStr} curr:${currentSlideStr}] %c${data.action || ''}`,
      'color: #888',
      'color: #0ff; font-weight: bold',
      data.accent ? 'color: #f0f' : 'color: #444',
      data.slideActive ? 'color: #ff0' : 'color: #444',
      'color: #666',
      'color: #0f0'
    );
  },
  logSynthCall: function(method, params) {
    if (!this.enabled) return;
    console.log(
      `%c  └─► ${method}(%c${JSON.stringify(params)}%c)`,
      'color: #66f',
      'color: #aaa',
      'color: #66f'
    );
  },
  clear: function() {
    this.events = [];
    console.clear();
    console.log('%c[TB303 Debug Logger] Cleared', 'color: #0f0');
  },
  summary: function() {
    console.log('\n%c═══════════════════════════════════════════════════════', 'color: #0ff');
    console.log('%c             PLAYBACK SUMMARY                           ', 'color: #0ff; font-weight: bold');
    console.log('%c═══════════════════════════════════════════════════════', 'color: #0ff');
    
    const noteOns = this.events.filter(e => e.action === 'TRIGGER');
    const slides = this.events.filter(e => e.action === 'SLIDE');
    const noteOffs = this.events.filter(e => e.action === 'NOTE-OFF');
    
    console.log(`Note ONs:  ${noteOns.length}`);
    console.log(`Slides:    ${slides.length}`);
    console.log(`Note OFFs: ${noteOffs.length}`);
    console.log(`Total:     ${this.events.length}`);
    
    console.log('\n%cEvent sequence:', 'color: #ff0');
    this.events.forEach((e, i) => {
      console.log(`  ${i.toString().padStart(2)}: Row ${e.row.toString().padStart(2)} - ${e.action || 'PROCESS'} ${e.note || ''}`);
    });
  }
};

// Instructions for use
console.log(`
%c╔═══════════════════════════════════════════════════════════════════════════╗
║                    TB-303 PLAYBACK DEBUG LOGGER                           ║
╚═══════════════════════════════════════════════════════════════════════════╝

%cUsage:
  %cwindow.TB303_DEBUG.enabled = true/false%c  - Toggle logging
  %cwindow.TB303_DEBUG.clear()%c               - Clear log
  %cwindow.TB303_DEBUG.summary()%c             - Show summary
  %cwindow.TB303_DEBUG.events%c                - Raw event array

%cLegend:
  %c●ACC%c = Accent active
  %c►SLD%c = Slide active (pitch glide from previous note)
  %c[prev:P curr:S]%c = Previous slide flag, Current slide flag

%cThis logger is PASSIVE - it doesn't hook into the actual code.
To enable actual runtime logging, you need to modify TrackerReplayer.ts

Copy this code into the processRow function after the slideActive calculation:

  // DEBUG LOGGING
  if (window.TB303_DEBUG?.enabled && ch.instrument?.synthType === 'TB303') {
    const noteName = noteValue ? periodToNoteName(this.noteToPeriod(noteValue, ch.finetune)) : null;
    window.TB303_DEBUG.logRow(this.pattPos, {
      note: noteName,
      midi: noteValue,
      accent: accent,
      slideActive: slideActive,
      currentSlide: slide,
      prevSlideFlag: ch.previousSlideFlag,
      action: noteValue === 97 ? 'NOTE-OFF' : (slideActive ? 'SLIDE' : (noteValue ? 'TRIGGER' : 'EMPTY'))
    });
  }

`,
'color: #0ff',
'color: #fff',
'color: #0f0', 'color: #888',
'color: #0f0', 'color: #888',
'color: #0f0', 'color: #888',
'color: #0f0', 'color: #888',
'color: #fff',
'color: #f0f', 'color: #888',
'color: #ff0', 'color: #888',
'color: #666', 'color: #888',
'color: #888'
);
