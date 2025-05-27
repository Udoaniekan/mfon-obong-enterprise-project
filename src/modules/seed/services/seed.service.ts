import { Command } from 'nestjs-command';
import { ConflictException, Injectable } from '@nestjs/common';
import { UsersService } from '../../users/services/users.service';
import { ProductsService } from '../../products/services/products.service';
import { ClientsService } from '../../clients/services/clients.service';
import { UserRole, PackagingUnit } from '../../../common/enums';

@Injectable()
export class SeedService {
  constructor(
    private readonly usersService: UsersService,
    private readonly productsService: ProductsService,
    private readonly clientsService: ClientsService,
  ) {}

  @Command({
    command: 'seed:all',
    describe: 'Seed all data',
  })
  async seedAll() {
    await this.seedUsers();
    await this.seedProducts();
    await this.seedClients();
  }

  @Command({
  command: 'seed:users',
  describe: 'Seed only 2 super-admin users',
})
async seedUsers() {
  const superAdmins = [
    {
      name: 'Super Admin One',
      email: 'superadmin1@example.com',
      password: 'superadmin123',
      role: UserRole.SUPER_ADMIN,
    },
    {
      name: 'Super Admin Two',
      email: 'superadmin2@example.com',
      password: 'superadmin456',
      role: UserRole.SUPER_ADMIN,
    },
  ];

  for (const user of superAdmins) {
    try {
      await this.usersService.create(user);
      console.log(`Created super admin: ${user.email}`);
    } catch (error) {
      if (error instanceof ConflictException) {
        console.log(`Super admin already exists: ${user.email}`);
      } else {
        console.error(`Error creating super admin ${user.email}:`, error.message);
      }
    }
  }
}

  @Command({
    command: 'seed:products',
    describe: 'Seed products data',
  })
  async seedProducts() {
    const products = [
      {
        name: 'Cement',
        type: 'Building Materials',
        primaryUnit: PackagingUnit.BAG,
        secondaryUnit: PackagingUnit.POUND,
        conversionRate: 110,
        primaryUnitPrice: 4500,
        secondaryUnitPrice: 45,
        primaryUnitStock: 100,
        secondaryUnitStock: 550,
        minStockLevel: 20,
        bulkPrices: [
          { quantity: 10, price: 4300 },
          { quantity: 50, price: 4000 },
        ],
      },
      {
        name: 'Sand',
        type: 'Building Materials',
        primaryUnit: PackagingUnit.BAG,
        primaryUnitPrice: 2000,
        primaryUnitStock: 200,
        minStockLevel: 50,
        bulkPrices: [
          { quantity: 20, price: 1800 },
          { quantity: 100, price: 1600 },
        ],
      },
      {
        name: 'Steel Rods',
        type: 'Construction',
        primaryUnit: PackagingUnit.PIECE,
        primaryUnitPrice: 3500,
        primaryUnitStock: 500,
        minStockLevel: 100,
        bulkPrices: [
          { quantity: 50, price: 3300 },
          { quantity: 200, price: 3000 },
        ],
      },
    ];

    for (const product of products) {
      try {
        await this.productsService.create(product);
        console.log(`Created product: ${product.name}`);
      } catch (error) {
        console.error(`Error creating product ${product.name}:`, error.message);
      }
    }
  }

  @Command({
    command: 'seed:clients',
    describe: 'Seed clients data',
  })
  async seedClients() {
    const clients = [
      {
        name: 'John Construction Ltd',
        phone: '2348012345678',
        email: 'john@construction.com',
        address: '123 Builder Street',
        isRegistered: true,
      },
      {
        name: 'Sarah Builders',
        phone: '2348087654321',
        email: 'sarah@builders.com',
        address: '456 Constructor Avenue',
        isRegistered: true,
      },
      {
        name: 'Mike Contractors',
        phone: '2348023456789',
        email: 'mike@contractors.com',
        address: '789 Project Road',
        isRegistered: true,
      },
    ];

    for (const client of clients) {
      try {
        await this.clientsService.create(client);
        console.log(`Created client: ${client.name}`);
      } catch (error) {
        if (error.code === 11000) {
          console.log(`Client already exists: ${client.name}`);
        } else {
          console.error(`Error creating client ${client.name}:`, error.message);
        }
      }
    }
  }
}
