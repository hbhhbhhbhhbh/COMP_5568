// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ReceiptToken
 * @dev Pool receipt (e.g. PCOL = 池内 COL 凭证, PBUSD = 池内 BUSD 凭证). Only pool can mint/burn.
 *      P 币不加入池子，只代表你在池子里存了多少对应币，取款时 1:1 从池中取回。
 */
contract ReceiptToken is ERC20 {
    address public immutable pool;

    constructor(string memory name_, string memory symbol_, address pool_) ERC20(name_, symbol_) {
        require(pool_ != address(0), "ReceiptToken: zero pool");
        pool = pool_;
    }

    modifier onlyPool() {
        require(msg.sender == pool, "ReceiptToken: only pool");
        _;
    }

    function mint(address to, uint256 amount) external onlyPool {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyPool {
        _burn(from, amount);
    }
}
