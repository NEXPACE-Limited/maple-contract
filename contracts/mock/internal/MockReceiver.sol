// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { NextMeso } from "../../NextMeso/NextMeso.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockReceiver {
    using SafeERC20 for IERC20;
    address payable public neso_;

    constructor(address payable _neso) {
        neso_ = _neso;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) public returns (bytes4) {
        NextMeso neso = NextMeso(neso_);
        neso.withdraw(100_000);
        return this.onERC1155Received.selector;
    }
}
