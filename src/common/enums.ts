export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
}

export enum PackagingUnit {
  BAG = 'BAG',
  CARTON = 'CARTON',
  POUND = 'POUND',
  PIECE = 'PIECE',
}

export interface BaseDocument {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
}
