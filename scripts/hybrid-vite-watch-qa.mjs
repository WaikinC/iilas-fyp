import test from 'node:test';import assert from 'node:assert/strict';import {mkdir,writeFile,mkdtemp,rm,realpath,lstat} from 'node:fs/promises';import {resolve,join,relative} from 'node:path';import {tmpdir} from 'node:os';import {loadConfigFromFile,createServer} from 'vite';
test('development watcher excludes private data and build trees but retains source edits',async()=>{
 const loaded=await loadConfigFromFile({command:'serve',mode:'development'},resolve('vite.config.ts')),watch=loaded.config.server?.watch;
 assert(watch&&Array.isArray(watch.ignored),'Resource-heavy private/generated trees must be excluded from development watching');
 const root=await mkdtemp(join(tmpdir(),'iilas-watch-'));
 for(const name of ['src','research/datasets','outputs','android/app/build','.superpowers']){await mkdir(join(root,name),{recursive:true});await writeFile(join(root,name,'watch-fixture.txt'),'before\n',{flag:'wx'});}
 const server=await createServer({configFile:false,root,publicDir:false,logLevel:'silent',server:{middlewareMode:true,watch}});
 try{
  for(let i=0;i<100&&!Object.keys(server.watcher.getWatched()).some(p=>resolve(p)===join(root,'src'));i++)await new Promise(r=>setTimeout(r,50));
  const directories=Object.keys(server.watcher.getWatched()).map(p=>resolve(p));assert(directories.includes(join(root,'src')),'Frontend sources must remain watched');
  for(const name of ['research/datasets','outputs','android','.superpowers'])assert(!directories.some(p=>p===join(root,name)||p.startsWith(join(root,name)+'/')||p.startsWith(join(root,name)+'\\')),'Excluded generated/data tree is still watched: '+name);
  const source=join(root,'src/watch-fixture.txt'),event=new Promise((done,reject)=>{const timeout=setTimeout(()=>reject(Error('Source edit was not observed')),5000);server.watcher.on('change',p=>{if(resolve(p)===source){clearTimeout(timeout);done();}});});await writeFile(source,'after\n');await event;
 }finally{await server.close();assert(/^iilas-watch-[A-Za-z0-9]+$/.test(relative(resolve(tmpdir()),root)));assert.equal(await realpath(root),root);assert(!(await lstat(root)).isSymbolicLink());await rm(root,{recursive:true,force:false});}
});
