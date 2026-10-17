import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!process.env.npm_execpath) throw new Error('Run npm run functions:install.');
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'ci'], {
  cwd: fileURLToPath(new URL('../backend/functions/', import.meta.url)),
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
