// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ILendingPool
 * @dev Minimal interface for LendingPool used by receivers and frontend
 */
interface ILendingPool {
    function deposit(address asset, uint256 amount) external;
    function withdraw(address asset, uint256 amount) external;
    function borrow(address asset, uint256 amount) external;
    function repay(address asset, uint256 amount) external;
    function liquidate(address collateralAsset, address debtAsset, address user) external;
    function flashLoan(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params
    ) external;

    function getUserPosition(address user) external view returns (uint256 collateral, uint256 debt);
    function getHealthFactor(address user) external view returns (uint256);
    function getUtilizationRate() external view returns (uint256);
    function getFlashLoanFee(uint256 amount) external view returns (uint256);
}
