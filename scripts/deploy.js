/**
 * Hardhat deployment script for local or testnet.
 * Run: npx hardhat run scripts/deploy.js --network localhost
 * Or: npx hardhat run scripts/deploy.js --network sepolia
 *
 * For Remix deployment, use the steps in README.md instead.
 */

const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying with account:', deployer.address);

  // 1. Deploy Mock tokens (collateral and borrow)
  const MockERC20 = await hre.ethers.getContractFactory('MockERC20');
  const collateralToken = await MockERC20.deploy('Collateral', 'COL', 18);
  await collateralToken.waitForDeployment();
  const collateralAddress = await collateralToken.getAddress();
  console.log('Collateral token (COL):', collateralAddress);

  const borrowToken = await MockERC20.deploy('Borrow USD', 'BUSD', 18);
  await borrowToken.waitForDeployment();
  const borrowAddress = await borrowToken.getAddress();
  console.log('Borrow token (BUSD):', borrowAddress);

  // 2. Deploy PriceOracle
  const PriceOracle = await hre.ethers.getContractFactory('PriceOracle');
  const oracle = await PriceOracle.deploy();
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log('PriceOracle:', oracleAddress);

  // Set fallback prices for mock tokens (8 decimals, e.g. 2000 = $2000 for COL, 1 = $1 for BUSD)
  await oracle.setFallbackPrice(collateralAddress, hre.ethers.parseUnits('2000', 8));
  await oracle.setFallbackPrice(borrowAddress, hre.ethers.parseUnits('1', 8));

  // 3. Deploy GovernanceToken
  const GovernanceToken = await hre.ethers.getContractFactory('GovernanceToken');
  const govToken = await GovernanceToken.deploy('Governance', 'GOV');
  await govToken.waitForDeployment();
  const govTokenAddress = await govToken.getAddress();
  console.log('GovernanceToken:', govTokenAddress);

  // 4. Deploy LendingPool
  const LendingPool = await hre.ethers.getContractFactory('LendingPool');
  const pool = await LendingPool.deploy(
    collateralAddress,
    borrowAddress,
    oracleAddress,
    govTokenAddress
  );
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();
  console.log('LendingPool:', poolAddress);

  // 5. Set lending pool in GovernanceToken (so it can mint rewards)
  await govToken.setLendingPool(poolAddress);

  // 6. Deploy FlashLoanReceiverExample
  const FlashLoanReceiverExample = await hre.ethers.getContractFactory('FlashLoanReceiverExample');
  const receiver = await FlashLoanReceiverExample.deploy(poolAddress);
  await receiver.waitForDeployment();
  const receiverAddress = await receiver.getAddress();
  console.log('FlashLoanReceiverExample:', receiverAddress);

  // Seed pool with borrow token so users can borrow
  const seedAmount = hre.ethers.parseUnits('1000000', 18);
  await borrowToken.mint(deployer.address, seedAmount);
  await borrowToken.connect(deployer).transfer(poolAddress, seedAmount);
  console.log('Seeded pool with 1,000,000 BUSD');

  // Mint some collateral and borrow tokens to deployer for testing
  await collateralToken.mint(deployer.address, hre.ethers.parseUnits('100', 18));
  await borrowToken.mint(deployer.address, hre.ethers.parseUnits('10000', 18));
  console.log('Minted test tokens to deployer');

  console.log('\n--- Summary ---');
  console.log('VITE_LENDING_POOL=' + poolAddress);
  console.log('VITE_PRICE_ORACLE=' + oracleAddress);
  console.log('VITE_GOVERNANCE_TOKEN=' + govTokenAddress);
  console.log('VITE_COLLATERAL_ASSET=' + collateralAddress);
  console.log('VITE_BORROW_ASSET=' + borrowAddress);
  console.log('VITE_FLASH_LOAN_RECEIVER=' + receiverAddress);
  console.log('\nAdd these to frontend/.env and restart the frontend.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
