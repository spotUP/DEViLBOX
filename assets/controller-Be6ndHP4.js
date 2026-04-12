import { j as jsxDevRuntimeExports, c as clientExports } from "./client-DHYdgbIN.js";
import { a as reactExports, R as React } from "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
let ws = null;
let connectPromise = null;
const pending = /* @__PURE__ */ new Map();
let onStatusChange = null;
let msgId = 0;
function nextId() {
  return `ctrl-${++msgId}-${Date.now().toString(36)}`;
}
function setStatusCallback(cb) {
  onStatusChange = cb;
}
function connect(host, port = 4003) {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve();
  if (connectPromise) return connectPromise;
  connectPromise = new Promise((resolve, reject) => {
    const url = `ws://${host}:${port}/controller`;
    console.log(`[Controller] Connecting to ${url}`);
    const socket = new WebSocket(url);
    socket.onopen = () => {
      ws = socket;
      connectPromise = null;
      onStatusChange == null ? void 0 : onStatusChange(true);
      console.log("[Controller] Connected");
      resolve();
    };
    socket.onclose = () => {
      ws = null;
      connectPromise = null;
      onStatusChange == null ? void 0 : onStatusChange(false);
      for (const [, p] of pending) {
        p.reject(new Error("WebSocket closed"));
      }
      pending.clear();
    };
    socket.onerror = () => {
      connectPromise = null;
      reject(new Error("WebSocket connection failed"));
    };
    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const p = pending.get(msg.id);
        if (p) {
          pending.delete(msg.id);
          if (msg.type === "error") {
            p.reject(new Error(msg.error));
          } else {
            p.resolve(msg.data);
          }
        }
      } catch {
      }
    };
  });
  return connectPromise;
}
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("Not connected"));
      return;
    }
    const id = nextId();
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, type: "call", method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }
    }, 5e3);
  });
}
const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];
class ControllerWebRTC {
  ws = null;
  pc = null;
  stream = null;
  audioTrack = null;
  roomCode = null;
  onStatusChange;
  /**
   * Connect to the signaling server and join a room.
   * The desktop creates the room and provides the code.
   */
  async connect(signalingHost, roomCode, port = 4002) {
    var _a;
    this.roomCode = roomCode;
    (_a = this.onStatusChange) == null ? void 0 : _a.call(this, "connecting");
    return new Promise((resolve, reject) => {
      const url = `ws://${signalingHost}:${port}`;
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({ type: "join_room", roomCode }));
      };
      this.ws.onmessage = async (e) => {
        var _a2, _b, _c, _d;
        const msg = JSON.parse(e.data);
        switch (msg.type) {
          case "peer_joined":
            await this.createOffer();
            resolve();
            break;
          case "offer":
            await this.handleOffer(msg.sdp);
            resolve();
            break;
          case "answer":
            await ((_a2 = this.pc) == null ? void 0 : _a2.setRemoteDescription(msg.sdp));
            (_b = this.onStatusChange) == null ? void 0 : _b.call(this, "connected");
            break;
          case "ice_candidate":
            await ((_c = this.pc) == null ? void 0 : _c.addIceCandidate(msg.candidate));
            break;
          case "error":
            console.error("[ControllerWebRTC] Signaling error:", msg.message);
            reject(new Error(msg.message));
            break;
          case "peer_left":
            (_d = this.onStatusChange) == null ? void 0 : _d.call(this, "disconnected");
            break;
        }
      };
      this.ws.onerror = () => reject(new Error("Signaling connection failed"));
      this.ws.onclose = () => {
        var _a2;
        return (_a2 = this.onStatusChange) == null ? void 0 : _a2.call(this, "disconnected");
      };
    });
  }
  /** Acquire mic and create WebRTC offer */
  async createOffer() {
    var _a;
    this.pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    this.pc.onicecandidate = (e) => {
      var _a2;
      if (e.candidate) {
        (_a2 = this.ws) == null ? void 0 : _a2.send(JSON.stringify({ type: "ice_candidate", candidate: e.candidate.toJSON() }));
      }
    };
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }
    });
    this.audioTrack = this.stream.getAudioTracks()[0];
    this.audioTrack.enabled = false;
    this.pc.addTrack(this.audioTrack, this.stream);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    (_a = this.ws) == null ? void 0 : _a.send(JSON.stringify({ type: "offer", sdp: this.pc.localDescription }));
  }
  /** Handle incoming offer from desktop */
  async handleOffer(sdp) {
    var _a, _b;
    this.pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    this.pc.onicecandidate = (e) => {
      var _a2;
      if (e.candidate) {
        (_a2 = this.ws) == null ? void 0 : _a2.send(JSON.stringify({ type: "ice_candidate", candidate: e.candidate.toJSON() }));
      }
    };
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }
    });
    this.audioTrack = this.stream.getAudioTracks()[0];
    this.audioTrack.enabled = false;
    this.pc.addTrack(this.audioTrack, this.stream);
    await this.pc.setRemoteDescription(sdp);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    (_a = this.ws) == null ? void 0 : _a.send(JSON.stringify({ type: "answer", sdp: this.pc.localDescription }));
    (_b = this.onStatusChange) == null ? void 0 : _b.call(this, "connected");
  }
  /** Enable/disable mic track (called by PTT) */
  setMicEnabled(enabled) {
    if (this.audioTrack) {
      this.audioTrack.enabled = enabled;
    }
  }
  /** Disconnect everything */
  disconnect() {
    var _a, _b, _c, _d;
    (_a = this.audioTrack) == null ? void 0 : _a.stop();
    (_b = this.pc) == null ? void 0 : _b.close();
    (_c = this.ws) == null ? void 0 : _c.close();
    this.stream = null;
    this.audioTrack = null;
    this.pc = null;
    this.ws = null;
    this.roomCode = null;
    (_d = this.onStatusChange) == null ? void 0 : _d.call(this, "disconnected");
  }
}
function formatTime(ms) {
  const s = Math.floor(ms / 1e3);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
const DeckPanel = ({ deck, id }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1, padding: 8, borderRight: id === "A" ? "1px solid #333" : "none" }, children: [
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 10, color: "#888", marginBottom: 2 }, children: [
    "DECK ",
    id
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
    lineNumber: 50,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 13, fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: deck.trackName || "—" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
    lineNumber: 51,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 11, color: "#aaa", display: "flex", gap: 8, marginTop: 2 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: deck.effectiveBPM > 0 ? `${deck.effectiveBPM.toFixed(1)} BPM` : "" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 55,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: deck.musicalKey ?? "" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 56,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { marginLeft: "auto" }, children: formatTime(deck.elapsedMs) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 57,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
    lineNumber: 54,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 6, marginTop: 6 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Btn, { label: deck.isPlaying ? "⏸" : "▶", color: deck.isPlaying ? "#22c55e" : "#555", onTap: () => call("dj_toggle_play", { deckId: id }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 61,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Btn, { label: "■", color: "#555", onTap: () => call("dj_stop", { deckId: id }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 62,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Btn, { label: "SYNC", color: "#3b82f6", onTap: () => call("dj_sync", { deckId: id }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 63,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
    lineNumber: 60,
    columnNumber: 5
  }, void 0),
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 4, marginTop: 6 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KillBtn, { label: "LO", active: deck.eqLowKill, onTap: () => call("dj_eq_kill", { deckId: id, band: "low", kill: !deck.eqLowKill }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 67,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KillBtn, { label: "MID", active: deck.eqMidKill, onTap: () => call("dj_eq_kill", { deckId: id, band: "mid", kill: !deck.eqMidKill }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 68,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(KillBtn, { label: "HI", active: deck.eqHighKill, onTap: () => call("dj_eq_kill", { deckId: id, band: "high", kill: !deck.eqHighKill }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 69,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
    lineNumber: 66,
    columnNumber: 5
  }, void 0)
] }, void 0, true, {
  fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
  lineNumber: 49,
  columnNumber: 3
}, void 0);
const Btn = ({ label, color, onTap }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  "button",
  {
    onPointerDown: onTap,
    style: {
      flex: 1,
      padding: "8px 0",
      border: `1px solid ${color}`,
      borderRadius: 6,
      background: `${color}22`,
      color,
      fontSize: 13,
      fontWeight: "bold",
      cursor: "pointer",
      touchAction: "manipulation"
    },
    children: label
  },
  void 0,
  false,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
    lineNumber: 75,
    columnNumber: 3
  },
  void 0
);
const KillBtn = ({ label, active, onTap }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
  "button",
  {
    onPointerDown: onTap,
    style: {
      flex: 1,
      padding: "6px 0",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: "bold",
      background: active ? "#ef4444" : "#222",
      color: active ? "#fff" : "#888",
      border: `1px solid ${active ? "#ef4444" : "#444"}`,
      cursor: "pointer",
      touchAction: "manipulation"
    },
    children: label
  },
  void 0,
  false,
  {
    fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
    lineNumber: 88,
    columnNumber: 3
  },
  void 0
);
const Crossfader = ({ value }) => {
  const trackRef = reactExports.useRef(null);
  const dragging = reactExports.useRef(false);
  const handleMove = reactExports.useCallback((clientX) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    call("dj_crossfader", { position: pos });
  }, []);
  const onDown = reactExports.useCallback((e) => {
    dragging.current = true;
    e.target.setPointerCapture(e.pointerId);
    handleMove(e.clientX);
  }, [handleMove]);
  const onMove = reactExports.useCallback((e) => {
    if (dragging.current) handleMove(e.clientX);
  }, [handleMove]);
  const onUp = reactExports.useCallback(() => {
    dragging.current = false;
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: "8px 12px" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "#666", marginBottom: 4 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "A" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 128,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "CROSSFADER" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 128,
        columnNumber: 23
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "B" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 128,
        columnNumber: 46
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 127,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        ref: trackRef,
        onPointerDown: onDown,
        onPointerMove: onMove,
        onPointerUp: onUp,
        onPointerCancel: onUp,
        style: {
          position: "relative",
          height: 36,
          background: "#222",
          borderRadius: 6,
          border: "1px solid #444",
          touchAction: "none",
          cursor: "pointer"
        },
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            style: {
              position: "absolute",
              top: 2,
              width: 40,
              height: 32,
              borderRadius: 4,
              background: "#66ccff",
              left: `calc(${value * 100}% - 20px)`,
              transition: dragging.current ? "none" : "left 0.05s"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
            lineNumber: 141,
            columnNumber: 9
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 130,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
    lineNumber: 126,
    columnNumber: 5
  }, void 0);
};
const PTTButton = ({ duckEnabled, webrtc }) => {
  const [live, setLive] = reactExports.useState(false);
  const liveRef = reactExports.useRef(false);
  const onDown = reactExports.useCallback(() => {
    if (liveRef.current) return;
    liveRef.current = true;
    setLive(true);
    console.log("[PTT] DOWN — duck:", duckEnabled);
    webrtc == null ? void 0 : webrtc.setMicEnabled(true);
    if (duckEnabled) call("dj_duck", {}).catch(() => {
    });
  }, [duckEnabled, webrtc]);
  const onUp = reactExports.useCallback(() => {
    if (!liveRef.current) return;
    liveRef.current = false;
    setLive(false);
    console.log("[PTT] UP — unduck:", duckEnabled);
    webrtc == null ? void 0 : webrtc.setMicEnabled(false);
    if (duckEnabled) call("dj_unduck", {}).catch(() => {
    });
  }, [duckEnabled, webrtc]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      onTouchStart: (e) => {
        e.preventDefault();
        onDown();
      },
      onTouchEnd: (e) => {
        e.preventDefault();
        onUp();
      },
      onTouchCancel: onUp,
      onPointerDown: onDown,
      onPointerUp: onUp,
      onPointerLeave: onUp,
      onPointerCancel: onUp,
      style: {
        width: "100%",
        padding: "18px 0",
        borderRadius: 8,
        fontSize: 18,
        fontWeight: "bold",
        border: "none",
        cursor: "pointer",
        touchAction: "manipulation",
        background: live ? "#22c55e" : "#333",
        color: live ? "#fff" : "#aaa",
        boxShadow: live ? "0 0 20px rgba(34,197,94,0.4)" : "none",
        transition: "all 0.05s"
      },
      children: live ? "LIVE" : "TALK"
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 178,
      columnNumber: 5
    },
    void 0
  );
};
const PairingScreen = ({ onConnect }) => {
  const [host, setHost] = reactExports.useState("");
  const [error, setError] = reactExports.useState("");
  reactExports.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const h = params.get("host");
    const room = params.get("room") || void 0;
    if (h) {
      setHost(h);
      onConnect(h, room);
    }
  }, [onConnect]);
  const handleConnect = () => {
    if (!host) {
      setError("Enter the desktop IP");
      return;
    }
    setError("");
    onConnect(host);
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, padding: 24 }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 24, fontWeight: "bold" }, children: "DEViLBOX" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 224,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 14, color: "#888" }, children: "Remote Controller" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 225,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "input",
      {
        type: "text",
        placeholder: "Desktop IP (e.g. 192.168.1.42)",
        value: host,
        onChange: (e) => setHost(e.target.value),
        style: {
          width: "100%",
          maxWidth: 300,
          padding: "12px 16px",
          borderRadius: 8,
          border: "1px solid #444",
          background: "#222",
          color: "#eee",
          fontSize: 16,
          textAlign: "center"
        }
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 226,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: handleConnect,
        style: {
          width: "100%",
          maxWidth: 300,
          padding: "14px 0",
          borderRadius: 8,
          border: "none",
          background: "#3b82f6",
          color: "#fff",
          fontSize: 16,
          fontWeight: "bold",
          cursor: "pointer"
        },
        children: "Connect"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 237,
        columnNumber: 7
      },
      void 0
    ),
    error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { color: "#ef4444", fontSize: 13 }, children: error }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 247,
      columnNumber: 17
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
    lineNumber: 223,
    columnNumber: 5
  }, void 0);
};
const ControllerApp = () => {
  const [connected, setConnected] = reactExports.useState(false);
  const [paired, setPaired] = reactExports.useState(false);
  const [state, setState] = reactExports.useState(null);
  const [duckEnabled, setDuckEnabled] = reactExports.useState(false);
  const [micStatus, setMicStatus] = reactExports.useState("");
  const pollRef = reactExports.useRef(void 0);
  const webrtcRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    var _a;
    let lock = null;
    (_a = navigator.wakeLock) == null ? void 0 : _a.request("screen").then((l) => {
      lock = l;
    }).catch(() => {
    });
    return () => {
      lock == null ? void 0 : lock.release();
    };
  }, []);
  setStatusCallback(setConnected);
  const handleConnect = reactExports.useCallback(async (host, roomCode) => {
    try {
      await connect(host, 4003);
      setPaired(true);
      pollRef.current = setInterval(async () => {
        try {
          const data = await call("dj_get_state");
          setState(data);
        } catch {
        }
      }, 200);
      if (roomCode) {
        try {
          const rtc = new ControllerWebRTC();
          rtc.onStatusChange = (s2) => setMicStatus(s2);
          await rtc.connect(host, roomCode, 4002);
          webrtcRef.current = rtc;
          setMicStatus("connected");
        } catch (err) {
          console.warn("[Controller] WebRTC mic failed (controls still work):", err);
          setMicStatus("failed");
        }
      }
    } catch (err) {
      console.error("[Controller] Connection failed:", err);
    }
  }, []);
  reactExports.useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);
  if (!paired) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PairingScreen, { onConnect: handleConnect }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 308,
      columnNumber: 12
    }, void 0);
  }
  const s = state;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", flexDirection: "column", height: "100%", background: "#111" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", background: "#1a1a1a", borderBottom: "1px solid #333", fontSize: 11 }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: "#888" }, children: "DEViLBOX Controller" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 317,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { style: { color: connected ? "#22c55e" : "#ef4444" }, children: connected ? "● Connected" : "● Disconnected" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 318,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 316,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", borderBottom: "1px solid #333" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckPanel, { deck: (s == null ? void 0 : s.decks.A) ?? emptyDeck, id: "A" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 323,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckPanel, { deck: (s == null ? void 0 : s.decks.B) ?? emptyDeck, id: "B" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 324,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 322,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Crossfader, { value: (s == null ? void 0 : s.crossfaderPosition) ?? 0.5 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 328,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, padding: "4px 12px" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FXPad, { label: "HPF A", onDown: () => call("dj_filter", { deckId: "A", position: -0.8 }), onUp: () => call("dj_filter", { deckId: "A", position: 0 }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 332,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FXPad, { label: "LPF A", onDown: () => call("dj_filter", { deckId: "A", position: 0.8 }), onUp: () => call("dj_filter", { deckId: "A", position: 0 }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 333,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FXPad, { label: "HPF B", onDown: () => call("dj_filter", { deckId: "B", position: -0.8 }), onUp: () => call("dj_filter", { deckId: "B", position: 0 }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 334,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FXPad, { label: "LPF B", onDown: () => call("dj_filter", { deckId: "B", position: 0.8 }), onUp: () => call("dj_filter", { deckId: "B", position: 0 }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 335,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 331,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", gap: 6, padding: "6px 12px" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onPointerDown: () => (s == null ? void 0 : s.autoDJEnabled) ? call("dj_auto_dj_disable") : call("dj_auto_dj_enable"),
          style: {
            flex: 1,
            padding: "10px 0",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: "bold",
            border: "none",
            cursor: "pointer",
            touchAction: "manipulation",
            background: (s == null ? void 0 : s.autoDJEnabled) ? "#22c55e" : "#333",
            color: (s == null ? void 0 : s.autoDJEnabled) ? "#fff" : "#aaa"
          },
          children: (s == null ? void 0 : s.autoDJEnabled) ? "STOP AUTO DJ" : "AUTO DJ"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
          lineNumber: 340,
          columnNumber: 9
        },
        void 0
      ),
      (s == null ? void 0 : s.autoDJEnabled) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onPointerDown: () => call("dj_auto_dj_skip"),
          style: {
            padding: "10px 16px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: "bold",
            border: "1px solid #444",
            background: "#222",
            color: "#aaa",
            cursor: "pointer",
            touchAction: "manipulation"
          },
          children: "SKIP"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
          lineNumber: 351,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 339,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { flex: 1 } }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 364,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { padding: "8px 12px 16px" }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { style: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#888", cursor: "pointer" }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("input", { type: "checkbox", checked: duckEnabled, onChange: () => setDuckEnabled(!duckEnabled) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
          lineNumber: 370,
          columnNumber: 13
        }, void 0),
        "Duck music while talking"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 369,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 368,
        columnNumber: 9
      }, void 0),
      micStatus && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { fontSize: 10, color: micStatus === "connected" ? "#22c55e" : "#888", marginBottom: 4 }, children: [
        "Mic: ",
        micStatus
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 374,
        columnNumber: 23
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PTTButton, { duckEnabled, webrtc: webrtcRef.current }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
        lineNumber: 375,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 367,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
    lineNumber: 314,
    columnNumber: 5
  }, void 0);
};
const FXPad = ({ label, onDown, onUp }) => {
  const [pressed, setPressed] = reactExports.useState(false);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      onTouchStart: (e) => {
        e.preventDefault();
        setPressed(true);
        onDown();
      },
      onTouchEnd: (e) => {
        e.preventDefault();
        setPressed(false);
        onUp();
      },
      onTouchCancel: () => {
        setPressed(false);
        onUp();
      },
      onPointerDown: () => {
        setPressed(true);
        onDown();
      },
      onPointerUp: () => {
        setPressed(false);
        onUp();
      },
      onPointerLeave: () => {
        if (pressed) {
          setPressed(false);
          onUp();
        }
      },
      onPointerCancel: () => {
        if (pressed) {
          setPressed(false);
          onUp();
        }
      },
      style: {
        padding: "12px 0",
        borderRadius: 6,
        fontSize: 10,
        fontWeight: "bold",
        border: `1px solid ${pressed ? "#66ccff" : "#444"}`,
        background: pressed ? "#66ccff22" : "#1a1a1a",
        color: pressed ? "#66ccff" : "#888",
        cursor: "pointer",
        touchAction: "manipulation"
      },
      children: label
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/controller/ControllerApp.tsx",
      lineNumber: 386,
      columnNumber: 5
    },
    void 0
  );
};
const emptyDeck = {
  isPlaying: false,
  trackName: "",
  effectiveBPM: 0,
  elapsedMs: 0,
  durationMs: 0,
  volume: 1,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  eqLowKill: false,
  eqMidKill: false,
  eqHighKill: false,
  filterPosition: 0,
  musicalKey: null
};
clientExports.createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(React.StrictMode, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ControllerApp, {}, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/controller/main.tsx",
    lineNumber: 7,
    columnNumber: 5
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/controller/main.tsx",
    lineNumber: 6,
    columnNumber: 3
  }, void 0)
);
