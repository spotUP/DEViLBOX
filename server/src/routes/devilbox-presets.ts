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
const DEXED_PRESET_COUNT = 32;
const DEXED_PATH_PREFIX = 'dexed:init:';

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
      id: 'helm',
      name: 'Helm',
      vendor: 'Matt Tytel',
      presetCount: getHelmPresets().length,
      synth: 'helm',
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
  if (!absolutePath.startsWith(HELM_PRESET_ROOT)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (!absolutePath.endsWith('.helm') || !fs.existsSync(absolutePath)) {
    res.status(404).json({ error: 'Preset not found' });
    return;
  }

  res.type('application/json');
  res.send(fs.readFileSync(absolutePath, 'utf8'));
});

export default router;
