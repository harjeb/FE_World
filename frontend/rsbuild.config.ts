import { fileURLToPath } from 'node:url';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';

// The battle engine and data tables live in ../backend/common and are bundled as source (docs/07),
// so the numbers on screen come from the same code the server and Agents use.
const webPort = Number(process.env.WEB_PORT || 8524);

export default defineConfig({
  plugins: [pluginReact(), pluginTailwindcss()],
  html: { template: './index.html' },
  source: { entry: { index: './src/main.tsx' } },
  resolve: { alias: { '@common': fileURLToPath(new URL('../backend/common', import.meta.url)) } },
  server: { port: webPort },
  output: { distPath: { root: 'dist' } },
});
