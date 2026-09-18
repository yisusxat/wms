import { buildLocationCodes } from '../prisma/seed';

describe('warehouse seed', () => {
  const codes = buildLocationCodes();

  it('generates exactly 148 unique locations', () => {
    expect(codes).toHaveLength(148);
    expect(new Set(codes).size).toBe(148);
  });

  it('includes both rack families and both aisles', () => {
    expect(codes).toContain('A-C-01-01');
    expect(codes).toContain('A-P-02-22');
    expect(codes).toContain('B-C-02-15');
    expect(codes).toContain('B-P-01-01');
  });
});
