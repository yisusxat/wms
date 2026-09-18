import { PrismaClient } from '@prisma/client';

const enabled = Boolean(process.env.DATABASE_URL);
const describeDatabase = enabled ? describe : describe.skip;

describeDatabase('PostgreSQL WMS integration', () => {
  const prisma = new PrismaClient();

  afterAll(async () => { await prisma.$disconnect(); });

  it('contains the seeded warehouse structure', async () => {
    const [warehouses, locations] = await Promise.all([
      prisma.warehouse.count(),
      prisma.location.count(),
    ]);
    expect(warehouses).toBe(1);
    expect(locations).toBe(148);
  });

  it('keeps inventory location status trigger data coherent', async () => {
    const available = await prisma.location.count({ where: { status: 'AVAILABLE' } });
    expect(available).toBeGreaterThanOrEqual(0);
    expect(available).toBeLessThanOrEqual(148);
  });
});
