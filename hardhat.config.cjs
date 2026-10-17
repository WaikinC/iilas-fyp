require('@nomicfoundation/hardhat-ethers');
module.exports={solidity:'0.8.28',paths:{sources:'./blockchain/contracts',tests:'./blockchain/test',cache:'./blockchain/cache',artifacts:'./blockchain/artifacts'},networks:{localhost:{url:'http://127.0.0.1:8545',chainId:31337}}};
