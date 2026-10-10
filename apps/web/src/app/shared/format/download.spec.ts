import { downloadText } from './download';
const share = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios' },
  registerPlugin: () => ({ shareText: share }),
}));

describe('iOS export', () => {
  afterEach(() => share.mockReset());
  it('sends the generated export to the native share sheet', async () => {
    await downloadText('backtest-results.csv', 'metric,value\nreturn,3');
    expect(share).toHaveBeenCalledWith({
      filename: 'backtest-results.csv',
      contents: 'metric,value\nreturn,3',
    });
  });
  it('returns native export errors to the page', async () => {
    share.mockRejectedValue(new Error('Export failed'));
    await expect(downloadText('backtest-results.csv', 'data')).rejects.toThrow('Export failed');
  });
});
