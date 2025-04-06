import { ethers } from "hardhat";
import { BytesLike } from "ethers";
import { beaconProxyCode } from "@projecta/min-proxy";

export function initCodeHash(factoryAddress: string) {
  return ethers.utils.keccak256(beaconProxyCode(factoryAddress));
}

export function getAddress(factoryAddress: string, salt: BytesLike) {
  return ethers.utils.getCreate2Address(factoryAddress, salt, initCodeHash(factoryAddress));
}
