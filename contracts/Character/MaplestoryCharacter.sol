// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Pausable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import { MinProxy } from "@projecta/min-proxy/contracts/MinProxy.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";
import { ApproveControlled } from "@projecta/util-contracts/contracts/approve/ApproveControlled.sol";
import { ApproveController } from "@projecta/util-contracts/contracts/approve/ApproveController.sol";
import { ERC721ApproveControlled } from "@projecta/util-contracts/contracts/approve/token/ERC721ApproveControlled.sol";
import { MaplestoryCharacterInventoryImpl } from "./MaplestoryCharacterInventoryImpl.sol";

/// @title MaplestoryCharacter - Non-Fungible Token contract based on ERC721.
/// @dev Main features:
///      - Character: Represents the nature of MSU characters.
///        All tokens is a proxy contract which have logic of MaplestoryCharacterInventoryImpl.
///      - Deposit/Withdraw: Functions which deposit non-fungible token to character or withdraw non-fungible token
///        item from character.
contract MaplestoryCharacter is
    ERC2771Context,
    ERC721("MaplestoryCharacter", "MSC"),
    ERC721Pausable,
    NextOwnablePausable,
    ApproveControlled,
    ERC721ApproveControlled
{
    using Strings for uint256;

    string private _defaultBaseURI;
    uint256 private _totalSupply;
    MaplestoryCharacterInventoryImpl private immutable _impl;
    mapping(uint256 => string) private _characterBaseURIs;

    event DefaultBaseURIChanged(string previousURI, string newURI);
    event CharacterBaseURIChanged(uint256 indexed characterId, string previousURI, string newURI);
    event ItemDeposited(
        address indexed from,
        uint256 indexed characterId,
        address tokenAddress,
        uint256 indexed tokenId
    );
    event ItemWithdrawn(uint256 indexed characterId, address indexed to, address tokenAddress, uint256 indexed tokenId);
    event RetrievedCharacter(address from, address to, uint256 tokenId, string reason);

    modifier onlyCharacterOwner(address userWallet, uint256 characterId) {
        require(
            ERC721.ownerOf(characterId) == userWallet,
            "MaplestoryCharacter/wrongRequester: requester is not the character owner"
        );
        _;
    }

    constructor(
        address trustedForwarder_,
        ApproveController controller_,
        string memory defaultBaseURI_
    ) ERC2771Context(trustedForwarder_) ApproveControlled(controller_) {
        _defaultBaseURI = defaultBaseURI_;
        _impl = new MaplestoryCharacterInventoryImpl(MaplestoryCharacter(address(this)));
    }

    /// @notice Transfer ERC721 token to character.
    /// @param  userWallet owns the character.
    /// @param  characterId is new owner of token.
    /// @param  tokenAddress transferred token's contract address.
    /// @param  tokenId transferred to character.
    function depositItemFromSender(
        address userWallet,
        uint256 characterId,
        IERC721 tokenAddress,
        uint256 tokenId
    ) external whenExecutable onlyCharacterOwner(userWallet, characterId) {
        _depositItemFromSender(characterId, tokenAddress, tokenId);
    }

    /// @notice Batch function of {depositItemFromSender}.
    function depositBatchItemsFromSender(
        address userWallet,
        uint256 characterId,
        IERC721 tokenAddress,
        uint256[] memory tokenIds
    ) external whenExecutable onlyCharacterOwner(userWallet, characterId) {
        uint256 tokensLength = tokenIds.length;
        for (uint256 i; i < tokensLength; ) {
            _depositItemFromSender(characterId, tokenAddress, tokenIds[i]);
            unchecked {
                i++;
            }
        }
    }

    /// @notice Transfer ERC721 token to character.
    /// @dev    The ERC721 token's owner is userWallet.
    /// @param  userWallet owns the character.
    /// @param  characterId is new owner of token.
    /// @param  tokenAddress transferred token's contract address.
    /// @param  tokenId transferred to character.
    function depositItemFromOwner(
        address userWallet,
        uint256 characterId,
        IERC721 tokenAddress,
        uint256 tokenId
    ) external whenExecutable onlyCharacterOwner(userWallet, characterId) {
        _depositItemFromOwner(userWallet, characterId, tokenAddress, tokenId);
    }

    /// @notice Batch function of {depositItemFromOwner}.
    function depositBatchItemsFromOwner(
        address userWallet,
        uint256 characterId,
        IERC721 tokenAddress,
        uint256[] memory tokenIds
    ) external whenExecutable onlyCharacterOwner(userWallet, characterId) {
        uint256 tokensLength = tokenIds.length;
        for (uint256 i; i < tokensLength; ) {
            _depositItemFromOwner(userWallet, characterId, tokenAddress, tokenIds[i]);
            unchecked {
                i++;
            }
        }
    }

    /// @notice Transfer ERC721 token from character to `to` address.
    /// @param  characterId owns the token.
    /// @param  userWallet owns the character.
    /// @param  to receive the token from character.
    /// @param  tokenAddress transferred token's contract address.
    /// @param  tokenId transferred to character.
    function withdrawItemTo(
        uint256 characterId,
        address userWallet,
        address to,
        IERC721 tokenAddress,
        uint256 tokenId
    ) external whenExecutable onlyCharacterOwner(userWallet, characterId) {
        _withdrawItemTo(characterId, to, tokenAddress, tokenId);
    }

    /// @notice Batch function of {withdrawItemTo}.
    function withdrawBatchItemsTo(
        uint256 characterId,
        address userWallet,
        address to,
        IERC721 tokenAddress,
        uint256[] memory tokenIds
    ) external whenExecutable onlyCharacterOwner(userWallet, characterId) {
        uint256 tokensLength = tokenIds.length;
        for (uint256 i; i < tokensLength; ) {
            _withdrawItemTo(characterId, to, tokenAddress, tokenIds[i]);
            unchecked {
                i++;
            }
        }
    }

    /// @notice Transfer ERC721 token from character to user wallet.
    /// @param  characterId owns the token.
    /// @param  userWallet owns the character.
    /// @param  tokenAddress transferred token's contract address.
    /// @param  tokenId transferred to user wallet.
    function withdrawItemToOwner(
        uint256 characterId,
        address userWallet,
        IERC721 tokenAddress,
        uint256 tokenId
    ) external whenExecutable onlyCharacterOwner(userWallet, characterId) {
        _withdrawItemToOwner(characterId, tokenAddress, tokenId);
    }

    /// @notice Batch function of {withdrawItemToOwner}.
    function withdrawBatchItemsToOwner(
        uint256 characterId,
        address userWallet,
        IERC721 tokenAddress,
        uint256[] memory tokenIds
    ) external whenExecutable onlyCharacterOwner(userWallet, characterId) {
        uint256 tokensLength = tokenIds.length;
        for (uint256 i; i < tokensLength; ) {
            _withdrawItemToOwner(characterId, tokenAddress, tokenIds[i]);
            unchecked {
                i++;
            }
        }
    }

    /// @notice Mints new MaplestoryCharacter token.
    /// @param  to Address to receive token.
    function mint(address to) external whenExecutable {
        _mint(to);
    }

    /// @notice Batch function of {Mint}.
    function mintBatch(address to, uint256 size) external whenExecutable {
        for (uint256 i; i < size; ) {
            _mint(to);
            unchecked {
                i++;
            }
        }
    }

    /// @notice Set `_characterBaseURIs`.
    /// @param  characterId token's id.
    /// @param  newURI String of the new character's base uri.
    function setCharacterURI(uint256 characterId, string memory newURI) external whenExecutable {
        string memory previousURI = _characterBaseURIs[characterId];
        _characterBaseURIs[characterId] = newURI;
        emit CharacterBaseURIChanged(characterId, previousURI, newURI);
    }

    /// @notice Set `_defaultBaseURI`.
    /// @param  newDefaultBaseURI String of the new `_defaultBaseURI`.
    function setBaseURI(string memory newDefaultBaseURI) external whenExecutable {
        string memory previousURI = _defaultBaseURI;
        _defaultBaseURI = newDefaultBaseURI;
        emit DefaultBaseURIChanged(previousURI, _defaultBaseURI);
    }

    /// @notice Retrieve character by owner.
    /// @param  from Address of the character owner.
    /// @param  to Address of the character receiver.
    /// @param  tokenId Token's id.
    /// @param  reason Reason of the retrieval.
    function retrieveCharacter(address from, address to, uint256 tokenId, string memory reason) external onlyOwner {
        safeTransferFrom(from, to, tokenId, "");
        emit RetrievedCharacter(from, to, tokenId, reason);
    }

    /// @notice Returns whether the character minted.
    /// @param characterId token's id.
    /// @return bool Whether the character is minted.
    function exists(uint256 characterId) external view returns (bool) {
        return ERC721._exists(characterId);
    }

    /// @notice Returns `_totalSupply`.
    /// @return uint256 Number of `_totalSupply`.
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    /// @notice Returns list of the tokens owner.
    /// @param  characterIds List of the token ids.
    /// @return Address list of the tokens owner.
    function ownerOfBatch(uint256[] memory characterIds) external view returns (address[] memory) {
        uint256 charactersLength = characterIds.length;
        address[] memory batchOwners = new address[](charactersLength);

        for (uint256 i; i < charactersLength; ++i) {
            batchOwners[i] = ownerOf(characterIds[i]);
        }

        return batchOwners;
    }

    /// @notice Returns token owner.
    /// @param  tokenId Token's id.
    /// @return Address of the token's current owner.
    function ownerOf(uint256 tokenId) public view virtual override returns (address) {
        address owner = _ownerOf(tokenId);
        if (owner == address(0)) {
            // nx-errors-ignore
            revert(
                string(
                    abi.encodePacked(
                        "MaplestoryCharacter/ownerOfInvalidID: invalid token ID(",
                        tokenId.toHexString(20),
                        ")"
                    )
                )
            );
        }
        return owner;
    }

    /// @notice Returns token's uri.
    /// @dev    Returns `_characterBaseURIs` if the base uri of character is set. Otherwise returns `_defaultBaseURI`.
    /// @param  characterId Token's id.
    /// @return String of the token uri.
    function tokenURI(uint256 characterId) public view override returns (string memory) {
        require(_exists(characterId), "MaplestoryCharacter/uriInvalidID: URI query for nonexistent character");
        string memory uri = bytes(_characterBaseURIs[characterId]).length > 0
            ? _characterBaseURIs[characterId]
            : _defaultBaseURI;

        return string(abi.encodePacked(uri, characterId.toHexString(20), ".json"));
    }

    /// @notice Hook called before any token transferred to ensure that the transfer is valid.
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721, ERC721Pausable) {
        require(uint256(uint160(to)) != tokenId, "MaplestoryCharacter/transferInvalidID: transfer character to itself");
        ERC721Pausable._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    /// @notice Mints new MaplestoryCharacter token.
    /// @param  to Address to receive minted token.
    function _mint(address to) private {
        uint256 newCharacter = uint256(uint160(MinProxy.createProxy(address(_impl))));
        _totalSupply++;
        ERC721._safeMint(to, newCharacter);
    }

    /// @notice Transfer ERC721 token to character.
    /// @dev    The ERC721 token's owner is msg sender.
    /// @param  characterId receive token.
    /// @param  tokenAddress transferred token's contract address.
    /// @param  tokenId transferred to character.
    function _depositItemFromSender(uint256 characterId, IERC721 tokenAddress, uint256 tokenId) private {
        tokenAddress.safeTransferFrom(_msgSender(), address(uint160(characterId)), tokenId);
        emit ItemDeposited(_msgSender(), characterId, address(tokenAddress), tokenId);
    }

    /// @notice Transfer ERC721 token to character.
    /// @dev    The ERC721 token's owner is userWallet.
    /// @param  userWallet owns the character.
    /// @param  characterId receive token.
    /// @param  tokenAddress transferred token's contract address.
    /// @param  tokenId transferred to character.
    function _depositItemFromOwner(
        address userWallet,
        uint256 characterId,
        IERC721 tokenAddress,
        uint256 tokenId
    ) private {
        tokenAddress.safeTransferFrom(userWallet, address(uint160(characterId)), tokenId);
        emit ItemDeposited(userWallet, characterId, address(tokenAddress), tokenId);
    }

    /// @notice Transfer ERC721 token from character to character's owner wallet.
    /// @param  characterId owns the token.
    /// @param  tokenAddress transferred token's contract address.
    /// @param  tokenId transferred to user wallet.
    function _withdrawItemToOwner(uint256 characterId, IERC721 tokenAddress, uint256 tokenId) private {
        _withdrawItemTo(characterId, ERC721.ownerOf(characterId), tokenAddress, tokenId);
    }

    /// @notice Transfer ERC721 token from character to `to` address.
    /// @param  characterId owns the token.
    /// @param  to receive the token from character.
    /// @param  tokenAddress transferred token's contract address.
    /// @param  tokenId transferred to user wallet.
    function _withdrawItemTo(uint256 characterId, address to, IERC721 tokenAddress, uint256 tokenId) private {
        MaplestoryCharacterInventoryImpl(address(uint160(characterId))).withdrawItem(to, tokenAddress, tokenId);
        emit ItemWithdrawn(characterId, to, address(tokenAddress), tokenId);
    }

    /* trivial overrides */

    /// @notice See {ERC721ApproveControlled-isApprovedForAll}.
    function isApprovedForAll(
        address owner_,
        address operator_
    ) public view override(ERC721, ERC721ApproveControlled) returns (bool) {
        if (owner() == _msgSender()) {
            return true;
        }
        return ERC721ApproveControlled.isApprovedForAll(owner_, operator_);
    }

    /// @notice See {ERC721ApproveControlled-_approve}.
    function _approve(address to, uint256 tokenId) internal virtual override(ERC721, ERC721ApproveControlled) {
        ERC721ApproveControlled._approve(to, tokenId);
    }

    /// @notice See {ERC721ApproveControlled-_setApprovalForAll}.
    function _setApprovalForAll(
        address owner,
        address operator,
        bool approved
    ) internal virtual override(ERC721, ERC721ApproveControlled) {
        ERC721ApproveControlled._setApprovalForAll(owner, operator, approved);
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
