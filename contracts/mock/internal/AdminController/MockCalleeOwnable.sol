// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { MockCallee } from "@projecta/util-contracts/contracts/mock/general/MockCallee.sol";

contract MockCalleeOwnable is Ownable, MockCallee {
    function _fallback() internal virtual override onlyOwner {
        MockCallee._fallback();
    }
}
