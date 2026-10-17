const assert=require('node:assert/strict');
const {ethers}=require('hardhat');
describe('Inventory and delivery integrity registry',()=>{
  let registry,admin,registrar,outsider;
  beforeEach(async()=>{[admin,registrar,outsider]=await ethers.getSigners();registry=await ethers.deployContract('IntegrityRegistry');await registry.waitForDeployment();});
  it('registers both workflows, detects changed hashes, and preserves the original',async()=>{
    for(const workflow of ['inventory','delivery']){
      const key=ethers.sha256(ethers.toUtf8Bytes(`${workflow}:opaque-reference`)),digest=ethers.sha256(ethers.toUtf8Bytes('canonical approved record'));
      assert.equal(await registry.lookup(key),ethers.ZeroHash);
      await (await registry.register(key,digest)).wait();assert.equal(await registry.lookup(key),digest);
      assert.notEqual(await registry.lookup(key),ethers.sha256(ethers.toUtf8Bytes('tampered record')));
      await assert.rejects(()=>registry.register(key,digest),/Already registered/);
    }
  });
  it('enforces registrar grants and revocation',async()=>{
    const key=ethers.sha256(ethers.toUtf8Bytes('key')),digest=ethers.sha256(ethers.toUtf8Bytes('value'));
    await assert.rejects(()=>registry.connect(outsider).register(key,digest),/Registrar only/);
    await assert.rejects(()=>registry.connect(outsider).setRegistrar(outsider.address,true),/Administrator only/);
    await (await registry.connect(admin).setRegistrar(registrar.address,true)).wait();
    await (await registry.connect(registrar).register(key,digest)).wait();
    await (await registry.setRegistrar(registrar.address,false)).wait();
    await assert.rejects(()=>registry.connect(registrar).register(ethers.sha256(ethers.toUtf8Bytes('another')),digest),/Registrar only/);
    await assert.rejects(()=>registry.register(ethers.ZeroHash,digest),/Empty hash/);
  });
});
