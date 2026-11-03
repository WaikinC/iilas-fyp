import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

// Keep diagnostics redacted: report paths/rules, never a matched credential.
const rules=[
  ['OpenAI API key',/(?<![0-9A-Za-z_-])sk-(?:(?:proj|svcacct)-)?[0-9A-Za-z_-]{20,}(?![0-9A-Za-z_-])/g],
  ['Google API key',/(?<![0-9A-Za-z_-])AIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g],
  ['GitHub token',/\b(?:gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,})\b/g],
  ['private key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
  ['service account',/"type"\s*:\s*"service_account"/g],
  ['AWS access key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['Slack token',/\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g],
  ['credential in URL',/https?:\/\/[^\s/"':]+:[^\s/@"']+@/g],
  ['assigned credential',/(?:client[_-]?secret|access[_-]?token|refresh[_-]?token|api[_-]?token|private[_-]?key|password)\s*[=:]\s*["']([^"'\r\n]{12,})["']/gi],
];
const fixtureFiles=new Set(['scripts/access-test-client.mjs','scripts/shared-qa.mjs','scripts/procurement-qa.mjs','scripts/stock-locations-qa.mjs']);
const privatePath=path=>/(?:^|\/)(?:\.env(?:\.[^/]*)?|firebase-config\.json|[^/]*(?:service[-_]?account|firebase-adminsdk|credentials)[^/]*\.json|[^/]+\.(?:pem|key|p12|pfx|joblib|pkl|keras|h5))$/i.test(path)&&!path.endsWith('/.env.example')&&path!=='.env.example';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe']});
const findings=new Set();let count=0;
function inspect(path,body){
  count++;
  if(privatePath(path)||/(?:^|\/)(?:google-services\.json|[^/]+\.(?:jks|keystore|apk|aab|db|sqlite|sqlite3))$/i.test(path))findings.add(`${JSON.stringify(path)}: private local file must not be tracked`);
  const text=body.toString('utf8');
  for(const [name,rule] of rules){
    rule.lastIndex=0;let match;
    while((match=rule.exec(text))){
      // This exact password is documented, disposable emulator test data only.
      if(name==='assigned credential'&&match[1]==='LocalTestPassword123!'&&fixtureFiles.has(path))continue;
      const line=text.slice(0,match.index).split('\n').length;
      findings.add(`${JSON.stringify(path)}:${line}: ${name} (value redacted)`);
    }
  }
}
try{
  if(process.argv.includes('--history')){
    const objects=new Map(git('rev-list','--objects','--all').trim().split('\n').filter(Boolean).map(row=>{const i=row.indexOf(' ');return i<0?[row,'']:[row.slice(0,i),row.slice(i+1)];}));
    const ids=[...objects.keys()];
    const result=spawnSync('git',['cat-file','--batch'],{input:ids.join('\n')+'\n',maxBuffer:64*1024*1024});
    if(result.status!==0)throw new Error('Cannot inspect Git object history.');
    let offset=0;
    for(const id of ids){
      const end=result.stdout.indexOf(10,offset),header=result.stdout.subarray(offset,end).toString('ascii').split(' '),size=Number(header[2]);
      if(end<0||!Number.isSafeInteger(size))throw new Error('Invalid Git object response.');
      const body=result.stdout.subarray(end+1,end+1+size);offset=end+size+2;
      if(header[1]==='blob')inspect(objects.get(id)||`blob-${id}`,body);
    }
  }else if(process.argv.includes('--staged')){
    const changed=new Set(git('diff','--cached','--name-only','--diff-filter=ACMR','-z').split('\0').filter(Boolean));
    for(const row of git('ls-files','--stage','-z').split('\0').filter(Boolean)){
      const split=row.indexOf('\t'),path=row.slice(split+1),[,oid,stage]=row.slice(0,split).split(' ');
      if(changed.has(path)){if(stage!=='0')throw new Error('Resolve merge conflicts before scanning.');inspect(path,execFileSync('git',['cat-file','blob',oid],{maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe']}));}
    }
  }else{
    for(const path of git('ls-files','-co','--exclude-standard','-z').split('\0').filter(Boolean))inspect(path,readFileSync(path));
  }
  if(findings.size){console.error('Secret check blocked this operation:\n'+[...findings].join('\n'));process.exitCode=1;}
  else console.log(`Secret check passed: ${count} ${process.argv.includes('--history')?'reachable Git blobs':'files'}; no recognised credential patterns or private paths found.`);
}catch{console.error('Secret check could not complete. No credential values were printed. Resolve Git/file errors before committing or pushing.');process.exitCode=2;}
