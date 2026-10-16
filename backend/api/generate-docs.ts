import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiDoc, renderMarkdown } from '../common/protocol/docs.ts';

// Regenerates docs/agent-api.md and agent-api.json from the op table (docs/06). `npm run docs`.
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
mkdirSync(join(ROOT, 'docs'), { recursive: true });
writeFileSync(join(ROOT, 'docs', 'agent-api.md'), renderMarkdown());
writeFileSync(join(ROOT, 'agent-api.json'), `${JSON.stringify(apiDoc(), null, 2)}\n`);
console.log('wrote docs/agent-api.md and agent-api.json');
