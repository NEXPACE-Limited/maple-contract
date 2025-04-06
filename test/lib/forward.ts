import { BigNumberish, BytesLike, ethers } from "ethers";
import { TypedDataField } from "@ethersproject/abstract-signer";

export const nextForwarderNameAndVersion = {
  name: "NextForwarder",
  version: "1.0.0",
};

export interface ForwardRequest {
  from: string;
  to: string;
  gas: BigNumberish;
  data: BytesLike;
  deadline: BigNumberish;
  salt: BigNumberish;
}

export interface CancelRequest {
  request: ForwardRequest;
}

export const forwardRequestTypes: Record<string, TypedDataField[]> = {
  ForwardRequest: [
    {
      type: "address",
      name: "from",
    },
    {
      type: "address",
      name: "to",
    },
    {
      type: "uint256",
      name: "gas",
    },
    {
      type: "bytes",
      name: "data",
    },
    {
      type: "uint256",
      name: "deadline",
    },
    {
      type: "uint256",
      name: "salt",
    },
  ],
};

export const cancelReqeustTypes: Record<string, TypedDataField[]> = {
  ...forwardRequestTypes,
  CancelRequest: [
    {
      type: "ForwardRequest",
      name: "request",
    },
  ],
};

export function hashForwardRequest(req: ForwardRequest): string {
  const typeName = Object.keys(forwardRequestTypes)[0];
  const typeHash = ethers.utils.solidityKeccak256(
    ["string"],
    [`${typeName}(${forwardRequestTypes[typeName].map(({ type, name }) => `${type} ${name}`).join(",")})`]
  );

  return ethers.utils.solidityKeccak256(
    [...Array(7).keys()].map(() => "uint256"),
    [typeHash, req.from, req.to, req.gas, ethers.utils.keccak256(req.data), req.deadline, req.salt]
  );
}
