import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./core/auth/login.page').then((module) => module.LoginPage),
  },
  {
    path: 'backtests',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/backtests/pages/backtest-list.page').then(
            (module) => module.BacktestListPage,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/backtests/pages/backtest-new.page').then(
            (module) => module.BacktestNewPage,
          ),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/backtests/pages/backtest-detail.page').then(
            (module) => module.BacktestDetailPage,
          ),
      },
    ],
  },
  {
    path: 'strategies',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/strategies/strategies-placeholder.page').then(
        (module) => module.StrategiesPlaceholderPage,
      ),
  },
  { path: '', pathMatch: 'full', redirectTo: 'backtests' },
  { path: '**', redirectTo: 'backtests' },
];
