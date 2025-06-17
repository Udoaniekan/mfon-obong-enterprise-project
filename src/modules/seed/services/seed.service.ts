import { Command } from 'nestjs-command';
import { ConflictException, Injectable } from '@nestjs/common';
import { UsersService } from '../../users/services/users.service';
import { CategoriesService } from '../../categories/services/categories.service';
import { UserRole } from '../../../common/enums';

@Injectable()
export class SeedService {
  constructor(
    private readonly usersService: UsersService,
    private readonly categoriesService: CategoriesService,
  ) {}

  @Command({
    command: 'seed:superadmin',
    describe: 'Seed initial super-admin user',
  })
  async seedSuperAdmin() {
    const superAdmin = {
      name: 'Super Admin',
      email: 'superadmin@example.com',
      password: 'superadmin123',
      role: UserRole.SUPER_ADMIN,
      branch: 'HEAD_OFFICE',
    };

    try {
      await this.usersService.create(superAdmin);
      console.log(`Created super admin: ${superAdmin.email}`);
    } catch (error) {
      if (error instanceof ConflictException) {
        console.log(`Super admin already exists: ${superAdmin.email}`);
      } else {
        console.error(`Error creating super admin ${superAdmin.email}:`, error.message);
      }
    }
  }

  @Command({
    command: 'seed:categories',
    describe: 'Seed initial product categories',
  })
  async seedCategories() {
    const categories = [
      {
        name: 'Marine Board',
        units: ['Sheet'],
        description: 'Marine grade plywood boards',
      },
      {
        name: 'Binding Wire',
        units: ['Bundle of 20KG', 'Bundle of 10KG'],
        description: 'Steel binding wire for construction',
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
      },
      {
        name: 'BRC',
        units: ['Bundle of 4MM', 'Bundle of 5MM'],
        description: 'BRC mesh for concrete reinforcement',
      },
      {
        name: 'Cement',
        units: ['Bag of Dangote', 'Bag of Larfarge'],
        description: 'Portland cement for construction',
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
          console.error(`Error creating category ${category.name}:`, error.message);
        }
      }
    }
  }
}
