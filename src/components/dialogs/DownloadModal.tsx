/**
 * DownloadModal - Shows links to download native applications
 */

import React from 'react';
import { X, Monitor, Apple, Terminal, Download, ExternalLink } from 'lucide-react';
import { Button } from '@components/ui/Button';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  // These should point to your GitHub Releases page or similar
  const RELEASES_URL = 'https://github.com/spot/DEViLBOX/releases/latest';

  const platforms = [
    {
      name: 'Windows',
      icon: <Monitor size={24} />,
      desc: 'Installer (.exe) or Portable (.zip)',
      color: 'text-blue-400',
    },
    {
      name: 'macOS',
      icon: <Apple size={24} />,
      desc: 'Disk Image (.dmg) for Intel/Apple Silicon',
      color: 'text-gray-300',
    },
    {
      name: 'Linux',
      icon: <Terminal size={24} />,
      desc: 'AppImage, Debian, or Tarball',
      color: 'text-orange-400',
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] animate-fade-in backdrop-blur-sm">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-slide-in-up">
        {/* Header */}
        <div className="bg-dark-bgTertiary px-6 py-4 flex items-center justify-between border-b border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent-primary/20 text-accent-primary">
              <Download size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">Download DEViLBOX</h2>
              <p className="text-xs text-text-muted font-mono">Native Desktop Applications</p>
            </div>
          </div>
          <Button
            variant="icon"
            size="icon"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm text-text-secondary mb-6 leading-relaxed">
            Experience DEViLBOX with lower latency, better performance, and offline support. 
            Native apps provide full access to system audio and MIDI resources.
          </p>

          <div className="space-y-3">
            {platforms.map((platform) => (
              <a
                key={platform.name}
                href={RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 p-4 rounded-xl border border-dark-border bg-dark-bg hover:bg-dark-bgHover hover:border-accent-primary/50 transition-all duration-200 shadow-sm"
              >
                <div className={`p-3 rounded-lg bg-dark-bgSecondary ${platform.color} group-hover:scale-110 transition-transform duration-200`}>
                  {platform.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-text-primary group-hover:text-accent-primary transition-colors">
                    {platform.name}
                  </h3>
                  <p className="text-xs text-text-muted">{platform.desc}</p>
                </div>
                <ExternalLink size={16} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </a>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-dark-border text-center">
            <p className="text-[10px] text-text-muted font-mono uppercase tracking-widest">
              Built with Electron & Tone.js
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
