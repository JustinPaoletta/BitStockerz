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

## Product language

The landing headline is **“Test your ideas. Build on evidence.”** Describe a
backtest as a simulation over a past dataset: it may support, weaken, or leave
an idea unresolved. Do not imply that a test has established an advantage.

Keep these terms distinct across the interface, exports, and help text:

| Term          | Meaning                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| Strategy      | A saved set of trading rules.                                           |
| Backtest      | A simulation of a strategy over a past dataset.                         |
| Order         | An instruction to buy or sell; it may remain unfilled.                  |
| Fill          | An execution of all or part of an order.                                |
| Closed trade  | One completed entry-and-exit cycle under the backtest's counting rules. |
| Position      | An open holding or exposure.                                            |
| Paper account | An account funded with simulated money.                                 |

Label generated prices as **simulated prices**, including when seed bars have
been stored in a database. A backtest can use recorded prices while its trades
remain simulated. Show unavailable metrics as unavailable when their
calculation has no valid denominator, and distinguish the requested test period
from the bars actually evaluated.

## Page previews

These screenshots were captured from the local seed API with a disposable
`example.invalid` account and simulated prices. They show the app as rendered
at desktop width, plus 390 px mobile market and backtest views; they are not live market data. “Brand Preview” in the header is the disposable test account’s display name.

| Page            | Light                                            | Dark                                            |
| --------------- | ------------------------------------------------ | ----------------------------------------------- |
| Sign in         | [Preview](screenshots/login-light.png)           | [Preview](screenshots/login-dark.png)           |
| Create account  | [Preview](screenshots/register-light.png)        | —                                               |
| Dashboard       | [Preview](screenshots/dashboard-light.png)       | [Preview](screenshots/dashboard-dark.png)       |
| Market chart    | [Preview](screenshots/market-light.png)          | [Preview](screenshots/market-dark.png)          |
| Backtest result | [Preview](screenshots/backtest-result-light.png) | [Preview](screenshots/backtest-result-dark.png) |

Also see the [backtest setup](screenshots/backtest-setup-light.png),
[mobile market](screenshots/market-mobile-light.png), and
[mobile backtest result](screenshots/backtest-result-mobile-light.png) previews.
