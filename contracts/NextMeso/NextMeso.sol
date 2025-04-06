// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Pausable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";
import { ApproveControlled } from "@projecta/util-contracts/contracts/approve/ApproveControlled.sol";
import { ApproveController } from "@projecta/util-contracts/contracts/approve/ApproveController.sol";
import { ERC20ApproveControlled } from "@projecta/util-contracts/contracts/approve/token/ERC20ApproveControlled.sol";

/// @notice NextMeso token(ERC20) for maplestory
contract NextMeso is
    ERC2771Context,
    ERC20("NextMeso", "NESO"),
    NextOwnablePausable,
    ERC20Pausable,
    ERC20ApproveControlled
{
    receive() external payable {
        deposit();
    }

    /**
     * @notice The exchange rate used to convert native currency to tokens.
     * @dev This the number of tokens minted or burned for each unit of native currency.
     * For example, if exchangeRate is 100,000, then 1 native currency unit is equivalent to 100,000 tokens.
     * This value is used in the deposit and withdraw functions to calculate the corresponding token amounts.
     */
    uint256 public immutable exchangeRate;

    constructor(
        address trustedForwarder,
        ApproveController controller_,
        uint256 exchangeRate_
    ) ERC2771Context(trustedForwarder) ApproveControlled(controller_) {
        exchangeRate = exchangeRate_;
    }

    event Deposit(address indexed to, uint256 amount, uint256 value);
    event Withdrawal(address indexed from, uint256 amount, uint256 value);
    event RetrievedNeso(address from, address to, uint256 amount, string reason);

    /**
     * @notice Withdraws the specified amount of tokens, burning them in exchange for native currency.
     * @param amount The amount of tokens to withdraw.
     */
    function withdraw(uint256 amount) external {
        require(amount >= exchangeRate, "NextMeso/wrongAmount: minimum amount is over exchange rate");
        uint256 modulo = amount % exchangeRate;
        uint256 quotient = amount - modulo;
        uint256 exchangeValue = quotient / exchangeRate;
        _burn(_msgSender(), quotient);
        (bool success, ) = _msgSender().call{ value: exchangeValue }("");
        require(success, "NextMeso/transferFailed: failed to transfer NXPC");
        emit Withdrawal(_msgSender(), quotient, exchangeValue);
    }

    /// @notice Retrieve neso by owner.
    /// @param from Address of the neso owner.
    /// @param to Address of the neso receiver.
    /// @param amount Amount of neso to retrieve.
    /// @param reason Reason of the retrieval.
    function retrieveNeso(address from, address to, uint256 amount, string memory reason) external onlyOwner {
        _transfer(from, to, amount);
        emit RetrievedNeso(from, to, amount, reason);
    }

    /// @notice Returns the amounts of balances accounts have.
    /// @param accounts List of accounts.
    /// @return uint256 Amount of NESO held by the accounts.
    function balanceOfBatch(address[] memory accounts) external view returns (uint256[] memory) {
        uint256 accountsLength = accounts.length;
        uint256[] memory batchBalances = new uint256[](accountsLength);

        for (uint256 i; i < accountsLength; ++i) {
            batchBalances[i] = balanceOf(accounts[i]);
        }

        return batchBalances;
    }

    /**
     * @notice Deposits native currency into the contract and mints an equivalent amount of tokens.
     */
    function deposit() public payable {
        require(msg.value != 0, "NextMeso/wrongValue: there is no value in message");
        uint256 amount = msg.value * exchangeRate;
        _mint(_msgSender(), amount);
        emit Deposit(_msgSender(), amount, msg.value);
    }

    /* trivial overrides */

    /**
     * @notice This function combines the allowance retrieval logic from the `ERC20` and `ERC20ApproveControlled` contracts.
     * It allows querying the approved amount directly without requiring an explicit call to `ERC20ApproveControlled.allowance`.
     */
    function allowance(
        address owner_,
        address spender
    ) public view override(ERC20, ERC20ApproveControlled) returns (uint256) {
        return ERC20ApproveControlled.allowance(owner_, spender);
    }

    /// @notice Hook that is called before any token transfer to ensure the transfer is valid when unpaused state.
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override(ERC20, ERC20Pausable) {
        ERC20Pausable._beforeTokenTransfer(from, to, amount);
    }

    /// @notice Internal function that check the spender registered on `onlyAllowlisted` authority when transfer any token.
    function _approve(address owner, address spender, uint256 amount) internal override(ERC20, ERC20ApproveControlled) {
        ERC20ApproveControlled._approve(owner, spender, amount);
    }

    /// @notice See {ERC2771Context-_msgSender}.
    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    /// @notice See {ERC2771Context-_msgData}.
    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
