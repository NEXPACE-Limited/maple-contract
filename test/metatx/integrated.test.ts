import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumberish, BytesLike, ContractReceipt, Signer } from "ethers";
import { TypedDataDomain, TypedDataSigner } from "@ethersproject/abstract-signer";
import { NextForwarder } from "../../typechain-types";
import { ForwardRequest, forwardRequestTypes, nextForwarderNameAndVersion } from "../lib/forward";
const fakeAddress = "0x0000000000000000000000000000000000000001";

function getInventoryAddressFromMintReceipt(receipt: ContractReceipt) {
  const e = receipt.events!.find((x) => x.event === "Transfer");
  expect(e, "maybe transfer event").to.be.ok;
  return ethers.utils.getAddress(e!.args!.tokenId.toHexString());
}

async function signAndForward(
  forwarder: NextForwarder,
  relayer: Signer,
  from: Signer & TypedDataSigner,
  to: string | { address: string } | { getAddress(): Promise<string> },
  data: BytesLike,
  gas: BigNumberish = 1_000_000n,
  deadline: BigNumberish = ethers.constants.MaxUint256,
  salt: BigNumberish = 0
) {
  const domain: TypedDataDomain = {
    ...nextForwarderNameAndVersion,
    chainId: (await forwarder.provider.getNetwork()).chainId,
    verifyingContract: forwarder.address,
  };

  const req: ForwardRequest = {
    from: await from.getAddress(),
    to: typeof to === "string" ? to : "address" in to ? to.address : await to.getAddress(),
    gas,
    data,
    deadline,
    salt,
  };

  return forwarder.connect(relayer).execute(req, await from._signTypedData(domain, forwardRequestTypes, req));
}

