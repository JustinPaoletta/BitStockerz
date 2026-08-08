import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { strategyEditorCanDeactivate } from './features/strategies/pages/strategy-editor.page';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./core/auth/login.page').then((module) => module.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((module) => module.DashboardPage),
      },
      {
        path: 'trade',
        loadComponent: () =>
          import('./features/trading/pages/trading-workspace.page').then(
            (module) => module.TradingWorkspacePage,
          ),
      },
      {
        path: 'strategies',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/strategies/pages/strategy-list.page').then(
                (module) => module.StrategyListPage,
              ),
          },
          {
            path: 'new',
            canDeactivate: [strategyEditorCanDeactivate],
            loadComponent: () =>
              import('./features/strategies/pages/strategy-editor.page').then(
                (module) => module.StrategyEditorPage,
              ),
          },
          {
            path: ':id/edit',
            canDeactivate: [strategyEditorCanDeactivate],
            loadComponent: () =>
              import('./features/strategies/pages/strategy-editor.page').then(
                (module) => module.StrategyEditorPage,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/strategies/pages/strategy-detail.page').then(
                (module) => module.StrategyDetailPage,
              ),
          },
        ],
      },
      {
        path: 'backtests',
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
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
