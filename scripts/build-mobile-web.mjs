import {spawnSync} from 'node:child_process';
import {copyFile,access} from 'node:fs/promises';
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','vite.mobile.config.ts'],{stdio:'inherit',windowsHide:true});if(result.status!==0)process.exit(result.status||1);
await access('dist/mobile/mobile.html');await copyFile('dist/mobile/mobile.html','dist/mobile/index.html');
