import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = path.resolve(projectRoot, 'dist');
if (path.dirname(output) !== projectRoot || path.basename(output) !== 'dist') throw new Error('Invalid build directory');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const entry of ['index.html', 'src', 'assets', 'examples']) {
  cpSync(path.join(projectRoot, entry), path.join(output, entry), { recursive: true });
}
console.log('Static site prepared in dist/');
