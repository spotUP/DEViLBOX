(function() {
  "use strict";
  const DECK_ACCENT = { A: "#60a5fa", B: "#f87171", C: "#34d399" };
  const DECK_LABEL = { A: "#1e2a3f", B: "#3f1e2a", C: "#1e3f2a" };
  const BASE_RPS = 0.5556;
  const BASE_BPM = 120;
  const GROOVE_COUNT = 14;
  let offCanvas = null;
  let ctx = null;
  let dpr = 1, width = 96, height = 96;
  let colors = {
    bg: "#6e1418",
    bgSecondary: "#7c1a1e",
    bgTertiary: "#8c2028",
    border: "#581014",
    borderLight: "#9c2028"
  };
  let deckId = "A";
  let isPlaying = false, effectiveBPM = 120;
  let scratchVelocity = 1, isScratchActive = false;
  let angle = 0, posSec = 0, dirty = true;
  let scratchIntegrating = false;
  let lastScratchAngle = 0;
  self.onmessage = (e) => {
    const msg = e.data;
    switch (msg.type) {
      case "init":
        offCanvas = msg.canvas;
        offCanvas.width = Math.round(msg.width * msg.dpr);
        offCanvas.height = Math.round(msg.height * msg.dpr);
        ctx = offCanvas.getContext("2d");
        dpr = msg.dpr;
        width = msg.width;
        height = msg.height;
        colors = msg.colors;
        deckId = msg.deckId;
        isPlaying = msg.isPlaying;
        effectiveBPM = msg.effectiveBPM;
        startRAF();
        self.postMessage({ type: "ready" });
        break;
      case "playback":
        isPlaying = msg.isPlaying;
        effectiveBPM = msg.effectiveBPM;
        dirty = true;
        break;
      case "position": {
        posSec = msg.posSec;
        const rps = effectiveBPM / BASE_BPM * BASE_RPS;
        const targetAngle = posSec * rps * 2 * Math.PI;
        if (!scratchIntegrating) {
          const diff = targetAngle - angle;
          if (Math.abs(diff) > Math.PI) {
            angle = targetAngle;
          }
          lastScratchAngle = targetAngle;
        }
        dirty = true;
        break;
      }
      case "velocity":
        scratchVelocity = msg.v;
        dirty = true;
        break;
      case "scratchActive":
        isScratchActive = msg.active;
        if (msg.active && !scratchIntegrating) {
          scratchIntegrating = true;
          const rps = effectiveBPM / BASE_BPM * BASE_RPS;
          angle = posSec * rps * 2 * Math.PI;
        }
        if (!msg.active) {
          lastScratchAngle = angle;
          scratchIntegrating = false;
        }
        dirty = true;
        break;
      case "resize":
        dpr = msg.dpr;
        width = msg.w;
        height = msg.h;
        if (offCanvas) {
          offCanvas.width = Math.round(width * dpr);
          offCanvas.height = Math.round(height * dpr);
        }
        dirty = true;
        break;
      case "colors":
        colors = msg.colors;
        dirty = true;
        break;
    }
  };
  let lastRafTime = 0;
  function startRAF() {
    const tick = (now) => {
      const dt = lastRafTime > 0 ? (now - lastRafTime) / 1e3 : 0;
      lastRafTime = now;
      if (isPlaying || dirty) renderFrame(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function renderFrame(dt) {
    if (!ctx) return;
    dirty = false;
    const rps = effectiveBPM / BASE_BPM * BASE_RPS;
    const omegaNormal = rps * 2 * Math.PI;
    if (scratchIntegrating) {
      angle += scratchVelocity * omegaNormal * dt;
    } else if (isPlaying) {
      angle += omegaNormal * dt;
    } else {
      angle = lastScratchAngle;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = width / 2, cy = height / 2;
    const radius = Math.min(cx, cy) - 2;
    const labelRadius = radius * 0.38;
    const markerColor = DECK_ACCENT[deckId];
    const labelBg = DECK_LABEL[deckId];
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = colors.bgSecondary;
    ctx.fill();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
    ctx.fillStyle = colors.bg;
    ctx.fill();
    const grooveStart = labelRadius + 4, grooveEnd = radius - 6;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < GROOVE_COUNT; i++) {
      const r = grooveStart + i / (GROOVE_COUNT - 1) * (grooveEnd - grooveStart);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = colors.bgTertiary;
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(i * 1.7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * labelRadius, cy + Math.sin(angle) * labelRadius);
    ctx.lineTo(cx + Math.cos(angle) * (radius - 4), cy + Math.sin(angle) * (radius - 4));
    ctx.strokeStyle = markerColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, labelRadius, 0, Math.PI * 2);
    ctx.fillStyle = labelBg;
    ctx.fill();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    if (isScratchActive) {
      ctx.font = `bold ${Math.round(labelRadius * 0.45)}px monospace`;
      ctx.fillStyle = markerColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("SCR", cx, cy);
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = colors.borderLight;
    ctx.fill();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  }
})();
