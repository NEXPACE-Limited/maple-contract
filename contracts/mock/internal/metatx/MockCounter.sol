// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

contract MockCounter {
    uint256 public value;

    function loadAndAdd(uint256 amount) external returns (uint256) {
        uint256 loaded = value;
        value += amount;
        return loaded;
    }
}
