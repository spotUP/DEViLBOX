/**
 * NKS Artwork & Visual Identity Pipeline
 *
 * Manages product artwork assets per NKS SDK Section 8:
 * - Source artwork (logos, product images)
 * - Deployment assets (VB_logo, OSO_logo, MST_logo, etc.)
 * - NKS2 hardware banners (WebP for Kontrol MK3)
 * - Product colors and short names
 * - PAResources directory structure
 */

import type { NKSArtworkAssets, NKSProductResources } from './types';
import { NKS_CONSTANTS } from './types';

// ============================================================================
// Artwork Specifications (from SDK Section 8.2)
// ============================================================================

/** Asset specifications per NKS SDK */
export const NKS_ARTWORK_SPECS = {
  VB_logo:              { width: 227, height: 47, format: 'png', description: 'Native Browser banner logo' },
  OSO_logo:             { width: 417, height: 65, format: 'png', description: 'S-Series MK1/Jam OSO browser logo' },
  MST_logo:             { width: 240, height: 196, format: 'png', description: 'S-Series MK2/MK3/Maschine screen logo' },
  VB_artwork:           { width: 96,  height: 47, format: 'png', description: 'Native Browser product artwork' },
  MST_artwork:          { width: 134, height: 66, format: 'png', description: 'OSO/hardware browse mode artwork' },
  MST_plugin:           { width: 190, height: 100, format: 'png', description: 'Scaled GUI screenshot' },
  NKS2_Hardware_Banner: { width: 1280, height: 212, format: 'webp', description: 'Kontrol MK3 plugin screen banner' },
  NKS2_hardware_banner_alt: { width: 1280, height: 152, format: 'webp', description: 'Kontrol MK3 alternate banner' },
  NKS2_software_tile:   { width: 420, height: 316, format: 'webp', description: 'Kontakt browser tile' },
} as const;

export type NKSArtworkAssetName = keyof typeof NKS_ARTWORK_SPECS;

// ============================================================================
// Default DEViLBOX Product Identity
// ============================================================================

/** Default artwork configuration for DEViLBOX */
export const DEVILBOX_ARTWORK: NKSArtworkAssets = {
  color: '#FF3300',           // DEViLBOX brand red-orange
  controlColor: 0xFF3300,     // NKS2 knob tint color
  shortName: 'DEViLBOX',     // Max 12 chars
};

/** Default product resources */
export const DEVILBOX_RESOURCES: NKSProductResources = {
  companyName: 'DEViLBOX',
  productName: 'DEViLBOX Tracker',
  artwork: DEVILBOX_ARTWORK,
  categories: ['Bass', 'Lead', 'Pad', 'Drum', 'FX', 'User'],
};

// ============================================================================
// PAResources Directory Builder
// ============================================================================

/**
 * PAResources directory structure per NKS SDK Section 13.2.
 *
 * Structure:
 * PAResources/
 *   <CompanyName>/
 *     <ProductName>/
 *       <ProductName>.meta
 *       color.json
 *       categories.json
 *       shortname.json
 *       VB_logo.png
 *       OSO_logo.png
 *       MST_logo.png
 *       VB_artwork.png
 *       MST_artwork.png
 *       MST_plugin.png
 *       NKS2_Hardware_Banner.webp
 *       NKS2_hardware_banner_1280x152.webp
 *       NKS2_software_tile.webp
 */
export function getPAResourcesPath(resources: NKSProductResources): string {
  return `PAResources/${resources.companyName}/${resources.productName}`;
}

/**
 * Generate color.json content (RGB HEX format)
 */
export function generateColorJson(color: string): string {
  return JSON.stringify({ color }, null, 2);
}

/**
 * Generate shortname.json content
 */
export function generateShortnameJson(shortName: string): string {
  return JSON.stringify({ shortname: shortName }, null, 2);
}

/**
 * Generate categories.json content
 */
export function generateCategoriesJson(categories: string[]): string {
  return JSON.stringify(categories, null, 2);
}

/**
 * Generate .meta file content (product versioning)
 */
export function generateMetaFile(
  productName: string,
  version: string,
): string {
  return JSON.stringify({
    product: productName,
    version,
    vendor: NKS_CONSTANTS.VENDOR_ID,
  }, null, 2);
}

/**
 * Get the complete file manifest for PAResources deployment.
 * Returns a list of files to create with their expected content/specs.
 */
