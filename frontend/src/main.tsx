import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
// Pixel font is bundled (OFL); Chinese text uses system fonts, so the page loads no external resources.
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('缺少 #root 挂载点');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
