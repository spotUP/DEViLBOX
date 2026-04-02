import React from 'react';
import { createRoot } from 'react-dom/client';
import { ControllerApp } from './ControllerApp';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ControllerApp />
  </React.StrictMode>
);
