/**
 * DEViLBOX factory preset browser routes.
 *
 * Exposes bundled preset libraries for built-in WASM synths so the existing
 * NKS browser UI can browse and load them without depending on Native Access.
 */

import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const HELM_PRESET_ROOT = path.join(PROJECT_ROOT, 'third-party/helm-master/patches/Factory Presets');
const SURGE_PRESET_ROOT = path.join(PROJECT_ROOT, 'third-party/surge-xt/resources/data/patches_3rdparty');
const OBXF_PRESET_ROOT = path.join(PROJECT_ROOT, 'third-party/OB-Xf-main/assets/installer/Surge Synth Team/OB-Xf/Patches');
const ODIN2_PRESET_ROOT = path.join(PROJECT_ROOT, 'third-party/odin2-master/assets/Soundbanks/Factory Presets');
const DEXED_PRESET_COUNT = 32;
const DEXED_PATH_PREFIX = 'dexed:init:';

const ALLOWED_ROOTS = [
  HELM_PRESET_ROOT,
  SURGE_PRESET_ROOT,
  OBXF_PRESET_ROOT,
  ODIN2_PRESET_ROOT,
];

interface DevilboxProduct {
  id: string;
  name: string;
  vendor: string;
  presetCount: number;
  synth: string;
  category: string;
}

interface DevilboxPreset {
  id: string;
  name: string;
  category: string;
  synth: string;
  path: string;
  tags: string[];
}

function toProjectRelativePath(absolutePath: string): string {
  return path.relative(PROJECT_ROOT, absolutePath).split(path.sep).join('/');
}

function scanHelmPresetFiles(dir: string, presets: DevilboxPreset[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanHelmPresetFiles(absolutePath, presets);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.helm')) {
      continue;
    }

    const category = path.basename(path.dirname(absolutePath));
    const relativePath = toProjectRelativePath(absolutePath);
    presets.push({
      id: `helm:${relativePath}`,
      name: path.basename(entry.name, '.helm'),
      category,
      synth: 'helm',
      path: relativePath,
      tags: [category],
    });
  }
}

let helmPresetCache: DevilboxPreset[] | null = null;

function getHelmPresets(): DevilboxPreset[] {
  if (helmPresetCache) {
    return helmPresetCache;
  }

  const presets: DevilboxPreset[] = [];
  if (fs.existsSync(HELM_PRESET_ROOT)) {
    scanHelmPresetFiles(HELM_PRESET_ROOT, presets);
  }

  presets.sort((left, right) => {
    if (left.category !== right.category) {
      return left.category.localeCompare(right.category);
    }
    return left.name.localeCompare(right.name);
  });
  helmPresetCache = presets;
  return presets;
}

// ── Generic .fxp / .odin scanner ─────────────────────────────────────────────

function scanPresetFiles(
  dir: string,
  synth: string,
  ext: string,
  presets: DevilboxPreset[],
  extraTags: string[] = [],
): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanPresetFiles(absolutePath, synth, ext, presets, extraTags);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(ext)) continue;
    const category = path.basename(path.dirname(absolutePath));
    const relativePath = toProjectRelativePath(absolutePath);
    presets.push({
      id: `${synth}:${relativePath}`,
      name: path.basename(entry.name, ext),
      category,
      synth,
      path: relativePath,
      tags: [category, ...extraTags],
    });
  }
}

let surgePresetCache: DevilboxPreset[] | null = null;
function getSurgePresets(): DevilboxPreset[] {
  if (surgePresetCache) return surgePresetCache;
  const presets: DevilboxPreset[] = [];
  scanPresetFiles(SURGE_PRESET_ROOT, 'surge', '.fxp', presets);
  presets.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  surgePresetCache = presets;
  return presets;
}

let obxfPresetCache: DevilboxPreset[] | null = null;
function getObxfPresets(): DevilboxPreset[] {
  if (obxfPresetCache) return obxfPresetCache;
  const presets: DevilboxPreset[] = [];
  scanPresetFiles(OBXF_PRESET_ROOT, 'obxf', '.fxp', presets, ['Oberheim']);
  presets.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  obxfPresetCache = presets;
  return presets;
}

let odin2PresetCache: DevilboxPreset[] | null = null;
function getOdin2Presets(): DevilboxPreset[] {
  if (odin2PresetCache) return odin2PresetCache;
  const presets: DevilboxPreset[] = [];
  scanPresetFiles(ODIN2_PRESET_ROOT, 'odin2', '.odin', presets);
  presets.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  odin2PresetCache = presets;
  return presets;
}

// ─────────────────────────────────────────────────────────────────────────────

function buildDexedPresetPath(index: number): string {
  return `${DEXED_PATH_PREFIX}${index}`;
}

function buildDexedPresets(): DevilboxPreset[] {
  return Array.from({ length: DEXED_PRESET_COUNT }, (_, presetIndex) => {
    const index = presetIndex + 1;
    return {
      id: `dexed:${index}`,
      name: `INIT VOICE ${index}`,
      category: 'Factory',
      synth: 'dexed',
      path: buildDexedPresetPath(index),
      tags: ['Factory', 'FM'],
    };
  });
}

