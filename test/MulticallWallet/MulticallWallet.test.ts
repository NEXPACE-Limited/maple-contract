import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ContractReceipt, ContractTransaction } from "ethers";
import { IExec } from "../../typechain-types/@projecta/util-contracts/exec/Exec";
import { TransferEvent } from "../../typechain-types/@openzeppelin/contracts/token/ERC721/IERC721";
import nxErrors from "../lib/nx-errors";
const fakeAddress = "0x0000000000000000000000000000000000000001";

describe("MulticallWallet Contract", function () {
  async function fixture() {
    const [MulticallWallet, Equip, Character, ApproveController, Erc20, ItemIssuance] = await Promise.all([
      ethers.getContractFactory("MulticallWallet"),
      ethers.getContractFactory("MaplestoryEquip"),
      ethers.getContractFactory("MaplestoryCharacter"),
      ethers.getContractFactory("ApproveController"),
      ethers.getContractFactory("ERC20PresetFixedSupply"),
      ethers.getContractFactory("ItemIssuance"),
    ]);
    const [owner, executor, operator, ad1] = await ethers.getSigners();
    const defaultURI = "https://defaultURI.com/";

    const itemIssuance = await ItemIssuance.deploy(fakeAddress, fakeAddress, fakeAddress);
    await itemIssuance.createUniverse("MapleStory Universe");

    // deploy contracts
    const erc20 = await Erc20.deploy("TEST", "TEST", 100_000_000n, await owner.getAddress());
    await erc20.deployed();

    const controller = await ApproveController.connect(owner).deploy(fakeAddress);

    const mcWallet = await MulticallWallet.connect(owner).deploy(fakeAddress);

    const equip = await Equip.connect(owner).deploy(fakeAddress, controller.address, itemIssuance.address, defaultURI);
    await itemIssuance.registerItem721Contract(1, equip.address);
    await equip.connect(owner).setLimitSupply(1, 10, true);

    const character = await Character.connect(owner).deploy(fakeAddress, controller.address, defaultURI);

    // controller user approve
    await controller.connect(ad1).setApprove(true);

    await equip.grantExecutor(await executor.getAddress());
    // set mcWallet as executor of equip
    await equip.grantExecutor(mcWallet.address);
    // set character as operator of equip
    await equip.approveOperator(character.address);
    await character.grantExecutor(await executor.getAddress());
    // set mcWallet as executor of character
    await character.grantExecutor(mcWallet.address);
    await character.approveOperator(operator.address);
    const mintTransaction: ContractTransaction = await character.connect(executor).mint(ad1.address);
    const mintReceipt: ContractReceipt = await mintTransaction.wait();
    const mintEvent = mintReceipt.events!.find((event): event is TransferEvent => event.event === "Transfer");
    const characterAddress = ethers.utils.getAddress(mintEvent!.args.tokenId.toHexString());
    await mcWallet.grantExecutor(await executor.getAddress());

    return {
      mcWallet,
      equip,
      character,
      executor,
      operator,
      ad1,
      characterAddress,
    };
  }

  // preload fixture
  before(async function () {
    await loadFixture(fixture);
  });

  describe("Exec Test", function () {
    it("Multicall (Equip Mint) & (Character Deposit)", async function () {
      const { mcWallet, equip, character, executor, ad1, characterAddress } = await loadFixture(fixture);
      const equipCallByteData = equip.interface.encodeFunctionData("mint", [await ad1.getAddress(), 1, 1]);
      const characterCallBytesData = character.interface.encodeFunctionData("depositItemFromOwner", [
        await ad1.getAddress(),
        characterAddress,
        equip.address,
        1,
      ]);
      const calls: IExec.CallStruct[] = [
        { to: equip.address, data: equipCallByteData, value: 0 },
        { to: character.address, data: characterCallBytesData, value: 0 },
      ];
      await mcWallet.connect(executor).batchExec(calls);

      expect(await equip.ownerOf(1)).to.be.equal(characterAddress);
    });

    it("Multicall fail when msg sender is not executor", async function () {
      const { mcWallet, ad1 } = await loadFixture(fixture);

      await expect(mcWallet.connect(ad1).batchExec([])).to.be.revertedWith(nxErrors.executorForbidden);
    });

    it("Multicall fail when paused", async function () {
      const { mcWallet, executor } = await loadFixture(fixture);

      await mcWallet.connect(executor).pause();

      await expect(mcWallet.connect(executor).batchExec([])).to.be.revertedWith(nxErrors.paused);
    });
  });
});
