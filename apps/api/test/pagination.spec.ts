import { paginated, pagination } from '../src/common/pagination';

describe('pagination', () => {
  it('normalizes page size and calculates offsets', () => {
    expect(pagination(0, 500)).toEqual({ page: 1, pageSize: 100, skip: 0 });
    expect(pagination(3, 25)).toEqual({ page: 3, pageSize: 25, skip: 50 });
  });

  it('returns a stable paginated envelope', () => {
    expect(paginated(['a', 'b'], 52, 2, 25)).toEqual({
      items: ['a', 'b'],
      total: 52,
      page: 2,
      pageSize: 25,
      pageCount: 3,
    });
  });
});
