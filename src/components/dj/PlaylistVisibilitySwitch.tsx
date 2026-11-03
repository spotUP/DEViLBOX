import React from 'react';
import { Globe, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export type PlaylistVisibility = 'private' | 'public';

export interface PlaylistVisibilitySwitchProps {
  value: PlaylistVisibility;
  onChange: (visibility: PlaylistVisibility) => void;
  disabled?: boolean;
}

/** Private / Public selector: used when creating a playlist and on an existing (published) one. */
export const PlaylistVisibilitySwitch: React.FC<PlaylistVisibilitySwitchProps> = ({ value, onChange, disabled }) => (
  <div className="flex items-center gap-1">
    <Button
      variant={value === 'private' ? 'primary' : 'ghost'}
      size="sm"
      icon={<Lock size={10} />}
      title="Only you can see this playlist"
      disabled={disabled}
      onClick={() => onChange('private')}
    >
      Private
    </Button>
    <Button
      variant={value === 'public' ? 'primary' : 'ghost'}
      size="sm"
      icon={<Globe size={10} />}
      title="Everyone can see this playlist once saved to the cloud"
      disabled={disabled}
      onClick={() => onChange('public')}
    >
      Public
    </Button>
  </div>
);
