import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { environment } from '../environments/environment';
import type { NativeBuildInfo } from './core/native/build-info';

describe('App', () => {
  const originalMode = environment.nativeMode;
  const originalBuild = environment.nativeBuild;

  afterEach(() => {
    environment.nativeMode = originalMode;
    environment.nativeBuild = originalBuild;
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the product brand', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand')?.getAttribute('aria-label')).toBe('BitStockerz home');
    expect(compiled.querySelector('.brand-logo')?.getAttribute('src')).toBe(
      '/brand/logo-light.png',
    );
    expect(compiled.querySelector('.brand source')?.getAttribute('srcset')).toBe(
      '/brand/logo-dark.png',
    );
  });

  it.each(['staging', 'production'])(
    'does not label a %s build as a local simulated-price prototype',
    async (mode) => {
      environment.nativeMode = 'device';
      environment.nativeBuild = { mode } as NativeBuildInfo;
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const compiled = fixture.nativeElement as HTMLElement;

      expect(compiled.querySelector('.prototype-notice')).toBeNull();
      expect(compiled.textContent).not.toContain('Local API uses simulated prices');
    },
  );

  it.each([
    ['simulator', 'Simulator email login is for local testing only.'],
    ['device-demo', 'Personal Team demo · Test login only; native passkeys deferred.'],
  ] as const)('keeps the %s testing notice visible', async (mode, notice) => {
    environment.nativeMode = mode;
    environment.nativeBuild = undefined;
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.prototype-notice')?.textContent).toContain(notice);
  });
});
