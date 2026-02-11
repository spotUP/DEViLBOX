(function () {
    const e = document.createElement("link").relList;
    if (e && e.supports && e.supports("modulepreload")) return;
    for (const a of document.querySelectorAll('link[rel="modulepreload"]')) n(a);
    new MutationObserver((a) => {
        for (const o of a)
            if (o.type === "childList")
                for (const s of o.addedNodes) s.tagName === "LINK" && s.rel === "modulepreload" && n(s);
    }).observe(document, { childList: !0, subtree: !0 });
    function t(a) {
        const o = {};
        return (
            a.integrity && (o.integrity = a.integrity),
            a.referrerPolicy && (o.referrerPolicy = a.referrerPolicy),
            a.crossOrigin === "use-credentials"
                ? (o.credentials = "include")
                : a.crossOrigin === "anonymous"
                  ? (o.credentials = "omit")
                  : (o.credentials = "same-origin"),
            o
        );
    }
    function n(a) {
        if (a.ep) return;
        a.ep = !0;
        const o = t(a);
        fetch(a.href, o);
    }
})();
const H = "modulepreload",
    j = function (i) {
        return "/" + i;
    },
    U = {},
    J = function (e, t, n) {
        let a = Promise.resolve();
        if (t && t.length > 0) {
            document.getElementsByTagName("link");
            const s = document.querySelector("meta[property=csp-nonce]"),
                r = (s == null ? void 0 : s.nonce) || (s == null ? void 0 : s.getAttribute("nonce"));
            a = Promise.allSettled(
                t.map((l) => {
                    if (((l = j(l)), l in U)) return;
                    U[l] = !0;
                    const c = l.endsWith(".css"),
                        d = c ? '[rel="stylesheet"]' : "";
                    if (document.querySelector(`link[href="${l}"]${d}`)) return;
                    const u = document.createElement("link");
                    if (
                        ((u.rel = c ? "stylesheet" : H),
                        c || (u.as = "script"),
                        (u.crossOrigin = ""),
                        (u.href = l),
                        r && u.setAttribute("nonce", r),
                        document.head.appendChild(u),
                        c)
                    )
                        return new Promise((g, E) => {
                            u.addEventListener("load", g),
                                u.addEventListener("error", () => E(new Error(`Unable to preload CSS for ${l}`)));
                        });
                })
            );
        }
        function o(s) {
            const r = new Event("vite:preloadError", { cancelable: !0 });
            if (((r.payload = s), window.dispatchEvent(r), !r.defaultPrevented)) throw s;
        }
        return a.then((s) => {
            for (const r of s || []) r.status === "rejected" && o(r.reason);
            return e().catch(o);
        });
    };
class Z {
    constructor(e) {
        if (
            ((this.canvas = document.getElementById(e)),
            (this.gl = this.canvas.getContext("webgl") || this.canvas.getContext("experimental-webgl")),
            !this.gl)
        ) {
            console.error("WebGL not supported");
            return;
        }
        (this.waveformData = new Uint8Array(2048)),
            (this.time = 0),
            (this.isRunning = !1),
            (this.envelopeLevel = 0),
            (this.attackCoeff = 0.05),
            this.initShaders(),
            this.initBuffers(),
            this.resize(),
            window.addEventListener("resize", () => this.resize());
    }
    initShaders() {
        const e = this.gl,
            t = `
            attribute vec2 position;
            void main() {
                gl_Position = vec4(position, 0.0, 1.0);
            }
        `,
            n = `
            precision highp float;

            uniform vec2 resolution;
            uniform float time;
            uniform sampler2D waveformTexture;
            uniform float audioLevel;
            uniform float brightness;
            uniform float cutoff;
            uniform float resonance;
            uniform float manualSegments;
            uniform float manualRotationSpeed;
            uniform float manualColorSpeed;
            uniform float manualTileSize;
            uniform float manualSpinSpeed;

            // Hash function for noise
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }

            // Get waveform sample
            float getWaveform(float x) {
                return texture2D(waveformTexture, vec2(fract(x), 0.5)).r;
            }

            void main() {
                vec2 uv = gl_FragCoord.xy / resolution;

                // GLOBAL SPIN - Rotate entire canvas/visualizer
                // This MUST be at the start to rotate everything
                float globalSpin = -time * 1.0 * manualSpinSpeed;  // Faster, negative for clockwise
                if (abs(manualSpinSpeed) > 0.01) {
                    vec2 spinCenter = uv - 0.5;
                    float cSpin = cos(globalSpin);
                    float sSpin = sin(globalSpin);
                    spinCenter = vec2(
                        spinCenter.x * cSpin - spinCenter.y * sSpin,
                        spinCenter.x * sSpin + spinCenter.y * cSpin
                    );
                    uv = spinCenter + 0.5;
                }

                vec2 center = uv - 0.5;

                // First rotation BEFORE tessellation (slow, counter-clockwise)
                float preRot = time * 0.05;
                float c1 = cos(preRot);
                float s1 = sin(preRot);
                center = vec2(center.x * c1 - center.y * s1, center.x * s1 + center.y * c1);

                // Aggressive kaleidoscope tessellation
                float angle = atan(center.y, center.x);
                float radius = length(center);

                // Kaleidoscope segments (manual control + audio + resonance modulation)
                float audioBoost = floor(4.0 * audioLevel);
                float resBoost = resonance * 4.0;
                float segments = manualSegments + audioBoost + resBoost;
                float segmentAngle = 6.28318 / segments;

                // Fold angle into one segment with mirroring
                float foldedAngle = mod(angle, segmentAngle);
                float segmentIndex = floor(angle / segmentAngle);

                // Mirror every other segment for more symmetry
                if (mod(segmentIndex, 2.0) > 0.5) {
                    foldedAngle = segmentAngle - foldedAngle;
                }

                // Reconstruct position
                vec2 kaleido = vec2(cos(foldedAngle), sin(foldedAngle)) * radius;

                // Add tiling/repetition for ravey effect (manual control + cutoff modulation)
                float tileVariation = manualTileSize * (1.0 + cutoff * 0.5);
                float tileSize = 0.15 * manualTileSize + 0.1 * sin(time * tileVariation);
                vec2 tiled = fract(kaleido / tileSize) - 0.5;
                tiled *= tileSize;

                // Second rotation AFTER tessellation (manual speed + resonance boost)
                float rotSpeed = 0.08 * manualRotationSpeed * (1.0 + resonance * 0.5);
                float postRot = time * -rotSpeed;
                float c2 = cos(postRot);
                float s2 = sin(postRot);
                tiled = vec2(tiled.x * c2 - tiled.y * s2, tiled.x * s2 + tiled.y * c2);
                tiled += 0.5;

                // Pixelation - create discrete pixel grid
                float pixelSize = 0.006 + 0.002 * sin(time);
                vec2 pixelUV = floor(tiled / pixelSize) * pixelSize;

                // Dark background with subtle grid
                vec3 color = vec3(0.02, 0.01, 0.03);

                // Add subtle grid lines
                float gridX = step(0.98, fract(tiled.x / pixelSize));
                float gridY = step(0.98, fract(tiled.y / pixelSize));
                color += vec3(0.05, 0.05, 0.08) * max(gridX, gridY);

                // Get waveform value
                float wave = getWaveform(pixelUV.x);
                float waveY = 0.5 + (wave - 0.5) * 0.4 * (1.0 + audioLevel);

                // Calculate distance to waveform (pixelated)
                float pixelY = floor(pixelUV.y / pixelSize) * pixelSize;
                float wavePixelY = floor(waveY / pixelSize) * pixelSize;

                // Draw dots/pixels on the waveform
                float dotThickness = pixelSize * 3.0;
                float dist = abs(pixelY - wavePixelY);

                // Discrete dot rendering (no blur!)
                if (dist < dotThickness) {
                    // Rainbow color based on position and time (manual speed + cutoff boost)
                    float colorSpeed = 0.3 * manualColorSpeed * (1.0 + cutoff * 0.5);
                    float hue = fract(time * colorSpeed + pixelUV.x * 2.0 + segmentIndex * 0.1);

                    // Color saturation (original formula - high resonance = more white/bright)
                    float saturation = 0.5 + resonance * 0.5;
                    vec3 dotColor = vec3(
                        saturation + (1.0 - saturation) * sin(hue * 6.28318),
                        saturation + (1.0 - saturation) * sin(hue * 6.28318 + 2.09439),
                        saturation + (1.0 - saturation) * sin(hue * 6.28318 + 4.18879)
                    );

                    // Boost brightness for visibility
                    dotColor *= 1.5 + audioLevel;

                    // Sharp pixels - no smoothing
                    color = dotColor;

                    // Add phosphor dot effect - make circular pixels
                    vec2 pixelCenter = (floor(gl_FragCoord.xy / (pixelSize * resolution)) + 0.5) * (pixelSize * resolution);
                    float pixelDist = length(gl_FragCoord.xy - pixelCenter) / (pixelSize * resolution.x * 0.5);
                    if (pixelDist > 1.0) {
                        color *= 0.3; // Dim the corners of pixels for round CRT look
                    }
                }

                // Add multiple waveform layers with different colors
                for (float layer = 1.0; layer <= 3.0; layer += 1.0) {
                    float layerOffset = layer * 0.1;
                    float wave2 = getWaveform(pixelUV.x + layerOffset);
                    float waveY2 = 0.5 + (wave2 - 0.5) * 0.3 * (1.0 + audioLevel * 0.5);
                    float wavePixelY2 = floor(waveY2 / pixelSize) * pixelSize;
                    float dist2 = abs(pixelY - wavePixelY2);

                    if (dist2 < dotThickness * 0.7) {
                        float hue2 = fract(time * 0.3 + pixelUV.x * 2.0 + layer * 0.2);
                        vec3 layerColor = vec3(
                            0.5 + 0.5 * sin(hue2 * 6.28318),
                            0.5 + 0.5 * sin(hue2 * 6.28318 + 2.09439),
                            0.5 + 0.5 * sin(hue2 * 6.28318 + 4.18879)
                        ) * (0.5 / layer);

                        color += layerColor;
                    }
                }

                // Scanlines for retro CRT effect
                float scanline = step(0.5, fract(gl_FragCoord.y * 0.5));
                color *= 0.85 + scanline * 0.15;

                // Vignette
                float vignette = 1.0 - length(center) * 0.6;
                vignette = smoothstep(0.0, 1.0, vignette);
                color *= vignette;

                // Random phosphor noise (very subtle)
                float noise = hash(gl_FragCoord.xy + time * 10.0) * 0.08;
                color += noise;

                // Apply brightness envelope (fade to black when no audio)
                color *= brightness;

                gl_FragColor = vec4(color, 1.0);
            }
        `,
            a = this.compileShader(e.VERTEX_SHADER, t),
            o = this.compileShader(e.FRAGMENT_SHADER, n);
        if (
            ((this.program = e.createProgram()),
            e.attachShader(this.program, a),
            e.attachShader(this.program, o),
            e.linkProgram(this.program),
            !e.getProgramParameter(this.program, e.LINK_STATUS))
        ) {
            console.error("Shader program failed to link:", e.getProgramInfoLog(this.program));
            return;
        }
        (this.uniforms = {
            resolution: e.getUniformLocation(this.program, "resolution"),
            time: e.getUniformLocation(this.program, "time"),
            waveformTexture: e.getUniformLocation(this.program, "waveformTexture"),
            audioLevel: e.getUniformLocation(this.program, "audioLevel"),
            brightness: e.getUniformLocation(this.program, "brightness"),
            cutoff: e.getUniformLocation(this.program, "cutoff"),
            resonance: e.getUniformLocation(this.program, "resonance"),
            manualSegments: e.getUniformLocation(this.program, "manualSegments"),
            manualRotationSpeed: e.getUniformLocation(this.program, "manualRotationSpeed"),
            manualColorSpeed: e.getUniformLocation(this.program, "manualColorSpeed"),
            manualTileSize: e.getUniformLocation(this.program, "manualTileSize"),
            manualSpinSpeed: e.getUniformLocation(this.program, "manualSpinSpeed"),
        }),
            (this.positionLocation = e.getAttribLocation(this.program, "position"));
    }
    compileShader(e, t) {
        const n = this.gl,
            a = n.createShader(e);
        return (
            n.shaderSource(a, t),
            n.compileShader(a),
            n.getShaderParameter(a, n.COMPILE_STATUS)
                ? a
                : (console.error("Shader compilation error:", n.getShaderInfoLog(a)), n.deleteShader(a), null)
        );
    }
    initBuffers() {
        const e = this.gl,
            t = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        (this.vertexBuffer = e.createBuffer()),
            e.bindBuffer(e.ARRAY_BUFFER, this.vertexBuffer),
            e.bufferData(e.ARRAY_BUFFER, t, e.STATIC_DRAW),
            (this.waveformTexture = e.createTexture()),
            e.bindTexture(e.TEXTURE_2D, this.waveformTexture),
            e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE),
            e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE),
            e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, e.LINEAR),
            e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, e.LINEAR);
    }
    resize() {
        (this.canvas.width = window.innerWidth),
            (this.canvas.height = window.innerHeight),
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    updateWaveform(e) {
        for (let t = 0; t < e.length; t++) this.waveformData[t] = e[t];
    }
    render() {
        if (!this.isRunning) return;
        const e = this.gl;
        e.clearColor(0, 0, 0, 1),
            e.clear(e.COLOR_BUFFER_BIT),
            e.useProgram(this.program),
            e.activeTexture(e.TEXTURE0),
            e.bindTexture(e.TEXTURE_2D, this.waveformTexture),
            e.texImage2D(
                e.TEXTURE_2D,
                0,
                e.LUMINANCE,
                this.waveformData.length,
                1,
                0,
                e.LUMINANCE,
                e.UNSIGNED_BYTE,
                this.waveformData
            );
        let t = 0;
        for (let w = 0; w < this.waveformData.length; w++) {
            const y = this.waveformData[w] / 255 - 0.5;
            t += y * y;
        }
        const n = Math.sqrt(t / this.waveformData.length) * 10,
            a = n > 0.1 ? Math.min(1, 0.75 + n * 0.25) : 0;
        if (a > this.envelopeLevel) this.envelopeLevel += (a - this.envelopeLevel) * this.attackCoeff;
        else {
            const w = window.vizReleaseCoeff !== void 0 ? window.vizReleaseCoeff : 0.97;
            this.envelopeLevel *= w;
        }
        const o = this.envelopeLevel < 0.75 ? this.envelopeLevel / 0.75 : this.envelopeLevel,
            s = window.vizBrightnessGain !== void 0 ? window.vizBrightnessGain : 1,
            r = o * s,
            l = window.synthCutoff !== void 0 ? window.synthCutoff : 0.5,
            c = window.synthResonance !== void 0 ? window.synthResonance : 0.5,
            d = window.vizSegments !== void 0 ? window.vizSegments : 12,
            u = window.vizRotationSpeed !== void 0 ? window.vizRotationSpeed : 1,
            g = window.vizColorSpeed !== void 0 ? window.vizColorSpeed : 1,
            E = window.vizTileSize !== void 0 ? window.vizTileSize : 1,
            M = window.vizSpinSpeed !== void 0 ? window.vizSpinSpeed : -0.05;
        e.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height),
            e.uniform1f(this.uniforms.time, this.time),
            e.uniform1i(this.uniforms.waveformTexture, 0),
            e.uniform1f(this.uniforms.audioLevel, n),
            e.uniform1f(this.uniforms.brightness, r),
            e.uniform1f(this.uniforms.cutoff, l),
            e.uniform1f(this.uniforms.resonance, c),
            e.uniform1f(this.uniforms.manualSegments, d),
            e.uniform1f(this.uniforms.manualRotationSpeed, u),
            e.uniform1f(this.uniforms.manualColorSpeed, g),
            e.uniform1f(this.uniforms.manualTileSize, E),
            e.uniform1f(this.uniforms.manualSpinSpeed, M),
            e.bindBuffer(e.ARRAY_BUFFER, this.vertexBuffer),
            e.enableVertexAttribArray(this.positionLocation),
            e.vertexAttribPointer(this.positionLocation, 2, e.FLOAT, !1, 0, 0),
            e.drawArrays(e.TRIANGLE_STRIP, 0, 4),
            (this.time += 0.016),
            requestAnimationFrame(() => this.render());
    }
    start() {
        this.isRunning || ((this.isRunning = !0), this.render());
    }
    stop() {
        this.isRunning = !1;
    }
}
function X(i, e) {
    let t = "";
    for (let n = 0; n < e; n++) {
        const a = i[n];
        if (!a) continue;
        const o = ((a.key + 1) << 4) | (a.octave + 1),
            s = (a.gate ? 1 : 0) | (a.accent ? 2 : 0) | (a.slide ? 4 : 0) | (a.mute ? 8 : 0) | (a.hammer ? 16 : 0);
        (t += o.toString(16).padStart(2, "0")), (t += s.toString(16).padStart(2, "0"));
    }
    return BigInt("0x" + t).toString(36);
}
function Q(i) {
    try {
        let e = 0n;
        for (const o of i.toLowerCase()) {
            const s = o >= "0" && o <= "9" ? o.charCodeAt(0) - 48 : o.charCodeAt(0) - 87;
            e = e * 36n + BigInt(s);
        }
        let t = e.toString(16);
        for (; t.length % 4 !== 0; ) t = "0" + t;
        const n = t.length / 4;
        if (n < 1 || n > 32) return null;
        const a = [];
        for (let o = 0; o < n; o++) {
            const s = parseInt(t.slice(o * 4, o * 4 + 2), 16),
                r = parseInt(t.slice(o * 4 + 2, o * 4 + 4), 16);
            a.push({
                key: ((s >> 4) & 15) - 1,
                octave: (s & 15) - 1,
                gate: !!(r & 1),
                accent: !!(r & 2),
                slide: !!(r & 4),
                mute: !!(r & 8),
                hammer: !!(r & 16),
            });
        }
        return { numSteps: n, steps: a };
    } catch (e) {
        return console.error("Failed to decode pattern:", e), null;
    }
}
function ee(i) {
    const e = i,
        t = [],
        n = (s) => Math.round(Math.max(0, Math.min(1, s)) * 255);
    t.push(n(e.waveform)),
        t.push(n(e.pulseWidth)),
        t.push(n(e.subOscGain)),
        t.push(n(e.subOscBlend)),
        t.push(n(e.cutoff)),
        t.push(n(e.resonance)),
        t.push(n(e.envMod)),
        t.push(n(e.decay)),
        t.push(n(e.accent)),
        t.push(n(e.normalDecay)),
        t.push(n(e.accentDecay)),
        t.push(n(e.softAttack)),
        t.push(n(e.accentSoftAttack ?? 0.5)),
        t.push(n(e.passbandCompensation)),
        t.push(n(e.resTracking ?? 0.7)),
        t.push(n(e.filterInputDrive)),
        t.push(Math.round(e.filterSelect) & 255),
        t.push(n(e.diodeCharacter)),
        t.push(n(((e.duffingAmount ?? 0) + 1) / 2)),
        t.push(n(e.filterFmDepth ?? 0)),
        t.push(n(e.lpBpMix ?? 0)),
        t.push(Math.round(e.lfoWaveform) & 255),
        t.push(n(e.lfoRate)),
        t.push(n(((e.lfoContour ?? 0) + 1) / 2)),
        t.push(n(e.lfoPitchDepth)),
        t.push(n(e.lfoPwmDepth)),
        t.push(n(e.lfoFilterDepth));
    const a = (e.delayTime - 0.25) / (16 - 0.25);
    t.push(n(a)),
        t.push(n(e.delayFeedback)),
        t.push(n(e.delayTone)),
        t.push(n(e.delayMix)),
        t.push(n(e.delaySpread ?? 0.75));
    let o = t.map((s) => s.toString(16).padStart(2, "0")).join("");
    return BigInt("0x" + o).toString(36);
}
function te(i) {
    try {
        let e = 0n;
        for (const d of i.toLowerCase()) {
            const u = d >= "0" && d <= "9" ? d.charCodeAt(0) - 48 : d.charCodeAt(0) - 87;
            e = e * 36n + BigInt(u);
        }
        let t = e.toString(16);
        const n = t.length;
        let a = 5,
            o = 64;
        for (
            n <= 48
                ? ((a = 1), (o = 48))
                : n <= 50
                  ? ((a = 2), (o = 50))
                  : n <= 60
                    ? ((a = 3), (o = 60))
                    : n <= 62 && ((a = 4), (o = 62));
            t.length < o;

        )
            t = "0" + t;
        if (t.length !== o) return console.error("Invalid synth settings length:", t.length), null;
        const s = [];
        for (let d = 0; d < t.length; d += 2) s.push(parseInt(t.slice(d, d + 2), 16));
        const r = (d) => d / 255;
        let l = 0;
        const c = {
            waveform: r(s[l++]),
            pulseWidth: r(s[l++]),
            subOscGain: r(s[l++]),
            subOscBlend: r(s[l++]),
            cutoff: r(s[l++]),
            resonance: r(s[l++]),
            envMod: r(s[l++]),
            decay: r(s[l++]),
            accent: r(s[l++]),
            normalDecay: r(s[l++]),
            accentDecay: r(s[l++]),
            softAttack: r(s[l++]),
        };
        return (
            a >= 3 ? (c.accentSoftAttack = r(s[l++])) : (c.accentSoftAttack = 0.5),
            (c.passbandCompensation = r(s[l++])),
            a >= 3 ? (c.resTracking = r(s[l++])) : (c.resTracking = 0.7),
            (c.filterInputDrive = r(s[l++])),
            (c.filterSelect = s[l++]),
            a >= 2 ? (c.diodeCharacter = r(s[l++])) : (c.diodeCharacter = 0),
            a >= 3
                ? ((c.duffingAmount = r(s[l++]) * 2 - 1), (c.filterFmDepth = r(s[l++])))
                : ((c.duffingAmount = 0), (c.filterFmDepth = 0)),
            a >= 5 ? (c.lpBpMix = r(s[l++])) : (c.lpBpMix = 0),
            (c.lfoWaveform = s[l++]),
            (c.lfoRate = r(s[l++])),
            a >= 4 ? (c.lfoContour = r(s[l++]) * 2 - 1) : (c.lfoContour = 0),
            (c.lfoPitchDepth = r(s[l++])),
            (c.lfoPwmDepth = r(s[l++])),
            (c.lfoFilterDepth = r(s[l++])),
            (c.delayTime = 0.25 + r(s[l++]) * (16 - 0.25)),
            (c.delayFeedback = r(s[l++])),
            (c.delayTone = r(s[l++])),
            (c.delayMix = r(s[l++])),
            a >= 3 ? (c.delaySpread = r(s[l++])) : (c.delaySpread = 0.75),
            c
        );
    } catch (e) {
        return console.error("Failed to decode synth settings:", e), null;
    }
}
const ne = {
        waveform: 0,
        pulseWidth: 1,
        subOscGain: 0,
        subOscBlend: 1,
        cutoff: 0.5,
        resonance: 0.5,
        envMod: 0.5,
        decay: 0.4,
        accent: 0.5,
        normalDecay: 0.5,
        accentDecay: 0.1,
        softAttack: 0,
        accentSoftAttack: 0.5,
        passbandCompensation: 0.9,
        resTracking: 0.7,
        filterInputDrive: 0,
        filterSelect: 1,
        diodeCharacter: 0,
        duffingAmount: 0,
        filterFmDepth: 0,
        lpBpMix: 0,
        stageNLAmount: 0,
        ensembleAmount: 0,
        oversamplingOrder: 2,
        korgStiffness: 0,
        korgWarmth: 0,
        korgFilterFm: 0,
        lfoWaveform: 0,
        lfoRate: 0,
        lfoContour: 0,
        lfoPitchDepth: 0,
        lfoPwmDepth: 0,
        lfoFilterDepth: 0,
        lfoStiffDepth: 0,
        chorusMode: 0,
        chorusMix: 0.5,
        phaserRate: 0.5,
        phaserWidth: 0.7,
        phaserFeedback: 0,
        phaserMix: 0,
        delayTime: 0.5,
        delayFeedback: 0,
        delayTone: 0.5,
        delayMix: 0,
        delaySpread: 0.75,
        extendedCutoff: !1,
        extendedEnvMod: !1,
        filterTracking: 0,
        slideTime: 0.17,
    },
    oe = { key: 0, octave: 0, gate: !0, accent: !1, slide: !1, mute: !1, hammer: !1 },
    N = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12 },
    ie = [
        { name: "Default", file: "default-pattern.xml" },
        { name: "Acid Trax (Phuture)", file: "acid-trax_phuture.xml" },
        { name: "Da Funk (Daft Punk)", file: "da-funk_daft-punk.xml" },
        { name: "Rip It Up (Orange Juice)", file: "rip-it-up-_orange_juice-1.xml" },
    ],
    W = {
        none: { name: "Chromatic", intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
        ionian: { name: "Ionian (Major)", intervals: [0, 2, 4, 5, 7, 9, 11] },
        dorian: { name: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
        phrygian: { name: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10] },
        lydian: { name: "Lydian", intervals: [0, 2, 4, 6, 7, 9, 11] },
        mixolydian: { name: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10] },
        aeolian: { name: "Aeolian (Minor)", intervals: [0, 2, 3, 5, 7, 8, 10] },
        locrian: { name: "Locrian", intervals: [0, 1, 3, 5, 6, 8, 10] },
    };
