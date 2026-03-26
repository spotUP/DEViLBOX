# DEViLBOX Live Gig Checklist

## Pre-Performance (Day Before)

### System Prep
- [ ] Disable Spotlight indexing: `sudo mdutil -a -i off`
- [ ] Disable Microsoft Defender real-time scanning
- [ ] Close all unnecessary apps (Discord, Slack, email)
- [ ] Disable macOS notifications: Focus mode > Do Not Disturb
- [ ] Connect and test audio interface
- [ ] Connect and test MIDI controller
- [ ] Test second screen for VJ pop-out (if using)

### DEViLBOX Prep
- [ ] Clear browser cache and IndexedDB
- [ ] Pre-render entire setlist via DJPipeline (load each track, wait for analysis)
- [ ] Verify all tracks in playlist load without errors
- [ ] Test crossfader with both decks playing
- [ ] Test master FX add/remove during playback
- [ ] Test VJ preset switching (milkdrop > projectM > three.js > back)
- [ ] Test VJ pop-out window fullscreen on second screen
- [ ] Run for 30+ minutes continuous -- check for audio dropouts

### Soak Test (2+ Hours)
- [ ] Load and play 20+ tracks sequentially
- [ ] Switch between tracks rapidly (every 30s)
- [ ] Use scratch pad on multiple tracks
- [ ] Toggle master FX on/off repeatedly
- [ ] Switch VJ presets every 30s
- [ ] Monitor: JS heap (Chrome DevTools), GPU memory, CPU usage
- [ ] Check for: audio clicks/pops, visual freezes, memory growth > 500MB

## Performance Day

### Sound Check
- [ ] Audio interface detected and routing correctly
- [ ] Master limiter active (prevents clipping PA)
- [ ] Headphone cue working (PFL)
- [ ] MIDI controller bound and responding
- [ ] VJ output on correct screen

### During Performance
- [ ] Watch health indicator (top-right corner, only visible when there's a problem)
- [ ] If audio suspends: click anywhere in the browser window
- [ ] If VJ freezes: press Next Preset
- [ ] If crash: Error boundary shows Retry button -- click it
- [ ] Last resort: Cmd+R to reload page (audio will cut for 2-3 seconds)

### Emergency Recovery
1. **Audio cuts out** > Check health indicator > Click browser to resume AudioContext
2. **VJ frozen** > Next Preset button > If stuck, switch to different layer
3. **Component crash** > Error boundary Retry > If fails, Reload Page
4. **MIDI dead** > Unplug/replug controller (auto-reconnect will re-bind)
5. **Full freeze** > Cmd+R (page reload) > Re-load current track from playlist
