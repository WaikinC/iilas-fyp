import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import {readFileSync,lstatSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {validateDemoEnvironment} from './lib/demoEnvironment.js';
import {validateSparkRuntime} from './lib/sparkRuntime.js';

const buildInput=process.env.IILAS_WEB_BUILD_INPUT;
const root=fileURLToPath(new URL('.',import.meta.url));
if(buildInput){
 const contained=['outputs/hybrid-demo-20261027','outputs/spark-msi-demo-20261028'].some(base=>{const rel=relative(resolve(root,base),resolve(buildInput));return Boolean(rel&&!rel.startsWith('..')&&!isAbsolute(rel));});if(!contained)throw Error('Cloud build inputs must be in the explicitly owned ignored output area.');
 for(const name of ['firebase-config.json','demo-environment.json','demo-allowlist.json']){const p=resolve(buildInput,name),s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>16384)throw Error('Unsafe cloud build input.');}
 const profile=JSON.parse(readFileSync(resolve(buildInput,'demo-environment.json'),'utf8')),allow=JSON.parse(readFileSync(resolve(buildInput,'demo-allowlist.json'),'utf8'));if(['spark-msi','spark-loopback-test'].includes(profile.mode))validateSparkRuntime(profile,allow);else{validateDemoEnvironment(profile,allow);if(profile.mode!=='cloud-demo')throw Error('Cloud build inputs require an explicit profile.');}
}

export default defineConfig({
  plugins: [{name:'iilas-explicit-cloud-build',enforce:'pre',resolveId(source,importer){if(!buildInput||!importer?.replaceAll('\\','/').endsWith('/lib/firebaseRuntime.js'))return null;const name=source.startsWith('../')?source.slice(3):'';return ['firebase-config.json','demo-environment.json','demo-allowlist.json'].includes(name)?resolve(buildInput,name):null;}},react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  server: {
    watch: {
      // These local data/native/output trees are not frontend modules.
      ignored: ['**/research/datasets/**', '**/outputs/**', '**/.superpowers/**', '**/android/**'],
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
});