export function getDeploymentManifest(resources: NKSProductResources): Array<{
  path: string;
  description: string;
  content?: string;
  assetSpec?: { width: number; height: number; format: string };
}> {
  const base = getPAResourcesPath(resources);
  const manifest = [];

  // JSON metadata files
  manifest.push({
    path: `${base}/${resources.productName}.meta`,
    description: 'Product metadata and versioning',
    content: generateMetaFile(resources.productName, '1.0.0.0'),
  });

  manifest.push({
    path: `${base}/color.json`,
    description: 'Product brand color (RGB HEX)',
    content: generateColorJson(resources.artwork.color),
  });

  manifest.push({
    path: `${base}/shortname.json`,
    description: 'Abbreviated product name (max 12 chars)',
    content: generateShortnameJson(resources.artwork.shortName),
  });

  if (resources.categories) {
    manifest.push({
      path: `${base}/categories.json`,
      description: 'Preset categories',
      content: generateCategoriesJson(resources.categories),
    });
  }

  // Image assets
  for (const [name, spec] of Object.entries(NKS_ARTWORK_SPECS)) {
    const ext = spec.format;
    const filename = name === 'NKS2_hardware_banner_alt'
      ? `NKS2_hardware_banner_${spec.width}x${spec.height}.${ext}`
      : `${name}.${ext}`;

    manifest.push({
      path: `${base}/${filename}`,
      description: spec.description,
      assetSpec: { width: spec.width, height: spec.height, format: spec.format },
    });
  }

  return manifest;
}

// ============================================================================
// Artwork Validation
// ============================================================================

/**
 * Validate an image blob against NKS artwork specifications.
 */
export async function validateArtworkAsset(
  blob: Blob,
  assetName: NKSArtworkAssetName,
): Promise<{ valid: boolean; errors: string[] }> {
  const spec = NKS_ARTWORK_SPECS[assetName];
  const errors: string[] = [];

  // Check format
  const expectedMime = spec.format === 'webp' ? 'image/webp' : 'image/png';
  if (!blob.type.includes(spec.format)) {
    errors.push(`Expected ${spec.format} format, got ${blob.type}`);
  }

  // Check dimensions by loading as image
  try {
    const url = URL.createObjectURL(blob);
    const img = await loadImage(url);
    URL.revokeObjectURL(url);

    if (img.width !== spec.width || img.height !== spec.height) {
      errors.push(`Expected ${spec.width}x${spec.height}px, got ${img.width}x${img.height}px`);
    }
  } catch {
    errors.push('Failed to load image for dimension check');
  }

  return { valid: errors.length === 0, errors };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// ============================================================================
// NKS2 Control Color
// ============================================================================

/**
 * Get NKS2 control color for a synth type.
 * This tints the hardware knob visualization on Kontrol MK3.
 */
export function getControlColor(synthType: string): number {
  // Color families for different synth categories
  const colorMap: Record<string, number> = {
    // Acid/Bass: Red-orange
    TB303: 0xFF3300,
    Buzz3o3DF: 0xFF3300,
    WobbleBass: 0xFF5500,

    // FM: Blue-cyan
    FMSynth: 0x0088FF,
    Dexed: 0x0088FF,
    DexedBridge: 0x0088FF,

    // Classic analog: Warm orange
    MonoSynth: 0xFF8800,
    PolySynth: 0xFF8800,
    OBXd: 0xFFAA00,
    V2: 0xCC8800,

    // Digital/Wavetable: Purple
    Vital: 0x8800FF,
    Odin2: 0x9900CC,
    Surge: 0x6600CC,
    Wavetable: 0xAA00FF,

    // Effects/SFX: Green
    DubSiren: 0x00CC44,
    SpaceLaser: 0x00FF88,

    // Drums: Yellow
    Synare: 0xFFCC00,
    MembraneSynth: 0xFFCC00,
    MetalSynth: 0xCCCC00,
    DrumMachine: 0xFFAA00,

    // Chip/Retro: Cyan
    ChipSynth: 0x00CCCC,

    // Organ/Keys: Warm brown
    TonewheelOrgan: 0xCC6600,
    Organ: 0xCC6600,
  };

  return colorMap[synthType] || DEVILBOX_ARTWORK.controlColor || 0xFF3300;
}