function G(i, e) {
    if (e === "none") return !0;
    const t = i % 12;
    return W[e].intervals.includes(t);
}
function ae(i) {
    if (i === "none") return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const e = [...W[i].intervals];
    return e.includes(0) && e.push(12), e;
}
function se(i, e, t, n, a) {
    let o = `<?xml version="1.0" encoding="UTF-8"?>
`;
    o += `<db303-pattern version="1.0" numSteps="${e}" tempo="${t}" swing="${n}" rootNote="${a}">
`;
    for (let s = 0; s < e; s++) {
        const r = i[s];
        (o += `  <step index="${s}" `),
            (o += `key="${r.key}" `),
            (o += `octave="${r.octave}" `),
            (o += `gate="${r.gate}" `),
            (o += `accent="${r.accent}" `),
            (o += `slide="${r.slide}" `),
            (o += `mute="${r.mute}" `),
            (o += `hammer="${r.hammer}"/>
`);
    }
    return (o += "</db303-pattern>"), o;
}
function re(i) {
    const t = new DOMParser().parseFromString(i, "text/xml");
    if (t.querySelector("parsererror")) throw new Error("Error parsing XML file");
    const a = t.querySelector("db303-pattern");
    if (!a) throw new Error("Invalid pattern file: missing db303-pattern root");
    const o = parseInt(a.getAttribute("numSteps") || "16"),
        s = parseFloat(a.getAttribute("tempo") || "120"),
        r = parseFloat(a.getAttribute("swing") || "0"),
        l = parseInt(a.getAttribute("rootNote") || "36"),
        c = t.querySelectorAll("step");
    if (c.length < 1 || c.length > 32) throw new Error("Invalid pattern: must have 1-32 steps");
    const d = [];
    return (
        c.forEach((u) => {
            d.push({
                key: parseInt(u.getAttribute("key") || "0"),
                octave: parseInt(u.getAttribute("octave") || "0"),
                gate: u.getAttribute("gate") === "true",
                accent: u.getAttribute("accent") === "true",
                slide: u.getAttribute("slide") === "true",
                mute: u.getAttribute("mute") === "true",
                hammer: u.getAttribute("hammer") === "true",
            });
        }),
        { numSteps: o, tempo: s, swing: r, rootNote: l, steps: d }
    );
}
function le(i) {
    let e = `<?xml version="1.0" encoding="UTF-8"?>
`;
    return (
        (e += `<db303-preset version="1.0">
`),
        (e += `  <oscillator>
`),
        (e += `    <waveform>${i.waveform}</waveform>
`),
        (e += `    <pulseWidth>${i.pulseWidth}</pulseWidth>
`),
        (e += `    <subOscGain>${i.subOscGain}</subOscGain>
`),
        (e += `    <subOscBlend>${i.subOscBlend}</subOscBlend>
`),
        (e += `  </oscillator>
`),
        (e += `  <filter>
`),
        (e += `    <cutoff>${i.cutoff}</cutoff>
`),
        (e += `    <resonance>${i.resonance}</resonance>
`),
        (e += `    <envMod>${i.envMod}</envMod>
`),
        (e += `    <decay>${i.decay}</decay>
`),
        (e += `    <accent>${i.accent}</accent>
`),
        (e += `  </filter>
`),
        (e += `  <devilfish>
`),
        (e += `    <normalDecay>${i.normalDecay}</normalDecay>
`),
        (e += `    <accentDecay>${i.accentDecay}</accentDecay>
`),
        (e += `    <softAttack>${i.softAttack}</softAttack>
`),
        (e += `    <accentSoftAttack>${i.accentSoftAttack}</accentSoftAttack>
`),
        (e += `    <passbandCompensation>${i.passbandCompensation}</passbandCompensation>
`),
        (e += `    <resTracking>${1 - i.resTracking}</resTracking>
`),
        (e += `    <filterInputDrive>${i.filterInputDrive}</filterInputDrive>
`),
        (e += `    <filterSelect>${i.filterSelect}</filterSelect>
`),
        (e += `    <diodeCharacter>${i.diodeCharacter}</diodeCharacter>
`),
        (e += `    <duffingAmount>${i.duffingAmount}</duffingAmount>
`),
        (e += `    <filterFmDepth>${i.filterFmDepth}</filterFmDepth>
`),
        (e += `    <lpBpMix>${i.lpBpMix}</lpBpMix>
`),
        (e += `    <stageNLAmount>${i.stageNLAmount}</stageNLAmount>
`),
        (e += `    <ensembleAmount>${i.ensembleAmount}</ensembleAmount>
`),
        (e += `    <oversamplingOrder>${i.oversamplingOrder}</oversamplingOrder>
`),
        (e += `    <filterTracking>${i.filterTracking}</filterTracking>
`),
        (e += `    <slideTime>${i.slideTime}</slideTime>
`),
        (e += `  </devilfish>
`),
        (e += `  <lfo>
`),
        (e += `    <waveform>${i.lfoWaveform}</waveform>
`),
        (e += `    <rate>${i.lfoRate}</rate>
`),
        (e += `    <contour>${i.lfoContour}</contour>
`),
        (e += `    <pitchDepth>${i.lfoPitchDepth}</pitchDepth>
`),
        (e += `    <pwmDepth>${i.lfoPwmDepth}</pwmDepth>
`),
        (e += `    <filterDepth>${i.lfoFilterDepth}</filterDepth>
`),
        (e += `  </lfo>
`),
        (e += `  <chorus>
`),
        (e += `    <mode>${i.chorusMode}</mode>
`),
        (e += `    <mix>${i.chorusMix}</mix>
`),
        (e += `  </chorus>
`),
        (e += `  <phaser>
`),
        (e += `    <rate>${i.phaserRate}</rate>
`),
        (e += `    <width>${i.phaserWidth}</width>
`),
        (e += `    <feedback>${i.phaserFeedback}</feedback>
`),
        (e += `    <mix>${i.phaserMix}</mix>
`),
        (e += `  </phaser>
`),
        (e += `  <delay>
`),
        (e += `    <time>${i.delayTime}</time>
`),
        (e += `    <feedback>${i.delayFeedback}</feedback>
`),
        (e += `    <tone>${i.delayTone}</tone>
`),
        (e += `    <mix>${i.delayMix}</mix>
`),
        (e += `    <spread>${i.delaySpread}</spread>
`),
        (e += `  </delay>
`),
        (e += "</db303-preset>"),
        e
    );
}
function ce(i) {
    const t = new DOMParser().parseFromString(i, "text/xml");
    if (t.querySelector("parsererror")) throw new Error("Error parsing XML file");
    if (!t.querySelector("db303-preset")) throw new Error("Invalid preset file: missing db303-preset root");
    const o = (l, c = null) => {
            const d = t.querySelector(l);
            if (!d) return c;
            const u = parseFloat(d.textContent || "");
            return isNaN(u) ? c : u;
        },
        s = (l, c = null) => {
            const d = t.querySelector(l);
            if (!d) return c;
            const u = parseInt(d.textContent || "");
            return isNaN(u) ? c : u;
        },
        r = o("devilfish resTracking");
    return {
        waveform: o("oscillator waveform") ?? void 0,
        pulseWidth: o("oscillator pulseWidth") ?? void 0,
        subOscGain: o("oscillator subOscGain") ?? void 0,
        subOscBlend: o("oscillator subOscBlend") ?? void 0,
        cutoff: o("filter cutoff") ?? void 0,
        resonance: o("filter resonance") ?? void 0,
        envMod: o("filter envMod") ?? void 0,
        decay: o("filter decay") ?? void 0,
        accent: o("filter accent") ?? void 0,
        normalDecay: o("devilfish normalDecay") ?? void 0,
        accentDecay: o("devilfish accentDecay") ?? void 0,
        softAttack: o("devilfish softAttack") ?? void 0,
        accentSoftAttack: o("devilfish accentSoftAttack") ?? void 0,
        passbandCompensation: o("devilfish passbandCompensation") ?? void 0,
        resTracking: r !== null ? 1 - r : void 0,
        filterInputDrive: o("devilfish filterInputDrive") ?? void 0,
        filterSelect: s("devilfish filterSelect"),
        diodeCharacter: o("devilfish diodeCharacter") ?? void 0,
        duffingAmount: o("devilfish duffingAmount") ?? void 0,
        filterFmDepth: o("devilfish filterFmDepth") ?? void 0,
        lpBpMix: o("devilfish lpBpMix", 0) ?? void 0,
        filterTracking: o("devilfish filterTracking", 0) ?? void 0,
        slideTime: o("devilfish slideTime", 0.17) ?? void 0,
        lfoWaveform: s("lfo waveform"),
        lfoRate: o("lfo rate") ?? void 0,
        lfoContour: o("lfo contour", 0) ?? void 0,
        lfoPitchDepth: o("lfo pitchDepth") ?? void 0,
        lfoPwmDepth: o("lfo pwmDepth") ?? void 0,
        lfoFilterDepth: o("lfo filterDepth") ?? void 0,
        chorusMode: s("chorus mode", 0),
        chorusMix: o("chorus mix", 0.5) ?? void 0,
        phaserRate: o("phaser rate", 0.5) ?? void 0,
        phaserWidth: o("phaser width", 0.5) ?? void 0,
        phaserFeedback: o("phaser feedback", 0) ?? void 0,
        phaserMix: o("phaser mix", 0) ?? void 0,
        delayTime: o("delay time") ?? void 0,
        delayFeedback: o("delay feedback") ?? void 0,
        delayTone: o("delay tone") ?? void 0,
        delayMix: o("delay mix") ?? void 0,
        delaySpread: o("delay spread", 0.75) ?? void 0,
    };
}
function de(i) {
    const t = new DOMParser().parseFromString(i, "text/xml");
    return t.querySelector("parsererror")
        ? null
        : t.querySelector("db303-pattern")
          ? "pattern"
          : t.querySelector("db303-preset")
            ? "preset"
            : null;
}
function K(i, e) {
    const t = new Blob([i], { type: "application/xml" }),
        n = URL.createObjectURL(t),
        a = document.createElement("a");
    (a.href = n), (a.download = e), a.click(), URL.revokeObjectURL(n);
}
function ue(i) {
    const e = new Set(),
        t = (s) => {
            const r = s.target;
            if (r.tagName === "INPUT" || r.tagName === "SELECT") return;
            const l = s.key.toLowerCase();
            if (s.key === "ArrowLeft") {
                s.preventDefault(), i.onStepLeft();
                return;
            }
            if (s.key === "ArrowRight") {
                s.preventDefault(), i.onStepRight();
                return;
            }
            if (s.key === "ArrowUp") {
                s.preventDefault(), i.onOctaveUp();
                return;
            }
            if (s.key === "ArrowDown") {
                s.preventDefault(), i.onOctaveDown();
                return;
            }
            e.has(l) || (N[l] !== void 0 && (s.preventDefault(), e.add(l), i.onNoteKey(N[l])));
        },
        n = (s) => {
            const r = s.key.toLowerCase();
            e.delete(r);
        },
        a = () => {
            e.clear();
        },
        o = (s) => {
            const r = s.target;
            r.tagName === "INPUT" ||
                r.tagName === "SELECT" ||
                (s.code === "Space" && !s.repeat && (s.preventDefault(), i.onPlayStop()),
                (s.key === "<" || s.key === ",") && (s.preventDefault(), i.onKeyboardOctaveDown()),
                (s.key === ">" || s.key === ".") && (s.preventDefault(), i.onKeyboardOctaveUp()));
        };
    return (
        window.addEventListener("keydown", t),
        window.addEventListener("keyup", n),
        window.addEventListener("blur", a),
        window.addEventListener("keydown", o),
        () => {
            window.removeEventListener("keydown", t),
                window.removeEventListener("keyup", n),
                window.removeEventListener("blur", a),
                window.removeEventListener("keydown", o);
        }
    );
}
function p(i, e) {
    if (e == null) return;
    const t = document.getElementById(i);
    t && ((t.value = String(e)), t.dispatchEvent(new Event("change")));
}
function fe(i) {
    p("waveform", i.waveform),
        p("pulseWidth", i.pulseWidth),
        p("subOscGain", i.subOscGain),
        p("subOscBlend", i.subOscBlend),
        p("cutoff", i.cutoff),
        p("resonance", i.resonance),
        p("envMod", i.envMod),
        p("decay", i.decay),
        p("accent", i.accent),
        p("normalDecay", i.normalDecay),
        p("accentDecay", i.accentDecay),
        p("softAttack", i.softAttack),
        p("accentSoftAttack", i.accentSoftAttack),
        p("passbandCompensation", i.passbandCompensation),
        p("resTracking", i.resTracking),
        p("filterInputDrive", i.filterInputDrive),
        p("diodeCharacter", i.diodeCharacter),
        p("duffingAmount", i.duffingAmount),
        p("filterFmDepth", i.filterFmDepth),
        p("lpBpMix", i.lpBpMix),
        p("filterTracking", i.filterTracking),
        p("slideTime", i.slideTime),
        p("lfoRate", i.lfoRate),
        p("lfoContour", i.lfoContour),
        p("lfoPitchDepth", i.lfoPitchDepth),
        p("lfoPwmDepth", i.lfoPwmDepth),
        p("lfoFilterDepth", i.lfoFilterDepth),
        p("chorusMix", i.chorusMix),
        p("phaserRate", i.phaserRate),
        p("phaserWidth", i.phaserWidth),
        p("phaserFeedback", i.phaserFeedback),
        p("phaserMix", i.phaserMix),
        p("delayTime", i.delayTime),
        p("delayFeedback", i.delayFeedback),
        p("delayTone", i.delayTone),
        p("delayMix", i.delayMix),
        p("delaySpread", i.delaySpread);
}
const P = "db303-synth-settings",
    Y = "db303-pattern";
