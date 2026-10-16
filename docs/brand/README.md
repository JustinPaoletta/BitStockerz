# BitStockerz identity

The approved logo combines three dotted-outline candlesticks with an open,
three-color ring. The full lockup spells **BitStockerz**: `Bit` and `erz` use
black in light mode and white in dark mode; `Stock` and the lower ring use
lime. The upper-right ring and third candle use turquoise. The app icon uses
the mark without the wordmark.

## Source and exports

- [`approved-logo.png`](approved-logo.png) is the selected visual reference.
- `apps/web/public/brand/logo-light.png` and `logo-dark.png` are transparent
  2× header-sized lockups for light and dark surfaces. `logo.png` is a
  light-mode alias. Keep the full-resolution approved artwork in this guide.
- `apps/web/public/brand/mark-light.png` and `mark-dark.png` are transparent
  standalone marks for secondary use.
- `apps/web/public/favicon-light.png`, `favicon-dark.png`, `favicon.ico`, and
  `apple-touch-icon.png` are browser and Home Screen exports.
- `apps/web/ios/App/App/Assets.xcassets/AppIcon.appiconset` contains 1024 px
  light and dark iOS app icons. `Splash.imageset` contains matching launch art.

The Angular header uses the full lockup. The login illustration and native
app icon use the standalone mark. Browser icons, the launch screen, and the
page theme follow the device's light/dark preference. Keep the clear space
around the mark at least one eighth of its width; do not stretch, rotate, or
recolor individual candles.

## Brand colors

| Role                        | Value     |
| --------------------------- | --------- |
| Black, light-mode lettering | `#000000` |
| White, dark-mode lettering  | `#FFFFFF` |
| Lime                        | `#C4DD2E` |
| Turquoise                   | `#00D1C4` |

These are solid values sampled from the approved artwork. In-app surfaces,
borders, and semantic status colors are derived from them or selected for
contrast. Small lime or turquoise text on a white surface uses darker
`--accent-text` or `--secondary-accent-text` tokens so it remains legible.
Losses and errors retain a separate red semantic color and a text label.
All shared theme values live in `apps/web/src/styles.css`; canvas charts read
the computed values from the same tokens.

## Usage

Keep the full lockup readable and use the mark when the wordmark cannot fit,
such as an app icon. Prose uses **BitStockerz**. Describe research,
backtesting, and paper trading without suggesting actual trades or promising
investment results.

## Page previews

These screenshots were captured from the local seed API with a disposable
`example.invalid` account and simulated prices. They show the app as rendered
at desktop width, plus a 390 px mobile market view; they are not live market data.

| Page | Light | Dark |
| ---- | ----- | ---- |
| Sign in | [Preview](screenshots/login-light.png) | [Preview](screenshots/login-dark.png) |
| Dashboard | [Preview](screenshots/dashboard-light.png) | [Preview](screenshots/dashboard-dark.png) |
| Market chart | [Preview](screenshots/market-light.png) | [Preview](screenshots/market-dark.png) |
| Backtest result | [Preview](screenshots/backtest-result-light.png) | [Preview](screenshots/backtest-result-dark.png) |

Also see the [backtest setup](screenshots/backtest-setup-light.png) and
[mobile market](screenshots/market-mobile-light.png) previews.
