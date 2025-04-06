import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { BytesLike } from "ethers";
import { IExec__factory } from "../../typechain-types";
import { missingRole } from "../lib/access-control";
import nxErrors from "../lib/nx-errors";

const execSighash = IExec__factory.createInterface().getSighash("exec");

function roleFor(to: string, data: BytesLike) {
  return ethers.utils.keccak256(
    ethers.utils.solidityPack(["bytes4", "address", "bytes"], [execSighash, to, ethers.utils.hexDataSlice(data, 0, 4)])
  );
}

function missingRoleFor(from: string, to: string, data: BytesLike) {
  return missingRole(roleFor(to, data), from);
}

describe("AdminController", function () {
  async function fixture() {
    const [owner, alice, bob] = await ethers.getSigners();

    const [AdminController, MockCalleeOwnable] = await Promise.all([
      ethers.getContractFactory("AdminController", owner),
      ethers.getContractFactory("MockCalleeOwnable", owner),
    ]);

    const [controller, ownable1, ownable2] = await Promise.all([
      AdminController.deploy(),
      MockCalleeOwnable.deploy(),
      MockCalleeOwnable.deploy(),
    ]);

    await Promise.all([ownable1.transferOwnership(controller.address), ownable2.transferOwnership(controller.address)]);

    return { controller, ownable1, ownable2, owner, alice, bob };
  }

  before(async function () {
    await loadFixture(fixture);
  });

  describe("constructor", function () {
    it("should grant DEFAULT_ADMIN_ROLE to the deployer", async function () {
      const { controller, owner } = await loadFixture(fixture);

      expect(await controller.hasRole(await controller.DEFAULT_ADMIN_ROLE(), await owner.getAddress())).to.be.true;
    });
  });

  describe("roleFor", function () {
    it("should return correct role for selector only", async function () {
      const { controller, ownable1 } = await loadFixture(fixture);
      const to = ownable1.address;
      const data = "0x12342345";

      expect(await controller.roleFor(to, data)).to.eq(roleFor(to, data));
    });

    it("should return correct role for receive", async function () {
      const { controller, ownable1 } = await loadFixture(fixture);
      const to = ownable1.address;
      const data = "0x";

      expect(await controller.roleFor(to, data)).to.eq(roleFor(to, data));
    });

    it("should return correct role for partial selector", async function () {
      const { controller, ownable1 } = await loadFixture(fixture);
      const to = ownable1.address;
      const data = "0x2233";

      expect(await controller.roleFor(to, data)).to.eq(roleFor(to, data));
    });

    it("should return correct role for extra data", async function () {
      const { controller, ownable1 } = await loadFixture(fixture);
      const to = ownable1.address;
      const data = "0x12125467556699ff11dd88aa00fe";

      expect(await controller.roleFor(to, data)).to.eq(roleFor(to, data));
    });
  });

  describe("exec", function () {
    it("should execute transferOwnership call", async function () {
      const { controller, ownable1, owner, alice } = await loadFixture(fixture);

      await controller
        .connect(owner)
        .grantRole(
          roleFor(ownable1.address, ownable1.interface.getSighash("transferOwnership")),
          await alice.getAddress()
        );

      await expect(
        await controller
          .connect(alice)
          .exec(
            ownable1.address,
            ownable1.interface.encodeFunctionData("transferOwnership", [await alice.getAddress()]),
            0
          )
      )
        .to.emit(ownable1, "OwnershipTransferred")
        .withArgs(controller.address, await alice.getAddress());
    });

    it("should execute transferOwnership call to second contract", async function () {
      const { controller, ownable2, owner, alice } = await loadFixture(fixture);

      await controller
        .connect(owner)
        .grantRole(
          roleFor(ownable2.address, ownable2.interface.getSighash("transferOwnership")),
          await alice.getAddress()
        );

      await expect(
        await controller
          .connect(alice)
          .exec(
            ownable2.address,
            ownable2.interface.encodeFunctionData("transferOwnership", [await alice.getAddress()]),
            0
          )
      )
        .to.emit(ownable2, "OwnershipTransferred")
        .withArgs(controller.address, await alice.getAddress());
    });

    it("should execute renounceOwnership call", async function () {
      const { controller, ownable1, owner, alice } = await loadFixture(fixture);

      await controller
        .connect(owner)
        .grantRole(
          roleFor(ownable1.address, ownable1.interface.getSighash("renounceOwnership")),
          await alice.getAddress()
        );

      await expect(
        await controller
          .connect(alice)
          .exec(ownable1.address, ownable1.interface.encodeFunctionData("renounceOwnership"), 0)
      )
        .to.emit(ownable1, "OwnershipTransferred")
        .withArgs(controller.address, "0x" + "00".repeat(20));
    });

    it("should send value", async function () {
      const { controller, ownable1, owner, alice } = await loadFixture(fixture);

      await controller.connect(owner).grantRole(roleFor(ownable1.address, "0x"), await alice.getAddress());

      await expect(await controller.connect(alice).exec(ownable1.address, "0x", 100, { value: 100 }))
        .to.emit(ownable1, "MockCalled")
        .withArgs("0x", 100);
    });

    it("should be okay for unspent value", async function () {
      const { controller, ownable1, owner, alice } = await loadFixture(fixture);

      await controller.connect(owner).grantRole(roleFor(ownable1.address, "0x"), await alice.getAddress());

      await expect(await controller.connect(alice).exec(ownable1.address, "0x", 1, { value: 100 }))
        .to.emit(ownable1, "MockCalled")
        .withArgs("0x", 1);
    });

    it("should send value with call", async function () {
      const { controller, ownable1, owner, alice } = await loadFixture(fixture);

      await controller.connect(owner).grantRole(roleFor(ownable1.address, "0xabcd"), await alice.getAddress());

      await expect(await controller.connect(alice).exec(ownable1.address, "0xabcd", 100, { value: 100 }))
        .to.emit(ownable1, "MockCalled")
        .withArgs("0xabcd", 100);
    });

    it("should be reverted when no role", async function () {
      const { controller, ownable1, alice } = await loadFixture(fixture);

      await expect(
        controller
          .connect(alice)
          .exec(
            ownable1.address,
            ownable1.interface.encodeFunctionData("transferOwnership", [await alice.getAddress()]),
            0
          )
      ).to.be.revertedWith(
        missingRoleFor(await alice.getAddress(), ownable1.address, ownable1.interface.getSighash("transferOwnership"))
      );
    });

    it("should be reverted when missing role but other guy has", async function () {
      const { controller, ownable1, owner, alice, bob } = await loadFixture(fixture);

      await controller
        .connect(owner)
        .grantRole(
          roleFor(ownable1.address, ownable1.interface.getSighash("transferOwnership")),
          await alice.getAddress()
        );

      await expect(
        controller
          .connect(bob)
          .exec(
            ownable1.address,
            ownable1.interface.encodeFunctionData("transferOwnership", [await alice.getAddress()]),
            0
          )
      ).to.be.revertedWith(
        missingRoleFor(await bob.getAddress(), ownable1.address, ownable1.interface.getSighash("transferOwnership"))
      );
    });

    it("should be reverted when missing role but receive role granted", async function () {
      const { controller, ownable1, owner, alice } = await loadFixture(fixture);

      await controller.connect(owner).grantRole(roleFor(ownable1.address, "0x"), await alice.getAddress());

      await expect(
        controller
          .connect(alice)
          .exec(
            ownable1.address,
            ownable1.interface.encodeFunctionData("transferOwnership", [await alice.getAddress()]),
            0
          )
      ).to.be.revertedWith(
        missingRoleFor(await alice.getAddress(), ownable1.address, ownable1.interface.getSighash("transferOwnership"))
      );
    });

    it("should be reverted for value transfer when granted other role but receive", async function () {
      const { controller, ownable1, owner, alice } = await loadFixture(fixture);

      await controller
        .connect(owner)
        .grantRole(
          roleFor(ownable1.address, ownable1.interface.getSighash("transferOwnership")),
          await alice.getAddress()
        );

      await expect(controller.connect(alice).exec(ownable1.address, "0x", 0)).to.be.revertedWith(
        missingRoleFor(await alice.getAddress(), ownable1.address, "0x")
      );
    });

    it("should be reverted when missing role but prefix role granted", async function () {
      const { controller, ownable1, owner, alice } = await loadFixture(fixture);

      await controller.connect(owner).grantRole(roleFor(ownable1.address, "0x1234"), await alice.getAddress());

      await expect(controller.connect(alice).exec(ownable1.address, "0x123456", 0)).to.be.revertedWith(
        missingRoleFor(await alice.getAddress(), ownable1.address, "0x123456")
      );
    });

    it("should be reverted when missing role but calling prefix data of granted role", async function () {
      const { controller, ownable1, owner, alice } = await loadFixture(fixture);

      await controller.connect(owner).grantRole(roleFor(ownable1.address, "0x987654"), await alice.getAddress());

      await expect(controller.connect(alice).exec(ownable1.address, "0x9876", 0)).to.be.revertedWith(
        missingRoleFor(await alice.getAddress(), ownable1.address, "0x9876")
      );
    });

    it("should be reverted when missing role but granted role to other contract", async function () {
      const { controller, ownable1, ownable2, owner, alice } = await loadFixture(fixture);

      await controller
        .connect(owner)
        .grantRole(
          roleFor(ownable1.address, ownable1.interface.getSighash("transferOwnership")),
          await alice.getAddress()
        );

      await expect(
        controller
          .connect(alice)
          .exec(
            ownable2.address,
            ownable1.interface.encodeFunctionData("transferOwnership", [await alice.getAddress()]),
            0
          )
      ).to.be.revertedWith(
        missingRoleFor(await alice.getAddress(), ownable2.address, ownable1.interface.getSighash("transferOwnership"))
      );
    });
  });

  describe("batchExec", function () {
    it("should do nothing when no call given", async function () {
      const { controller } = await loadFixture(fixture);

      await expect(controller.batchExec([])).not.to.be.reverted;
    });

    it("should execute every call", async function () {
      const { controller, ownable1, ownable2, owner, alice } = await loadFixture(fixture);

      {
        const controllerFromOwner = controller.connect(owner);
        const aliceAddress = await alice.getAddress();
        await Promise.all(
          [
            roleFor(ownable1.address, "0x"),
            roleFor(ownable1.address, "0xabcd"),
            roleFor(ownable1.address, ownable1.interface.getSighash("transferOwnership")),
            roleFor(ownable2.address, ownable1.interface.getSighash("renounceOwnership")),
          ].map((role) => controllerFromOwner.grantRole(role, aliceAddress))
        );
      }

      await expect(
        await controller.connect(alice).batchExec(
          [
            {
              to: ownable1.address,
              data: "0x",
              value: 50,
            },
            {
              to: ownable1.address,
              data: "0xabcd",
              value: 56,
            },
            {
              to: ownable1.address,
              data: ownable1.interface.encodeFunctionData("transferOwnership", [await alice.getAddress()]),
              value: 0,
            },
            {
              to: ownable2.address,
              data: ownable1.interface.encodeFunctionData("renounceOwnership"),
              value: 0,
            },
          ],
          { value: 200 }
        )
      )
        .to.emit(ownable1, "MockCalled")
        .withArgs("0x", 50)
        .emit(ownable1, "MockCalled")
        .withArgs("0xabcd", 56)
        .emit(ownable1, "OwnershipTransferred")
        .withArgs(controller.address, await alice.getAddress())
        .emit(ownable2, "OwnershipTransferred")
        .withArgs(controller.address, "0x" + "00".repeat(20));
    });

    it("should be reverted even when one role missing", async function () {
      const { controller, ownable1, ownable2, owner, alice } = await loadFixture(fixture);

      await controller.connect(owner).grantRole(roleFor(ownable1.address, "0x1234"), await alice.getAddress());

      await expect(
        controller.connect(alice).batchExec([
          { to: ownable1.address, data: "0x1234", value: 0 },
          { to: ownable2.address, data: "0x1234", value: 0 },
        ])
      ).to.be.revertedWith(missingRoleFor(await alice.getAddress(), ownable2.address, "0x1234"));
    });

    it("should be reverted even when one call reverts", async function () {
      const { controller, ownable1, owner, alice } = await loadFixture(fixture);

      await controller
        .connect(owner)
        .grantRole(
          roleFor(ownable1.address, ownable1.interface.getSighash("renounceOwnership")),
          await alice.getAddress()
        );

      await expect(
        controller.connect(alice).batchExec([
          {
            to: ownable1.address,
            data: ownable1.interface.encodeFunctionData("renounceOwnership"),
            value: 0,
          },
          {
            to: ownable1.address,
            data: ownable1.interface.encodeFunctionData("renounceOwnership"),
            value: 0,
          },
        ])
      ).to.be.revertedWith(nxErrors.ownerForbidden);
    });
  });

  describe("setRoleAdmin", function () {
    it("should change admin role", async function () {
      const { controller, owner } = await loadFixture(fixture);

      const role = ethers.utils.solidityPack(["uint256"], [123]);
      const adminRole = ethers.utils.solidityPack(["uint256"], [456]);

      await expect(controller.connect(owner).setRoleAdmin(role, adminRole))
        .to.emit(controller, "RoleAdminChanged")
        .withArgs(role, "0x" + "00".repeat(32), adminRole);
    });

    it("should be reverted when missing previous admin role", async function () {
      const { controller, alice } = await loadFixture(fixture);

      const role = ethers.utils.solidityPack(["uint256"], [123]);
      const adminRole = ethers.utils.solidityPack(["uint256"], [456]);

      await expect(controller.connect(alice).setRoleAdmin(role, adminRole)).to.be.revertedWith(
        missingRole("0x" + "00".repeat(32), await alice.getAddress())
      );
    });

    it("should be reverted when missing previous admin role but granted target role", async function () {
      const { controller, owner, alice } = await loadFixture(fixture);

      const role = ethers.utils.solidityPack(["uint256"], [123]);
      const adminRole = ethers.utils.solidityPack(["uint256"], [456]);
      await controller.connect(owner).grantRole(role, await alice.getAddress());

      await expect(controller.connect(alice).setRoleAdmin(role, adminRole)).to.be.revertedWith(
        missingRole("0x" + "00".repeat(32), await alice.getAddress())
      );
    });

    it("should be reverted when missing previous admin role but new admin role", async function () {
      const { controller, owner, alice } = await loadFixture(fixture);

      const role = ethers.utils.solidityPack(["uint256"], [123]);
      const adminRole = ethers.utils.solidityPack(["uint256"], [456]);
      await controller.connect(owner).grantRole(adminRole, await alice.getAddress());

      await expect(controller.connect(alice).setRoleAdmin(role, adminRole)).to.be.revertedWith(
        missingRole("0x" + "00".repeat(32), await alice.getAddress())
      );
    });
  });
});
