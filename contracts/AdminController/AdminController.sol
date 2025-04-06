// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Exec } from "@projecta/util-contracts/contracts/exec/Exec.sol";

/// @notice Wallet-like contract that holds ownerships of target contracts and controls roles in function name
/// granularity. This contract inherits AccessControl and a role represents the ability to call a function of a
/// contract.
contract AdminController is Context, AccessControl, Exec {
    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    /// @notice Sets the admin role of a role. Only admin role holders of that role can call. After calling, the previous
    /// admin role is not the admin of that role.
    function setRoleAdmin(bytes32 role, bytes32 adminRole) external onlyRole(getRoleAdmin(role)) {
        _setRoleAdmin(role, adminRole);
    }

    /// @notice Calculates role that can call the function specified by to and data. Functions are distinguished only by
    /// 4-byte signatures.
    function roleFor(address to, bytes memory data) public pure returns (bytes32) {
        if (data.length >= 4) return keccak256(abi.encodePacked(Exec.exec.selector, to, bytes4(data))); // first 4 bytes
        return keccak256(abi.encodePacked(Exec.exec.selector, to, data));
    }

    /// @notice Overrides _beforeEachExec callback to restrict who can execute the function.
    function _beforeEachExec(
        address to,
        bytes memory data,
        uint256 value
    ) internal override onlyRole(roleFor(to, data)) {}
}
