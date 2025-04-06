// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { ERC1155Pausable } from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Pausable.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";
import { ApproveControlled } from "@projecta/util-contracts/contracts/approve/ApproveControlled.sol";
import { ApproveController } from "@projecta/util-contracts/contracts/approve/ApproveController.sol";
import { ERC1155ApproveControlled } from "@projecta/util-contracts/contracts/approve/token/ERC1155ApproveControlled.sol";

/// @notice Consume token(ERC1155) for maplestory
/// for example, potion
/// It inherits from about ERC1155(ERC1155, ERC1155Pausable), access(NextOwnablePausable, ERC1155ApproveControlled),
/// and meta transaction(ERC2771Context)
contract MaplestoryConsume is
    ERC2771Context,
    ERC1155(""),
    NextOwnablePausable,
    ERC1155Pausable,
    ERC1155ApproveControlled
{
    using Strings for uint256;

    // limitSupply >= issuedAmount
    // issuedAmount == (onChainAmount + onChainBurnedAmount) + (offChainAmount + offChainUsedAmount)

    // onChain state
    // onChainAmount: (+)mint / (-)melt, burn
    // onChainBurnedAmount: (+)burn

    // offChain state
    // offChainAmount: (+)melt, setIssuedAmount / (-)mint, setOffChainUsedAmount
    // offChainUsedAmount: (+)setOffChainUsedAmount

    // issuedAmount: (+)setIssuedAmount
    struct Token {
        uint64 limitSupply;
        uint64 issuedAmount;
        int64 offChainAmount;
        uint64 onChainAmount;
        uint64 offChainUsedAmount;
        uint64 onChainBurnedAmount;
    }

    /// @notice modifier for checking if a token exists
    modifier onlyExistToken(uint256 tokenId) {
        require(_tokens[tokenId].limitSupply != 0, "MaplestoryConsume/tokenNotExists: token is not exist");
        _;
    }

    modifier checkOverflow(uint256 amount) {
        require(amount < 9223372036854775808, "MaplestoryConsume/amountOverflow: amount's max value is int64");
        _;
    }

    string private _defaultBaseURI;

    mapping(uint256 => string) private _tokenBaseURIs;
    mapping(uint256 => Token) private _tokens;

    event TokenLimitSupply(uint256 indexed tokenId, uint64 newLimitSupply);
    event DefaultBaseURIChanged(string previousURI, string newURI);
    event TokenBaseURIChanged(uint256 indexed id, string previousURI, string newURI);
    event TokenUsedAmount(uint256 indexed tokenId, uint64 usedAmount);
    event TokenIssuedAmount(uint256 indexed tokenId, uint64 issuedAmount);
    event RetrievedERC1155(address from, address to, uint256 id, uint256 amount, string reason);

    constructor(
        address trustedForwarder,
        ApproveController controller_,
        string memory defaultBaseURI
    ) ERC2771Context(trustedForwarder) ApproveControlled(controller_) {
        _defaultBaseURI = defaultBaseURI;
    }

    /// @notice Sets the default base URI and emits a DefaultBaseURIChanged event.
    /// @param newURI The new default base URI to be set.
    function setDefaultURI(string memory newURI) external whenExecutable {
        emit DefaultBaseURIChanged(_defaultBaseURI, newURI);
        _defaultBaseURI = newURI;
    }

    /// @notice Sets the base URI for a specific token ID and emits a TokenBaseURIChanged event.
    /// @param newURI The new base URI to be set for the specified token ID.
    /// @param id The ID of the token for which the base URI is being set.
    function setTokenURI(string memory newURI, uint256 id) external whenExecutable {
        emit TokenBaseURIChanged(id, _tokenBaseURIs[id], newURI);
        _tokenBaseURIs[id] = newURI;
    }

    /// @notice Sets the limit supply for a specific token ID, allowing only one call per token ID.
    /// @param id The ID of the token for which the limit supply is being set.
    /// @param newLimitSupply The new limit supply to be set for the specified token ID.
    function setLimitSupply(uint256 id, uint64 newLimitSupply) external whenExecutable {
        require(
            newLimitSupply < 9223372036854775808,
            "MaplestoryConsume/setSupplyOverflow: limit supply's max value is int64"
        );
        Token storage token = _tokens[id];
        require(token.limitSupply == 0, "MaplestoryConsume/setLimitSupply: limit supply is already set");
        emit TokenLimitSupply(id, newLimitSupply);
        token.limitSupply = newLimitSupply;
    }

    /// @notice Mints a specified amount of tokens with the given ID and assigns them to the specified address.
    /// @param to The address to which the newly minted tokens will be assigned.
    /// @param id The ID of the token to be minted.
    /// @param amount The amount of tokens to mint.
    /// @param data Additional data to pass during the minting process.
    function mint(
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) external whenExecutable checkOverflow(amount) {
        Token storage token = _tokens[id];

        token.onChainAmount += uint64(amount);
        token.offChainAmount -= int64(uint64(amount));

        _mint(to, id, amount, data);
    }

    /// @notice Batch function of mint.
    function mintBatch(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) external whenExecutable {
        uint256 idsLength = ids.length;
        for (uint256 i; i < idsLength; ) {
            require(amounts[i] < 9223372036854775808, "MaplestoryConsume/amountOverflow: amount's max value is int64");
            Token storage token = _tokens[ids[i]];
            token.onChainAmount += uint64(amounts[i]);
            token.offChainAmount -= int64(uint64(amounts[i]));
            unchecked {
                i++;
            }
        }
        _mintBatch(to, ids, amounts, data);
    }

    /// @notice Converts tokens into game consumables to be consumed in-game and reports the usage through setOffChainUsed.
    /// @param from The address from which the tokens will be melted.
    /// @param id The ID of the token to be melted.
    /// @param amount The amount of tokens to melt.
    function melt(address from, uint256 id, uint256 amount) external whenExecutable checkOverflow(amount) {
        Token storage token = _tokens[id];
        _burn(from, id, amount);
        token.onChainAmount -= uint64(amount);
        token.offChainAmount += int64(uint64(amount));
    }

    /// @notice Batch function of melt.
    function meltBatch(address from, uint256[] calldata ids, uint256[] calldata amounts) external whenExecutable {
        uint256 idsLength = ids.length;
        for (uint256 i; i < idsLength; ) {
            require(amounts[i] < 9223372036854775808, "MaplestoryConsume/amountOverflow: amount's max value is int64");
            Token storage token = _tokens[ids[i]];
            token.onChainAmount -= uint64(amounts[i]);
            token.offChainAmount += int64(uint64(amounts[i]));
            unchecked {
                i++;
            }
        }
        _burnBatch(from, ids, amounts);
    }

    /// @notice Burns a specified amount of tokens, reducing the total supply.
    /// @param from The address from which the tokens will be burned.
    /// @param id The ID of the token to be burned.
    /// @param amount The amount of tokens to burn.
    function burn(address from, uint256 id, uint256 amount) external checkOverflow(amount) {
        Token storage token = _tokens[id];
        _burn(from, id, amount);
        token.onChainAmount -= uint64(amount);
        token.onChainBurnedAmount += uint64(amount);
    }

    /// @notice Batch function of burn.
    function burnBatch(address from, uint256[] calldata ids, uint256[] calldata amounts) external {
        uint256 idsLength = ids.length;
        for (uint256 i; i < idsLength; ) {
            require(amounts[i] < 9223372036854775808, "MaplestoryConsume/amountOverflow: amount's max value is int64");
            Token storage token = _tokens[ids[i]];
            token.onChainAmount -= uint64(amounts[i]);
            token.onChainBurnedAmount += uint64(amounts[i]);
            unchecked {
                i++;
            }
        }
        _burnBatch(from, ids, amounts);
    }

    /// @notice Sets the off-chain used amount for multiple tokens.
    /// @param ids An array of token IDs for which the off-chain used amount will be set.
    /// @param amounts An array of amounts representing the off-chain used amount for each corresponding token ID.
    function setOffChainUsedAmount(uint256[] calldata ids, uint256[] calldata amounts) external whenExecutable {
        uint256 idsLength = ids.length;
        require(idsLength == amounts.length, "MaplestoryConsume/invalidRequest: ids and amounts length mismatch");
        for (uint256 i; i < idsLength; ) {
            require(amounts[i] < 9223372036854775808, "MaplestoryConsume/amountOverflow: amount's max value is int64");
            Token storage token = _tokens[ids[i]];
            uint64 amount = uint64(amounts[i]);
            token.offChainUsedAmount += amount;
            token.offChainAmount -= int64(amount);
            unchecked {
                emit TokenUsedAmount(ids[i], amount);
                i++;
            }
        }
    }

    /// @notice Sets the issued amount for multiple tokens.
    /// @param ids An array of token IDs for which the issued amount will be set.
    /// @param amounts An array of amounts representing the issued amount for each corresponding token ID.
    function setIssuedAmount(uint256[] calldata ids, uint256[] calldata amounts) external whenExecutable {
        uint256 idsLength = ids.length;
        require(idsLength == amounts.length, "MaplestoryConsume/invalidRequest: ids and amounts length mismatch");
        for (uint256 i; i < idsLength; ) {
            require(amounts[i] < 9223372036854775808, "MaplestoryConsume/amountOverflow: amount's max value is int64");
            Token storage token = _tokens[ids[i]];
            uint64 amount = uint64(amounts[i]);
            require(
                token.limitSupply >= token.issuedAmount + amount,
                "MaplestoryConsume/issuedLimit: supply limit exceeded"
            );
            token.issuedAmount += amount;
            token.offChainAmount += int64(amount);
            unchecked {
                emit TokenIssuedAmount(ids[i], amount);
                i++;
            }
        }
    }

    /// @notice Retrieve equip item by owner.
    /// @param from Address of the item owner.
    /// @param to Address of the item receiver.
    /// @param id Token's id.
    /// @param amount Amount of token to retrieve.
    /// @param reason Reason of the retrieval.
    function retrieveERC1155(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        string memory reason
    ) external onlyOwner {
        safeTransferFrom(from, to, id, amount, "");
        emit RetrievedERC1155(from, to, id, amount, reason);
    }

    /// @notice Returns `limitSupply` of item.
    /// @param id Token's id.
    /// @return uint64 Number of item's `limitSupply`
    function getTokenLimitSupply(uint256 id) external view onlyExistToken(id) returns (uint64) {
        return _tokens[id].limitSupply;
    }

    /// @notice Returns `onChainAmount` of item.
    /// @param id Token's id.
    /// @return uint64 Number of item's `onChainAmount`
    function getTokenOnChainAmount(uint256 id) external view onlyExistToken(id) returns (uint64) {
        return _tokens[id].onChainAmount;
    }

    /// @notice Returns `offChainAmount` of item.
    /// @param id Token's id.
    /// @return int64 Number of item's `offChainAmount`
    function getTokenOffChainAmount(uint256 id) external view onlyExistToken(id) returns (int64) {
        return _tokens[id].offChainAmount;
    }

    /// @notice Returns `offChainUsedAmount` of item.
    /// @param id Token's id.
    /// @return uint64 Number of item's `offChainUsedAmount`
    function getTokenOffChainUsedAmount(uint256 id) external view onlyExistToken(id) returns (uint64) {
        return _tokens[id].offChainUsedAmount;
    }

    /// @notice Returns `onChainBurnedAmount` of item.
    /// @param id Token's id.
    /// @return uint64 Number of item's `onChainBurnedAmount`
    function getTokenOnChainBurnedAmount(uint256 id) external view onlyExistToken(id) returns (uint64) {
        return _tokens[id].onChainBurnedAmount;
    }

    /// @notice Returns `issuedAmount` of item.
    /// @param id Token's id.
    /// @return uint64 Number of item's `issuedAmount`
    function getTokenIssuedAmount(uint256 id) external view onlyExistToken(id) returns (uint64) {
        return _tokens[id].issuedAmount;
    }

    /// @notice Returns token's uri.
    /// @dev Returns `_tokenBaseURIs` if the base uri of item is set. Otherwise returns `_defaultBaseURI`.
    /// @param id Token's id.
    /// @return string String of the token uri.
    function uri(uint256 id) public view override onlyExistToken(id) returns (string memory) {
        string memory _uri = bytes(_tokenBaseURIs[id]).length > 0 ? _tokenBaseURIs[id] : _defaultBaseURI;

        return string(abi.encodePacked(_uri, id.toString(), ".json"));
    }

    /* trivial overrides */
    /** functions under this comments are just like wrapping functions. these are functionaly same to original functions */
    function isApprovedForAll(
        address account,
        address operator
    ) public view override(ERC1155, ERC1155ApproveControlled) returns (bool) {
        if (owner() == _msgSender()) {
            return true;
        }
        return ERC1155ApproveControlled.isApprovedForAll(account, operator);
    }

    /// @notice override _beforeTokenTransfer from ERC1155Pausable,
    /// it is called by _mint and _burn function from ERC1155.
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override(ERC1155, ERC1155Pausable) {
        if (from == address(0)) {
            uint256 idsLength = ids.length;
            for (uint256 i; i < idsLength; ) {
                Token storage token = _tokens[ids[i]];
                require(token.limitSupply != 0, "MaplestoryConsume/mintInvalidTokenID: minting for invalid token ID");
                require(token.limitSupply >= amounts[i], "MaplestoryConsume/overMint: wrong amount to mint");
                unchecked {
                    i++;
                }
            }
        }

        if (to == address(0)) {
            require(
                from == _msgSender() || isApprovedForAll(from, _msgSender()),
                "MaplestoryConsume/burnForbidden: caller is neither the token owner, approved"
            );
        }

        ERC1155Pausable._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }

    /// @notice See {ERC1155ApproveControlled-_setApprovalForAll}.
    function _setApprovalForAll(
        address owner,
        address operator,
        bool approved
    ) internal virtual override(ERC1155, ERC1155ApproveControlled) {
        ERC1155ApproveControlled._setApprovalForAll(owner, operator, approved);
    }

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
