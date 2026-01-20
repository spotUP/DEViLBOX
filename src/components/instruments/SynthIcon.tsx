import React from 'react';
import * as LucideIcons from 'lucide-react';

interface SynthIconProps {
  iconName: string;
  size?: number;
  className?: string;
}

export const SynthIcon: React.FC<SynthIconProps> = ({ 
  iconName, 
  size = 18, 
  className = '' 
}) => {
  const icons = LucideIcons as unknown as Record<string, LucideIcons.LucideIcon>;
  const Icon = icons[iconName] || LucideIcons.Music2;
  return <Icon size={size} className={className} />;
};
