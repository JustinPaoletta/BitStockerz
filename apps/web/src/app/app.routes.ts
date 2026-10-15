import { Routes } from '@angular/router';
import { environment } from '../environments/environment';

import { authGuard } from './core/auth/auth.guard';
import { strategyEditorCanDeactivate } from './features/strategies/pages/strategy-editor.page';

const landingPage = environment.nativeMode === 'web' ? 'dashboard' : 'research';

export const routes: Routes = [
  {
    path: 'help',
    loadComponent: () => import('./features/help/help.page').then((module) => module.HelpPage),
  },
  { path: 'data-policy', redirectTo: 'help', pathMatch: 'full' },
  {
    path: 'auth/oauth/callback',
    loadComponent: () =>
      import('./core/auth/oauth-callback.page').then((module) => module.OAuthCallbackPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./core/auth/login.page').then((module) => module.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: 'research',
        loadComponent: () =>
          import('./features/research/research.page').then((m) => m.ResearchPage),
      },
      {
        path: 'automations',
        loadComponent: () =>
          import('./features/automation/automation.page').then((module) => module.AutomationPage),
      },
      {
        path: 'market',
        loadComponent: () =>
          import('./features/market/market.page').then((module) => module.MarketPage),
      },
      {
        path: 'account/data',
        loadComponent: () =>
          import('./features/profile/account-data.page').then((module) => module.AccountDataPage),
      },
      {
        path: 'account/security',
        loadComponent: () =>
          import('./features/profile/security.page').then((module) => module.SecurityPage),
      },
      { path: '', pathMatch: 'full', redirectTo: landingPage },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile.page').then((module) => module.ProfilePage),
      },
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
            path: 'compare',
            loadComponent: () =>
              import('./features/backtests/pages/backtest-compare.page').then(
                (module) => module.BacktestComparePage,
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
  { path: '**', redirectTo: landingPage },
];
