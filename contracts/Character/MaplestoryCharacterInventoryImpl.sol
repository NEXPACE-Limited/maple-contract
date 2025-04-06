// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ERC721Holder } from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import { MaplestoryCharacter } from "./MaplestoryCharacter.sol";

contract MaplestoryCharacterInventoryImpl is Context, ERC721Holder {
    MaplestoryCharacter private immutable _character;

    constructor(MaplestoryCharacter character) {
        _character = character;
    }

    /// @notice Transfer ERC721 token from character to `to` address.
    /// @param to Receive the token from character.
    /// @param tokenAddress Transferred token's contract address.
    /// @param tokenId Token's id.
    function withdrawItem(address to, IERC721 tokenAddress, uint256 tokenId) external {
        // solhint-disable-next-line reason-string
        require(
            _msgSender() == address(_character),
            "MaplestoryInventory/withdrawForbidden: caller is not the character token contract"
        );
        tokenAddress.transferFrom(address(this), to, tokenId);
    }
}
