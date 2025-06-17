export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
}

export interface BaseDocument {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
}
