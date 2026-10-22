import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/400-italic.css';
import './styles/base.css';
import './styles/components.css';
import './styles/app.css';
import './styles/studio.css';
import './styles/sign.css';
import { App } from './App';
import { getLang } from './lib/i18n';

document.documentElement.lang = getLang();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
