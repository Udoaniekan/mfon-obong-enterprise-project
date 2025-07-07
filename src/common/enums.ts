export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  MAINTAINER = 'MAINTAINER',
  STAFF = 'STAFF',
}

export interface BaseDocument {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
}
