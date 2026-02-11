/**
 * NKS Deployment & Registry Integration
 *
 * Generates deployment configuration per NKS SDK Section 13:
 * - Service Center XML template for NI product registration
 * - Windows Registry key generation
 * - macOS plist generation
 * - ContentVersion tracking for NI Browser rescan
 * - Complete PAResources directory structure
 */

import type { NKSDeploymentConfig, NKSRegistryKeys, NKSProductResources } from './types';
import { NKS_CONSTANTS } from './types';

// ============================================================================
// Service Center XML
// ============================================================================

/**
 * Generate Service Center XML file for NKS VST product registration.
 * Per SDK Section 13.1.1.
 *
 * This XML file is placed in:
 * - Windows: C:\Program Files\Common Files\Native Instruments\Service Center
 * - macOS: /Library/Application Support/Native Instruments/Service Center
 */
export function generateServiceCenterXML(config: NKSDeploymentConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ProductHints spec="2.0.0">
  <Product version="1" id="${escapeXml(config.upid)}"
    type="instrument"
    name="${escapeXml(config.productName)}">

    <ShortName>${escapeXml(config.productName)}</ShortName>
    <Manufacturer>${escapeXml(config.companyName)}</Manufacturer>

    <!-- VST Plugin Identification -->
    <VST>
      <Plugin>${escapeXml(config.binName)}</Plugin>
      <PluginID>${escapeXml(config.vstPluginId)}</PluginID>
    </VST>

    <!-- Registry/Plist Key for Content Discovery -->
    <RegKey>${escapeXml(config.registryKey)}</RegKey>

    <!-- Preset Library -->
    <PresetLibrary>
      <Name>${escapeXml(config.presetLibraryName)}</Name>
    </PresetLibrary>
  </Product>
</ProductHints>`;
}

/**
 * Generate Service Center XML for a content product (no VST plugin).
 */
export function generateContentProductXML(config: NKSDeploymentConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ProductHints spec="2.0.0">
  <Product version="1" id="${escapeXml(config.upid)}"
    type="content"
    name="${escapeXml(config.productName)}">

    <ShortName>${escapeXml(config.productName)}</ShortName>
    <Manufacturer>${escapeXml(config.companyName)}</Manufacturer>

    <!-- Registry/Plist Key for Content Discovery -->
    <RegKey>${escapeXml(config.registryKey)}</RegKey>

    <!-- Preset Library -->
    <PresetLibrary>
      <Name>${escapeXml(config.presetLibraryName)}</Name>
    </PresetLibrary>
  </Product>
</ProductHints>`;
}

// ============================================================================
// Windows Registry
// ============================================================================

/**
 * Generate Windows .reg file content for NKS product registration.
 * Per SDK Section 13.1.2.
 *
 * Creates: HKEY_LOCAL_MACHINE\SOFTWARE\Native Instruments\<registryKey>
 */
export function generateWindowsRegistry(
  registryKey: string,
  keys: NKSRegistryKeys,
): string {
  const lines = [
    'Windows Registry Editor Version 5.00',
    '',
    `[HKEY_LOCAL_MACHINE\\SOFTWARE\\Native Instruments\\${registryKey}]`,
  ];

  if (keys.installDir) {
    // Escape backslashes for .reg format
    const path = keys.installDir.replace(/\\/g, '\\\\');
    lines.push(`"InstallVSTDir"="${path}"`);
  }

  if (keys.installVST64Dir) {
    const path = keys.installVST64Dir.replace(/\\/g, '\\\\');
    lines.push(`"InstallVST64Dir"="${path}"`);
  }

  const contentPath = keys.contentDir.replace(/\\/g, '\\\\');
  lines.push(`"ContentDir"="${contentPath}"`);
  lines.push(`"ContentVersion"="${keys.contentVersion}"`);

  return lines.join('\r\n') + '\r\n';
}

// ============================================================================
// macOS Plist
// ============================================================================

/**
 * Generate macOS plist XML for NKS product registration.
 * Per SDK Section 13.1.2.
 *
 * Creates: /Library/Preferences/com.native-instruments.<registryKey>.plist
 */
