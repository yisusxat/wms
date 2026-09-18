import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type RackSeed = { code: string; name: string; rackType: string; levels: number; positions: number };

export const rackDefinitions: RackSeed[] = [
  { code: 'C', name: 'Rack Central', rackType: 'CENTRAL', levels: 2, positions: 15 },
  { code: 'P', name: 'Rack Pared', rackType: 'WALL', levels: 2, positions: 22 },
];

export function buildLocationCodes(aisles = ['A', 'B']) {
  return aisles.flatMap((aisleCode) =>
    rackDefinitions.flatMap((definition) =>
      Array.from({ length: definition.levels }, (_, levelIndex) => levelIndex + 1).flatMap((level) =>
        Array.from({ length: definition.positions }, (_, positionIndex) => positionIndex + 1).map(
          (position) => `${aisleCode}-${definition.code}-${String(level).padStart(2, '0')}-${String(position).padStart(2, '0')}`,
        ),
      ),
    ),
  );
}

export async function main() {
  const warehouse = await prisma.warehouse.upsert({
    where: { code: 'BOD-PRINCIPAL' },
    update: { name: 'Bodega Principal', active: true },
    create: { code: 'BOD-PRINCIPAL', name: 'Bodega Principal' },
  });

  const zone = await prisma.zone.upsert({
    where: { warehouseId_code: { warehouseId: warehouse.id, code: 'GENERAL' } },
    update: {},
    create: { warehouseId: warehouse.id, code: 'GENERAL', name: 'Zona General' },
  });

  let locationCount = 0;
  const expectedCodes = buildLocationCodes();
  for (const aisleCode of ['A', 'B']) {
    const aisle = await prisma.aisle.upsert({
      where: { zoneId_code: { zoneId: zone.id, code: aisleCode } },
      update: {},
      create: { zoneId: zone.id, code: aisleCode, name: `Pasillo ${aisleCode}` },
    });

    for (const definition of rackDefinitions) {
      const rack = await prisma.rack.upsert({
        where: { aisleId_code: { aisleId: aisle.id, code: definition.code } },
        update: { levels: definition.levels, positions: definition.positions },
        create: { aisleId: aisle.id, ...definition },
      });

      for (let level = 1; level <= definition.levels; level += 1) {
        for (let position = 1; position <= definition.positions; position += 1) {
          await prisma.location.upsert({
            where: { code: `${aisleCode}-${definition.code}-${String(level).padStart(2, '0')}-${String(position).padStart(2, '0')}` },
            update: { rackId: rack.id, level, position },
            create: {
              rackId: rack.id,
              code: `${aisleCode}-${definition.code}-${String(level).padStart(2, '0')}-${String(position).padStart(2, '0')}`,
              level,
              position,
            },
          });
          locationCount += 1;
        }
      }
    }
  }

  if (locationCount !== 148 || new Set(expectedCodes).size !== 148) {
    throw new Error(`Seed inválido: se esperaban 148 ubicaciones y códigos únicos`);
  }

  console.log(`Seed completado: ${locationCount} ubicaciones generadas.`);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
