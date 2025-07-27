import { registerAs } from '@nestjs/config';

// export default () => ({
//   MONGODB_URI: process.env.MONGODB_URI,
//   JWT_SECRET: process.env.JWT_SECRET,
//   JWT_EXPIRATION: process.env.JWT_EXPIRATION,
// });

export const databaseConfig = registerAs('database', () => ({
  uri: process.env.MONGODB_URI,
  dbName: process.env.MONGODB_DB_NAME,
}));

export const jwtConfig = registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRATION,
}));