function buildDexedInitVoice(index: number): Buffer {
  const data = new Uint8Array(155);

  for (let operatorIndex = 0; operatorIndex < 6; operatorIndex += 1) {
    const offset = operatorIndex * 21;
    data[offset + 0] = 99;
    data[offset + 1] = 99;
    data[offset + 2] = 99;
    data[offset + 3] = 99;
    data[offset + 4] = 99;
    data[offset + 5] = 99;
    data[offset + 6] = 99;
    data[offset + 7] = 0;
    data[offset + 8] = 39;
    data[offset + 16] = operatorIndex === 5 ? 99 : 0;
    data[offset + 18] = 1;
    data[offset + 20] = 7;
  }

  data[126] = 99;
  data[127] = 99;
  data[128] = 99;
  data[129] = 99;
  data[130] = 50;
  data[131] = 50;
  data[132] = 50;
  data[133] = 50;
  data[134] = 0;
  data[135] = 0;
  data[136] = 0;
  data[144] = 24;

  const patchName = `INIT ${String(index).padStart(2, '0')}`.slice(0, 10).padEnd(10, ' ');
  for (let characterIndex = 0; characterIndex < patchName.length; characterIndex += 1) {
    data[145 + characterIndex] = patchName.charCodeAt(characterIndex) & 0x7f;
  }

  return Buffer.from(data);
}

function getProducts(): DevilboxProduct[] {
  return [
    {
      id: 'surge',
      name: 'Surge XT',
      vendor: 'Surge Synth Team',
      presetCount: getSurgePresets().length,
      synth: 'surge',
      category: 'Instrument',
    },
    {
      id: 'helm',
      name: 'Helm',
      vendor: 'Matt Tytel',
      presetCount: getHelmPresets().length,
      synth: 'helm',
      category: 'Instrument',
    },
    {
      id: 'obxf',
      name: 'OB-Xf',
      vendor: 'Surge Synth Team',
      presetCount: getObxfPresets().length,
      synth: 'obxf',
      category: 'Instrument',
    },
    {
      id: 'odin2',
      name: 'Odin 2',
      vendor: 'TheWaveWarden',
      presetCount: getOdin2Presets().length,
      synth: 'odin2',
      category: 'Instrument',
    },
    {
      id: 'dexed',
      name: 'Dexed DX7',
      vendor: 'asb2m10',
      presetCount: DEXED_PRESET_COUNT,
      synth: 'dexed',
      category: 'Instrument',
    },
  ];
}

function filterPresets(presets: DevilboxPreset[], category: string, search: string): DevilboxPreset[] {
  const normalizedSearch = search.trim().toLowerCase();
  return presets.filter((preset) => {
    if (category && preset.category !== category) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }
    return (
      preset.name.toLowerCase().includes(normalizedSearch) ||
      preset.category.toLowerCase().includes(normalizedSearch) ||
      preset.tags.some((tag) => tag.toLowerCase().includes(normalizedSearch))
    );
  });
}

router.get('/products', (_req: Request, res: Response) => {
  res.json(getProducts());
});

router.get('/presets', (req: Request, res: Response) => {
  const synth = (req.query.synth as string | undefined)?.toLowerCase() ?? '';
  const category = (req.query.category as string | undefined) ?? '';
  const search = (req.query.search as string | undefined) ?? '';
  const limit = Math.max(1, Math.min(500, Number.parseInt((req.query.limit as string | undefined) ?? '50', 10) || 50));
  const offset = Math.max(0, Number.parseInt((req.query.offset as string | undefined) ?? '0', 10) || 0);

  let presets: DevilboxPreset[] = [];
  if (synth === 'helm') {
    presets = filterPresets(getHelmPresets(), category, search);
  } else if (synth === 'surge') {
    presets = filterPresets(getSurgePresets(), category, search);
  } else if (synth === 'obxf') {
    presets = filterPresets(getObxfPresets(), category, search);
  } else if (synth === 'odin2') {
    presets = filterPresets(getOdin2Presets(), category, search);
  } else if (synth === 'dexed') {
    presets = filterPresets(buildDexedPresets(), category, search);
  }

  res.json(presets.slice(offset, offset + limit));
});

router.get('/preset-data', (req: Request, res: Response) => {
  const presetPath = decodeURIComponent((req.query.path as string | undefined) ?? '');
  if (!presetPath) {
    res.status(400).json({ error: 'Missing path' });
    return;
  }

  if (presetPath.startsWith(DEXED_PATH_PREFIX)) {
    const index = Number.parseInt(presetPath.slice(DEXED_PATH_PREFIX.length), 10);
    if (!Number.isFinite(index) || index < 1 || index > DEXED_PRESET_COUNT) {
      res.status(404).json({ error: 'Preset not found' });
      return;
    }

    res.type('application/octet-stream');
    res.send(buildDexedInitVoice(index));
    return;
  }

  const absolutePath = path.resolve(PROJECT_ROOT, presetPath);
  const isAllowed = ALLOWED_ROOTS.some(root => absolutePath.startsWith(root));
  if (!isAllowed) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (!fs.existsSync(absolutePath)) {
    res.status(404).json({ error: 'Preset not found' });
    return;
  }

  // Helm presets are JSON, everything else is binary
  if (absolutePath.endsWith('.helm')) {
    res.type('application/json');
    res.send(fs.readFileSync(absolutePath, 'utf8'));
  } else {
    res.type('application/octet-stream');
    res.send(fs.readFileSync(absolutePath));
  }
});

export default router;