describe("meta-transaction integrated", function () {
  async function fixture() {
    const [owner, relayer, alice, bob] = await ethers.getSigners();

    const [
      NextForwarder,
      ApproveController,
      NextMeso,
      MaplestoryEquip,
      MaplestoryConsume,
      MaplestoryCharacter,
      ItemIssuance,
    ] = await Promise.all([
      ethers.getContractFactory("NextForwarder"),
      ethers.getContractFactory("ApproveController"),
      ethers.getContractFactory("NextMeso"),
      ethers.getContractFactory("MaplestoryEquip"),
      ethers.getContractFactory("MaplestoryConsume"),
      ethers.getContractFactory("MaplestoryCharacter"),
      ethers.getContractFactory("ItemIssuance"),
    ]);

    const forwarder = await NextForwarder.deploy();
    const approveController = await ApproveController.deploy(forwarder.address);
    const itemIssuance = await ItemIssuance.deploy(fakeAddress, fakeAddress, fakeAddress);
    await itemIssuance.createUniverse("MapleStory Universe");
    const neso = await NextMeso.deploy(forwarder.address, approveController.address, 100_000);
    const [equip, consume, character] = await Promise.all([
      MaplestoryEquip.deploy(forwarder.address, approveController.address, itemIssuance.address, ""),
      MaplestoryConsume.deploy(forwarder.address, approveController.address, ""),
      MaplestoryCharacter.deploy(forwarder.address, approveController.address, ""),
    ]);
    await itemIssuance.registerItem721Contract(1, equip.address);

    // approve
    await neso.connect(owner).approveOperator(character.address);
    await neso.connect(owner).approveOperator(equip.address);
    await neso.connect(owner).approveOperator(consume.address);
    await approveController.connect(owner).setAllowlist(neso.address, true);
    await approveController.connect(owner).setAllowlist(character.address, true);
    await approveController.connect(owner).setAllowlist(equip.address, true);

    await equip.setLimitSupply(1234n, 100, true);
    return {
      forwarder,
      relayer,
      owner,
      neso,
      equip,
      consume,
      character,
      alice,
      bob,
    };
  }

  before(async () => {
    await loadFixture(fixture);
  });

  it("transfer neso", async function () {
    const { forwarder, relayer, neso, alice, bob } = await loadFixture(fixture);

    await neso.connect(alice).deposit({ value: 1 });
    await signAndForward(
      forwarder,
      relayer,
      alice,
      neso,
      neso.interface.encodeFunctionData("transfer", [await bob.getAddress(), 150n])
    );
    await signAndForward(
      forwarder,
      relayer,
      bob,
      neso,
      neso.interface.encodeFunctionData("transfer", [await alice.getAddress(), 100n])
    );

    expect(await neso.balanceOf(await alice.getAddress()), "sender balance after transfers").to.eq(99950n);
    expect(await neso.balanceOf(await bob.getAddress()), "receiver balance after transfers").to.eq(50n);
  });

  it("transfer equip", async function () {
    const { owner, forwarder, relayer, equip, alice, bob } = await loadFixture(fixture);

    await Promise.all(
      [1n, 2n, 3n, 4n, 5n].map(async (id) => equip.connect(owner).setLimitSupply(id, 10000000000n, true))
    );
    await Promise.all([1n, 2n, 3n, 4n, 5n].map(async (id) => equip.mint(await alice.getAddress(), 1234n, id)));

    await signAndForward(
      forwarder,
      relayer,
      alice,
      equip,
      equip.interface.encodeFunctionData("transferFrom", [await alice.getAddress(), await bob.getAddress(), 1n])
    );
    await signAndForward(
      forwarder,
      relayer,
      alice,
      equip,
      equip.interface.encodeFunctionData("transferFrom", [await alice.getAddress(), await bob.getAddress(), 3n])
    );
    await signAndForward(
      forwarder,
      relayer,
      alice,
      equip,
      equip.interface.encodeFunctionData("transferFrom", [await alice.getAddress(), await bob.getAddress(), 5n])
    );

    expect(await equip.ownerOf(1n), "owner of 1 after transfers").to.eq(await bob.getAddress());
    expect(await equip.ownerOf(2n), "owner of 2 after transfers").to.eq(await alice.getAddress());
    expect(await equip.ownerOf(3n), "owner of 3 after transfers").to.eq(await bob.getAddress());
    expect(await equip.ownerOf(4n), "owner of 4 after transfers").to.eq(await alice.getAddress());
    expect(await equip.ownerOf(5n), "owner of 5 after transfers").to.eq(await bob.getAddress());
  });

  it("transfer consume", async function () {
    const { owner, forwarder, relayer, consume, alice, bob } = await loadFixture(fixture);

    await Promise.all([1n, 2n, 3n, 4n, 5n].map(async (id) => consume.connect(owner).setLimitSupply(id, 10000000000n)));
    await consume.mintBatch(await alice.getAddress(), [1n, 2n], [1000n, 1000n], "0x");

    await signAndForward(
      forwarder,
      relayer,
      alice,
      consume,
      consume.interface.encodeFunctionData("safeBatchTransferFrom", [
        await alice.getAddress(),
        await bob.getAddress(),
        [1n, 2n],
        [500n, 400n],
        "0x",
      ])
    );
    await signAndForward(
      forwarder,
      relayer,
      bob,
      consume,
      consume.interface.encodeFunctionData("safeTransferFrom", [
        await bob.getAddress(),
        await alice.getAddress(),
        1n,
        1n,
        "0x",
      ])
    );

    expect(
      (
        await consume.balanceOfBatch(
          [await alice.getAddress(), await alice.getAddress(), await bob.getAddress(), await bob.getAddress()],
          [1n, 2n, 1n, 2n]
        )
      ).map((x) => x.toBigInt()),
      "balance of [alice 1, alice 2, bob 1, bob2] after transfers"
    ).to.deep.eq([501n, 600n, 499n, 400n]);
  });

  it("transfer character", async function () {
    const { forwarder, relayer, character, alice, bob } = await loadFixture(fixture);

    const ch1 = BigInt(
      getInventoryAddressFromMintReceipt(await (await character.mint(await alice.getAddress())).wait())
    );
    const ch2 = BigInt(getInventoryAddressFromMintReceipt(await (await character.mint(await bob.getAddress())).wait()));

    await signAndForward(
      forwarder,
      relayer,
      alice,
      character,
      character.interface.encodeFunctionData("transferFrom", [await alice.getAddress(), await bob.getAddress(), ch1])
    );
    await signAndForward(
      forwarder,
      relayer,
      bob,
      character,
      character.interface.encodeFunctionData("transferFrom", [await bob.getAddress(), await alice.getAddress(), ch2])
    );

    expect(await character.ownerOf(ch1), "owner of ch1 after transfers").to.eq(await bob.getAddress());
    expect(await character.ownerOf(ch2), "owner of ch2 after transfers").to.eq(await alice.getAddress());
  });
});
