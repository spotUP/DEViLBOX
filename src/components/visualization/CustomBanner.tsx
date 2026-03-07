/**
 * CustomBanner - Displays user-uploaded banner image in the visualizer area.
 * Shows after the Up Rough logo animation completes (or as a standalone visualizer mode).
 */

import React from 'react';
import { useSettingsStore } from '@stores/useSettingsStore';

interface CustomBannerProps {
  height?: number;
  onComplete?: () => void;
}

const CustomBannerComponent: React.FC<CustomBannerProps> = ({
  height = 100,
  onComplete,
}) => {
  const bannerImage = useSettingsStore(s => s.customBannerImage);

  if (!bannerImage) {
    // No banner set — cycle to next visualizer immediately
    onComplete?.();
    return null;
  }

  return (
    <div
      className="w-full flex items-center justify-center overflow-hidden cursor-pointer"
      style={{ height: `${height}px` }}
      onClick={(e) => {
        e.stopPropagation();
        onComplete?.();
      }}
      title="Click to cycle visualizer"
    >
      <img
        src={bannerImage}
        alt="Custom banner"
        style={{
          maxHeight: '100%',
          maxWidth: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
};

export const CustomBanner = React.memo(CustomBannerComponent);
