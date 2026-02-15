require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const pkg = require('pg');

const { Pool } = pkg;

async function main() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/museum';

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminGoogleSub = (process.env.ADMIN_GOOGLE_SUB || '').trim();
  const adminDisplayName = (process.env.ADMIN_DISPLAY_NAME || '').trim();

  if (!adminEmail) {
    throw new Error('ADMIN_EMAIL is required.');
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const existing = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: { id: true, email: true, role: true },
    });

    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: { role: 'ADMIN' },
        select: { id: true, email: true, role: true },
      });
      console.log('Promoted existing user to admin:', updated);
      return;
    }

    if (!adminGoogleSub) {
      throw new Error(
        'User not found by ADMIN_EMAIL. Set ADMIN_GOOGLE_SUB to create an admin user.'
      );
    }

    const created = await prisma.user.create({
      data: {
        email: adminEmail,
        googleSub: adminGoogleSub,
        displayName: adminDisplayName || null,
        role: 'ADMIN',
        tier: 'PREMIUM',
      },
      select: { id: true, email: true, role: true, tier: true },
    });
    console.log('Created admin user:', created);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

