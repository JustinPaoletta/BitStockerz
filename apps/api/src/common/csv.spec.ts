import { csv } from './csv';
describe('CSV downloads', () => {
  it('escapes quotes, newlines and formulas while retaining negative numbers', () => {
    expect(
      csv([
        ['a"b', 'line\nnext', '=cmd', ' +formula', '@SUM(A1)', -12.25, null],
      ]),
    ).toBe(
      '"a""b","line\nnext","\'=cmd","\' +formula","\'@SUM(A1)","-12.25",""\r\n',
    );
  });
});