function pe(i) {
    try {
        localStorage.setItem(P, JSON.stringify(i));
    } catch (e) {
        console.warn("Could not save synth settings to localStorage:", e);
    }
}
function he() {
    try {
        const i = localStorage.getItem(P);
        return i ? JSON.parse(i) : null;
    } catch (i) {
        return console.warn("Could not load synth settings from localStorage:", i), null;
    }
}
function me() {
    try {
        localStorage.removeItem(P);
    } catch (i) {
        console.warn("Could not clear synth settings from localStorage:", i);
    }
}
function ge(i, e, t, n, a = "none") {
    try {
        const o = { numSteps: e, tempo: t, swing: n, patternLength: e, steps: i.slice(0, e), scale: a };
        localStorage.setItem(Y, JSON.stringify(o));
    } catch (o) {
        console.warn("Could not save pattern to localStorage:", o);
    }
}
function ye() {
    try {
        const i = localStorage.getItem(Y);
        return i ? JSON.parse(i) : null;
    } catch (i) {
        return console.warn("Could not load pattern from localStorage:", i), null;
    }
}
function Se(i, e, t, n, a) {
    const o = X(i, e),
        s = ee(t),
        r = new URL(window.location.pathname, window.location.origin);
    return (
        r.searchParams.set("p", o),
        r.searchParams.set("t", String(Math.round(n))),
        a > 0 && r.searchParams.set("sw", a.toFixed(2)),
        r.searchParams.set("s", s),
        r.toString()
    );
}
async function z(i, e, t) {
    try {
        await navigator.clipboard.writeText(i);
        const n = document.getElementById(e);
        if (n) {
            n.classList.add("copied");
            const a = n.querySelector(".share-label"),
                o = a == null ? void 0 : a.textContent;
            a && (a.textContent = t),
                setTimeout(() => {
                    n.classList.remove("copied"), a && o && (a.textContent = o);
                }, 1500);
        }
        return !0;
    } catch (n) {
        return console.error("Failed to copy to clipboard:", n), prompt("Copy this link:", i), !1;
    }
}
const _ = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "C+"],
    ve = [1, 3, 6, 8, 10],
    O = 32;
