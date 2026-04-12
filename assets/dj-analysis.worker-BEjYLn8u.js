(function() {
  "use strict";
  let essentiaInstance = null;
  let essentiaModule = null;
  let essentiaReady = false;
  async function initEssentia() {
    if (essentiaReady) return;
    const baseUrl = self.location.origin;
    const wasmGlueUrl = `${baseUrl}/essentia/essentia-wasm.web.js`;
    const coreUrl = `${baseUrl}/essentia/essentia.js-core.es.js`;
    const wasmResponse = await fetch(wasmGlueUrl);
    let wasmGlueCode = await wasmResponse.text();
    wasmGlueCode = wasmGlueCode.replace(/import\.meta\.url/g, `"${wasmGlueUrl}"`);
    wasmGlueCode = wasmGlueCode.replace(/export\s+default\s+/g, "var EssentiaWASM = ");
    wasmGlueCode = wasmGlueCode.replace(/export\s*\{[^}]*\}/g, "");
    wasmGlueCode = wasmGlueCode.replace(/var ENVIRONMENT_IS_WEB=true;var ENVIRONMENT_IS_WORKER=false;/g, "var ENVIRONMENT_IS_WEB=false;var ENVIRONMENT_IS_WORKER=true;");
    wasmGlueCode = 'var document = { currentScript: { src: "' + wasmGlueUrl + '" }, title: "" };\n' + wasmGlueCode;
    const wasmFactory = new Function(wasmGlueCode + '\n;return typeof EssentiaWASM !== "undefined" ? EssentiaWASM : Module;')();
    essentiaModule = await wasmFactory();
    const coreResponse = await fetch(coreUrl);
    let coreCode = await coreResponse.text();
    coreCode = coreCode.replace(/export\s+default\s+/g, "var Essentia = ");
    coreCode = coreCode.replace(/export\s*\{[^}]*\}/g, "");
    coreCode = coreCode.replace(/import\s+.*?from\s+['"][^'"]+['"];?/g, "");
    const EssentiaClass = new Function(coreCode + '\n;return typeof Essentia !== "undefined" ? Essentia : null;')();
    if (!EssentiaClass) {
      throw new Error("Failed to load Essentia core class");
    }
    essentiaInstance = new EssentiaClass(essentiaModule);
    essentiaReady = true;
    console.log("[DJAnalysisWorker] Essentia initialized, version:", essentiaInstance.version || "unknown");
  }
  function mixToMono(left, right) {
    if (!right) return left;
    const mono = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) {
      mono[i] = (left[i] + right[i]) * 0.5;
    }
    return mono;
  }
  function analyzeRhythm(mono, essentia) {
    var _a, _b, _c;
    try {
      const signal = essentia.arrayToVector(mono);
      const result = essentia.RhythmExtractor2013(signal, 208, "multifeature", 40);
      const bpm = result.bpm ?? 0;
      const confidence = Math.min(1, Math.max(0, (result.confidence ?? 0) / 5.32));
      const ticks = [];
      if (result.ticks) {
        const ticksSize = result.ticks.size();
        for (let i = 0; i < ticksSize; i++) {
          ticks.push(result.ticks.get(i));
        }
      }
      try {
        signal.delete();
      } catch {
      }
      try {
        (_a = result.ticks) == null ? void 0 : _a.delete();
      } catch {
      }
      try {
        (_b = result.estimates) == null ? void 0 : _b.delete();
      } catch {
      }
      try {
        (_c = result.bpmIntervals) == null ? void 0 : _c.delete();
      } catch {
      }
      return { bpm, confidence, beats: ticks };
    } catch (err) {
      console.warn("[DJAnalysisWorker] RhythmExtractor2013 failed:", err);
      return { bpm: 0, confidence: 0, beats: [] };
    }
  }
  function analyzeKey(mono, sampleRate, essentia) {
    try {
      const signal = essentia.arrayToVector(mono);
      const result = essentia.KeyExtractor(
        signal,
        true,
        // averageDetuningCorrection
        4096,
        // frameSize
        4096,
        // hopSize
        36,
        // hpcpSize
        5e3,
        // maxFrequency
        60,
        // maximumSpectralPeaks
        25,
        // minFrequency
        0.2,
        // pcpThreshold
        "bgate",
        // profileType (Bgate — good for electronic/dance music)
        sampleRate
      );
      const key = `${result.key ?? "Unknown"} ${result.scale ?? ""}`.trim();
      const confidence = result.strength ?? 0;
      try {
        signal.delete();
      } catch {
      }
      return { key, confidence };
    } catch (err) {
      console.warn("[DJAnalysisWorker] KeyExtractor failed:", err);
      return { key: "Unknown", confidence: 0 };
    }
  }
  function detectDownbeats(beats, mono, sampleRate) {
    if (beats.length < 4) {
      return { downbeats: beats.length > 0 ? [beats[0]] : [], timeSignature: 4 };
    }
    const windowSamples = Math.floor(sampleRate * 0.05);
    const energies = [];
    for (const beat of beats) {
      const center = Math.floor(beat * sampleRate);
      const start = Math.max(0, center - windowSamples);
      const end = Math.min(mono.length, center + windowSamples);
      let energy = 0;
      for (let i = start; i < end; i++) {
        energy += mono[i] * mono[i];
      }
      energies.push(energy);
    }
    let bestPeriod = 4;
    let bestScore = -Infinity;
    for (const period of [3, 4]) {
      let score = 0;
      const groupCount = Math.floor(beats.length / period);
      if (groupCount < 2) continue;
      for (let g = 0; g < groupCount; g++) {
        const idx = g * period;
        if (idx < energies.length) {
          const first = energies[idx];
          let otherAvg = 0;
          let otherCount = 0;
          for (let j = 1; j < period && idx + j < energies.length; j++) {
            otherAvg += energies[idx + j];
            otherCount++;
          }
          otherAvg = otherCount > 0 ? otherAvg / otherCount : 0;
          score += first - otherAvg;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestPeriod = period;
      }
    }
    const downbeats = [];
    for (let i = 0; i < beats.length; i += bestPeriod) {
      downbeats.push(beats[i]);
    }
    return { downbeats, timeSignature: bestPeriod };
  }
  function computeLoudness(mono) {
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < mono.length; i++) {
      const v = mono[i];
      sumSq += v * v;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sumSq / mono.length);
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -100;
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -100;
    return { rmsDb, peakDb };
  }
  function computeFrequencyPeaks(left, right, sampleRate, numBins) {
    const totalSamples = left.length;
    const samplesPerBin = Math.floor(totalSamples / numBins);
    if (samplesPerBin < 1) return [[0], [0], [0]];
    const lowPeaks = new Float32Array(numBins);
    const midPeaks = new Float32Array(numBins);
    const highPeaks = new Float32Array(numBins);
    const lpFreq = 200;
    const hpFreq = 2e3;
    const dt = 1 / sampleRate;
    const alphaLP = 2 * Math.PI * dt * lpFreq / (2 * Math.PI * dt * lpFreq + 1);
    const alphaHP = 1 / (2 * Math.PI * dt * hpFreq + 1);
    let lowState = 0;
    let highState = 0;
    for (let bin = 0; bin < numBins; bin++) {
      const start = bin * samplesPerBin;
      const end = Math.min(start + samplesPerBin, totalSamples);
      let maxLow = 0;
      let maxMid = 0;
      let maxHigh = 0;
      for (let i = start; i < end; i++) {
        let sample = left[i];
        if (right) sample = (sample + right[i]) * 0.5;
        const absSample = Math.abs(sample);
        lowState = lowState + alphaLP * (absSample - lowState);
        const lowVal = lowState;
        const highVal = alphaHP * (highState + absSample - (i > 0 ? Math.abs(left[i - 1]) : 0));
        highState = highVal;
        const midVal = Math.max(0, absSample - lowVal - Math.abs(highVal));
        if (lowVal > maxLow) maxLow = lowVal;
        if (midVal > maxMid) maxMid = midVal;
        const absHigh = Math.abs(highVal);
        if (absHigh > maxHigh) maxHigh = absHigh;
      }
      lowPeaks[bin] = maxLow;
      midPeaks[bin] = maxMid;
      highPeaks[bin] = maxHigh;
    }
    const normalize = (arr) => {
      let max = 0;
      for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
      if (max === 0) return Array.from(arr);
      const result = new Array(arr.length);
      for (let i = 0; i < arr.length; i++) result[i] = arr[i] / max;
      return result;
    };
    return [normalize(lowPeaks), normalize(midPeaks), normalize(highPeaks)];
  }
  function classifyGenre(bpm, key, timeSignature, frequencyPeaks, rmsDb, beats, _mono, _sampleRate) {
    const [lowBand, midBand, highBand] = frequencyPeaks;
    const avgLow = lowBand.reduce((a, b) => a + b, 0) / lowBand.length;
    const avgMid = midBand.reduce((a, b) => a + b, 0) / midBand.length;
    const avgHigh = highBand.reduce((a, b) => a + b, 0) / highBand.length;
    const totalEnergy = avgLow + avgMid + avgHigh + 1e-3;
    const bassRatio = avgLow / totalEnergy;
    const midRatio = avgMid / totalEnergy;
    const highRatio = avgHigh / totalEnergy;
    const isBassHeavy = bassRatio > 0.45;
    const isMidHeavy = midRatio > 0.4;
    const isBright = avgHigh > avgLow * 0.8;
    const isDark = avgLow > avgHigh * 2;
    const spectralVariance = Math.sqrt(
      Math.pow(bassRatio - 0.33, 2) + Math.pow(midRatio - 0.33, 2) + Math.pow(highRatio - 0.33, 2)
    );
    const isBalanced = spectralVariance < 0.15;
    let beatVariance = 0;
    if (beats.length > 2) {
      const intervals = [];
      for (let i = 1; i < beats.length; i++) {
        intervals.push(beats[i] - beats[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      beatVariance = intervals.reduce((a, b) => a + Math.pow(b - avgInterval, 2), 0) / intervals.length;
    }
    const beatRegularity = Math.max(0, 1 - beatVariance * 10);
    const isFourOnFloor = beatRegularity > 0.65 && beats.length > 16;
    const isSyncopated = beatRegularity < 0.5 && beats.length > 8;
    const isBreakbeat = beatRegularity > 0.3 && beatRegularity < 0.65;
    const trackDuration = beats.length > 1 ? beats[beats.length - 1] - beats[0] : 1;
    const beatDensity = beats.length / Math.max(trackDuration, 1);
    const isDense = beatDensity > 3;
    const energy = Math.min(1, Math.max(0, (rmsDb + 40) / 40));
    const isHighEnergy = energy > 0.65;
    const isMidEnergy = energy > 0.4 && energy <= 0.65;
    const isLowEnergy = energy <= 0.4;
    const isMinor = key.toLowerCase().includes("minor");
    const isMajor = key.toLowerCase().includes("major");
    let effectiveBpm = bpm;
    if (bpm >= 55 && bpm < 75 && isHighEnergy && isFourOnFloor) {
      effectiveBpm = bpm * 2;
    } else if (bpm >= 75 && bpm < 95 && isHighEnergy && beatRegularity > 0.6) {
      if (isFourOnFloor && !isSyncopated) {
        effectiveBpm = bpm * 2;
      }
    }
    if (bpm > 200 && bpm <= 280 && !isHighEnergy) {
      effectiveBpm = bpm / 2;
    }
    const bpmDanceScore = effectiveBpm >= 115 && effectiveBpm <= 135 ? 1 : (
      // House/techno sweet spot
      effectiveBpm >= 100 && effectiveBpm <= 150 ? 0.85 : effectiveBpm >= 85 && effectiveBpm <= 170 ? 0.7 : effectiveBpm >= 70 && effectiveBpm <= 180 ? 0.5 : 0.3
    );
    const danceability = bpmDanceScore * 0.4 + beatRegularity * 0.4 + energy * 0.2;
    let mood;
    if (isMinor && isDark && isHighEnergy) {
      mood = "Dark & Intense";
    } else if (isMinor && isDark && !isHighEnergy) {
      mood = "Melancholic";
    } else if (isHighEnergy && isBright) {
      mood = "Euphoric";
    } else if (isHighEnergy) {
      mood = "Energetic";
    } else if (isLowEnergy && isDark) {
      mood = "Atmospheric";
    } else if (isLowEnergy) {
      mood = "Chill";
    } else if (isMajor && isBright) {
      mood = "Uplifting";
    } else {
      mood = "Driving";
    }
    let primary;
    let subgenre;
    let confidence = 0.55;
    const isChiptuneSpectrum = highRatio > 0.35 && midRatio > bassRatio && !isBassHeavy;
    const isAcidSpectrum = midRatio > 0.38 && highRatio > 0.25 && isHighEnergy;
    const isIndustrial = isDark && isHighEnergy && spectralVariance > 0.2;
    const isAmbientSpectrum = isLowEnergy && beatRegularity < 0.4 && !isBassHeavy;
    if (effectiveBpm >= 180) {
      primary = "Electronic";
      if (effectiveBpm >= 200) {
        if (isHighEnergy && isDark) {
          subgenre = "Speedcore";
          confidence = 0.7;
        } else if (isHighEnergy) {
          subgenre = "Gabber";
          confidence = 0.65;
        } else {
          subgenre = "Happy Hardcore";
          confidence = 0.6;
        }
      } else {
        if (isChiptuneSpectrum) {
          subgenre = "Happy Hardcore";
          confidence = 0.7;
        } else if (isIndustrial) {
          subgenre = "Industrial Hardcore";
          confidence = 0.65;
        } else {
          subgenre = "Hardcore";
          confidence = 0.6;
        }
      }
    } else if (effectiveBpm >= 160 && effectiveBpm < 180) {
      primary = "Electronic";
      if (isBassHeavy && isBreakbeat) {
        subgenre = "Drum & Bass";
        confidence = 0.75;
        if (isDark && isHighEnergy) {
          subgenre = "Neurofunk";
          confidence = 0.7;
        } else if (isBright && isMidEnergy) {
          subgenre = "Liquid D&B";
          confidence = 0.65;
        }
      } else if (isBassHeavy && isSyncopated) {
        subgenre = "Jungle";
        confidence = 0.7;
      } else if (isChiptuneSpectrum) {
        subgenre = "Chiptune";
        confidence = 0.7;
      } else if (isFourOnFloor && isHighEnergy) {
        subgenre = "Hard Trance";
        confidence = 0.65;
      } else {
        subgenre = "Breakcore";
        confidence = 0.55;
      }
    } else if (effectiveBpm >= 138 && effectiveBpm < 160) {
      primary = "Electronic";
      if (isFourOnFloor && isHighEnergy && isBassHeavy) {
        if (effectiveBpm >= 150) {
          subgenre = "Hardstyle";
          confidence = 0.75;
        } else {
          subgenre = "Hard Techno";
          confidence = 0.7;
        }
      } else if (isFourOnFloor && isBright && isHighEnergy) {
        subgenre = "Uplifting Trance";
        confidence = 0.7;
      } else if (isFourOnFloor && isMidHeavy) {
        if (isMinor) {
          subgenre = "Psytrance";
          confidence = 0.65;
        } else {
          subgenre = "Trance";
          confidence = 0.65;
        }
      } else if (isAcidSpectrum && isFourOnFloor) {
        subgenre = "Acid Techno";
        confidence = 0.7;
      } else if (isChiptuneSpectrum) {
        subgenre = "Chiptune";
        confidence = 0.7;
      } else if (isIndustrial) {
        subgenre = "Industrial";
        confidence = 0.6;
      } else {
        subgenre = "Eurodance";
        confidence = 0.55;
      }
    } else if (effectiveBpm >= 125 && effectiveBpm < 138) {
      primary = "Electronic";
      if (isAcidSpectrum && isFourOnFloor) {
        subgenre = "Acid Techno";
        confidence = 0.75;
      } else if (isFourOnFloor && isBassHeavy && isDark) {
        subgenre = "Techno";
        confidence = 0.75;
        if (isIndustrial) {
          subgenre = "Industrial Techno";
          confidence = 0.7;
        }
      } else if (isFourOnFloor && isBassHeavy && isHighEnergy) {
        subgenre = "Peak Time Techno";
        confidence = 0.7;
      } else if (isFourOnFloor && isBalanced && isMidEnergy) {
        subgenre = "Minimal Techno";
        confidence = 0.65;
      } else if (isFourOnFloor && isBright) {
        subgenre = "Progressive Trance";
        confidence = 0.65;
      } else if (isChiptuneSpectrum) {
        subgenre = "Chiptune";
        confidence = 0.7;
      } else if (isFourOnFloor) {
        subgenre = "Tech House";
        confidence = 0.6;
      } else if (isBreakbeat) {
        subgenre = "Breakbeat";
        confidence = 0.6;
      } else {
        subgenre = "Electronic";
        confidence = 0.5;
      }
    } else if (effectiveBpm >= 118 && effectiveBpm < 125) {
      primary = "Electronic";
      if (isAcidSpectrum && isFourOnFloor) {
        subgenre = "Acid House";
        confidence = 0.75;
      } else if (isFourOnFloor && isBassHeavy && isHighEnergy) {
        subgenre = "Tech House";
        confidence = 0.7;
      } else if (isFourOnFloor && isBright && isHighEnergy) {
        subgenre = "Electro House";
        confidence = 0.7;
      } else if (isFourOnFloor && isBalanced) {
        subgenre = "House";
        confidence = 0.7;
      } else if (isChiptuneSpectrum) {
        subgenre = "Chiptune";
        confidence = 0.7;
      } else if (isBright && isMidHeavy) {
        subgenre = "Nu Disco";
        confidence = 0.6;
      } else if (isBreakbeat) {
        subgenre = "Electro";
        confidence = 0.6;
      } else {
        subgenre = "House";
        confidence = 0.55;
      }
    } else if (effectiveBpm >= 105 && effectiveBpm < 118) {
      if (isFourOnFloor && isBassHeavy && !isHighEnergy) {
        primary = "Electronic";
        subgenre = "Deep House";
        confidence = 0.7;
      } else if (isFourOnFloor && isHighEnergy && isBassHeavy) {
        primary = "Electronic";
        subgenre = "Tech House";
        confidence = 0.65;
      } else if (isSyncopated && isBassHeavy) {
        primary = "Electronic";
        subgenre = "UK Garage";
        confidence = 0.65;
      } else if (isChiptuneSpectrum) {
        primary = "Electronic";
        subgenre = "Chiptune";
        confidence = 0.7;
      } else if (isFourOnFloor) {
        primary = "Electronic";
        subgenre = "House";
        confidence = 0.6;
      } else if (isBright && isMidHeavy) {
        primary = "Electronic";
        subgenre = "Synthwave";
        confidence = 0.6;
      } else {
        primary = "Electronic";
        subgenre = "Electro";
        confidence = 0.55;
      }
    } else if (effectiveBpm >= 85 && effectiveBpm < 105) {
      if (isFourOnFloor && isHighEnergy) {
        primary = "Electronic";
        if (isAcidSpectrum) {
          subgenre = "Acid House";
          confidence = 0.65;
        } else if (isBassHeavy) {
          subgenre = "Deep House";
          confidence = 0.65;
        } else {
          subgenre = "Downtempo";
          confidence = 0.6;
        }
      } else if (isSyncopated && isBassHeavy && !isHighEnergy) {
        primary = "Hip Hop";
        if (effectiveBpm < 95) {
          subgenre = "Boom Bap";
          confidence = 0.65;
        } else {
          subgenre = "Hip Hop";
          confidence = 0.6;
        }
      } else if (isSyncopated && isBassHeavy && isHighEnergy) {
        primary = "Hip Hop";
        subgenre = "Trap";
        confidence = 0.65;
      } else if (isChiptuneSpectrum) {
        primary = "Electronic";
        subgenre = "Chiptune";
        confidence = 0.7;
      } else if (isBright && isMidHeavy && !isBassHeavy) {
        primary = "Electronic";
        subgenre = "Synthwave";
        confidence = 0.65;
      } else if (isDark && isMidEnergy) {
        primary = "Electronic";
        subgenre = "Darkwave";
        confidence = 0.6;
      } else {
        primary = "Electronic";
        subgenre = "Downtempo";
        confidence = 0.55;
      }
    } else if (effectiveBpm >= 70 && effectiveBpm < 85) {
      if (isBassHeavy && !isFourOnFloor && isMidEnergy) {
        primary = "Reggae / Dub";
        subgenre = "Dub";
        confidence = 0.6;
      } else if (isDark && isSyncopated) {
        primary = "Electronic";
        subgenre = "Trip Hop";
        confidence = 0.65;
      } else if (isAmbientSpectrum) {
        primary = "Electronic";
        subgenre = "Ambient";
        confidence = 0.6;
      } else if (isBassHeavy && isSyncopated) {
        primary = "Hip Hop";
        subgenre = "Lo-Fi Hip Hop";
        confidence = 0.55;
      } else if (isChiptuneSpectrum) {
        primary = "Electronic";
        subgenre = "Chiptune";
        confidence = 0.65;
      } else {
        primary = "Electronic";
        subgenre = "Downtempo";
        confidence = 0.55;
      }
    } else if (effectiveBpm >= 50 && effectiveBpm < 70) {
      primary = "Electronic";
      if (isAmbientSpectrum) {
        subgenre = "Ambient";
        confidence = 0.65;
      } else if (isDark && isLowEnergy) {
        subgenre = "Dark Ambient";
        confidence = 0.6;
      } else if (isDense) {
        subgenre = "IDM";
        confidence = 0.55;
      } else {
        subgenre = "Ambient";
        confidence = 0.5;
      }
    } else {
      primary = "Electronic";
      if (isHighEnergy) {
        subgenre = "Noise";
        confidence = 0.5;
      } else if (isAmbientSpectrum) {
        subgenre = "Drone";
        confidence = 0.55;
      } else {
        subgenre = "Experimental";
        confidence = 0.45;
      }
    }
    if (isFourOnFloor && beatRegularity > 0.8) {
      confidence = Math.min(0.85, confidence + 0.1);
    }
    if (timeSignature === 3) {
      if (primary === "Electronic") {
        subgenre = subgenre + " (3/4)";
        confidence = Math.max(0.4, confidence - 0.1);
      }
    }
    if (primary === "Electronic" && isDense && !isFourOnFloor && spectralVariance > 0.18) {
      subgenre = "IDM";
      confidence = 0.6;
    }
    return {
      primary,
      subgenre,
      confidence: Math.min(0.9, Math.max(0.4, confidence)),
      mood,
      energy,
      danceability
    };
  }
  function postProgress(id, progress) {
    self.postMessage({ type: "analysisProgress", id, progress: Math.round(progress) });
  }
  self.onmessage = async (e) => {
    const msg = e.data;
    switch (msg.type) {
      case "init": {
        try {
          await initEssentia();
          self.postMessage({ type: "ready" });
        } catch (err) {
          console.error("[DJAnalysisWorker] Init failed:", err);
          self.postMessage({
            type: "ready",
            error: err instanceof Error ? err.message : String(err)
          });
        }
        break;
      }
      case "analyze": {
        const { id, pcmLeft, pcmRight, sampleRate, numBins = 800 } = msg;
        try {
          await initEssentia();
          postProgress(id, 5);
          const mono = mixToMono(pcmLeft, pcmRight);
          postProgress(id, 10);
          const rhythm = analyzeRhythm(mono, essentiaInstance);
          postProgress(id, 40);
          const keyResult = analyzeKey(mono, sampleRate, essentiaInstance);
          postProgress(id, 60);
          const { downbeats, timeSignature } = detectDownbeats(
            rhythm.beats,
            mono,
            sampleRate
          );
          postProgress(id, 70);
          const frequencyPeaks = computeFrequencyPeaks(pcmLeft, pcmRight, sampleRate, numBins);
          postProgress(id, 85);
          const loudness = computeLoudness(mono);
          postProgress(id, 90);
          const genre = classifyGenre(
            rhythm.bpm,
            keyResult.key,
            timeSignature,
            frequencyPeaks,
            loudness.rmsDb,
            rhythm.beats,
            mono,
            sampleRate
          );
          postProgress(id, 98);
          const result = {
            bpm: rhythm.bpm,
            bpmConfidence: rhythm.confidence,
            beats: rhythm.beats,
            downbeats,
            timeSignature,
            musicalKey: keyResult.key,
            keyConfidence: keyResult.confidence,
            onsets: rhythm.beats,
            // Use beat positions as onset markers
            frequencyPeaks,
            rmsDb: loudness.rmsDb,
            peakDb: loudness.peakDb,
            genre
          };
          postProgress(id, 100);
          self.postMessage({ type: "analysisComplete", id, result });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`[DJAnalysisWorker] Analysis failed:`, errorMsg);
          self.postMessage({ type: "analysisError", id, error: errorMsg });
        }
        break;
      }
    }
  };
  self.postMessage({ type: "ready" });
})();
