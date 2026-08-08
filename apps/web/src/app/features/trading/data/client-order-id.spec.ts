import { nextClientOrderId } from './client-order-id';

describe('nextClientOrderId', () => {
  it('retains the same id until inputs change or a terminal response arrives', () => {
    const first = '11111111-1111-4111-8111-111111111111';
    expect(nextClientOrderId(first, false, false)).toBe(first);
    expect(nextClientOrderId(first, true, false)).not.toBe(first);
    expect(nextClientOrderId(first, false, true)).not.toBe(first);
  });
});
