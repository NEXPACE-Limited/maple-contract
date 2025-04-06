import { ethers } from "hardhat";

export function encodeError(reason: string) {
  const utf8Reason = Buffer.from(reason, "utf-8");
  return ethers.utils.solidityPack(
    ["bytes4", "uint256", "uint256", "bytes", "bytes"],
    [
      ethers.utils.solidityKeccak256(["string"], ["Error(string)"]).substring(0, 10),
      0x20,
      utf8Reason.length,
      utf8Reason,
      Buffer.alloc((32 - (utf8Reason.length % 32)) % 32, 0),
    ]
  );
}
