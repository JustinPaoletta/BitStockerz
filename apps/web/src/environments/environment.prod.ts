export const environment = {
  production: true,
  /**
   * Same-origin /api requests pass through Vercel Deployment Protection and
   * the server-side beta proxy. Never put the shared proxy key in this bundle.
   */
  nativeMode: 'web' as 'web' | 'simulator' | 'device',
  apiBaseUrl: '',
};
