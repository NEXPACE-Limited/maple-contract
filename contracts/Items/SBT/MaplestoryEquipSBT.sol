// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";

contract MaplestoryEquipSBT is ERC721("MaplestoryEquipSBT", "MSS"), NextOwnablePausable {
    using Strings for uint256;

    struct Token {
        uint64 itemId;
        uint64 number;
    }

    struct Item {
        uint64 totalSupply;
        uint64 limitSupply;
    }

    struct Mint {
        uint64 itemId;
        uint256 tokenId;
    }

    modifier onlyExistToken(uint256 tokenId) {
        require(_exists(tokenId), "MaplestoryEquipSBT/tokenNotExists: token is not exist");
        _;
    }

    modifier onlyExistItem(uint64 itemId) {
        require(_items[itemId].limitSupply != 0, "MaplestoryEquipSBT/itemNotExists: item is not exist");
        _;
    }

    uint256 private _totalSupply;
    string private _defaultBaseURI;

    // solhint-disable-next-line var-name-mixedcase
    mapping(uint256 => Token) private _tokens;
    mapping(uint64 => Item) private _items;
    mapping(uint64 => string) private _itemBaseURIs;

    event ItemLimitSupply(uint64 indexed itemId, uint64 previousLimitSupply, uint64 newLimitSupply);
    event ItemCreated(address indexed to, uint256 indexed tokenId, uint64 indexed itemId, uint64 number);
    event DefaultBaseURIChanged(string previousURI, string newURI);
    event ItemBaseURIChanged(uint64 indexed itemId, string previousURI, string newURI);

    constructor(string memory defaultBaseURI) {
        _defaultBaseURI = defaultBaseURI;
    }

    /// @notice Mints new MaplestoryEquipSBT.
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

    /// @notice Airdrop version of {Mint}.
    /// @param to Addresses to receive token.
    /// @param mints Token informations for 'to'
    function airdrop(address[] memory to, Mint[] memory mints) external whenExecutable {
        uint256 mintsLength = mints.length;

        require(mintsLength == to.length, "MaplestoryEquipSBT/invalidLength: invalid arguments' length");

        for (uint256 i; i < mintsLength; ) {
            _mint(to[i], mints[i].itemId, mints[i].tokenId);
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
    function setLimitSupply(uint64 itemId, uint64 newLimitSupply) external whenExecutable {
        Item storage item = _items[itemId];
        require(item.limitSupply == 0, "MaplestoryEquipSBT/setLimitSupply: limit supply is already set");

        emit ItemLimitSupply(itemId, item.limitSupply, newLimitSupply);

        item.limitSupply = newLimitSupply;
    }

    /// @notice Returns `_totalSupply`.
    /// @return uint256 Number of `_totalSupply`.
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
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

    /// @notice Returns token's uri.
    /// @dev Returns `_itemBaseURIs` if the base uri of item is set. Otherwise returns `_defaultBaseURI`.
    /// @param tokenId Token's id.
    /// @return string String of the token uri.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "MaplestoryEquipSBT/uriInvalidID: URI query for nonexistent token");

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
                string(
                    abi.encodePacked("MaplestoryEquipSBT/ownerOfInvalidID: invalid token ID(", tokenId.toString(), ")")
                )
            );
        }
        return owner;
    }

    /// @notice Mints new MaplestoryEquipSBT.
    /// @param to Address to receive minted token.
    /// @param itemId Item id of the new token.
    /// @param tokenId Token id of the new token.
    function _mint(address to, uint64 itemId, uint256 tokenId) internal {
        Item storage item = _items[itemId];
        // solhint-disable-next-line reason-string
        require(
            item.totalSupply < item.limitSupply,
            "MaplestoryEquipSBT/mintInvalidItem: supply limit exceeded or minting for invalid item ID"
        );

        uint64 itemNumber;
        unchecked {
            item.totalSupply++;
            itemNumber = item.totalSupply;
            _tokens[tokenId] = Token(itemId, itemNumber);
            _totalSupply++;
        }
        ERC721._safeMint(to, tokenId);

        emit ItemCreated(to, tokenId, itemId, itemNumber);
    }

    /// @notice Soul bound tokens cannot be transferred except through the mint function.
    function _beforeTokenTransfer(address from, address, uint256, uint256) internal pure override {
        require(from == address(0), "MaplestoryEquipSBT/NotTransferable: soul bound token is not transferable");
    }

    /// @notice Approval is meaningless for soul bound tokens.
    function _approve(address, uint256) internal virtual override {
        revert("MaplestoryEquipSBT/NotTransferable: soul bound token is not transferable");
    }

    /// @notice Approval is meaningless for soul bound tokens.
    function _setApprovalForAll(address, address, bool) internal virtual override {
        revert("MaplestoryEquipSBT/NotTransferable: soul bound token is not transferable");
    }
}
