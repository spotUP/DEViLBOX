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
    try {
      // Add timestamp to prevent caching
      const response = await fetch(`/DEViLBOX/version.json?t=${Date.now()}`, {
        cache: 'no-cache',
      });

      if (!response.ok) {
        console.warn('Failed to check for updates:', response.status);
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
      console.error('Error checking for updates:', error);
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
