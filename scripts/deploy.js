/**
 * Deploy PCOLBUSDPool: 单一池 COL+BUSD，存入得 PCOL/PBUSD 凭证，抵押 PCOL 借 BUSD、抵押 PBUSD 借 COL.
 * Run: npx hardhat run scripts/deploy-pcolbusd.js --network localhost
 */

const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying with account:', deployer.address);

  const MockERC20 = await hre.ethers.getContractFactory('MockERC20');
  const col = await MockERC20.deploy('Collateral', 'COL', 18);
  await col.waitForDeployment();
  const colAddr = await col.getAddress();
  console.log('COL:', colAddr);

  const busd = await MockERC20.deploy('Borrow USD', 'BUSD', 18);
  await busd.waitForDeployment();
  const busdAddr = await busd.getAddress();
  console.log('BUSD:', busdAddr);

  const GovernanceToken = await hre.ethers.getContractFactory('GovernanceToken');
  const gov = await GovernanceToken.deploy('Governance', 'GOV');
  await gov.waitForDeployment();
  const govAddr = await gov.getAddress();
  console.log('GovernanceToken:', govAddr);

  const PCOLBUSDPool = await hre.ethers.getContractFactory('PCOLBUSDPool');
  const pool = await PCOLBUSDPool.deploy(colAddr, busdAddr, govAddr);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log('PCOLBUSDPool:', poolAddr);

  await gov.setLendingPool(poolAddr);

  const pcolAddr = await pool.pcolToken();
  const pbusdAddr = await pool.pbusdToken();
  console.log('PCOL:', pcolAddr);
  console.log('PBUSD:', pbusdAddr);

  const FlashLoanReceiverExample = await hre.ethers.getContractFactory('FlashLoanReceiverExample');
  const receiver = await FlashLoanReceiverExample.deploy(poolAddr);
  await receiver.waitForDeployment();
  const receiverAddr = await receiver.getAddress();
  console.log('FlashLoanReceiverExample:', receiverAddr);

  const seedCol = hre.ethers.parseUnits('500', 18);
  const seedBusd = hre.ethers.parseUnits('10000', 18);
  await col.mint(deployer.address, seedCol);
  await busd.mint(deployer.address, seedBusd);
  await col.approve(poolAddr, seedCol);
  await busd.approve(poolAddr, seedBusd);
  await pool.depositCOL(seedCol);
  await pool.depositBUSD(seedBusd);
  console.log('Seeded pool: 500 COL, 1,000,000 BUSD');

  const signers = await hre.ethers.getSigners();
  const perCol = hre.ethers.parseUnits('10000000000', 18);
  const perBusd = hre.ethers.parseUnits('10000000', 18);
  for (const a of signers) {
    await col.mint(a.address, perCol);
    await busd.mint(a.address, perBusd);
  }
  console.log('Minted 100 COL, 10,000 BUSD to', signers.length, 'accounts');

  console.log('\n--- frontend .env ---');
  console.log('VITE_CHAIN_ID=31337');
  console.log('VITE_LENDING_POOL=' + poolAddr);
  console.log('VITE_GOVERNANCE_TOKEN=' + govAddr);
  console.log('VITE_COLLATERAL_ASSET=' + colAddr);
  console.log('VITE_BORROW_ASSET=' + busdAddr);
  console.log('VITE_PCOL_TOKEN=' + pcolAddr);
  console.log('VITE_PBUSD_TOKEN=' + pbusdAddr);
  console.log('VITE_FLASH_LOAN_RECEIVER=' + receiverAddr);
  console.log('\nPCOL/PBUSD 为池内凭证，不加入池子；存入 COL 得 PCOL、存入 BUSD 得 PBUSD；取款 1:1；抵押 PCOL 借 BUSD、抵押 PBUSD 借 COL.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
