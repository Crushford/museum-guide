import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';

const { Pool } = pkg;

// Use DATABASE_URL from env, fall back to your local Docker Postgres
const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/museum';

// Create a pg connection pool
const pool = new Pool({ connectionString });

// Wrap it in the Prisma adapter
const adapter = new PrismaPg(pool);

// Create a Prisma Client using the adapter (required in Prisma 7)
const client = new PrismaClient({
  adapter,
});

export const prisma = client;
