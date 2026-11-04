import {createRequire} from 'node:module';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export default async function loadProvider({app,manifest}){
 const fromApp=createRequire(join(app,'package.json')),hre=fromApp('hardhat');
 const {createProvider}=fromApp('hardhat/internal/core/providers/construction.js');
 const canonical=v=>JSON.stringify(v,(_k,x)=>typeof x==='bigint'?{$bigint:x.toString()}:x instanceof Map?{$map:[...x]}:x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
 const network={...hre.config.networks.hardhat,initialDate:manifest.initialDate,loggingEnabled:false};
 const configurationSha256=createHash('sha256').update(canonical(network)).digest('hex');
 if(configurationSha256!==manifest.configurationSha256)throw Error('Hardhat configuration changed');
 const provider=await createProvider({...hre.config,networks:{...hre.config.networks,hardhat:network}},'hardhat');
 return {provider,ethers:fromApp('ethers')};
}
