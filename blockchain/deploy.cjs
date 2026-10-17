const {ethers}=require('hardhat');
const fs=require('node:fs');
async function main(){
  const registry=await ethers.deployContract('IntegrityRegistry');await registry.waitForDeployment();
  const config={chainId:31337,address:await registry.getAddress(),rpcUrl:'http://127.0.0.1:8545'};
  fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync('outputs/blockchain-local.json',JSON.stringify(config,null,2));
  console.log('Local integrity registry:',config.address,'chain',config.chainId);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
