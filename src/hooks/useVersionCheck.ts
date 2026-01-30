import { useEffect, useState } from 'react';
import { BUILD_HASH, BUILD_NUMBER } from '@generated/changelog';

interface VersionInfo {
  buildNumber: string;
  buildHash: string;
  timestamp: string;
}

/**
 * Checks for application updates by comparing current build hash
 * with the deployed version.json file.
 *
 * @param checkIntervalMs - How often to check for updates (default: 5 minutes)
 * @returns Object with updateAvailable flag and refresh function
 */
export function useVersionCheck(checkIntervalMs: number = 5 * 60 * 1000) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState<VersionInfo | null>(null);

  const checkForUpdates = async () => {
    // Skip version check in development
    if (import.meta.env.DEV) {
      return;
    }

    try {
      // Use Vite's base URL (e.g., '/DEViLBOX/' in production)
      const baseUrl = import.meta.env.BASE_URL || '/';
      const versionUrl = `${baseUrl}version.json?t=${Date.now()}`;

      const response = await fetch(versionUrl, {
        cache: 'no-cache',
      });

      if (!response.ok) {
        // Silently ignore - version.json may not exist
        return;
      }

      const versionInfo: VersionInfo = await response.json();
      setLatestVersion(versionInfo);

      // Compare build hashes
      if (versionInfo.buildHash !== BUILD_HASH) {
        console.log('Update available:', {
          current: { buildNumber: BUILD_NUMBER, buildHash: BUILD_HASH },
          latest: versionInfo,
        });
        setUpdateAvailable(true);
      }
    } catch (error) {
      // Silently ignore version check errors (network issues, etc.)
      if (import.meta.env.DEV) {
        console.debug('Version check skipped:', error);
      }
    }
  };

  useEffect(() => {
    // Check immediately on mount
    checkForUpdates();

    // Then check periodically
    const interval = setInterval(checkForUpdates, checkIntervalMs);

    return () => clearInterval(interval);
  }, [checkIntervalMs]);

  const refresh = () => {
    window.location.reload();
  };

  return {
    updateAvailable,
    latestVersion,
    currentVersion: { buildNumber: BUILD_NUMBER, buildHash: BUILD_HASH },
    refresh,
  };
}
