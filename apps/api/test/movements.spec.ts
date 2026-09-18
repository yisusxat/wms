import { MovementsService } from '../src/movements/movements.service';

describe('MovementsService', () => {
  it('returns the movement id created by the adjustment transaction', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ movementId: 'movement-1' }]);
    const service = new MovementsService({ $queryRaw: queryRaw } as never);

    const result = await service.adjustment({
      productId: 'product-1', locationId: 'location-1', delta: -3,
      reason: 'Conteo físico', reference: 'COUNT-1',
    }, 'user-1');

    expect(result).toEqual({ movementId: 'movement-1' });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
