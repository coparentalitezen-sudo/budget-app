import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { installerMiseAJourPwa } from './pwa.ts';
import { installerTheme } from './lib/theme.ts';
import './styles.css';

installerTheme();
installerMiseAJourPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
