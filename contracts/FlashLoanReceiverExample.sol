// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IFlashLoanReceiver.sol";
import "./interfaces/ILendingPool.sol";

/**
 * @title FlashLoanReceiverExample
 * @dev Example contract that receives a flash loan and repays it + fee in the same tx.
 * Call requestFlashLoan(asset, amount) - caller must approve this contract for the fee amount first.
 */
contract FlashLoanReceiverExample is IFlashLoanReceiver {
    using SafeERC20 for IERC20;

    address public immutable lendingPool;

    constructor(address _lendingPool) {
        lendingPool = _lendingPool;
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 fee,
        address initiator,
        bytes calldata /* params */
    ) external override returns (bool) {
        require(msg.sender == lendingPool, "FlashLoanReceiverExample: only pool");
        require(initiator == address(this) || initiator == tx.origin, "FlashLoanReceiverExample: invalid initiator");

        uint256 totalDebt = amount + fee;
        IERC20(asset).safeTransfer(lendingPool, totalDebt);
        return true;
    }

    /**
     * @dev Request a flash loan. Caller must approve this contract for the fee (get via pool.getFlashLoanFee(amount)).
     */
    function requestFlashLoan(address asset, uint256 amount) external {
        uint256 fee = ILendingPool(lendingPool).getFlashLoanFee(amount);
        IERC20(asset).safeTransferFrom(msg.sender, address(this), fee);
        ILendingPool(lendingPool).flashLoan(address(this), asset, amount, "");
    }
}
