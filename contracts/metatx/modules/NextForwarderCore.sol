// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @notice The main implementation of NextForwarder, which is the forwarder contract for meta-transaction. Instead of
/// extending EIP712, it leaves _hashTypedDataV4 unimplemented and has the deriving contracts override it. By doing
/// this, we can have two versions of NextForwarder nicely without any duplicate codes.
abstract contract NextForwarderCore {
    struct ForwardRequest {
        address from;
        address to;
        uint256 gas;
        bytes data;
        uint256 deadline;
        uint256 salt;
    }

    struct CancelRequest {
        ForwardRequest request;
    }

    string private constant _TYPE_FORWARD_REQUEST =
        "ForwardRequest(address from,address to,uint256 gas,bytes data,uint256 deadline,uint256 salt)";
    bytes32 private constant _TYPEHASH_FORWARD_REQUEST = keccak256(bytes(_TYPE_FORWARD_REQUEST));
    bytes32 private constant _TYPEHASH_CANCEL_REQUEST =
        keccak256(abi.encodePacked("CancelRequest(ForwardRequest request)", _TYPE_FORWARD_REQUEST));

    mapping(bytes32 => bool) private _fulfilled;

    event Executed(address indexed from, bytes32 requestHash, bool success, bytes returndata);
    event Canceled(address indexed from, bytes32 requestHash);

    /// @notice Executes meta-transaction request and emit and return the execution result. This function requires that
    /// the exact same request has never been executed or canceled, the deadline is not exceeded, and the signature is
    /// valid.
    function execute(
        ForwardRequest calldata req,
        bytes memory signature
    ) external returns (bool success, bytes memory returndata) {
        address from = req.from;
        bytes32 requestHash = hashRequest(req);

        require(!_fulfilled[requestHash], "NextForwarderCore/duplicate: already executed or canceled");
        require(block.timestamp < req.deadline, "NextForwarderCore/deadline: deadline exceeded");
        _checkEIP712Signature(req.from, requestHash, signature);

        _fulfilled[requestHash] = true;

        // solhint-disable-next-line avoid-low-level-calls
        (success, returndata) = req.to.call{ gas: req.gas }(abi.encodePacked(req.data, req.from));

        // Validate that the relayer has sent enough gas for the call.
        // See https://ronan.eth.limo/blog/ethereum-gas-dangers/
        if (gasleft() <= req.gas / 63) {
            // We explicitly trigger invalid opcode to consume all gas and bubble-up the effects, since
            // neither revert or assert consume all gas since Solidity 0.8.0
            // https://docs.soliditylang.org/en/v0.8.0/control-structures.html#panic-via-assert-and-error-via-require
            // solhint-disable no-inline-assembly

            /// @solidity memory-safe-assembly
            assembly {
                invalid()
            }
        }

        emit Executed(from, requestHash, success, returndata);
    }

    /// @notice Cancels the request. After doing that, that request cannot be executed. This function requires a valid
    /// signature. The signature scheme is different from execute function so that the same signature for execute cannot
    /// be used for cancel function and vice versa.
    function cancel(CancelRequest calldata req, bytes memory signature) external {
        address from = req.request.from;
        bytes32 requestHash = hashRequest(req.request);

        _checkEIP712Signature(from, keccak256(abi.encode(_TYPEHASH_CANCEL_REQUEST, requestHash)), signature);

        _fulfilled[requestHash] = true;

        emit Canceled(from, requestHash);
    }

    /// @notice Calculates the hash of request, which is used for signature validation and protection against double-
    /// spend. Hash calculation scheme obeys EIP-712 so the same hash is usable for calculating the final hash for
    /// signature validation.
    function hashRequest(ForwardRequest calldata req) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    _TYPEHASH_FORWARD_REQUEST,
                    req.from,
                    req.to,
                    req.gas,
                    keccak256(req.data),
                    req.deadline,
                    req.salt
                )
            );
    }

    /// @notice Returns whether the request given by requestHash has been fulfilled. A request becomes fulfilled when it
    /// gets executed or canceled, and fulfilled request cannot be executed again. The requestHash can be retrieved with
    /// hashRequest function.
    function fulfilled(bytes32 requestHash) public view returns (bool) {
        return _fulfilled[requestHash];
    }

    /// @notice Abstract function that should work as like openzeppelin's EIP712._hashTypedDataV4.
    function _hashTypedDataV4(bytes32 structHash) internal view virtual returns (bytes32);

    /// @notice A convenient function which does EIP-712 signature validation with structHash. If the validation fails,
    /// it reverts.
    function _checkEIP712Signature(address signer, bytes32 structHash, bytes memory signature) private view {
        bytes32 hash = _hashTypedDataV4(structHash);
        require(
            SignatureChecker.isValidSignatureNow(signer, hash, signature),
            "NextForwarderCore/invalidSignature: invalid signature"
        );
    }
}
