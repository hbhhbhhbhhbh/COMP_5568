// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IFlashLoanReceiver
 * @dev Interface that must be implemented by contracts that receive flash loans from LendingPool
 */
interface IFlashLoanReceiver {
    /**
     * @dev Called by LendingPool when a flash loan is executed.
     * @param asset The address of the borrowed asset
     * @param amount The amount borrowed
     * @param fee The fee charged for the flash loan
     * @param initiator The address that initiated the flash loan
     * @param params Optional encoded params passed from the initiator
     * @return True if the execution was successful; reverts otherwise
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 fee,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}
