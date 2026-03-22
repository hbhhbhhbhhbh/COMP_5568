// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPriceOracle
 * @dev Interface for price oracle (Chainlink or mock)
 */
interface IPriceOracle {
    /**
     * @dev Returns the latest price for an asset (8 decimals, USD)
     * @param asset The asset address
     * @return price The price in 8 decimals
     */
    function getPrice(address asset) external view returns (uint256 price);
}
