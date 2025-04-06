// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { NextForwarderCore } from "./modules/NextForwarderCore.sol";

/// @notice The normal version of NextForwarder. It uses _hashTypedDataV4 of openzeppelin's EIP712 implementation.
contract NextForwarder is EIP712("NextForwarder", "1.0.0"), NextForwarderCore {
    function _hashTypedDataV4(
        bytes32 structHash
    ) internal view virtual override(EIP712, NextForwarderCore) returns (bytes32) {
        return EIP712._hashTypedDataV4(structHash);
    }
}
