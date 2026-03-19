// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IPriceOracle.sol";
import "./interfaces/IAggregatorV3.sol";

/**
 * @title PriceOracle
 * @dev Integrates Chainlink price feeds. Do NOT hardcode prices.
 * Uses Chainlink AggregatorV3Interface for testnet (e.g. Sepolia) and mainnet.
 */
contract PriceOracle is IPriceOracle {
    /// @dev Mapping from asset address to Chainlink price feed address
    mapping(address => address) private _priceFeeds;

    /// @dev Fallback price for assets without a feed (e.g. mock tokens in tests). 0 = no fallback.
    mapping(address => uint256) private _fallbackPrices;

    event PriceFeedSet(address indexed asset, address indexed feed);
    event FallbackPriceSet(address indexed asset, uint256 price);

    /**
     * @dev Set Chainlink price feed for an asset.
     * @param asset The token/asset address
     * @param feedAddress The Chainlink AggregatorV3 price feed address
     */
    function setPriceFeed(address asset, address feedAddress) external {
        _priceFeeds[asset] = feedAddress;
        emit PriceFeedSet(asset, feedAddress);
    }

    /**
     * @dev Set a fallback price (e.g. for mock tokens on local/testnet when no feed exists).
     * Price should be in 8 decimals (same as Chainlink).
     * @param asset The asset address
     * @param price Price in 8 decimals
     */
    function setFallbackPrice(address asset, uint256 price) external {
        _fallbackPrices[asset] = price;
        emit FallbackPriceSet(asset, price);
    }

    /**
     * @dev Returns the latest price for an asset in 8 decimals (USD).
     * Uses Chainlink feed if set; otherwise uses fallback price if set.
     * @param asset The asset address
     * @return price The price in 8 decimals
     */
    function getPrice(address asset) external view override returns (uint256 price) {
        address feed = _priceFeeds[asset];
        if (feed != address(0)) {
            AggregatorV3Interface aggregator = AggregatorV3Interface(feed);
            (, int256 answer,,,) = aggregator.latestRoundData();
            require(answer > 0, "PriceOracle: invalid answer");
            return uint256(answer);
        }
        uint256 fallbackPrice = _fallbackPrices[asset];
        require(fallbackPrice != 0, "PriceOracle: no feed or fallback");
        return fallbackPrice;
    }

    /**
     * @dev Get the price feed address for an asset.
     */
    function getPriceFeed(address asset) external view returns (address) {
        return _priceFeeds[asset];
    }
}