export function generateMacOSPlist(
  registryKey: string,
  keys: NKSRegistryKeys,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>InstallDir</key>
  <string>${escapeXml(keys.installDir || keys.contentDir)}</string>
  <key>ContentDir</key>
  <string>${escapeXml(keys.contentDir)}</string>
  <key>ContentVersion</key>
  <string>${escapeXml(keys.contentVersion)}</string>
</dict>
</plist>`;
}

/**
 * Get the plist filename for a product.
 */
export function getPlistFilename(registryKey: string): string {
  return `com.native-instruments.${registryKey}.plist`;
}

// ============================================================================
// Content Version Management
// ============================================================================

/**
 * Parse a content version string (x.x.x.x format).
 */
export function parseContentVersion(version: string): { major: number; minor: number; patch: number; build: number } {
  const parts = version.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
    build: parts[3] || 0,
  };
}

/**
 * Increment a content version (bumps the build number).
 * Changing ContentVersion triggers a full rescan of presets in NI software.
 */
export function incrementContentVersion(current: string): string {
  const v = parseContentVersion(current);
  v.build++;
  return `${v.major}.${v.minor}.${v.patch}.${v.build}`;
}

/**
 * Validate content version format (must be x.x.x.x).
 */
export function isValidContentVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(version);
}

// ============================================================================
// Default DEViLBOX Deployment Config
// ============================================================================

/**
 * Generate default deployment config for DEViLBOX.
 */
export function getDefaultDeploymentConfig(): NKSDeploymentConfig {
  return {
    nameOfPlugin: 'DEViLBOX',
    productName: 'DEViLBOX Tracker',
    upid: NKS_CONSTANTS.PLUGIN_UUID,
    registryKey: 'DEViLBOX',
    binName: 'DEViLBOX',
    vstPluginId: '44564258', // "DVBX" in hex
    companyName: 'DEViLBOX',
    presetLibraryName: 'DEViLBOX Factory',
    contentDir: '',  // Set by installer
    contentVersion: '1.0.0.0',
  };
}

/**
 * Generate all deployment files as a manifest.
 * Returns filename -> content pairs for all required deployment files.
 */
export function generateDeploymentManifest(
  config: NKSDeploymentConfig,
  targetOS: 'windows' | 'macos' | 'both' = 'both',
): Array<{ filename: string; content: string; description: string }> {
  const files = [];

  // Service Center XML
  files.push({
    filename: `${config.productName}.xml`,
    content: generateServiceCenterXML(config),
    description: 'Service Center product registration',
  });

  // Windows registry
  if (targetOS === 'windows' || targetOS === 'both') {
    files.push({
      filename: `${config.registryKey}.reg`,
      content: generateWindowsRegistry(config.registryKey, {
        contentDir: config.contentDir || `C:\\Users\\Public\\Documents\\${config.companyName}\\${config.productName}`,
        contentVersion: config.contentVersion,
      }),
      description: 'Windows registry entries',
    });
  }

  // macOS plist
  if (targetOS === 'macos' || targetOS === 'both') {
    const plistKeys: NKSRegistryKeys = {
      contentDir: config.contentDir || `/Library/${config.companyName}/${config.productName}`,
      contentVersion: config.contentVersion,
    };

    files.push({
      filename: getPlistFilename(config.registryKey),
      content: generateMacOSPlist(config.registryKey, plistKeys),
      description: 'macOS preferences plist',
    });
  }

  return files;
}

// ============================================================================
// Deployment Directory Structure
// ============================================================================

/**
 * Get the complete deployment directory structure.
 * Returns the expected layout of files for NKS product deployment.
 */
export function getDeploymentStructure(config: NKSDeploymentConfig): string[] {
  const paths = [];
  const base = config.contentDir || `/path/to/${config.productName}`;

  // Service Center XML locations
  paths.push('(Windows) C:\\Program Files\\Common Files\\Native Instruments\\Service Center\\');
  paths.push('(macOS) /Library/Application Support/Native Instruments/Service Center/');

  // Registry/plist locations
  paths.push(`(Windows) HKLM\\SOFTWARE\\Native Instruments\\${config.registryKey}`);
  paths.push(`(macOS) /Library/Preferences/${getPlistFilename(config.registryKey)}`);

  // Content structure
  paths.push(`${base}/`);
  paths.push(`${base}/.previews/`);
  paths.push(`${base}/PAResources/${config.companyName}/${config.productName}/`);

  return paths;
}

// ============================================================================
// Utilities
// ============================================================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
