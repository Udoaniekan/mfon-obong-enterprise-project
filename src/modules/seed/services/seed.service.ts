import { Command } from 'nestjs-command';
import { ConflictException, Injectable } from '@nestjs/common';
import { UsersService } from '../../users/services/users.service';
import { CategoriesService } from '../../categories/services/categories.service';
import { BranchesService } from '../../branches/services/branches.service';
import { UserRole } from '../../../common/enums';

@Injectable()
export class SeedService {
  constructor(
    private readonly usersService: UsersService,
    private readonly categoriesService: CategoriesService,
    private readonly branchesService: BranchesService,
  ) {}

  @Command({
    command: 'seed:superadmin',
    describe: 'Seed initial super-admin user',
  })
  async seedSuperAdmin() {
    // First create the default branch
    let defaultBranch;
    try {
      defaultBranch = await this.branchesService.create({
        name: 'Head Office',
        address: 'Sheelter Afrique',
        phone: '+1234567890',
      });
      console.log(`Created default branch: ${defaultBranch.name}`);
    } catch (error) {
      // If branch already exists, find it
      const branches = await this.branchesService.findAll();
      defaultBranch =
        branches.find((b) => b.name === 'Head Office') || branches[0];
      console.log(`Using existing branch: ${defaultBranch?.name}`);
    }

    if (!defaultBranch) {
      console.error('No default branch available. Cannot create super admin.');
      return;
    }

    const superAdmin = {
      name: 'Super Admin',
      email: 'superadmin@example.com',
      password: 'Superadmin123!',
      phone: '+1234567890',
      address: 'Head Office, Sheelter Afrique',
      role: UserRole.SUPER_ADMIN,
      branchId: defaultBranch._id.toString(),
      branch: 'Head Office',
      branchAddress: 'Sheelter Afrique',
    };

    try {
      await this.usersService.create(superAdmin);
      console.log(`Created super admin: ${superAdmin.email}`);
    } catch (error) {
      if (error instanceof ConflictException) {
        console.log(`Super admin already exists: ${superAdmin.email}`);
      } else {
        console.error(
          `Error creating super admin ${superAdmin.email}:`,
          error.message,
        );
      }
    }
  }

  @Command({
    command: 'seed:categories',
    describe: 'Seed initial product categories',
  })
  async seedCategories() {
    // Find the default branch
    const branches = await this.branchesService.findAll();
    const defaultBranch =
      branches.find((b) => b.name === 'Head Office') || branches[0];

    if (!defaultBranch) {
      console.error('No default branch available. Cannot create categories.');
      return;
    }

    const categories = [
      {
        name: 'Marine Board',
        units: ['Sheet'],
        description: 'Marine grade plywood boards',
        branchId: defaultBranch._id.toString(),
      },
      {
        name: 'Binding Wire',
        units: ['Bundle of 20KG', 'Bundle of 10KG'],
        description: 'Steel binding wire for construction',
        branchId: defaultBranch._id.toString(),
      },
      {
        name: 'Rod',
        units: [
          'Length of quarter',
          'Length of 8MM',
          'Length of 10MM',
          'Length of 12MM',
          'Length of 16MM',
          'Length of 20MM',
          'Length of 25MM',
        ],
        description: 'Steel rods for reinforcement',
        branchId: defaultBranch._id.toString(),
      },
      {
        name: 'Nail',
        units: [
          'Bag of 1.5 Inches',
          'Bag of 2 Inches',
          'Bag of 3 Inches',
          'Bag of 4 Inches',
          'Bag of 5 Inches',
          'Bag of Cupper',
          'LBS of 1.5 Inches',
          'LBS of 2 Inches',
          'LBS of 3 Inches',
          'LBS of 4 Inches',
          'LBS of 5 Inches',
          'LBS of Cupper',
        ],
        description: 'Various types and sizes of nails',
        branchId: defaultBranch._id.toString(),
      },
      {
        name: 'BRC',
        units: ['Bundle of 4MM', 'Bundle of 5MM'],
        description: 'BRC mesh for concrete reinforcement',
        branchId: defaultBranch._id.toString(),
      },
      {
        name: 'Cement',
        units: ['Bag of Dangote', 'Bag of Larfarge'],
        description: 'Portland cement for construction',
        branchId: defaultBranch._id.toString(),
      },
    ];

    for (const category of categories) {
      try {
        await this.categoriesService.create(category);
        console.log(`Created category: ${category.name}`);
      } catch (error) {
        if (error instanceof ConflictException) {
          console.log(`Category already exists: ${category.name}`);
        } else {
          console.error(
            `Error creating category ${category.name}:`,
            error.message,
          );
        }
      }
    }
  }

  @Command({
    command: 'seed:maintainer',
    describe: 'Seed initial maintainer user',
  })
  async seedMaintainer() {
    // Find the default branch
    const branches = await this.branchesService.findAll();
    const defaultBranch =
      branches.find((b) => b.name === 'Head Office') || branches[0];

    if (!defaultBranch) {
      console.error('No default branch available. Cannot create maintainer.');
      return;
    }

    const maintainer = {
      name: 'Aniekan Udo',
      email: 'aniekan50k@gmail.com',
      password: 'Maintainer123!',
      phone: '+1234567891',
      address: 'IT Department, Sheelter Afrique',
      role: UserRole.MAINTAINER,
      branchId: defaultBranch._id.toString(),
      branch: 'Head Office',
      branchAddress: 'Sheelter Afrique',
    };

    try {
      await this.usersService.create(maintainer);
      console.log(`Created maintainer: ${maintainer.email}`);
    } catch (error) {
      if (error instanceof ConflictException) {
        console.log(`Maintainer already exists: ${maintainer.email}`);
      } else {
        console.error(
          `Error creating maintainer ${maintainer.email}:`,
          error.message,
        );
      }
    }
  }
}