function Ee(i, e, t) {
    i.innerHTML = "";
    for (let n = 0; n < O; n++) {
        const a = we(n, e[n], t);
        i.appendChild(a);
    }
}
function we(i, e, t) {
    const n = document.createElement("div");
    (n.className = "seq-step"), (n.id = `step-${i}`);
    const a = document.createElement("button");
    (a.className = "seq-btn gate"),
        (a.title = "Gate"),
        e.gate && a.classList.add("active"),
        (a.onclick = () => {
            (e.gate = !e.gate),
                a.classList.toggle("active", e.gate),
                n.classList.toggle("gate-off", !e.gate),
                t.onStepChange(i, e);
        }),
        n.appendChild(a),
        n.addEventListener("click", (d) => {
            d.target.tagName !== "INPUT" && t.onStepSelect(i);
        });
    const o = Te(i, e, n, t);
    n.appendChild(o);
    const s = document.createElement("div");
    (s.className = "note-name-display"), (s.textContent = _[e.key]), n.appendChild(s);
    const r = Me(i, e, t);
    n.appendChild(r);
    const l = Ie(i, e, t);
    n.appendChild(l);
    const c = Ae(i, e, t);
    return n.appendChild(c), n;
}
function Te(i, e, t, n) {
    const a = document.createElement("div");
    return (
        (a.className = "piano-roll"),
        _.forEach((o, s) => {
            const r = document.createElement("div");
            (r.className = "piano-key"),
                ve.includes(s) && r.classList.add("black-key"),
                (r.dataset.note = String(s)),
                (r.dataset.name = o),
                (r.title = o),
                s === e.key && r.classList.add("selected"),
                r.addEventListener("mouseenter", () => {
                    const l = t.querySelector(".note-name-display");
                    l &&
                        ((l.dataset.originalNote = l.textContent || ""),
                        (l.textContent = o),
                        l.classList.add("hovering"));
                }),
                r.addEventListener("mouseleave", () => {
                    const l = t.querySelector(".note-name-display");
                    l &&
                        l.dataset.originalNote &&
                        ((l.textContent = l.dataset.originalNote), l.classList.remove("hovering"));
                }),
                r.addEventListener("click", () => {
                    if (r.classList.contains("disabled")) return;
                    a.querySelectorAll(".piano-key").forEach((c) => {
                        c.classList.remove("selected"), c.classList.remove("out-of-scale");
                    }),
                        r.classList.add("selected"),
                        (e.key = s),
                        n.onStepChange(i, e);
                    const l = t.querySelector(".note-name-display");
                    l && ((l.textContent = o), (l.dataset.originalNote = o)), n.onStepPreview(i);
                }),
                r.addEventListener("mouseenter", (l) => {
                    if (l.buttons === 1) {
                        if (r.classList.contains("disabled")) return;
                        a.querySelectorAll(".piano-key").forEach((d) => {
                            d.classList.remove("selected"), d.classList.remove("out-of-scale");
                        }),
                            r.classList.add("selected"),
                            (e.key = s),
                            n.onStepChange(i, e);
                        const c = t.querySelector(".note-name-display");
                        c && ((c.textContent = o), (c.dataset.originalNote = o));
                    }
                }),
                a.appendChild(r);
        }),
        a
    );
}
function Me(i, e, t) {
    const n = document.createElement("div");
    return (
        (n.className = "octave-radios"),
        ["+1", "0", "-1"].forEach((a) => {
            const o = parseInt(a),
                s = document.createElement("div");
            s.className = "octave-radio";
            const r = document.createElement("input");
            (r.type = "radio"),
                (r.name = `oct-${i}`),
                (r.id = `oct-${i}-${o}`),
                (r.value = String(o)),
                o === e.octave && (r.checked = !0),
                r.addEventListener("change", () => {
                    (e.octave = o), t.onStepChange(i, e);
                });
            const l = document.createElement("label");
            (l.htmlFor = `oct-${i}-${o}`), (l.textContent = a), s.appendChild(r), s.appendChild(l), n.appendChild(s);
        }),
        n
    );
}
function Ie(i, e, t) {
    const n = document.createElement("button");
    return (
        (n.className = "seq-btn accent"),
        (n.title = "Accent / Mute / Off"),
        (n.onclick = () => {
            !e.accent && !e.mute
                ? ((e.accent = !0), (e.mute = !1))
                : e.accent && !e.mute
                  ? ((e.accent = !1), (e.mute = !0))
                  : ((e.accent = !1), (e.mute = !1)),
                n.classList.remove("active", "mute"),
                e.accent && n.classList.add("active"),
                e.mute && n.classList.add("mute"),
                t.onStepChange(i, e);
        }),
        n
    );
}
function Ae(i, e, t) {
    const n = document.createElement("button");
    return (
        (n.className = "seq-btn slide"),
        (n.title = "Slide / Hammer / Off"),
        (n.onclick = () => {
            !e.slide && !e.hammer
                ? ((e.slide = !0), (e.hammer = !1))
                : e.slide && !e.hammer
                  ? ((e.slide = !1), (e.hammer = !0))
                  : ((e.slide = !1), (e.hammer = !1)),
                n.classList.remove("active", "hammer"),
                e.slide && n.classList.add("active"),
                e.hammer && n.classList.add("hammer"),
                t.onStepChange(i, e);
        }),
        n
    );
}
function B(i) {
    for (let e = 0; e < O; e++) {
        const t = document.getElementById(`step-${e}`);
        t &&
            (e < i
                ? ((t.style.display = ""), (t.style.opacity = "1.0"), (t.style.pointerEvents = "auto"))
                : (t.style.display = "none"));
    }
}
function x(i, e) {
    const t = document.getElementById(`step-${i}`);
    if (!t) return;
    const n = t.querySelector(".piano-roll");
    n &&
        n.querySelectorAll(".piano-key").forEach((r, l) => {
            r.classList.toggle("selected", l === e.key);
        });
    const a = t.querySelector(".note-name-display");
    a && (a.textContent = _[e.key]);
    const o = t.querySelector(`input[name="oct-${i}"][value="${e.octave}"]`);
    o && (o.checked = !0), t.classList.toggle("gate-off", !e.gate);
    const s = t.querySelectorAll(".seq-btn");
    s.length >= 3 &&
        (s[0].classList.toggle("active", e.gate),
        s[1].classList.remove("active", "mute"),
        e.accent && s[1].classList.add("active"),
        e.mute && s[1].classList.add("mute"),
        s[2].classList.remove("active", "hammer"),
        e.slide && s[2].classList.add("active"),
        e.hammer && s[2].classList.add("hammer"));
}
function Ce(i) {
    document.querySelectorAll(".seq-step").forEach((e, t) => {
        e.classList.toggle("current", t === i);
    });
}
function V(i, e) {
    const t = Math.max(0, Math.min(e - 1, i));
    document.querySelectorAll(".seq-step").forEach((a, o) => {
        a.classList.toggle("selected", o === t);
    });
    const n = document.getElementById(`step-${t}`);
    return n && n.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }), t;
}
function R(i, e) {
    for (let t = 0; t < O; t++) {
        const n = document.getElementById(`step-${t}`);
        if (!n) continue;
        const a = n.querySelector(".piano-roll");
        if (!a) continue;
        const o = i[t].key;
        a.querySelectorAll(".piano-key").forEach((s, r) => {
            const l = G(r, e),
                c = r === o;
            s.classList.toggle("disabled", !l), s.classList.toggle("out-of-scale", c && !l);
        });
    }
}
function Le(i, e, t = "none") {
    const n = ae(t);
    for (let a = 0; a < e; a++) {
        const o = i[a];
        (o.key = n[Math.floor(Math.random() * n.length)]),
            (o.octave = Math.floor(Math.random() * 3) - 1),
            (o.gate = Math.random() > 0.4);
        const s = Math.random();
        s < 0.25
            ? ((o.accent = !0), (o.mute = !1))
            : s < 0.35
              ? ((o.accent = !1), (o.mute = !0))
              : ((o.accent = !1), (o.mute = !1));
        const r = Math.random();
        r < 0.2
            ? ((o.slide = !0), (o.hammer = !1))
            : r < 0.3
              ? ((o.slide = !1), (o.hammer = !0))
              : ((o.slide = !1), (o.hammer = !1));
    }
}
function De(i, e) {
    const t = i.slice(0, e).map((c) => ({ key: c.key, octave: c.octave })),
        n = i.slice(0, e).map((c) => c.gate),
        a = i.slice(0, e).map((c) => c.accent),
        o = i.slice(0, e).map((c) => c.slide),
        s = i.slice(0, e).map((c) => c.mute),
        r = i.slice(0, e).map((c) => c.hammer),
        l = (c) => {
            for (let d = c.length - 1; d > 0; d--) {
                const u = Math.floor(Math.random() * (d + 1));
                [c[d], c[u]] = [c[u], c[d]];
            }
        };
    l(t), l(n), l(a), l(o), l(s), l(r);
    for (let c = 0; c < e; c++)
        i[c] = { key: t[c].key, octave: t[c].octave, gate: n[c], accent: a[c], slide: o[c], mute: s[c], hammer: r[c] };
}
function xe(i, e, t) {
    for (let n = 0; n < e; n++) {
        const a = i[n];
        let o = a.key + t,
            s = a.octave;
        for (; o < 0; ) (o += 12), s--;
        for (; o >= 12; ) (o -= 12), s++;
        (a.key = o), (a.octave = Math.max(-1, Math.min(1, s)));
    }
}
function be(i, e, t) {
    const n = i.slice(0, e);
    let a;
    t > 0 ? (a = [n[e - 1], ...n.slice(0, e - 1)]) : (a = [...n.slice(1), n[0]]);
    for (let o = 0; o < e; o++) i[o] = { ...a[o] };
}
function Fe(i, e = 16) {
    for (let t = 0; t < e; t++) i[t] = { ...oe };
}
function ke(i, e, t) {
    for (let n = e; n < t; n++) {
        const a = n % e;
        i[n] = { ...i[a] };
    }
}
function Be(i, e) {
    document.querySelectorAll(".preset-dropdown").forEach((o) => o.remove());
    const t = document.createElement("div");
    (t.className = "preset-dropdown"),
        ie.forEach((o) => {
            const s = document.createElement("button");
            (s.className = "preset-dropdown-item"),
                (s.textContent = o.name),
                (s.onclick = () => {
                    t.remove(), e(o.file);
                }),
                t.appendChild(s);
        });
    const n = i.parentElement;
    (n.style.position = "relative"),
        (t.style.top = i.offsetTop + i.offsetHeight + 4 + "px"),
        (t.style.left = i.offsetLeft + "px"),
        n.appendChild(t);
    const a = (o) => {
        !t.contains(o.target) && o.target !== i && (document.removeEventListener("click", a), t.remove());
    };
    setTimeout(() => document.addEventListener("click", a), 0);
}
function $(i, e) {
    return new Promise((t) => {
        document.querySelectorAll(".confirm-tooltip").forEach((r) => r.remove());
        const n = document.createElement("div");
        (n.className = "confirm-tooltip"),
            (n.innerHTML = `
            <span>${e}</span>
            <button class="confirm-yes">Yes</button>
            <button class="confirm-no">No</button>
        `);
        const a = i.parentElement;
        (a.style.position = "relative"),
            (n.style.top = i.offsetTop + i.offsetHeight + 8 + "px"),
            (n.style.left = i.offsetLeft + "px"),
            a.appendChild(n);
        const o = (r) => {
            n.remove(), t(r);
        };
        n.querySelector(".confirm-yes").addEventListener("click", () => o(!0)),
            n.querySelector(".confirm-no").addEventListener("click", () => o(!1));
        const s = (r) => {
            !n.contains(r.target) && r.target !== i && (document.removeEventListener("click", s), o(!1));
        };
        setTimeout(() => document.addEventListener("click", s), 0);
    });
}
const m = {
        percent: () => (i) => Math.round(i * 100) + "%",
        percentSigned: () => (i) => {
            const e = Math.round(i * 100);
            return (e >= 0 ? "+" : "") + e + "%";
        },
        expMs: (i, e) => (t, n) => Math.round(n[i] * Math.pow(n[e] / n[i], t)) + " ms",
        expMsDecimal: (i, e) => (t, n) => (n[i] * Math.pow(n[e] / n[i], t)).toFixed(1) + " ms",
        expMsInt: (i, e) => (t, n) => (n[i] * Math.pow(n[e] / n[i], t)).toFixed(0) + " ms",
        lfoRate: (i, e) => (t, n) => {
            const a = n[i] * Math.pow(n[e] / n[i], t);
            return a >= 10 ? a.toFixed(1) + " Hz" : a.toFixed(2) + " Hz";
        },
        semitones: () => (i) => "+" + Math.round(i * 12) + " semi",
        octaves: () => (i) => "+" + (i * 2).toFixed(1) + " oct",
        pulseWidth: () => (i) => Math.round(50 + i * 49) + "%",
        drive: (i) => (e, t) => (e * t[i]).toFixed(1),
        lpBpHp: () => (i) => {
            if (window.currentFilterType === 5)
                return i < 0.05
                    ? "LP"
                    : i > 0.45 && i < 0.55
                      ? "BP"
                      : i > 0.95
                        ? "HP"
                        : i < 0.5
                          ? `LP${Math.round((1 - i * 2) * 100)}`
                          : `HP${Math.round((i - 0.5) * 2 * 100)}`;
            {
                if (i < 0.05) return "LP";
                if (i > 0.95) return "BP";
                const n = Math.round((1 - i) * 100);
                return n > 95 ? "LP" : n < 5 ? "BP" : `LP${n}`;
            }
        },
        delayTone: () => (i) => (i < 0.4 ? "LP" : i > 0.6 ? "HP" : "Bypass"),
        delayTime: () => (i) => i.toFixed(2),
        rawInt: () => (i) => String(Math.round(i)),
        percentInt: () => (i) => String(Math.round(i * 100)),
        none: () => () => "",
    },
    Re = [
        { id: "cutoff", setter: "setCutoff", stateKey: "cutoff", displayId: "cutoffValue", customHandler: !0 },
        {
            id: "resonance",
            setter: "setResonance",
            stateKey: "resonance",
            displayId: "resonanceValue",
            formatter: m.percent(),
            customHandler: !0,
        },
        { id: "envMod", setter: "setEnvMod", stateKey: "envMod", displayId: "envModValue", customHandler: !0 },
        {
            id: "decay",
            setter: "setDecay",
            stateKey: "decay",
            displayId: "decayValue",
            formatter: m.expMs("DECAY_MIN", "DECAY_MAX"),
        },
        { id: "accent", setter: "setAccent", stateKey: "accent", displayId: "accentValue", formatter: m.percent() },
        { id: "waveform", setter: "setWaveform", stateKey: "waveform" },
        {
            id: "pulseWidth",
            setter: "setPulseWidth",
            stateKey: "pulseWidth",
            displayId: "pulseWidthValue",
            formatter: m.pulseWidth(),
        },
        {
            id: "subOscGain",
            setter: "setSubOscGain",
            stateKey: "subOscGain",
            displayId: "subOscGainValue",
            formatter: m.percent(),
        },
        { id: "subOscBlend", setter: "setSubOscBlend", stateKey: "subOscBlend" },
        {
            id: "normalDecay",
            setter: "setNormalDecay",
            stateKey: "normalDecay",
            displayId: "normalDecayValue",
            formatter: m.expMs("DECAY_MIN", "DECAY_MAX"),
        },
        {
            id: "accentDecay",
            setter: "setAccentDecay",
            stateKey: "accentDecay",
            displayId: "accentDecayValue",
            formatter: m.expMs("DECAY_MIN", "DECAY_MAX"),
        },
        {
            id: "softAttack",
            setter: "setSoftAttack",
            stateKey: "softAttack",
            displayId: "softAttackValue",
            formatter: m.expMsDecimal("ATTACK_MIN", "ATTACK_MAX"),
        },
        {
            id: "accentSoftAttack",
            setter: "setAccentSoftAttack",
            stateKey: "accentSoftAttack",
            displayId: "accentSoftAttackValue",
            formatter: m.expMsInt("ACCENT_ATTACK_MIN", "ACCENT_ATTACK_MAX"),
        },
        {
            id: "passbandCompensation",
            setter: "setPassbandCompensation",
            stateKey: "passbandCompensation",
            displayId: "passbandCompensationValue",
            formatter: m.percent(),
            invert: !0,
        },
        {
            id: "resTracking",
            setter: "setResTracking",
            stateKey: "resTracking",
            displayId: "resTrackingValue",
            formatter: m.percent(),
            invert: !0,
        },
        {
            id: "filterInputDrive",
            setter: "setFilterInputDrive",
            stateKey: "filterInputDrive",
            displayId: "filterInputDriveValue",
            formatter: m.drive("FILTER_INPUT_DRIVE_MAX"),
        },
        {
            id: "diodeCharacter",
            setter: "setDiodeCharacter",
            stateKey: "diodeCharacter",
            displayId: "diodeCharacterValue",
            formatter: m.percent(),
        },
        {
            id: "duffingAmount",
            setter: "setDuffingAmount",
            stateKey: "duffingAmount",
            displayId: "duffingAmountValue",
            formatter: m.percentSigned(),
            stickyZero: !0,
        },
        {
            id: "filterFmDepth",
            setter: "setFilterFmDepth",
            stateKey: "filterFmDepth",
            displayId: "filterFmDepthValue",
            formatter: m.percent(),
        },
        { id: "lpBpMix", setter: "setLpBpMix", stateKey: "lpBpMix", displayId: "lpBpMixValue", formatter: m.lpBpHp() },
        {
            id: "filterTracking",
            setter: "setFilterTracking",
            stateKey: "filterTracking",
            displayId: "filterTrackingValue",
            formatter: m.percent(),
        },
        {
            id: "slideTime",
            setter: "setSlideTime",
            stateKey: "slideTime",
            displayId: "slideTimeValue",
            formatter: m.expMs("SLIDE_MIN", "SLIDE_MAX"),
        },
        {
            id: "lfoRate",
            setter: "setLfoRate",
            stateKey: "lfoRate",
            displayId: "lfoRateValue",
            formatter: m.lfoRate("LFO_RATE_MIN", "LFO_RATE_MAX"),
        },
        {
            id: "lfoContour",
            setter: "setLfoContour",
            stateKey: "lfoContour",
            displayId: "lfoContourValue",
            formatter: m.percentSigned(),
            stickyZero: !0,
        },
        {
            id: "lfoPitchDepth",
            setter: "setLfoPitchDepth",
            stateKey: "lfoPitchDepth",
            displayId: "lfoPitchDepthValue",
            formatter: m.semitones(),
        },
        {
            id: "lfoPwmDepth",
            setter: "setLfoPwmDepth",
            stateKey: "lfoPwmDepth",
            displayId: "lfoPwmDepthValue",
            formatter: m.percent(),
        },
        {
            id: "lfoFilterDepth",
            setter: "setLfoFilterDepth",
            stateKey: "lfoFilterDepth",
            displayId: "lfoFilterDepthValue",
            formatter: m.octaves(),
        },
        {
            id: "lfoStiffDepth",
            setter: "setLfoStiffDepth",
            stateKey: "lfoStiffDepth",
            displayId: "lfoStiffDepthValue",
            formatter: m.percent(),
        },
        {
            id: "chorusMix",
            setter: "setChorusMix",
            stateKey: "chorusMix",
            displayId: "chorusMixDisplay",
            formatter: m.percentInt(),
        },
        {
            id: "phaserRate",
            setter: "setPhaserLfoRate",
            stateKey: "phaserRate",
            displayId: "phaserRateDisplay",
            formatter: m.percentInt(),
        },
        {
            id: "phaserWidth",
            setter: "setPhaserLfoWidth",
            stateKey: "phaserWidth",
            displayId: "phaserWidthDisplay",
            formatter: m.percentInt(),
        },
        {
            id: "phaserFeedback",
            setter: "setPhaserFeedback",
            stateKey: "phaserFeedback",
            displayId: "phaserFeedbackDisplay",
            formatter: m.percentInt(),
        },
        {
            id: "phaserMix",
            setter: "setPhaserMix",
            stateKey: "phaserMix",
            displayId: "phaserMixDisplay",
            formatter: m.percentInt(),
        },
        {
            id: "delayTime",
            setter: "setDelayTime",
            stateKey: "delayTime",
            displayId: "delayTimeDisplay",
            formatter: m.delayTime(),
        },
        {
            id: "delayFeedback",
            setter: "setDelayFeedback",
            stateKey: "delayFeedback",
            displayId: "delayFeedbackDisplay",
            formatter: m.percentInt(),
        },
        {
            id: "delayTone",
            setter: "setDelayTone",
            stateKey: "delayTone",
            displayId: "delayToneDisplay",
            formatter: m.delayTone(),
        },
        {
            id: "delayMix",
            setter: "setDelayMix",
            stateKey: "delayMix",
            displayId: "delayMixDisplay",
            formatter: m.percentInt(),
        },
        {
            id: "delaySpread",
            setter: "setDelaySpread",
            stateKey: "delaySpread",
            displayId: "delaySpreadDisplay",
            formatter: m.percentInt(),
        },
    ],
    Ne = [
        { selector: ".lfo-wave-btn", setter: "setLfoWaveform", stateKey: "lfoWaveform", dataAttr: "wave" },
        { selector: "#chorusModeSelect button", setter: "setChorusMode", stateKey: "chorusMode", dataAttr: "mode" },
    ];
