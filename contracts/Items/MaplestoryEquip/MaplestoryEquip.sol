// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Pausable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";
import { ApproveControlled } from "@projecta/util-contracts/contracts/approve/ApproveControlled.sol";
import { ApproveController } from "@projecta/util-contracts/contracts/approve/ApproveController.sol";
import { ERC721ApproveControlled } from "@projecta/util-contracts/contracts/approve/token/ERC721ApproveControlled.sol";
import { ItemIssuance } from "@projecta/nexpace-contracts/contracts/ItemIssuance/ItemIssuance.sol";

/// @title MaplestoryEquip - Non-Fungible Token contract based on ERC721.
/// @dev Main features:
///      - Item: Represents the nature of MSU equip items.
///        All tokens have an `itemId` indicating which item is it.
///      - LimitSupply: Maximum number of tokens that can be minted.
///        Items with unspecified limitSupply cannot be minted as tokens and
///        can only be minted if limitSupply is greater than the sum of totalSupply and burnedAmount.
contract MaplestoryEquip is
    ERC2771Context,
    ERC721("MaplestoryEquip", "MSE"),
    NextOwnablePausable,
    ERC721Pausable,
    ERC721ApproveControlled
{
    using Strings for uint256;

    struct Token {
        uint64 itemId;
        uint64 number;
    }

    // limitSupply >= totalSupply + burnedAmount
    struct Item {
        uint64 totalSupply;
        uint64 limitSupply;
        uint64 burnedAmount;
    }

    struct Mint {
        uint64 itemId;
        uint256 tokenId;
    }

    modifier onlyExistToken(uint256 tokenId) {
        require(_exists(tokenId), "MaplestoryEquip/tokenNotExists: token is not exist");
        _;
    }

    modifier onlyExistItem(uint64 itemId) {
        require(_items[itemId].limitSupply != 0, "MaplestoryEquip/itemNotExists: item is not exist");
        _;
    }

    ItemIssuance private immutable _itemIssuance;
    string private _defaultBaseURI;
    uint256 private _totalSupply;
    uint256 private _burnedAmount;

    // solhint-disable-next-line var-name-mixedcase
    mapping(uint256 => Token) private _tokens;
    mapping(uint64 => Item) private _items;
    mapping(uint64 => string) private _itemBaseURIs;

    event ItemLimitSupply(uint64 indexed itemId, uint64 previousLimitSupply, uint64 newLimitSupply);
    event ItemCreated(uint256 indexed tokenId, uint64 indexed itemId, uint64 number);
    event DefaultBaseURIChanged(string previousURI, string newURI);
    event ItemBaseURIChanged(uint64 indexed itemId, string previousURI, string newURI);
    event RetrievedERC721(address from, address to, uint256 tokenId, string reason);

    constructor(
        address trustedForwarder,
        ApproveController controller_,
        ItemIssuance itemIssuance_,
        string memory defaultBaseURI
    ) ERC2771Context(trustedForwarder) ApproveControlled(controller_) {
        _itemIssuance = itemIssuance_;
        _defaultBaseURI = defaultBaseURI;
    }

    /// @notice Mints new MaplestoryEquip token.
    /// @param to Address to receive token.
    /// @param itemId Token's item id.
    /// @param tokenId Token's id.
    function mint(address to, uint64 itemId, uint256 tokenId) external whenExecutable {
        _mint(to, itemId, tokenId);
    }

    /// @notice Batch function of {Mint}.
    /// @dev Instead of checking length of the `itemId` and `tokenId`, uses `Mint` struct.
    function mintBatch(address to, Mint[] memory mints) external whenExecutable {
        uint256 mintsLength = mints.length;
        for (uint256 i; i < mintsLength; ) {
            _mint(to, mints[i].itemId, mints[i].tokenId);
            unchecked {
                i++;
            }
        }
    }

    /// @notice Batch function of {Burn}.
    function burnBatch(uint256[] memory tokenIds) external {
        uint256 tokenIdsLength = tokenIds.length;
        for (uint256 i; i < tokenIdsLength; ) {
            burn(tokenIds[i]);
            unchecked {
                i++;
            }
        }
    }

    /// @notice Batch function of {ERC721-safeTransferFrom}.
    function safeBatchTransferFrom(address from, address to, uint256[] memory tokenIds) external {
        uint256 tokenIdsLength = tokenIds.length;
        for (uint256 i; i < tokenIdsLength; ) {
            safeTransferFrom(from, to, tokenIds[i]);
            unchecked {
                i++;
            }
        }
    }

    /// @notice Set `_defaultBaseURI`.
    /// @param newURI String of the new `_defaultBaseURI`.
    function setDefaultURI(string memory newURI) external whenExecutable {
        string memory previousURI = _defaultBaseURI;
        _defaultBaseURI = newURI;
        emit DefaultBaseURIChanged(previousURI, _defaultBaseURI);
    }

    /// @notice Set `_itemBaseURIs`.
    /// @param itemId token's item id.
    /// @param newURI String of the new item's base uri.
    function setItemURI(uint64 itemId, string memory newURI) external whenExecutable {
        string memory previousURI = _itemBaseURIs[itemId];
        _itemBaseURIs[itemId] = newURI;
        emit ItemBaseURIChanged(itemId, previousURI, _itemBaseURIs[itemId]);
    }

    /// @notice Set `item.limitSupply`.
    /// @dev Can set only once for each item.
    /// @param itemId Token's item id.
    /// @param newLimitSupply New limitSupply of the item.
    /// @param isItemBase Items included in itemBase
    function setLimitSupply(uint64 itemId, uint64 newLimitSupply, bool isItemBase) external whenExecutable {
        Item storage item = _items[itemId];
        require(item.limitSupply == 0, "MaplestoryEquip/setLimitSupply: limit supply is already set");

        emit ItemLimitSupply(itemId, item.limitSupply, newLimitSupply);

        item.limitSupply = newLimitSupply;

        if (isItemBase) {
            _itemIssuance.addItem721BaseAmount(itemId, newLimitSupply);
        }
    }

    /// @notice Retrieve equip item by owner.
    /// @param from Address of the item owner.
    /// @param to Address of the item receiver.
    /// @param tokenId Token's id.
    /// @param reason Reason of the retrieval.
    function retrieveERC721(address from, address to, uint256 tokenId, string memory reason) external onlyOwner {
        safeTransferFrom(from, to, tokenId, "");
        emit RetrievedERC721(from, to, tokenId, reason);
    }

    /// @notice Returns `_itemIssuance`.
    /// @return ItemIssuance Address of the `_itemIssuance`.
    function itemIssuance() external view returns (ItemIssuance) {
        return _itemIssuance;
    }

    /// @notice Returns `_totalSupply`.
    /// @return uint256 Number of `_totalSupply`.
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    /// @notice Returns `_burnedAmount`.
    /// @return uint256 Sum of the `burnedAmount` of all items.
    function burnedAmount() external view returns (uint256) {
        return _burnedAmount;
    }

    /// @notice Returns `itemId` of token.
    /// @param tokenId Token's id.
    /// @return uint64 Number of the token's `itemId`.
    function tokenItemId(uint256 tokenId) external view onlyExistToken(tokenId) returns (uint64) {
        return _tokens[tokenId].itemId;
    }

    /// @notice Returns the number of token.
    /// @dev `TokenNumber` indicates the minting order of the token within the item which it belongs to.
    /// @param tokenId Token's id.
    /// @return uint64 Number of the token's `number`.
    function tokenNumber(uint256 tokenId) external view onlyExistToken(tokenId) returns (uint64) {
        return _tokens[tokenId].number;
    }

    /// @notice Returns `totalSupply` of item.
    /// @param itemId Token's item id.
    /// @return uint64 Number of item's `totalSupply`.
    function itemTotalSupply(uint64 itemId) external view onlyExistItem(itemId) returns (uint64) {
        return _items[itemId].totalSupply;
    }

    /// @notice Returns `limitSupply` of item.
    /// @param itemId Token's item id.
    /// @return uint64 Number of item's `limitSupply`.
    function itemLimitSupply(uint64 itemId) external view onlyExistItem(itemId) returns (uint64) {
        return _items[itemId].limitSupply;
    }

    /// @notice Returns `burnedAmount` of item.
    /// @param itemId Token's item id.
    /// @return uint64 Number of item's `burnedAmount`.
    function itemBurnedAmount(uint64 itemId) external view onlyExistItem(itemId) returns (uint64) {
        return _items[itemId].burnedAmount;
    }

    /// @notice Returns list of the tokens owner.
    /// @param tokenIds List of the token ids.
    /// @return address Address list of the tokens owner.
    function ownerOfBatch(uint256[] memory tokenIds) external view returns (address[] memory) {
        uint256 tokenIdsLength = tokenIds.length;
        address[] memory batchOwners = new address[](tokenIdsLength);

        for (uint256 i; i < tokenIdsLength; ++i) {
            batchOwners[i] = ownerOf(tokenIds[i]);
        }

        return batchOwners;
    }

    /// @notice Burns MaplestoryEquip token.
    /// @param tokenId Token's id that to be burned.
    function burn(uint256 tokenId) public {
        // solhint-disable-next-line reason-string
        require(
            _isApprovedOrOwner(_msgSender(), tokenId),
            "MaplestoryEquip/burnForbidden: caller is neither the token owner, approved"
        );

        uint64 itemId = _tokens[tokenId].itemId;
        delete _tokens[tokenId];
        unchecked {
            _items[itemId].totalSupply--;
            _items[itemId].burnedAmount++;
        }
        unchecked {
            _totalSupply--;
            _burnedAmount++;
        }

        _burn(tokenId);
    }

    /// @notice Returns token's uri.
    /// @dev Returns `_itemBaseURIs` if the base uri of item is set. Otherwise returns `_defaultBaseURI`.
    /// @param tokenId Token's id.
    /// @return string String of the token uri.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "MaplestoryEquip/uriInvalidID: URI query for nonexistent token");

        uint64 itemId = _tokens[tokenId].itemId;
        string memory uri = bytes(_itemBaseURIs[itemId]).length > 0 ? _itemBaseURIs[itemId] : _defaultBaseURI;

        return string(abi.encodePacked(uri, tokenId.toString(), ".json"));
    }

    /// @notice Returns token owner.
    /// @param tokenId Token's id.
    /// @return address Address of the token's current owner.
    function ownerOf(uint256 tokenId) public view virtual override returns (address) {
        address owner = _ownerOf(tokenId);
        if (owner == address(0)) {
            // nx-errors-ignore
            revert(
                string(abi.encodePacked("MaplestoryEquip/ownerOfInvalidID: invalid token ID(", tokenId.toString(), ")"))
            );
        }
        return owner;
    }

    /// @notice Mints new MaplestoryEquip token.
    /// @param to Address to receive minted token.
    /// @param itemId Item id of the new token.
    /// @param tokenId Token id of the new token.
    function _mint(address to, uint64 itemId, uint256 tokenId) internal {
        Item storage item = _items[itemId];
        // solhint-disable-next-line reason-string
        require(
            item.totalSupply + item.burnedAmount < item.limitSupply,
            "MaplestoryEquip/mintInvalidItem: supply limit exceeded or minting for invalid item ID"
        );

        uint64 itemNumber;
        unchecked {
            item.totalSupply++;
            itemNumber = item.totalSupply + item.burnedAmount;
            _tokens[tokenId] = Token(itemId, itemNumber);
            _totalSupply++;
        }
        ERC721._safeMint(to, tokenId);

        emit ItemCreated(tokenId, itemId, itemNumber);
    }

    /// @notice See {ERC721Pausable-_beforeTokenTransfer}.
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721, ERC721Pausable) {
        ERC721Pausable._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    /* trivial overrides */

    /// @notice See {ERC721ApproveControlled-isApprovedForAll}.
    function isApprovedForAll(
        address owner_,
        address operator
    ) public view override(ERC721, ERC721ApproveControlled) returns (bool) {
        if (owner() == _msgSender()) {
            return true;
        }
        return ERC721ApproveControlled.isApprovedForAll(owner_, operator);
    }

    /// @notice See {ERC721ApproveControlled-_approve}
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
