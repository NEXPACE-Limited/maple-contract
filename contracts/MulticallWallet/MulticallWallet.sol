// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";
import { Exec } from "@projecta/util-contracts/contracts/exec/Exec.sol";

/// @notice A smart contract that provides the ability to bundle multiple transactions into a single one.
contract MulticallWallet is ERC2771Context, NextOwnablePausable, Exec {
    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {}

    /// @notice This function is a callback function that is called just before each call is executed to
    /// determine if the function can be called, if it is not in a PAUSE state, and if the calling privilege
    /// is EXECUTOR or higher.
    function _beforeExec() internal override whenExecutable {}

    /* trivial overrides */

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
