import { BytesLike, ethers } from "ethers";

export function missingRole(role: BytesLike, account: string) {
  return `AccessControl: account ${account.toLowerCase()} is missing role ${ethers.utils.hexlify(role)}`;
}
