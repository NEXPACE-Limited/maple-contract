import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ContractReceipt, ContractTransaction } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import nxErrors from "../lib/nx-errors";
const fakeAddress = "0x0000000000000000000000000000000000000001";

describe("MaplestoryCharacter Contract", function () {
  async function beforeMintFixture() {
    const [owner, executor, operator, ad1, ad2, collection] = await ethers.getSigners();
    const defaultURI = "https://defaultURI.com/";
    const changedURI = "https://changedURI.com/";
    const itemIds = [1, 1, 1, 2, 3];
    const tokenIds = [1, 2, 3, 4, 5];

    const [Equip, Character, Controller, ItemIssuance] = await Promise.all([
      ethers.getContractFactory("MaplestoryEquip"),
      ethers.getContractFactory("MaplestoryCharacter"),
      ethers.getContractFactory("ApproveController"),
      ethers.getContractFactory("ItemIssuance"),
    ]);
    const controller = await Controller.connect(owner).deploy(fakeAddress);
    await controller.connect(ad1).setApprove(true);
    await controller.connect(ad2).setApprove(true);
    const itemIssuance = await ItemIssuance.deploy(fakeAddress, fakeAddress, fakeAddress);
    await itemIssuance.createUniverse("MapleStory Universe");

    const equip = await Equip.connect(owner).deploy(fakeAddress, controller.address, itemIssuance.address, defaultURI);
    const equip2 = await Equip.connect(owner).deploy(fakeAddress, controller.address, itemIssuance.address, defaultURI);

    await equip.grantExecutor(await executor.getAddress());
    await equip2.grantExecutor(await executor.getAddress());

    await itemIssuance.registerItem721Contract(1, equip.address);
    await itemIssuance.registerItem721Contract(1, equip2.address);

    await Promise.all(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => equip.connect(owner).setLimitSupply(id, "0xffffffffffffffff", true))
    );
    await Promise.all(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => equip2.connect(owner).setLimitSupply(id, "0xffffffffffffffff", true))
    );

    await equip.connect(executor).mintBatch(await ad1.getAddress(), [
      { itemId: itemIds[0], tokenId: tokenIds[0] },
      { itemId: itemIds[1], tokenId: tokenIds[1] },
      { itemId: itemIds[2], tokenId: tokenIds[2] },
      { itemId: itemIds[3], tokenId: tokenIds[3] },
      { itemId: itemIds[4], tokenId: tokenIds[4] },
    ]);
    await equip2.connect(executor).mintBatch(await ad1.getAddress(), [
      { itemId: itemIds[0], tokenId: tokenIds[0] },
      { itemId: itemIds[1], tokenId: tokenIds[1] },
      { itemId: itemIds[2], tokenId: tokenIds[2] },
      { itemId: itemIds[3], tokenId: tokenIds[3] },
      { itemId: itemIds[4], tokenId: tokenIds[4] },
    ]);

    await equip.connect(executor).mint(await ad2.getAddress(), 1, 6);
    await equip2.connect(executor).mint(await ad2.getAddress(), 1, 6);

    const character = await Character.connect(owner).deploy(fakeAddress, controller.address, defaultURI);
    await character.grantExecutor(await executor.getAddress());
    await character.approveOperator(await operator.getAddress());

    /* set character contract as equip contract's operator */
    await equip.approveOperator(character.address);
    await equip2.approveOperator(character.address);

    await character.connect(owner).grantExecutor(await collection.getAddress());

    return {
      character,
      equip,
      equip2,
      controller,
      owner,
      executor,
      operator,
      ad1,
      ad2,
      defaultURI,
      changedURI,
      collection,
    };
  }
  async function characterFixture() {
    const {
      character,
      equip,
      equip2,
      controller,
      owner,
      executor,
      operator,
      ad1,
      ad2,
      defaultURI,
      changedURI,
      collection,
    } = await loadFixture(beforeMintFixture);

    // mint character token
    const mintTransaction: ContractTransaction = await character.connect(executor).mint(await ad1.getAddress());
    const mintReceipt: ContractReceipt = await mintTransaction.wait();
    const mintEvent = mintReceipt.events!.find((event) => event.event === "Transfer");
    const characterAddress = ethers.utils.getAddress(mintEvent?.args!.tokenId.toHexString());

    // mint character token in msn
    const mintBatchTransaction: ContractTransaction = await character
      .connect(executor)
      .mintBatch(await ad2.getAddress(), 5);
    const mintBatchReceipt: ContractReceipt = await mintBatchTransaction.wait();
    const mintBatchTransferEvents = mintBatchReceipt.events!.filter((event) => event.event === "Transfer");
    const characterAddresses: string[] = [];
    for (const { args } of mintBatchTransferEvents!.map((args, index) => ({ index, args }))) {
      const characterAddress = ethers.utils.getAddress(args.args!.tokenId.toHexString());
      characterAddresses.push(characterAddress);
    }

    // mint character token in web
    const webMintTransaction: ContractTransaction = await character.connect(executor).mint(await ad1.getAddress());
    const webMintReceipt: ContractReceipt = await webMintTransaction.wait();
    const webMintEvent = webMintReceipt.events!.find((event) => event.event === "Transfer");
    const webMintCharacterAddress = ethers.utils.getAddress(webMintEvent?.args!.tokenId.toHexString());

    return {
      character,
      equip,
      equip2,
      controller,
      owner,
      executor,
      operator,
      ad1,
      ad2,
      mintReceipt,
      mintBatchReceipt,
      characterAddress,
      characterAddresses,
      webMintCharacterAddress,
      defaultURI,
      changedURI,
      collection,
      contract: character,
      nonOwner: executor,
    };
  }
  async function depositFixture() {
    const { character, equip, characterAddress, owner, executor, ad1, ad2, collection } = await loadFixture(
      characterFixture
    );

    await character
      .connect(executor)
      .depositBatchItemsFromOwner(await ad1.getAddress(), characterAddress, equip.address, [1, 2]);

    return {
      character,
      equip,
      characterAddress,
      owner,
      executor,
      ad1,
      ad2,
      collection,
    };
  }

  // preload fixture
  before(async function () {
    await loadFixture(beforeMintFixture);
  });

  describe("setApprovalForAll", function () {
    it("Success", async function () {
      const { controller, character, ad1, ad2 } = await loadFixture(beforeMintFixture);

      await controller.setAllowlist(await ad2.getAddress(), true);
      await character.connect(ad1).setApprovalForAll(await ad2.getAddress(), true);
    });

    it("should revert when not allowlisted", async function () {
      const { character, ad1, ad2 } = await loadFixture(beforeMintFixture);

      await expect(character.connect(ad1).setApprovalForAll(await ad2.getAddress(), true)).to.be.revertedWith(
        nxErrors.notAllowlisted
      );
    });
  });

  describe("Mint Test", function () {
    it("Mint character", async function () {
      const { character, executor, ad1 } = await loadFixture(beforeMintFixture);
      // mint character token
      const mintTransaction: ContractTransaction = await character.connect(executor).mint(await ad1.getAddress());

      const mintReceipt: ContractReceipt = await mintTransaction.wait();
      const mintEvent = mintReceipt.events!.find((event) => event.event === "Transfer");
      const characterAddress = ethers.utils.getAddress(mintEvent?.args!.tokenId.toHexString());
      expect(mintReceipt.events?.find((event) => event.event === "Transfer")).to.be.exist;
      expect(await character.ownerOf(characterAddress)).equal(await ad1.getAddress());
      expect(await character.exists(characterAddress)).to.be.true;
    });

    it("mintBatch Character", async function () {
      const { character, ad2, executor } = await loadFixture(beforeMintFixture);
      // mint character token
      const mintBatchTransaction: ContractTransaction = await character
        .connect(executor)
        .mintBatch(await ad2.getAddress(), 5);

      const mintBatchReceipt: ContractReceipt = await mintBatchTransaction.wait();
      const mintBatchTransferEvents = mintBatchReceipt.events!.filter((event) => event.event === "Transfer");
      const characterAddresses: string[] = [];
      for (const args of mintBatchTransferEvents!) {
        const characterAddress = ethers.utils.getAddress(args.args!.tokenId.toHexString());
        characterAddresses.push(characterAddress);
      }

      expect(mintBatchReceipt.events?.filter((event) => event.event === "Transfer")).to.be.exist;
      for (const characterAddress of characterAddresses) {
        expect(await character.ownerOf(characterAddress)).equal(await ad2.getAddress());
      }
    });

    it("mint fail when msg sender is not executor", async function () {
      const { character, ad1 } = await loadFixture(characterFixture);
      await expect(character.connect(ad1).mint(await ad1.getAddress())).to.be.revertedWith(nxErrors.executorForbidden);
    });

    it("mintBatch fail when msg sender is not executor", async function () {
      const { character, ad1 } = await loadFixture(characterFixture);
      await expect(character.connect(ad1).mintBatch(await ad1.getAddress(), 10)).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });

    it("mint fail when mint to zero address", async function () {
      const { character, executor } = await loadFixture(characterFixture);
      await expect(character.connect(executor).mint(ethers.constants.AddressZero)).to.be.revertedWith(
        nxErrors.ERC721.invalidRequest
      );
    });

    it("mint fail when paused", async function () {
      const { character, executor, ad1 } = await loadFixture(characterFixture);
      await character.connect(executor).pause();
      await expect(character.connect(executor).mint(await ad1.getAddress())).to.be.revertedWith(nxErrors.paused);
    });

    it("mintBatch fail when paused", async function () {
      const { character, executor, ad1 } = await loadFixture(characterFixture);
      await character.connect(executor).pause();
      await expect(character.connect(executor).mintBatch(await ad1.getAddress(), 10)).to.be.revertedWith(
        nxErrors.paused
      );
    });
  });

  describe("Transfer Test", function () {
    it("Can Transfer when msg sender is owner", async function () {
      const { character, ad1, webMintCharacterAddress, ad2 } = await loadFixture(characterFixture);
      expect(await character.ownerOf(webMintCharacterAddress)).to.be.equal(await ad1.getAddress());
      await character
        .connect(ad1)
        .transferFrom(await ad1.getAddress(), await ad2.getAddress(), webMintCharacterAddress);
      expect(await character.ownerOf(webMintCharacterAddress)).to.be.equal(await ad2.getAddress());
    });

    it("Can't transfer when msg sender is not owner", async function () {
      const { character, ad1, webMintCharacterAddress, ad2 } = await loadFixture(characterFixture);
      await expect(
        character.connect(ad2).transferFrom(await ad1.getAddress(), await ad2.getAddress(), webMintCharacterAddress)
      ).to.be.revertedWith(nxErrors.ERC721.transferForbidden);
    });

    it("Can't transfer character token to character proxy contract itself", async function () {
      const { character, ad1, webMintCharacterAddress } = await loadFixture(characterFixture);
      await expect(
        character.connect(ad1).transferFrom(await ad1.getAddress(), webMintCharacterAddress, webMintCharacterAddress)
      ).to.be.revertedWith(nxErrors.MaplestoryCharacter.transferInvalidID);
    });
    it("Transfer character when msg sender is operator", async function () {
      const { character, operator, ad1, ad2, webMintCharacterAddress } = await loadFixture(characterFixture);
      expect(await character.ownerOf(webMintCharacterAddress)).to.be.equal(await ad1.getAddress());
      await character
        .connect(operator)
        .transferFrom(await ad1.getAddress(), await ad2.getAddress(), webMintCharacterAddress);
      expect(await character.ownerOf(webMintCharacterAddress)).to.be.equal(await ad2.getAddress());
    });

    it("Transfer character using approve", async function () {
      const { controller, character, ad1, ad2, webMintCharacterAddress } = await loadFixture(characterFixture);
      await controller.setAllowlist(await ad2.getAddress(), true);
      await character.connect(ad1).approve(await ad2.getAddress(), webMintCharacterAddress);
      await character
        .connect(ad2)
        .transferFrom(await ad1.getAddress(), await ad2.getAddress(), webMintCharacterAddress);
      expect(await character.ownerOf(webMintCharacterAddress)).to.be.equal(await ad2.getAddress());
    });

    it("Transfer character using setApprovalForAll", async function () {
      const { controller, character, ad1, ad2, webMintCharacterAddress } = await loadFixture(characterFixture);
      await controller.setAllowlist(await ad2.getAddress(), true);
      await character.connect(ad1).setApprovalForAll(await ad2.getAddress(), true);
      await character
        .connect(ad2)
        .transferFrom(await ad1.getAddress(), await ad2.getAddress(), webMintCharacterAddress);
      expect(await character.ownerOf(webMintCharacterAddress)).to.be.equal(await ad2.getAddress());
    });
  });

  describe("URI Test", function () {
    it("Set Base Character URI", async function () {
      const { character, executor, characterAddress, defaultURI, changedURI } = await loadFixture(characterFixture);
      expect(await character.tokenURI(characterAddress)).to.be.equal(
        defaultURI + characterAddress.toString().toLowerCase() + ".json"
      );
      await expect(character.connect(executor).setBaseURI(changedURI))
        .to.emit(character, "DefaultBaseURIChanged")
        .withArgs(defaultURI, changedURI);
      expect(await character.tokenURI(characterAddress)).to.be.equal(
        changedURI + characterAddress.toString().toLowerCase() + ".json"
      );
    });

    it("Set URI of Character", async function () {
      const { character, executor, characterAddress, defaultURI, changedURI } = await loadFixture(characterFixture);
      expect(await character.tokenURI(characterAddress)).to.be.equal(
        defaultURI + characterAddress.toString().toLowerCase() + ".json"
      );
      await expect(character.connect(executor).setCharacterURI(characterAddress, changedURI))
        .to.emit(character, "CharacterBaseURIChanged")
        .withArgs(characterAddress, "", changedURI);
      expect(await character.tokenURI(characterAddress)).to.be.equal(
        changedURI + characterAddress.toString().toLowerCase() + ".json"
      );
    });

    it("Set Base Character URI fail when msg sender is not executor", async function () {
      const { character, ad1, changedURI } = await loadFixture(characterFixture);
      await expect(character.connect(ad1).setBaseURI(changedURI)).to.be.revertedWith(nxErrors.executorForbidden);
    });

    it("Set Base Character URI fail when paused", async function () {
      const { character, executor, changedURI } = await loadFixture(characterFixture);
      await character.connect(executor).pause();
      await expect(character.connect(executor).setBaseURI(changedURI)).to.be.revertedWith(nxErrors.paused);
    });

    it("Set URI of Character fail when msg sender is not executor", async function () {
      const { character, ad1, characterAddress, changedURI } = await loadFixture(characterFixture);
      await expect(character.connect(ad1).setCharacterURI(characterAddress, changedURI)).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });

    it("Set URI of Character fail when paused", async function () {
      const { character, executor, characterAddress, changedURI } = await loadFixture(characterFixture);
      await character.connect(executor).pause();
      await expect(character.connect(executor).setCharacterURI(characterAddress, changedURI)).to.be.revertedWith(
        nxErrors.paused
      );
    });

    it("Can't get tokenURI when tokenId does not exist", async function () {
      const { character } = await loadFixture(characterFixture);
      await expect(character.tokenURI(0x12345)).to.be.revertedWith(nxErrors.MaplestoryCharacter.uriInvalidID);
    });
  });

  describe("Total Supply Test", function () {
    it("Count Correct Total Supply", async function () {
      const { character } = await loadFixture(characterFixture);
      expect(await character.totalSupply()).to.be.equal(7);
    });
  });
  describe("Pause Test", function () {
    it("Pause Character Contract", async function () {
      const { character, webMintCharacterAddress, executor, ad1, ad2 } = await loadFixture(characterFixture);
      expect(await character.paused()).to.be.equal(false);
      await character.connect(executor).pause();
      expect(await character.paused()).to.be.equal(true);
      await expect(
        character.connect(ad1).transferFrom(await ad1.getAddress(), await ad2.getAddress(), webMintCharacterAddress)
      ).to.be.revertedWith(nxErrors.ERC721.paused);
    });

    it("Unpause Character Contract", async function () {
      const { character, webMintCharacterAddress, owner, executor, ad1, ad2 } = await loadFixture(characterFixture);
      expect(await character.paused()).to.be.equal(false);
      await character.connect(executor).pause();
      expect(await character.paused()).to.be.equal(true);
      await expect(
        character.connect(ad1).transferFrom(await ad1.getAddress(), await ad2.getAddress(), webMintCharacterAddress)
      ).to.be.reverted;
      await character.connect(owner).unpause();
      expect(await character.paused()).to.be.equal(false);
      await character
        .connect(ad1)
        .transferFrom(await ad1.getAddress(), await ad2.getAddress(), webMintCharacterAddress);
      expect(await character.ownerOf(webMintCharacterAddress)).to.be.equal(await ad2.getAddress());
    });

    it("Pause Character Contract fail when msg sender is not owner nor executor", async function () {
      const { character, ad1 } = await loadFixture(characterFixture);
      await expect(character.connect(ad1).pause()).to.be.revertedWith(nxErrors.executorForbidden);
    });

    it("Unpause Character Contract fail when msg sender is not owner", async function () {
      const { character, executor, ad1 } = await loadFixture(characterFixture);
      await character.connect(executor).pause();
      await expect(character.connect(ad1).unpause()).to.be.revertedWith(nxErrors.ownerForbidden);
    });
  });

  describe("Deposit And Withdraw Item Test", function () {
    it("Deposit item", async function () {
      const { character, equip, characterAddress, executor, ad1 } = await loadFixture(characterFixture);
      expect(await equip.ownerOf(1)).to.be.equal(await ad1.getAddress());
      await expect(
        character.connect(executor).depositItemFromOwner(await ad1.getAddress(), characterAddress, equip.address, 1)
      )
        .to.emit(character, "ItemDeposited")
        .withArgs(await ad1.getAddress(), characterAddress, equip.address, 1);
      expect(await equip.ownerOf(1)).to.be.equal(characterAddress);
    });

    it("Deposit batch items", async function () {
      const { character, equip, characterAddress, executor, ad1 } = await loadFixture(characterFixture);
      expect(await equip.ownerOf(1)).to.be.equal(await ad1.getAddress());
      expect(await equip.ownerOf(2)).to.be.equal(await ad1.getAddress());
      const depositBatchItemsTx: ContractTransaction = await character
        .connect(executor)
        .depositBatchItemsFromOwner(await ad1.getAddress(), characterAddress, equip.address, [1, 2]);
      const depositBatchItemsReceipt: ContractReceipt = await depositBatchItemsTx.wait();
      const depositBatchItemsEvent = depositBatchItemsReceipt.events!.filter(
        (event) => event.event === "ItemDeposited"
      );
      const tokenIds: string[] = [];
      for (const { index, args } of depositBatchItemsEvent!.map((args, index) => ({ index, args }))) {
        tokenIds[index] = args.args!.tokenId;
      }
      expect(tokenIds[0]).to.be.equal(1);
      expect(tokenIds[1]).to.be.equal(2);
      expect(await equip.ownerOf(1)).to.be.equal(characterAddress);
      expect(await equip.ownerOf(2)).to.be.equal(characterAddress);
    });

    it("Deposit another token contract's item", async function () {
      const { character, equip2, characterAddress, executor, ad1 } = await loadFixture(characterFixture);
      expect(await equip2.ownerOf(1)).to.be.equal(await ad1.getAddress());
      await expect(
        character.connect(executor).depositItemFromOwner(await ad1.getAddress(), characterAddress, equip2.address, 1)
      )
        .to.emit(character, "ItemDeposited")
        .withArgs(await ad1.getAddress(), characterAddress, equip2.address, 1);
      expect(await equip2.ownerOf(1)).to.be.equal(characterAddress);
    });

    it("Cannot deposit item when msg sender is not executor of character", async function () {
      const { character, equip, characterAddress, ad1 } = await loadFixture(characterFixture);
      await expect(
        character.connect(ad1).depositItemFromOwner(await ad1.getAddress(), characterAddress, equip.address, 1)
      ).to.be.revertedWith(nxErrors.executorForbidden);
    });

    it("Cannot deposit batch item when msg sender is not executor of character", async function () {
      const { character, equip, characterAddress, ad1 } = await loadFixture(characterFixture);
      await expect(
        character
          .connect(ad1)
          .depositBatchItemsFromOwner(await ad1.getAddress(), characterAddress, equip.address, [1, 2])
      ).to.be.revertedWith(nxErrors.executorForbidden);
    });

    it("Cannot deposit item when requester is not owner of character", async function () {
      const { character, equip, characterAddress, executor, ad1, ad2 } = await loadFixture(characterFixture);
      expect(await equip.ownerOf(1)).to.be.equal(await ad1.getAddress());
      await expect(
        character.connect(executor).depositItemFromOwner(await ad2.getAddress(), characterAddress, equip.address, 6)
      ).to.be.revertedWith(nxErrors.MaplestoryCharacter.wrongRequester);
      expect(await equip.ownerOf(1)).to.be.equal(await ad1.getAddress());
    });

    it("Cannot deposit item when requester is not owner of item", async function () {
      const { character, equip, characterAddress, executor, ad1 } = await loadFixture(characterFixture);
      await expect(
        character.connect(executor).depositItemFromOwner(await ad1.getAddress(), characterAddress, equip.address, 6)
      ).to.be.revertedWith(nxErrors.ERC721.transferConflict);
    });

    it("Cannot deposit batch items when requester is not owner of character", async function () {
      const { character, equip, characterAddress, executor, ad1, ad2 } = await loadFixture(characterFixture);
      expect(await equip.ownerOf(1)).to.be.equal(await ad1.getAddress());
      await expect(
        character
          .connect(executor)
          .depositBatchItemsFromOwner(await ad2.getAddress(), characterAddress, equip.address, [6])
      ).to.be.revertedWith(nxErrors.MaplestoryCharacter.wrongRequester);
      expect(await equip.ownerOf(1)).to.be.equal(await ad1.getAddress());
    });

    it("Cannot deposit batch items when requester is not owner of item", async function () {
      const { character, equip, characterAddress, executor, ad1 } = await loadFixture(characterFixture);
      await expect(
        character
          .connect(executor)
          .depositBatchItemsFromOwner(await ad1.getAddress(), characterAddress, equip.address, [6])
      ).to.be.revertedWith(nxErrors.ERC721.transferConflict);
    });

    it("Cannot deposit item by executor when paused", async function () {
      const { character, equip, characterAddress, executor, ad1 } = await loadFixture(characterFixture);
      await character.connect(executor).pause();
      await expect(
        character.connect(executor).depositItemFromOwner(await ad1.getAddress(), characterAddress, equip.address, 1)
      ).to.be.revertedWith(nxErrors.paused);
    });

    it("Cannot deposit batch items by executor when paused", async function () {
      const { character, equip, characterAddress, executor, ad1 } = await loadFixture(characterFixture);
      await character.connect(executor).pause();
      await expect(
        character
          .connect(executor)
          .depositBatchItemsFromOwner(await ad1.getAddress(), characterAddress, equip.address, [1, 2])
      ).to.be.revertedWith(nxErrors.paused);
    });

    it("Deposit item from sender", async function () {
      const { character, controller, equip, collection, characterAddress, ad1 } = await loadFixture(characterFixture);
      await controller.connect(collection).setApprove(true);
      await equip.connect(ad1).transferFrom(await ad1.getAddress(), collection.address, 1);
      await expect(
        character.connect(collection).depositItemFromSender(await ad1.getAddress(), characterAddress, equip.address, 1)
      ).not.to.reverted;
      expect(await equip.ownerOf(1)).to.be.equal(characterAddress);
    });

    it("Deposit item from sender fail when msg sender is not executor", async function () {
      const { character, controller, equip, collection, characterAddress, ad1 } = await loadFixture(characterFixture);
      await controller.connect(collection).setApprove(true);
      await equip.connect(ad1).transferFrom(await ad1.getAddress(), await collection.getAddress(), 1);
      await expect(
        character.connect(ad1).depositItemFromSender(await ad1.getAddress(), characterAddress, equip.address, 1)
      ).to.be.revertedWith(nxErrors.executorForbidden);
    });

    it("Deposit item from sender fail when requester is not character's owner", async function () {
      const { character, controller, equip, collection, characterAddress, ad1, ad2 } = await loadFixture(
        characterFixture
      );
      await controller.connect(collection).setApprove(true);
      await equip.connect(ad1).transferFrom(await ad1.getAddress(), await collection.getAddress(), 1);
      await expect(
        character.connect(collection).depositItemFromSender(await ad2.getAddress(), characterAddress, equip.address, 1)
      ).to.be.revertedWith(nxErrors.MaplestoryCharacter.wrongRequester);
    });

    it("Deposit item from sender by executor fail when paused", async function () {
      const { character, controller, equip, collection, characterAddress, executor, ad1 } = await loadFixture(
        characterFixture
      );
      await controller.connect(collection).setApprove(true);
      await equip.connect(ad1).transferFrom(await ad1.getAddress(), await collection.getAddress(), 1);
      await character.connect(executor).pause();
      await expect(
        character.connect(collection).depositItemFromSender(await ad1.getAddress(), characterAddress, equip.address, 1)
      ).to.be.revertedWith(nxErrors.paused);
    });

    it("Deposit batch items from sender", async function () {
      const { character, controller, equip, collection, characterAddress, ad1 } = await loadFixture(characterFixture);
      await controller.connect(collection).setApprove(true);
      await equip.connect(ad1).transferFrom(await ad1.getAddress(), await collection.getAddress(), 1);
      await expect(
        character
          .connect(collection)
          .depositBatchItemsFromSender(await ad1.getAddress(), characterAddress, equip.address, [1])
      ).not.to.reverted;
      expect(await equip.ownerOf(1)).to.be.equal(characterAddress);
    });

    it("Deposit batch items from sender fail when msg sender is not executor", async function () {
      const { character, controller, equip, collection, characterAddress, ad1 } = await loadFixture(characterFixture);
      await controller.connect(collection).setApprove(true);
      await equip.connect(ad1).transferFrom(await ad1.getAddress(), collection.address, 1);
      await expect(
        character.connect(ad1).depositBatchItemsFromSender(await ad1.getAddress(), characterAddress, equip.address, [1])
      ).to.be.revertedWith(nxErrors.executorForbidden);
    });

    it("Deposit batch items from sender fail when requester is not character's owner", async function () {
      const { character, controller, equip, collection, characterAddress, ad1, ad2 } = await loadFixture(
        characterFixture
      );
      await controller.connect(collection).setApprove(true);
      await equip.connect(ad1).transferFrom(await ad1.getAddress(), await collection.getAddress(), 1);
      await expect(
        character
          .connect(collection)
          .depositBatchItemsFromSender(await ad2.getAddress(), characterAddress, equip.address, [1])
      ).to.be.revertedWith(nxErrors.MaplestoryCharacter.wrongRequester);
    });

    it("Deposit batch items from sender by executor fail when paused", async function () {
      const { character, controller, equip, collection, characterAddress, executor, ad1 } = await loadFixture(
        characterFixture
      );
      await controller.connect(collection).setApprove(true);
      await equip.connect(ad1).transferFrom(await ad1.getAddress(), await collection.getAddress(), 1);
      await character.connect(executor).pause();
      await expect(
        character
          .connect(collection)
          .depositBatchItemsFromSender(await ad1.getAddress(), characterAddress, equip.address, [1])
      ).to.be.revertedWith(nxErrors.paused);
    });

    it("Withdraw item", async function () {
      const { character, equip, characterAddress, executor, ad1 } = await loadFixture(depositFixture);
      expect(await equip.ownerOf(1)).to.be.equal(characterAddress);
      await expect(
        character.connect(executor).withdrawItemToOwner(characterAddress, await ad1.getAddress(), equip.address, 1)
      )
        .to.emit(character, "ItemWithdrawn")
        .withArgs(characterAddress, await ad1.getAddress(), equip.address, 1);
      expect(await equip.ownerOf(1)).to.be.equal(await ad1.getAddress());
    });

    it("Withdraw batch items", async function () {
      const { character, equip, characterAddress, executor, ad1 } = await loadFixture(depositFixture);
      expect(await equip.ownerOf(1)).to.be.equal(characterAddress);
      expect(await equip.ownerOf(2)).to.be.equal(characterAddress);
      const withdrawBatchItemsTx: ContractTransaction = await character
        .connect(executor)
        .withdrawBatchItemsToOwner(characterAddress, await ad1.getAddress(), equip.address, [1, 2]);
      const withdrawBatchItemReceipt: ContractReceipt = await withdrawBatchItemsTx.wait();
      const withdrawBatchItemsEvent = withdrawBatchItemReceipt.events!.filter(
        (event) => event.event === "ItemWithdrawn"
      );
      const tokenIds: string[] = [];
      for (const { index, args } of withdrawBatchItemsEvent!.map((args, index) => ({ index, args }))) {
        tokenIds[index] = args.args!.tokenId;
      }
      expect(tokenIds[0]).to.be.equal(1);
      expect(tokenIds[1]).to.be.equal(2);
      expect(await equip.ownerOf(1)).to.be.equal(await ad1.getAddress());
      expect(await equip.ownerOf(2)).to.be.equal(await ad1.getAddress());
    });

    it("Cannot withdraw item when item is not deposited", async function () {
      const { character, equip, characterAddress, executor, ad1 } = await loadFixture(depositFixture);
      await expect(
        character.connect(executor).withdrawItemToOwner(characterAddress, await ad1.getAddress(), equip.address, 3)
      ).to.be.revertedWith(nxErrors.ERC721.transferForbidden);
    });

    it("Cannot withdraw item when msg sender is not executor of character", async function () {
      const { character, equip, characterAddress, ad1 } = await loadFixture(depositFixture);
      await expect(
        character.connect(ad1).withdrawItemToOwner(characterAddress, await ad1.getAddress(), equip.address, 1)
      ).to.be.revertedWith(nxErrors.executorForbidden);
    });

    it("Cannot withdraw batch item when msg sender is not executor of character", async function () {
      const { character, equip, characterAddress, ad1 } = await loadFixture(depositFixture);
      await expect(
        character
          .connect(ad1)
          .withdrawBatchItemsToOwner(characterAddress, await ad1.getAddress(), equip.address, [1, 2])
      ).to.be.revertedWith(nxErrors.executorForbidden);
    });

    it("Cannot withdraw item when requester is not owner of character", async function () {
      const { character, equip, characterAddress, executor, ad2 } = await loadFixture(depositFixture);
      await expect(
        character.connect(executor).withdrawItemToOwner(characterAddress, await ad2.getAddress(), equip.address, 1)
      ).to.be.revertedWith(nxErrors.MaplestoryCharacter.wrongRequester);
    });

    it("Cannot withdraw batch items when requester is not owner of character", async function () {
      const { character, equip, characterAddress, executor, ad2 } = await loadFixture(depositFixture);
      await expect(
        character
          .connect(executor)
          .withdrawBatchItemsToOwner(characterAddress, await ad2.getAddress(), equip.address, [1, 2])
      ).to.be.revertedWith(nxErrors.MaplestoryCharacter.wrongRequester);
    });

    it("Cannot withdraw item when msg sender is not character contract", async function () {
      const { ad1, equip, characterAddress } = await loadFixture(depositFixture);
      const proxy = await ethers.getContractAt("MaplestoryCharacterInventoryImpl", characterAddress);
      await expect(proxy.connect(ad1).withdrawItem(await ad1.getAddress(), equip.address, 1)).to.be.revertedWith(
        nxErrors.MaplestoryCharacter.withdrawForbidden
      );
    });

    it("Withdraw to collection by collection", async function () {
      const { character, executor, ad1, collection, equip, characterAddress } = await loadFixture(characterFixture);
      await character
        .connect(executor)
        .depositItemFromOwner(await ad1.getAddress(), characterAddress, equip.address, 1);
      await expect(
        character
          .connect(collection)
          .withdrawItemTo(characterAddress, await ad1.getAddress(), collection.address, equip.address, 1)
      )
        .to.emit(character, "ItemWithdrawn")
        .withArgs(characterAddress, await collection.getAddress(), equip.address, 1);
      expect(await equip.ownerOf(1)).to.be.equal(await collection.getAddress());
    });

    it("Withdraw to collection fail when msg sender is not executor", async function () {
      const { character, equip, collection, executor, ad1, characterAddress } = await loadFixture(characterFixture);
      await character
        .connect(executor)
        .depositItemFromOwner(await ad1.getAddress(), characterAddress, equip.address, 1);
      await expect(
        character
          .connect(ad1)
          .withdrawItemTo(characterAddress, await ad1.getAddress(), collection.address, equip.address, 1)
      ).to.be.revertedWith(nxErrors.executorForbidden);
    });

    it("Withdraw to collection fail when requester is not character's owner", async function () {
      const { character, executor, ad1, ad2, collection, equip, characterAddress } = await loadFixture(
        characterFixture
      );

      await character
        .connect(executor)
        .depositItemFromOwner(await ad1.getAddress(), characterAddress, equip.address, 1);
      await expect(
        character
          .connect(collection)
          .withdrawItemTo(characterAddress, await ad2.getAddress(), collection.address, equip.address, 1)
      ).to.be.revertedWith(nxErrors.MaplestoryCharacter.wrongRequester);
    });

    it("Withdraw to collection fail when paused", async function () {
      const { character, executor, ad1, collection, equip, characterAddress } = await loadFixture(characterFixture);
      await character
        .connect(executor)
        .depositItemFromOwner(await ad1.getAddress(), characterAddress, equip.address, 1);
      await character.connect(executor).pause();
      await expect(
        character
          .connect(collection)
          .withdrawItemTo(characterAddress, await ad1.getAddress(), collection.address, equip.address, 1)
      ).to.be.revertedWith(nxErrors.paused);
    });

    it("Withdraw batch items to collection by collection", async function () {
      const { character, equip, collection, characterAddress, executor, ad1 } = await loadFixture(characterFixture);
      await expect(
        character
          .connect(executor)
          .depositBatchItemsFromOwner(await ad1.getAddress(), characterAddress, equip.address, [1, 2])
      ).not.to.reverted;
      expect(await equip.ownerOf(1)).to.be.equal(characterAddress);
      expect(await equip.ownerOf(2)).to.be.equal(characterAddress);
      await expect(
        character
          .connect(collection)
          .withdrawBatchItemsTo(characterAddress, await ad1.getAddress(), collection.address, equip.address, [1, 2])
      ).not.to.reverted;
      expect(await equip.ownerOf(1)).to.be.equal(collection.address);
      expect(await equip.ownerOf(2)).to.be.equal(collection.address);
    });

    it("Withdraw batch items to collection fail when msg sender is not executor", async function () {
      const { character, equip, collection, characterAddress, executor, ad1 } = await loadFixture(characterFixture);
      await expect(
        character
          .connect(executor)
          .depositBatchItemsFromOwner(await ad1.getAddress(), characterAddress, equip.address, [1, 2])
      );
      await expect(
        character
          .connect(ad1)
          .withdrawBatchItemsTo(characterAddress, await ad1.getAddress(), collection.address, equip.address, [1, 2])
      ).to.be.revertedWith(nxErrors.executorForbidden);
    });

    it("Withdraw batch items to collection fail when requester is not character's owner", async function () {
      const { character, equip, collection, characterAddress, executor, ad1, ad2 } = await loadFixture(
        characterFixture
      );
      await character
        .connect(executor)
        .depositBatchItemsFromOwner(await ad1.getAddress(), characterAddress, equip.address, [1, 2]);

      await expect(
        character
          .connect(collection)
          .withdrawBatchItemsTo(characterAddress, await ad2.getAddress(), collection.address, equip.address, [1, 2])
      ).to.be.revertedWith(nxErrors.MaplestoryCharacter.wrongRequester);
    });

    it("Withdraw batch items to collection by collection fail when paused", async function () {
      const { character, equip, collection, characterAddress, executor, ad1 } = await loadFixture(characterFixture);
      await character
        .connect(executor)
        .depositBatchItemsFromOwner(await ad1.getAddress(), characterAddress, equip.address, [1, 2]);
      await character.connect(executor).pause();
      await expect(
        character
          .connect(collection)
          .withdrawBatchItemsTo(characterAddress, await ad1.getAddress(), collection.address, equip.address, [1, 2])
      ).to.be.revertedWith(nxErrors.paused);
    });

    it("Withdraw to collection fail when inventory caller is not character contract", async function () {
      const { character, equip, executor, ad1, characterAddress } = await loadFixture(characterFixture);
      await character
        .connect(executor)
        .depositItemFromOwner(await ad1.getAddress(), characterAddress, equip.address, 1);

      const proxy = await ethers.getContractAt("MaplestoryCharacterInventoryImpl", characterAddress);
      await expect(proxy.connect(ad1).withdrawItem(await ad1.getAddress(), equip.address, 1)).to.be.revertedWith(
        nxErrors.MaplestoryCharacter.withdrawForbidden
      );
    });
  });

  describe("retrieve Character Test", () => {
    it("retrieve Character", async () => {
      const { character, owner, ad1, ad2, characterAddress } = await loadFixture(characterFixture);
      await expect(
        character
          .connect(owner)
          .retrieveCharacter(await ad1.getAddress(), await ad2.getAddress(), characterAddress, "bad situation")
      )
        .to.emit(character, "RetrievedCharacter")
        .withArgs(await ad1.getAddress(), await ad2.getAddress(), characterAddress, "bad situation");

      const newOwner = await character.ownerOf(characterAddress);
      await expect(newOwner).to.be.equal(await ad2.getAddress());
    });

    it("retrieve Character from not owner", async () => {
      const { character, ad1, ad2, characterAddress } = await loadFixture(characterFixture);
      await expect(
        character
          .connect(ad1)
          .retrieveCharacter(await ad1.getAddress(), await ad2.getAddress(), characterAddress, "bad situation")
      ).to.revertedWith(nxErrors.ownerForbidden);
    });
  });

  describe("OwnerOf Test", function () {
    it("Success", async function () {
      const { character, executor, ad1, ad2 } = await loadFixture(beforeMintFixture);
      // mint character token
      const mint = async (user: SignerWithAddress) => {
        const mintTransaction: ContractTransaction = await character.connect(executor).mint(await user.getAddress());
        const mintReceipt: ContractReceipt = await mintTransaction.wait();
        const mintEvent = mintReceipt.events!.find((event) => event.event === "Transfer");
        return ethers.utils.getAddress(mintEvent?.args!.tokenId.toHexString());
      };
      const charId1 = await mint(executor);
      const charId2 = await mint(ad1);
      const charId3 = await mint(ad2);
      const charId4 = await mint(ad1);
      expect(await character.ownerOfBatch([charId1, charId2, charId3, charId4])).to.deep.equal([
        await executor.getAddress(),
        await ad1.getAddress(),
        await ad2.getAddress(),
        await ad1.getAddress(),
      ]);
    });
    it("invalid token ID", async function () {
      const { character, executor, ad1, ad2 } = await loadFixture(beforeMintFixture);
      // mint character token
      const mint = async (user: SignerWithAddress) => {
        const mintTransaction: ContractTransaction = await character.connect(executor).mint(user.address);
        const mintReceipt: ContractReceipt = await mintTransaction.wait();
        const mintEvent = mintReceipt.events!.find((event) => event.event === "Transfer");
        return ethers.utils.getAddress(mintEvent?.args!.tokenId.toHexString());
      };
      const charId1 = await mint(executor);
      const charId2 = await mint(ad1);
      const charId3 = await mint(ad2);
      const charId4 = await mint(ad1);
      await expect(
        character.ownerOfBatch([charId1, charId2, charId3, charId4, await ad1.getAddress()])
      ).to.be.revertedWith(
        new RegExp(`^MaplestoryCharacter/ownerOfInvalidID:.+${(await ad1.getAddress()).toLowerCase()}`)
      );
    });
  });
});