function Pe(i, e = 0.08) {
    if (Math.abs(i) < e * 2) return 0;
    const t = i > 0 ? 1 : -1,
        a = (Math.abs(i) - e * 2) / (1 - e * 2);
    return t * a;
}
function _e(i, e, t, n, a) {
    if (i.customHandler) return;
    const o = document.getElementById(i.id);
    if (!o) return;
    const s = (l) => {
        let c = l;
        if (
            (i.stickyZero && (c = Pe(l)),
            i.invert && (c = 1 - c),
            e && typeof e[i.setter] == "function" && e[i.setter](c),
            i.displayId && i.formatter)
        ) {
            const d = document.getElementById(i.displayId);
            d && (d.textContent = i.formatter(i.stickyZero ? c : l, n));
        }
        (t[i.stateKey] = l), a();
    };
    o.addEventListener("change", (l) => s(parseFloat(l.target.value))),
        o.addEventListener("input", (l) => s(parseFloat(l.target.value)));
    const r = parseFloat(o.value);
    isNaN(r) || s(r);
}
function Oe(i, e, t, n) {
    const a = document.querySelectorAll(i.selector);
    a.forEach((o) => {
        o.addEventListener("click", () => {
            const s = parseInt(o.dataset[i.dataAttr || "value"] || "0");
            e && typeof e[i.setter] == "function" && e[i.setter](s),
                (t[i.stateKey] = s),
                a.forEach((r) => r.classList.remove("active")),
                o.classList.add("active"),
                n();
        });
    });
}
function qe(i, e, t, n) {
    Re.forEach((a) => {
        _e(a, i, e, t, n);
    }),
        Ne.forEach((a) => {
            Oe(a, i, e, n);
        });
}
class q {
    constructor() {
        (this.audioContext = null),
            (this.scriptNode = null),
            (this.analyser = null),
            (this.visualizer = null),
            (this.wasmModule = null),
            (this.engine = null),
            (this.activeNotes = new Set()),
            (this.currentOctave = 2),
            (this.sequencerState = []),
            (this.sequencerRunning = !1),
            (this.selectedStep = 0),
            (this.skipUrlUpdate = !1),
            (this.currentScale = "none"),
            (this.synthState = { ...ne }),
            (this.CUTOFF_MIN = null),
            (this.CUTOFF_MAX = null),
            (this.DECAY_MIN = null),
            (this.DECAY_MAX = null),
            (this.ATTACK_MIN = null),
            (this.ATTACK_MAX = null),
            (this.ACCENT_ATTACK_MIN = null),
            (this.ACCENT_ATTACK_MAX = null),
            (this.SLIDE_MIN = null),
            (this.SLIDE_MAX = null),
            (this.LFO_RATE_MIN = null),
            (this.LFO_RATE_MAX = null),
            (this.FILTER_INPUT_DRIVE_MAX = null),
            (this.keyboardMap = N),
            this.init();
    }
    saveSynthSettingsToStorage() {
        this.skipUrlUpdate || pe(this.synthState);
    }
    updateFilterParamsVisibility(e) {
        const n = document.getElementById("korgParams");
        n && (n.style.display = e === 5 ? "block" : "none");
    }
    updateLpBpMixForFilterType(e) {
        const n = e === 5,
            a = document.getElementById("lpBpMixLabel");
        a && (a.textContent = n ? "LP/BP/HP" : "LP/BP"), (window.currentFilterType = e);
        const o = document.getElementById("lpBpMix");
        o && o.dispatchEvent(new Event("input"));
    }
    loadSynthSettingsFromStorage() {
        const e = he();
        if (!e) return !1;
        try {
            return this.applySynthSettings(e);
        } catch (t) {
            return console.warn("Could not load synth settings from localStorage:", t), !1;
        }
    }
    savePatternToStorage() {
        var a, o;
        if (this.skipUrlUpdate) return;
        const e = this.engine ? this.engine.getSequencerNumSteps() : 16,
            t = Math.round(parseFloat((a = document.getElementById("tempo")) == null ? void 0 : a.value) || 120),
            n = parseFloat((o = document.getElementById("swing")) == null ? void 0 : o.value) || 0;
        ge(this.sequencerState, e, t, n, this.currentScale);
    }
    loadPatternFromStorage() {
        const e = ye();
        return e ? this.applyPatternData(e) : !1;
    }
    async resetToDefaults() {
        try {
            me(), console.log("[RESET] Cleared synth settings from localStorage");
            const e = await fetch("presets/default-preset.xml");
            if (e.ok) {
                const t = await e.text();
                this.loadPresetFromXML(t), console.log("[RESET] Loaded default preset");
            } else console.warn("[RESET] Default preset not found");
        } catch (e) {
            console.error("[RESET] Error resetting to defaults:", e);
        }
    }
    applySynthSettings(e) {
        if (!e) return !1;
        this.skipUrlUpdate = !0;
        const t = (n, a) => {
            const o = document.getElementById(n);
            o && a !== void 0 && a !== null && ((o.value = a), o.dispatchEvent(new Event("change")));
        };
        if (
            (t("waveform", e.waveform),
            t("pulseWidth", e.pulseWidth),
            t("subOscGain", e.subOscGain),
            t("subOscBlend", e.subOscBlend),
            t("cutoff", e.cutoff),
            t("resonance", e.resonance),
            t("envMod", e.envMod),
            t("decay", e.decay),
            t("accent", e.accent),
            t("normalDecay", e.normalDecay),
            t("accentDecay", e.accentDecay),
            t("softAttack", e.softAttack),
            t("accentSoftAttack", e.accentSoftAttack),
            t("passbandCompensation", e.passbandCompensation),
            t("resTracking", e.resTracking),
            t("filterInputDrive", e.filterInputDrive),
            this.engine && e.filterSelect !== void 0 && !isNaN(e.filterSelect))
        ) {
            const n = Math.floor(Number(e.filterSelect)) || 0;
            this.engine.setFilterSelect(n),
                (this.synthState.filterSelect = n),
                this.updateFilterParamsVisibility(n),
                this.updateLpBpMixForFilterType(n);
            const a = document.getElementById("filterSelect");
            a && (a.value = String(n));
        }
        if (
            (t("diodeCharacter", e.diodeCharacter),
            this.engine && e.diodeCharacter !== void 0 && this.engine.setKorgWarmth(e.diodeCharacter),
            t("duffingAmount", e.duffingAmount),
            this.engine && e.duffingAmount !== void 0)
        ) {
            const n = e.duffingAmount,
                a = Math.abs(n) < 0.16 ? 0 : ((n > 0 ? 1 : -1) * (Math.abs(n) - 0.16)) / 0.84;
            this.engine.setKorgStiffness(a);
        }
        if (
            (t("filterFmDepth", e.filterFmDepth),
            this.engine && e.filterFmDepth !== void 0 && this.engine.setKorgFilterFm(e.filterFmDepth),
            t("lpBpMix", e.lpBpMix),
            e.extendedCutoff !== void 0)
        ) {
            this.synthState.extendedCutoff = e.extendedCutoff;
            const n = document.getElementById("extendedCutoff");
            n && (n.checked = e.extendedCutoff);
        }
        if (e.extendedEnvMod !== void 0) {
            this.synthState.extendedEnvMod = e.extendedEnvMod;
            const n = document.getElementById("extendedEnvMod");
            n && (n.checked = e.extendedEnvMod);
        }
        if (
            (t("filterTracking", e.filterTracking),
            t("slideTime", e.slideTime),
            this.engine && e.lfoWaveform !== void 0 && !isNaN(e.lfoWaveform))
        ) {
            const n = Math.floor(Number(e.lfoWaveform)) || 0;
            this.engine.setLfoWaveform(n),
                (this.synthState.lfoWaveform = n),
                document.querySelectorAll(".lfo-wave-btn").forEach((a, o) => {
                    a.classList.toggle("active", o === n);
                });
        }
        if (
            (t("lfoRate", e.lfoRate),
            t("lfoContour", e.lfoContour ?? 0),
            t("lfoPitchDepth", e.lfoPitchDepth),
            t("lfoPwmDepth", e.lfoPwmDepth),
            t("lfoFilterDepth", e.lfoFilterDepth),
            this.engine && e.chorusMode !== void 0 && !isNaN(e.chorusMode))
        ) {
            const n = Math.floor(Number(e.chorusMode)) || 0;
            this.engine.setChorusMode(n),
                (this.synthState.chorusMode = n),
                document.querySelectorAll("#chorusModeSelect button").forEach((a, o) => {
                    a.classList.toggle("active", o === n);
                });
        }
        return (
            t("chorusMix", e.chorusMix ?? 0.5),
            t("phaserRate", e.phaserRate ?? 0.5),
            t("phaserWidth", e.phaserWidth ?? 0.5),
            t("phaserFeedback", e.phaserFeedback ?? 0),
            t("phaserMix", e.phaserMix ?? 0),
            t("delayTime", e.delayTime),
            t("delayFeedback", e.delayFeedback),
            t("delayTone", e.delayTone),
            t("delayMix", e.delayMix),
            t("delaySpread", e.delaySpread ?? 0.75),
            (this.skipUrlUpdate = !1),
            !0
        );
    }
    applyPatternData(e) {
        var a;
        if (!e || !e.steps) return !1;
        if (((this.skipUrlUpdate = !0), e.tempo)) {
            const o = parseInt(e.tempo);
            if (o >= 60 && o <= 300) {
                const s = document.getElementById("tempo");
                s && ((s.value = String(o)), s.dispatchEvent(new Event("input")));
            }
        }
        if (e.swing !== null && e.swing !== void 0) {
            const o = parseFloat(e.swing);
            if (o >= 0 && o <= 1) {
                const s = document.getElementById("swing");
                s && ((s.value = String(o)), s.dispatchEvent(new Event("input")));
            }
        }
        if (e.scale) {
            this.currentScale = e.scale;
            const o = document.getElementById("scaleMode");
            o && (o.value = e.scale);
        }
        const t = Math.max(
            1,
            Math.min(32, Math.floor(e.numSteps || ((a = e.steps) == null ? void 0 : a.length) || 16))
        );
        this.engine && this.engine.setSequencerNumSteps(t);
        const n = document.getElementById("patternLength");
        n && (n.value = String(t));
        for (let o = 0; o < t; o++)
            (this.sequencerState[o] = { ...e.steps[o] }), x(o, this.sequencerState[o]), this.updateSequencerStep(o);
        return B(t), R(this.sequencerState, this.currentScale), (this.skipUrlUpdate = !1), !0;
    }
    updateUrlWithSynthSettings() {
        this.saveSynthSettingsToStorage();
    }
    loadSynthSettingsFromUrlParams(e) {
        if (!e) return !1;
        const t = te(e);
        if (!t) return !1;
        const n = this.applySynthSettings(t);
        return n && console.log("Synth settings loaded from URL"), n;
    }
    async copyGlobalShareLink() {
        var o, s;
        const e = this.engine ? this.engine.getSequencerNumSteps() : 16,
            t = Math.round(parseFloat((o = document.getElementById("tempo")) == null ? void 0 : o.value) || 120),
            n = parseFloat((s = document.getElementById("swing")) == null ? void 0 : s.value) || 0,
            a = Se(this.sequencerState, e, this.synthState, t, n);
        await z(a, "globalShare", "Song link copied!");
    }
    updateUrlWithPattern() {
        this.savePatternToStorage();
    }
    updateWormAnimation(e, t) {
        const n = document.querySelector(".logo");
        if (n) {
            const a = 240 / e;
            (n.style.animationDuration = `${a}s`),
                t !== void 0 && (n.style.animationPlayState = t ? "running" : "paused");
        }
    }
    loadPatternFromUrlParams(e, t = null, n = null) {
        if ((console.log("loadPatternFromUrlParams called with:", e, t, n), !e)) return !1;
        const a = Q(e);
        if ((console.log("decoded pattern:", a), !a)) return !1;
        const o = {
                numSteps: a.numSteps,
                tempo: t ? parseInt(t) : null,
                swing: n ? parseFloat(n) : null,
                steps: a.steps,
            },
            s = this.applyPatternData(o);
        return s && console.log("Pattern loaded from URL"), s;
    }
    async copyShareLink() {
        var s, r;
        const e = this.engine ? this.engine.getSequencerNumSteps() : 16,
            t = X(this.sequencerState, e),
            n = Math.round(parseFloat((s = document.getElementById("tempo")) == null ? void 0 : s.value) || 120),
            a = parseFloat((r = document.getElementById("swing")) == null ? void 0 : r.value) || 0,
            o = new URL(window.location.pathname, window.location.origin);
        o.searchParams.set("p", t),
            o.searchParams.set("t", String(n)),
            a > 0 && o.searchParams.set("sw", a.toFixed(2)),
            await z(o.toString(), "seqShare", "Pattern link copied!");
    }
    init() {
        console.log("🔧 init() called");
        const e = document.getElementById("startSensitive"),
            t = document.getElementById("startTrippy"),
            n = document.getElementById("warningModal");
        if (!e || !t || !n) {
            console.error("❌ Could not find start buttons or warning modal!");
            return;
        }
        e.addEventListener("click", () => {
            const f = document.getElementById("vizBrightness");
            f &&
                ((f.value = 0),
                (window.vizBrightnessGain = 0),
                (document.getElementById("brightnessValue").textContent = "0")),
                this.start();
        }),
            t.addEventListener("click", () => {
                this.start();
            }),
            window.addEventListener("keydown", (f) => {
                f.code === "Space" && n.style.display !== "none" && (f.preventDefault(), t.click());
            }),
            console.log("🔍 Looking for visualizer control elements...");
        const a = document.getElementById("vizBrightness"),
            o = document.getElementById("brightnessValue");
        a &&
            o &&
            (a.addEventListener("input", (f) => {
                const S = f.target.value / 100;
                console.log("🌟 Setting viz brightness to:", S),
                    (window.vizBrightnessGain = S),
                    (o.textContent = f.target.value);
            }),
            (window.vizBrightnessGain = parseInt(a.value) / 100),
            console.log("✅ Brightness slider initialized"));
        const s = document.getElementById("fadeSpeed"),
            r = document.getElementById("fadeSpeedValue");
        if (s && r) {
            const f = (S) => {
                const L = 0.8 + (S / 100) * 0.195;
                (window.vizReleaseCoeff = L),
                    S < 33 ? (r.textContent = "Fast") : S < 66 ? (r.textContent = "Medium") : (r.textContent = "Slow");
            };
            s.addEventListener("input", (S) => {
                f(parseInt(S.target.value));
            }),
                f(parseInt(s.value)),
                console.log("✅ Fade speed slider initialized");
        }
        const l = document.getElementById("vizSegments"),
            c = document.getElementById("segmentsValue");
        l &&
            c &&
            (l.addEventListener("input", (f) => {
                (window.vizSegments = parseInt(f.target.value)), (c.textContent = f.target.value);
            }),
            (window.vizSegments = parseInt(l.value)),
            console.log("✅ Segments slider initialized"));
        const d = document.getElementById("vizRotation"),
            u = document.getElementById("rotationValue");
        d &&
            u &&
            (d.addEventListener("input", (f) => {
                (window.vizRotationSpeed = parseInt(f.target.value) / 100), (u.textContent = f.target.value);
            }),
            (window.vizRotationSpeed = parseInt(d.value) / 100),
            console.log("✅ Rotation slider initialized"));
        const g = document.getElementById("vizSpin"),
            E = document.getElementById("spinValue");
        g &&
            E &&
            (g.addEventListener("input", (f) => {
                (window.vizSpinSpeed = parseInt(f.target.value) / 100), (E.textContent = f.target.value);
            }),
            (window.vizSpinSpeed = parseInt(g.value) / 100),
            (E.textContent = g.value));
        const M = document.getElementById("vizColorSpeed"),
            w = document.getElementById("colorSpeedValue");
        M &&
            w &&
            (M.addEventListener("input", (f) => {
                (window.vizColorSpeed = parseInt(f.target.value) / 100), (w.textContent = f.target.value);
            }),
            (window.vizColorSpeed = parseInt(M.value) / 100),
            console.log("✅ Color speed slider initialized"));
        const y = document.getElementById("vizTileSize"),
            I = document.getElementById("tileSizeValue");
        y &&
            I &&
            (y.addEventListener("input", (f) => {
                (window.vizTileSize = parseInt(f.target.value) / 100), (I.textContent = f.target.value);
            }),
            (window.vizTileSize = parseInt(y.value) / 100),
            console.log("✅ Tile size slider initialized"));
        const b = document.getElementById("bgOpacity"),
            D = document.getElementById("opacityValue");
        b && D
            ? (b.addEventListener("input", (f) => {
                  const S = f.target.value / 100;
                  console.log("🎨 Setting opacity to:", S),
                      document.documentElement.style.setProperty("--synth-bg-opacity", S),
                      (D.textContent = f.target.value);
              }),
              console.log("✅ Transparency slider initialized"))
            : (console.error("❌ Transparency slider elements not found!"),
              console.error("  - bgOpacitySlider:", b),
              console.error("  - opacityValue:", D)),
            console.log("✅ DB303 Web Synthesizer initialized"),
            fetch("https://api.github.com/repos/dfl/db303/commits/gh-pages?per_page=1")
                .then((f) => f.json())
                .then((f) => {
                    var S, L;
                    if (f.sha) {
                        const F = f.sha.substring(0, 7),
                            A = new Date(
                                (L = (S = f.commit) == null ? void 0 : S.author) == null ? void 0 : L.date
                            ).toLocaleDateString(),
                            h = document.getElementById("footer-version");
                        h && (h.textContent = `${F} (${A})`);
                    }
                })
                .catch(() => {});
    }
    async start() {
        const e = document.getElementById("warningModal"),
            t = document.getElementById("status"),
            n = document.getElementById("startSensitive"),
            a = document.getElementById("startTrippy");
        try {
            (n.disabled = !0),
                (a.disabled = !0),
                (t.textContent = "Loading WASM module..."),
                console.log("Loading WASM module...");
            const o = (
                await J(async () => {
                    const { default: y } = await import("./db303-BSKwMUXt.js");
                    return { default: y };
                }, [])
            ).default;
            console.log("createDB303Module imported, BASE_URL:", "/"),
                (this.wasmModule = await o({
                    locateFile: (y) => {
                        const I = y.endsWith(".wasm") ? "/" + y : y;
                        return console.log("locateFile:", y, "->", I), I;
                    },
                })),
                console.log("WASM module loaded successfully"),
                (t.textContent = "Initializing audio..."),
                console.log("Creating AudioContext..."),
                (this.audioContext = new AudioContext()),
                this.audioContext.state === "suspended" && (await this.audioContext.resume()),
                console.log(
                    "Creating engine with sample rate:",
                    this.audioContext.sampleRate,
                    typeof this.audioContext.sampleRate
                ),
                (this.engine = new this.wasmModule.DB303Engine(Math.floor(this.audioContext.sampleRate))),
                console.log("Engine created successfully"),
                (this.CUTOFF_MIN = this.wasmModule.CUTOFF_MIN),
                (this.CUTOFF_MAX = this.wasmModule.CUTOFF_MAX),
                (this.DECAY_MIN = this.wasmModule.DECAY_MIN),
                (this.DECAY_MAX = this.wasmModule.DECAY_MAX),
                (this.ATTACK_MIN = this.wasmModule.ATTACK_MIN),
                (this.ATTACK_MAX = this.wasmModule.ATTACK_MAX),
                (this.ACCENT_ATTACK_MIN = this.wasmModule.ACCENT_ATTACK_MIN),
                (this.ACCENT_ATTACK_MAX = this.wasmModule.ACCENT_ATTACK_MAX),
                (this.SLIDE_MIN = this.wasmModule.SLIDE_MIN),
                (this.SLIDE_MAX = this.wasmModule.SLIDE_MAX),
                (this.LFO_RATE_MIN = this.wasmModule.LFO_RATE_MIN),
                (this.LFO_RATE_MAX = this.wasmModule.LFO_RATE_MAX),
                (this.FILTER_INPUT_DRIVE_MAX = this.wasmModule.FILTER_INPUT_DRIVE_MAX);
            const s = 4096;
            this.scriptNode = this.audioContext.createScriptProcessor(s, 0, 2);
            let r = -1;
            (this.scriptNode.onaudioprocess = (y) => {
                const I = y.outputBuffer.getChannelData(0),
                    b = y.outputBuffer.getChannelData(1),
                    D = I.length;
                this.engine.process(D);
                const f = this.engine.getOutputBufferPtr(),
                    S = this.wasmModule.HEAPF32,
                    L = f >> 2;
                for (let A = 0; A < D; A++) (I[A] = S[L + A * 2]), (b[A] = S[L + A * 2 + 1]);
                const F = this.engine.getCurrentStep();
                F !== r && ((r = F), requestAnimationFrame(() => Ce(F)));
            }),
                (this.analyser = this.audioContext.createAnalyser()),
                (this.analyser.fftSize = 2048),
                (this.analyser.smoothingTimeConstant = 0.8),
                this.scriptNode.connect(this.analyser),
                this.analyser.connect(this.audioContext.destination),
                console.log("ScriptProcessorNode created and connected"),
                (this.visualizer = new Z("shaderCanvas")),
                this.visualizer.start(),
                this.updateVisualizer(),
                e.classList.add("fade-out"),
                setTimeout(() => {
                    e.style.display = "none";
                }, 500);
            const l = document.getElementById("synthContainer");
            (l.style.display = "block"),
                (l.style.opacity = "0"),
                setTimeout(() => {
                    (l.style.transition = "opacity 1.0s ease-in"), (l.style.opacity = "1");
                }, 100);
            const c = document.getElementById("vizControls");
            (c.style.display = "block"),
                (c.style.opacity = "0"),
                setTimeout(() => {
                    (c.style.transition = "opacity 1.0s ease-in"), (c.style.opacity = "1");
                }, 100),
                window.customElements && (await customElements.whenDefined("webaudio-knob")),
                console.log("[START] Full URL at start:", window.location.href);
            const d = new URL(window.location.href).searchParams,
                u = d.get("p"),
                g = d.get("t"),
                E = d.get("sw"),
                M = d.get("s");
            console.log("[START] URL params captured:", { urlPattern: u, urlTempo: g, urlSwing: E, urlSynth: M }),
                (this.skipUrlUpdate = !0),
                console.log("Starting setupControls..."),
                this.setupControls(),
                console.log("setupControls done, starting setupOctaveSelector..."),
                this.setupOctaveSelector(),
                console.log("setupOctaveSelector done, starting setupKeyboard..."),
                this.setupKeyboard(),
                console.log("setupKeyboard done, starting initComputerKeyboard..."),
                this.initComputerKeyboard(),
                console.log("initComputerKeyboard done, starting setupSequencer..."),
                this.setupSequencer(),
                console.log("setupSequencer done"),
                (this.skipUrlUpdate = !1),
                console.log("Starting loadDefaults..."),
                await this.loadDefaults(u, g, E, M),
                console.log("loadDefaults done"),
                console.log("Starting autoStartSequencer..."),
                this.autoStartSequencer(),
                console.log("autoStartSequencer done"),
                console.log("DB303 ready at", this.audioContext.sampleRate, "Hz");
            const w = document.getElementById("globalShare");
            w && (w.style.display = "");
        } catch (o) {
            console.error("Failed to start:", o),
                (t.textContent = "❌ Error: " + o.message),
                (n.disabled = !1),
                (a.disabled = !1);
        }
    }
    setupControls() {
        const e = {
            CUTOFF_MIN: this.CUTOFF_MIN,
            CUTOFF_MAX: this.CUTOFF_MAX,
            DECAY_MIN: this.DECAY_MIN,
            DECAY_MAX: this.DECAY_MAX,
            ATTACK_MIN: this.ATTACK_MIN,
            ATTACK_MAX: this.ATTACK_MAX,
            ACCENT_ATTACK_MIN: this.ACCENT_ATTACK_MIN,
            ACCENT_ATTACK_MAX: this.ACCENT_ATTACK_MAX,
            SLIDE_MIN: this.SLIDE_MIN,
            SLIDE_MAX: this.SLIDE_MAX,
            LFO_RATE_MIN: this.LFO_RATE_MIN,
            LFO_RATE_MAX: this.LFO_RATE_MAX,
            FILTER_INPUT_DRIVE_MAX: this.FILTER_INPUT_DRIVE_MAX,
        };
        qe(this.engine, this.synthState, e, () => this.saveSynthSettingsToStorage()),
            this.setupKnob(
                "cutoff",
                (d) => {
                    if (this.synthState.extendedCutoff) {
                        const u = 10 * Math.pow(500, d);
                        this.engine.setCutoffHz(u),
                            (document.getElementById("cutoffValue").textContent = Math.round(u) + " Hz");
                    } else {
                        this.engine.setCutoff(d);
                        const u = Math.round(this.CUTOFF_MIN * Math.pow(this.CUTOFF_MAX / this.CUTOFF_MIN, d));
                        document.getElementById("cutoffValue").textContent = u + " Hz";
                    }
                    window.synthCutoff = d;
                },
                "cutoff"
            ),
            this.setupKnob(
                "resonance",
                (d) => {
                    this.engine.setResonance(d),
                        (document.getElementById("resonanceValue").textContent = Math.round(d * 100) + "%"),
                        (window.synthResonance = d);
                },
                "resonance"
            ),
            this.setupKnob(
                "envMod",
                (d) => {
                    if (this.synthState.extendedEnvMod) {
                        const u = d * 300;
                        this.engine.setEnvModPercent(u),
                            (document.getElementById("envModValue").textContent = Math.round(u) + "%");
                    } else
                        this.engine.setEnvMod(d),
                            (document.getElementById("envModValue").textContent = Math.round(d * 100) + "%");
                },
                "envMod"
            ),
            document.querySelectorAll(".lfo-wave-btn").forEach((d) => {
                d.addEventListener("click", () => {
                    const u = parseInt(d.dataset.wave) || 0;
                    isNaN(u) ||
                        (this.engine.setLfoWaveform(u),
                        (this.synthState.lfoWaveform = u),
                        document.querySelectorAll(".lfo-wave-btn").forEach((g) => g.classList.remove("active")),
                        d.classList.add("active"),
                        this.updateUrlWithSynthSettings());
                });
            });
        const t = document.getElementById("filterSelect");
        t &&
            t.addEventListener("change", () => {
                const d = parseInt(t.value) || 0;
                isNaN(d) ||
                    (this.engine.setFilterSelect(d),
                    (this.synthState.filterSelect = d),
                    this.updateFilterParamsVisibility(d),
                    this.updateLpBpMixForFilterType(d),
                    this.saveSynthSettingsToStorage(),
                    this.updateUrlWithSynthSettings());
            });
        const n = document.getElementById("filterFmDepth");
        if (n) {
            const d = (u) => {
                const g = parseFloat(u.target.value);
                this.engine.setKorgFilterFm(g);
            };
            n.addEventListener("input", d), n.addEventListener("change", d);
        }
        const a = document.getElementById("diodeCharacter");
        if (a) {
            const d = (u) => {
                const g = parseFloat(u.target.value);
                this.engine.setKorgWarmth(g);
            };
            a.addEventListener("input", d), a.addEventListener("change", d);
        }
        const o = document.getElementById("duffingAmount");
        if (o) {
            const d = (u) => {
                const g = parseFloat(u.target.value),
                    E = Math.abs(g) < 0.16 ? 0 : ((g > 0 ? 1 : -1) * (Math.abs(g) - 0.16)) / 0.84;
                this.engine.setKorgStiffness(E);
            };
            o.addEventListener("input", d), o.addEventListener("change", d);
        }
        const s = document.getElementById("resTracking");
        if (s) {
            const d = (u) => {
                const g = parseFloat(u.target.value);
                this.engine.setKorgIbiasScale(0.1 + g * 3.9);
            };
            s.addEventListener("input", d), s.addEventListener("change", d);
        }
        const r = document.querySelectorAll("#chorusModeSelect button");
        r.forEach((d) => {
            d.addEventListener("click", () => {
                const u = parseInt(d.dataset.mode);
                this.engine.setChorusMode(u),
                    (this.synthState.chorusMode = u),
                    r.forEach((g) => g.classList.remove("active")),
                    d.classList.add("active"),
                    this.updateUrlWithSynthSettings();
            });
        });
        const l = document.getElementById("extendedCutoff");
        l &&
            l.addEventListener("change", () => {
                this.synthState.extendedCutoff = l.checked;
                const d = document.getElementById("cutoff");
                d && d.dispatchEvent(new Event("input")), this.saveSynthSettingsToStorage();
            });
        const c = document.getElementById("extendedEnvMod");
        c &&
            c.addEventListener("change", () => {
                this.synthState.extendedEnvMod = c.checked;
                const d = document.getElementById("envMod");
                d && d.dispatchEvent(new Event("input")), this.saveSynthSettingsToStorage();
            }),
            this.engine.setOversamplingOrder(2),
            (this.synthState.oversamplingOrder = 2);
        try {
            this.engine.setFilterSelect(0),
                (this.synthState.filterSelect = 0),
                this.updateFilterParamsVisibility(0),
                this.updateLpBpMixForFilterType(0);
            const d = document.getElementById("filterSelect");
            d && (d.value = "0");
        } catch (d) {
            console.error("Error setting initial parameters:", d);
        }
    }
    setupKnob(e, t, n = null) {
        const a = document.getElementById(e);
        if (!a) return;
        const o = [
                "waveform",
                "pulseWidth",
                "subOscGain",
                "subOscBlend",
                "cutoff",
                "resonance",
                "envMod",
                "decay",
                "accent",
                "normalDecay",
                "accentDecay",
                "softAttack",
                "accentSoftAttack",
                "passbandCompensation",
                "resTracking",
                "filterInputDrive",
                "filterSelect",
                "diodeCharacter",
                "duffingAmount",
                "filterFmDepth",
                "lpBpMix",
                "extendedCutoff",
                "extendedEnvMod",
                "filterTracking",
                "slideTime",
                "lfoWaveform",
                "lfoRate",
                "lfoContour",
                "lfoPitchDepth",
                "lfoPwmDepth",
                "lfoFilterDepth",
                "chorusMode",
                "chorusMix",
                "phaserRate",
                "phaserWidth",
                "phaserFeedback",
                "phaserMix",
                "delayTime",
                "delayFeedback",
                "delayTone",
                "delayMix",
                "delaySpread",
            ],
            s = (l) => {
                t(l),
                    n &&
                        this.synthState &&
                        this.synthState.hasOwnProperty(n) &&
                        ((this.synthState[n] = l), o.includes(n) && this.updateUrlWithSynthSettings());
            };
        a.addEventListener("change", (l) => s(parseFloat(l.target.value))),
            a.addEventListener("input", (l) => s(parseFloat(l.target.value)));
        const r = parseFloat(a.value);
        isNaN(r) || s(r);
    }
    setupOctaveSelector() {
        const e = document.getElementById("octaveDisplay"),
            t = document.getElementById("octaveDown"),
            n = document.getElementById("octaveUp");
        !e ||
            !t ||
            !n ||
            (t.addEventListener("click", () => {
                this.currentOctave > 0 &&
                    (this.currentOctave--, (e.textContent = this.currentOctave), this.updateKeyboardDisplay());
            }),
            n.addEventListener("click", () => {
                this.currentOctave < 6 &&
                    (this.currentOctave++, (e.textContent = this.currentOctave), this.updateKeyboardDisplay());
            }));
    }
    updateKeyboardDisplay() {
        const t = document.getElementById("keyboard").querySelectorAll(".key"),
            n = this.currentOctave * 12 + 12;
        t.forEach((a, o) => {
            a.dataset.note = n + o;
        });
    }
    setupKeyboard() {
        const e = document.getElementById("keyboard"),
            t = this.currentOctave * 12 + 12,
            n = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "C"];
        for (let a = 0; a < n.length; a++) {
            const o = document.createElement("div");
            (o.className = "key"), n[a].includes("#") && o.classList.add("black");
            const s = t + a;
            o.addEventListener("mousedown", () => {
                const r = parseInt(o.dataset.note);
                this.noteOn(r, 100), (o.dataset.playingNote = r), o.classList.add("active");
            }),
                o.addEventListener("mouseup", () => {
                    o.dataset.playingNote &&
                        (this.noteOff(parseInt(o.dataset.playingNote)), delete o.dataset.playingNote),
                        o.classList.remove("active");
                }),
                o.addEventListener("mouseleave", () => {
                    if (o.dataset.playingNote) {
                        const r = parseInt(o.dataset.playingNote);
                        this.activeNotes.has(r) && this.noteOff(r),
                            delete o.dataset.playingNote,
                            o.classList.remove("active");
                    }
                }),
                o.addEventListener("touchstart", (r) => {
                    r.preventDefault();
                    const l = parseInt(o.dataset.note);
                    this.noteOn(l, 100), (o.dataset.playingNote = l), o.classList.add("active");
                }),
                o.addEventListener("touchend", (r) => {
                    r.preventDefault(),
                        o.dataset.playingNote &&
                            (this.noteOff(parseInt(o.dataset.playingNote)), delete o.dataset.playingNote),
                        o.classList.remove("active");
                }),
                (o.dataset.note = s),
                e.appendChild(o);
        }
    }
    setupSequencer() {
        const e = document.getElementById("sequencerGrid");
        if (!e) return;
        (this.sequencerState = Array(32)
            .fill(null)
            .map(() => ({ key: 0, octave: 0, accent: !1, slide: !1, gate: !0, mute: !1, hammer: !1 }))),
            Ee(e, this.sequencerState, {
                onStepChange: (h, v) => {
                    (this.sequencerState[h] = v), this.updateSequencerStep(h);
                },
                onStepSelect: (h) => this.selectStep(h),
                onStepPreview: (h) => this.triggerStepPreview(h),
                getNumSteps: () => (this.engine ? this.engine.getSequencerNumSteps() : 16),
            });
        for (let h = 0; h < 16; h++) this.updateSequencerStep(h);
        B(16),
            (this.selectedStep = V(0, 16)),
            this.setupKnob(
                "tempo",
                (h) => {
                    this.engine &&
                        (this.engine.setSequencerTempo(h),
                        this.engine.setDelayTime(parseFloat(document.getElementById("delayTime").value))),
                        (document.getElementById("tempoValue").textContent = Math.round(h) + " BPM"),
                        this.updateUrlWithPattern(),
                        this.updateWormAnimation(h);
                },
                "tempo"
            ),
            this.setupKnob(
                "swing",
                (h) => {
                    this.engine && this.engine.setSequencerSwing(h),
                        (document.getElementById("swingValue").textContent = Math.round(h * 100) + "%");
                },
                "swing"
            );
        const t = document.getElementById("patternLength");
        if (t) {
            let h = 16;
            t.addEventListener("change", (v) => {
                const T = parseInt(v.target.value);
                if (T >= 1 && T <= 32) {
                    if (T > h) {
                        ke(this.sequencerState, h, T);
                        for (let C = h; C < T; C++) x(C, this.sequencerState[C]), this.updateSequencerStep(C);
                    }
                    (h = T), (this.synthState.patternLength = T), this.engine.setSequencerNumSteps(T), B(T);
                }
            });
        }
        this.setupKnob(
            "transpose",
            (h) => {
                const v = Math.round(h),
                    T = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
                    C = Math.floor(v / 12) - 1,
                    k = T[v % 12];
                (document.getElementById("transposeValue").textContent = k + C),
                    this.sequencerRunning && this.engine && this.engine.setSequencerRootNote(v);
            },
            "transpose"
        );
        const n = document.getElementById("scaleMode");
        n &&
            n.addEventListener("change", () => {
                (this.currentScale = n.value), R(this.sequencerState, this.currentScale), this.savePatternToStorage();
            });
        const a = document.getElementById("seqPlayStop");
        a &&
            (a.onclick = () => {
                var h, v, T;
                if (this.engine)
                    if (a.classList.contains("active")) {
                        this.engine.stopSequencer(),
                            (this.sequencerRunning = !1),
                            a.classList.remove("active"),
                            (a.textContent = "▶ PLAY"),
                            document.querySelectorAll(".seq-step").forEach((k) => k.classList.remove("current"));
                        const C = parseFloat((h = document.getElementById("tempo")) == null ? void 0 : h.value) || 120;
                        this.updateWormAnimation(C, !1);
                    } else {
                        const C = parseInt((v = document.getElementById("transpose")) == null ? void 0 : v.value) || 36;
                        this.engine.setSequencerRootNote(C),
                            this.engine.startSequencer(),
                            (this.sequencerRunning = !0),
                            a.classList.add("active"),
                            (a.textContent = "⏹ STOP");
                        const k = parseFloat((T = document.getElementById("tempo")) == null ? void 0 : T.value) || 120;
                        this.updateWormAnimation(k, !0);
                    }
            });
        const o = document.getElementById("seqRandom");
        o && (o.onclick = () => this.randomizeUI());
        const s = document.getElementById("seqShuffle");
        s && (s.onclick = () => this.shuffleNotesUI());
        const r = document.getElementById("seqPresets");
        r && (r.onclick = () => Be(r, (h) => this.loadPatternPreset(h)));
        const l = document.getElementById("seqClear");
        l &&
            (l.onclick = async () => {
                (await $(l, "Clear pattern?")) && this.resetPatternToBlank();
            });
        const c = document.getElementById("seqExport");
        c && (c.onclick = () => this.exportPattern());
        const d = document.getElementById("seqImport");
        d && (d.onclick = () => document.getElementById("patternFileInput").click());
        const u = document.getElementById("patternFileInput");
        u &&
            (u.onchange = (h) => {
                const v = h.target.files[0];
                v && this.importPattern(v);
            });
        const g = document.getElementById("globalShare");
        g && (g.onclick = () => this.copyGlobalShareLink());
        const E = document.getElementById("presetExport");
        E && (E.onclick = () => this.exportPreset());
        const M = document.getElementById("presetImport");
        M && (M.onclick = () => document.getElementById("presetFileInput").click());
        const w = document.getElementById("presetFileInput");
        w &&
            (w.onchange = (h) => {
                const v = h.target.files[0];
                v && this.importPreset(v);
            });
        const y = document.getElementById("presetReset");
        y &&
            (y.onclick = async () => {
                (await $(y, "Reset synth?")) && this.resetToDefaults();
            });
        const I = document.getElementById("seqTransposeUp");
        I && (I.onclick = () => this.transposeSequence(1));
        const b = document.getElementById("seqTransposeDown");
        b && (b.onclick = () => this.transposeSequence(-1));
        const D = document.getElementById("seqShiftLeft");
        D && (D.onclick = () => this.shiftSequence(-1));
        const f = document.getElementById("seqShiftRight");
        f && (f.onclick = () => this.shiftSequence(1));
        const S = document.getElementById("seqTransposeUpMobile");
        S && (S.onclick = () => this.transposeSequence(1));
        const L = document.getElementById("seqTransposeDownMobile");
        L && (L.onclick = () => this.transposeSequence(-1));
        const F = document.getElementById("seqShiftLeftMobile");
        F && (F.onclick = () => this.shiftSequence(-1));
        const A = document.getElementById("seqShiftRightMobile");
        A && (A.onclick = () => this.shiftSequence(1));
    }
    autoStartSequencer() {
        var a, o;
        if (!this.engine) return;
        const e = document.getElementById("seqPlayStop"),
            t = parseInt((a = document.getElementById("transpose")) == null ? void 0 : a.value) || 36;
        this.engine.setSequencerRootNote(t),
            this.engine.startSequencer(),
            (this.sequencerRunning = !0),
            e && (e.classList.add("active"), (e.textContent = "⏹ STOP"));
        const n = parseFloat((o = document.getElementById("tempo")) == null ? void 0 : o.value) || 120;
        this.updateWormAnimation(n, !0), console.log("Sequencer auto-started");
    }
    randomizeUI() {
        const e = this.engine ? this.engine.getSequencerNumSteps() : 16;
        Le(this.sequencerState, e, this.currentScale);
        for (let t = 0; t < e; t++) x(t, this.sequencerState[t]), this.updateSequencerStep(t);
        R(this.sequencerState, this.currentScale);
    }
    shuffleNotesUI() {
        const e = this.engine ? this.engine.getSequencerNumSteps() : 16;
        De(this.sequencerState, e);
        for (let t = 0; t < e; t++) x(t, this.sequencerState[t]), this.updateSequencerStep(t);
    }
    async resetSequencer() {
        try {
            localStorage.removeItem(q.STORAGE_KEY_PATTERN), console.log("[RESET] Cleared pattern from localStorage");
            const e = await fetch("presets/default-pattern.xml");
            if (e.ok) {
                const t = await e.text();
                this.loadPatternFromXML(t), console.log("[RESET] Loaded default pattern");
            } else console.warn("[RESET] Default pattern not found, using basic reset"), this.resetPatternToBlank();
        } catch (e) {
            console.error("[RESET] Error resetting pattern:", e);
        }
    }
    resetPatternToBlank() {
        this.engine && this.engine.setSequencerNumSteps(16);
        const e = document.getElementById("patternLength");
        e && (e.value = "16"), B(16), Fe(this.sequencerState, 16);
        for (let t = 0; t < 16; t++) x(t, this.sequencerState[t]), this.updateSequencerStep(t);
        console.log("[RESET] Pattern reset to blank (16 steps of C0)");
    }
    async loadPatternPreset(e) {
        try {
            const t = await fetch(`presets/${e}`);
            if (t.ok) {
                const n = await t.text();
                this.loadPatternFromXML(n), console.log(`[PRESET] Loaded pattern: ${e}`);
            } else console.error(`[PRESET] Failed to load: ${e}`);
        } catch (t) {
            console.error(`[PRESET] Error loading ${e}:`, t);
        }
    }
    transposeSequence(e) {
        const t = this.engine ? this.engine.getSequencerNumSteps() : 16;
        xe(this.sequencerState, t, e);
        for (let n = 0; n < t; n++) x(n, this.sequencerState[n]), this.updateSequencerStep(n);
        console.log(`Sequence transposed by ${e > 0 ? "+" : ""}${e} semitone(s)`);
    }
    shiftSequence(e) {
        const t = this.engine ? this.engine.getSequencerNumSteps() : 16;
        be(this.sequencerState, t, e);
        for (let n = 0; n < t; n++) x(n, this.sequencerState[n]), this.updateSequencerStep(n);
        console.log(`Sequence shifted ${e > 0 ? "right" : "left"}`);
    }
    updateSequencerStep(e) {
        const t = this.sequencerState[e];
        this.engine &&
            t &&
            this.engine.setSequencerStep(
                e,
                t.key ?? 0,
                t.octave ?? 0,
                t.accent ?? !1,
                t.slide ?? !1,
                t.gate ?? !0,
                t.mute ?? !1,
                t.hammer ?? !1
            ),
            this.updateUrlWithPattern();
    }
    exportPattern() {
        var s, r;
        const e = this.engine ? this.engine.getSequencerNumSteps() : 16,
            t = parseFloat(document.getElementById("tempo").value) || 120,
            n = parseFloat((s = document.getElementById("swing")) == null ? void 0 : s.value) || 0,
            a = parseInt((r = document.getElementById("transpose")) == null ? void 0 : r.value) || 36,
            o = se(this.sequencerState, e, t, n, a);
        K(o, "db303-pattern.xml"), console.log("Pattern exported");
    }
    importXMLAuto(e) {
        const t = de(e);
        if (!t) throw new Error("Error parsing XML file");
        if (t === "pattern") this.loadPatternFromXML(e), console.log("Auto-detected and loaded pattern");
        else if (t === "preset") this.loadPresetFromXML(e), console.log("Auto-detected and loaded preset");
        else throw new Error("Unknown file type: expected db303-pattern or db303-preset");
    }
    importPattern(e) {
        const t = new FileReader();
        (t.onload = (n) => {
            try {
                this.importXMLAuto(n.target.result);
            } catch (a) {
                console.error("Import error:", a), alert("Error importing: " + a.message);
            }
        }),
            t.readAsText(e);
    }
    loadPatternFromXML(e) {
        const t = re(e),
            { numSteps: n, tempo: a, swing: o, rootNote: s, steps: r } = t;
        (this.skipUrlUpdate = !0), this.engine && this.engine.setSequencerNumSteps(n);
        const l = document.getElementById("patternLength");
        l && (l.value = String(n)),
            a && a >= 60 && a <= 300 && p("tempo", a),
            o !== void 0 && o >= 0 && o <= 1 && p("swing", o),
            s && s >= 24 && s <= 48 && (p("transpose", s), this.engine && this.engine.setSequencerRootNote(s)),
            r.forEach((c, d) => {
                (this.sequencerState[d] = { ...c, octave: Math.max(-1, Math.min(1, c.octave)) }),
                    x(d, this.sequencerState[d]),
                    this.updateSequencerStep(d);
            }),
            B(n),
            (this.skipUrlUpdate = !1),
            this.updateUrlWithPattern(),
            console.log("[LOAD] Pattern loaded from XML:", { numSteps: n, tempo: a });
    }
    async loadDefaults(e = null, t = null, n = null, a = null) {
        try {
            console.log("[DEFAULTS] loadDefaults called with:", {
                urlPattern: e,
                urlTempo: t,
                urlSwing: n,
                urlSynth: a,
            }),
                console.log("[DEFAULTS] Current URL:", window.location.href);
            let o = !1;
            if (
                (a &&
                    ((o = this.loadSynthSettingsFromUrlParams(a)),
                    o && console.log("[DEFAULTS] Synth settings loaded from URL")),
                o ||
                    ((o = this.loadSynthSettingsFromStorage()),
                    o && console.log("[DEFAULTS] Synth settings loaded from localStorage")),
                !o)
            )
                try {
                    const r = await fetch("presets/default-preset.xml");
                    if (r.ok) {
                        const l = await r.text();
                        this.loadPresetFromXML(l), console.log("[DEFAULTS] Synth settings loaded from default preset");
                    } else console.warn("Default preset not found, using hardcoded defaults");
                } catch (r) {
                    console.warn("Could not load default preset:", r.message);
                }
            let s = !1;
            if (
                (e &&
                    ((s = this.loadPatternFromUrlParams(e, t, n)),
                    s && console.log("[DEFAULTS] Pattern loaded from URL")),
                s ||
                    ((s = this.loadPatternFromStorage()),
                    s && console.log("[DEFAULTS] Pattern loaded from localStorage")),
                !s)
            )
                try {
                    const r = await fetch("presets/default-pattern.xml");
                    if (r.ok) {
                        const l = await r.text();
                        this.loadPatternFromXML(l), console.log("[DEFAULTS] Pattern loaded from default preset");
                    } else console.warn("Default pattern not found, using hardcoded defaults");
                } catch (r) {
                    console.warn("Could not load default pattern:", r.message);
                }
            (e || a) &&
                (window.history.replaceState({}, "", window.location.pathname),
                console.log("[DEFAULTS] Cleared URL params after loading shared link"));
        } catch (o) {
            console.error("Error loading defaults:", o);
        }
    }
    exportPreset() {
        if (!this.synthState) {
            console.error("synthState not initialized"),
                alert("Error: Synth state not initialized. Please wait for the synth to fully load.");
            return;
        }
        const e = le(this.synthState);
        K(e, "db303-preset.xml"), console.log("Preset exported");
    }
    importPreset(e) {
        const t = new FileReader();
        (t.onload = (n) => {
            try {
                this.importXMLAuto(n.target.result);
            } catch (a) {
                console.error("Import error:", a), alert("Error importing: " + a.message);
            }
        }),
            t.readAsText(e);
    }
    loadPresetFromXML(e) {
        var n;
        const t = ce(e);
        if ((fe(t), t.filterSelect !== null && !isNaN(t.filterSelect) && this.engine)) {
            const a = Math.floor(Number(t.filterSelect)) || 0;
            this.engine.setFilterSelect(a),
                (this.synthState.filterSelect = a),
                this.updateFilterParamsVisibility(a),
                this.updateLpBpMixForFilterType(a);
            const o = document.getElementById("filterSelect");
            o && (o.value = String(a));
        }
        if (t.lfoWaveform !== null && !isNaN(t.lfoWaveform) && this.engine) {
            const a = Math.floor(Number(t.lfoWaveform)) || 0;
            this.engine.setLfoWaveform(a),
                (this.synthState.lfoWaveform = a),
                document.querySelectorAll(".lfo-wave-btn").forEach((o, s) => {
                    o.classList.toggle("active", s === a);
                });
        }
        if (t.chorusMode !== null && !isNaN(t.chorusMode) && (n = this.engine) != null && n.setChorusMode) {
            const a = Math.floor(Number(t.chorusMode)) || 0;
            this.engine.setChorusMode(a),
                (this.synthState.chorusMode = a),
                document.querySelectorAll("#chorusModeSelect button").forEach((o, s) => {
                    o.classList.toggle("active", s === a);
                });
        }
        console.log("Preset loaded successfully");
    }
    selectStep(e) {
        const t = this.engine ? this.engine.getSequencerNumSteps() : 16;
        this.selectedStep = V(e, t);
    }
    setSelectedStepNote(e) {
        var t;
        if (
            G(e, this.currentScale) &&
            ((this.sequencerState[this.selectedStep].key = e),
            x(this.selectedStep, this.sequencerState[this.selectedStep]),
            this.updateSequencerStep(this.selectedStep),
            R(this.sequencerState, this.currentScale),
            this.engine)
        ) {
            const n = this.sequencerState[this.selectedStep],
                o =
                    (parseInt((t = document.getElementById("transpose")) == null ? void 0 : t.value) || 36) +
                    n.key +
                    n.octave * 12;
            this.engine.noteOn(o, 80),
                setTimeout(() => {
                    this.engine && this.engine.noteOff(o);
                }, 150);
        }
    }
    changeSelectedStepOctave(e) {
        var s;
        const t = document.getElementById(`step-${this.selectedStep}`);
        if (!t) return;
        const n = this.sequencerState[this.selectedStep].octave;
        let a = n + e;
        if (((a = Math.max(-1, Math.min(1, a))), a === n)) return;
        (this.sequencerState[this.selectedStep].octave = a), this.updateSequencerStep(this.selectedStep);
        const o = t.querySelector(`input[name="oct-${this.selectedStep}"][value="${a}"]`);
        if ((o && (o.checked = !0), this.engine)) {
            const r = this.sequencerState[this.selectedStep],
                c =
                    (parseInt((s = document.getElementById("transpose")) == null ? void 0 : s.value) || 36) +
                    r.key +
                    r.octave * 12;
            this.engine.noteOn(c, 80),
                setTimeout(() => {
                    this.engine && this.engine.noteOff(c);
                }, 150);
        }
    }
    triggerStepPreview(e) {
        var o;
        if (!this.engine) return;
        const t = this.sequencerState[e];
        if (!t.gate) return;
        const a =
            (parseInt((o = document.getElementById("transpose")) == null ? void 0 : o.value) || 36) +
            t.key +
            t.octave * 12;
        this.engine.noteOn(a, 60),
            setTimeout(() => {
                this.engine && this.engine.noteOff(a);
            }, 150);
    }
    initComputerKeyboard() {
        ue({
            onNoteKey: (e) => this.setSelectedStepNote(e),
            onStepLeft: () => this.selectStep(this.selectedStep - 1),
            onStepRight: () => this.selectStep(this.selectedStep + 1),
            onOctaveUp: () => this.changeSelectedStepOctave(1),
            onOctaveDown: () => this.changeSelectedStepOctave(-1),
            onPlayStop: () => {
                const e = document.getElementById("seqPlayStop");
                e && e.click();
            },
            onKeyboardOctaveDown: () => {
                this.currentOctave > 0 &&
                    (this.currentOctave--,
                    (document.getElementById("octaveDisplay").textContent = String(this.currentOctave)),
                    this.updateKeyboardDisplay());
            },
            onKeyboardOctaveUp: () => {
                this.currentOctave < 6 &&
                    (this.currentOctave++,
                    (document.getElementById("octaveDisplay").textContent = String(this.currentOctave)),
                    this.updateKeyboardDisplay());
            },
        });
    }
    noteOn(e, t) {
        this.engine && (this.activeNotes.add(e), console.log("Note ON:", e, "velocity:", t), this.engine.noteOn(e, t));
    }
    noteOff(e) {
        this.engine && (this.activeNotes.delete(e), console.log("Note OFF:", e), this.engine.noteOff(e));
    }
    allNotesOff() {
        this.engine && (this.activeNotes.clear(), this.engine.allNotesOff());
    }
    updateVisualizer() {
        if (!this.analyser || !this.visualizer) return;
        const e = new Uint8Array(this.analyser.fftSize);
        this.analyser.getByteTimeDomainData(e),
            this.visualizer.updateWaveform(e),
            requestAnimationFrame(() => this.updateVisualizer());
    }
}
console.log("🚀 Script loaded, waiting for DOMContentLoaded...");
window.addEventListener("DOMContentLoaded", () => {
    console.log("📄 DOMContentLoaded fired, creating DB303App..."), (window.db303App = new q());
});
