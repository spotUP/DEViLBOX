/**
 * AppLayout - Main application layout container
 */

import React from 'react';
import { NavBar } from './NavBar';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div className="h-screen flex flex-col bg-dark-bg text-text-primary overflow-hidden">
      {/* Top Navigation Bar */}
      <NavBar />

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {children}
      </main>
    </div>
  );
};
