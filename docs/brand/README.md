# BitStockerz / Offset identity

The Offset symbol uses two opposing, stepped forms to suggest bid and ask,
iteration, and the exchange between an idea and evidence. Its open center and
45-degree cuts give it a recognizable silhouette without a surrounding badge.

## Assets

- `apps/web/public/brand/mark.svg`: citron master mark on transparent ground.
- `apps/web/public/brand/mark-mono.svg`: ivory version for dark backgrounds.
- `apps/web/public/brand/mark-light.svg`: ink version for light backgrounds.
- `apps/web/public/favicon.svg`: inset symbol on an ink tile for browser tabs.
- `docs/brand/identity.svg`: overview of the lockup, variants, and palette.

Use the standalone symbol at 24 px or larger; use the dedicated favicon at
16 px. Keep clear space of at least one quarter of the symbol width. Do not
stretch, rotate, outline, add effects, or place the master mark in a badge.
The PNG at `public/brand/logo.png` and the ICO favicon are matching raster exports
for compatibility. Use the SVG master for new work.

The visual wordmark is lowercase **bitstockerz**, set in Helvetica/Arial with
close spacing and medium weight. Prose retains **BitStockerz**. The header
uses a simple mark-and-name lockup without a miniature tagline.

## Palette

| Role                                 | Color     |
| ------------------------------------ | --------- |
| Citron / identity and primary action | `#D7F86B` |
| Hover                                | `#E5FF97` |
| Ink / background                     | `#10120F` |
| Surface                              | `#181B16` |
| Raised surface                       | `#22261E` |
| Border                               | `#363C30` |
| Chalk / primary text                 | `#F3F4ED` |
| Muted text                           | `#ACB3A3` |
| Positive data                        | `#80E8C0` |
| Negative data                        | `#FF7B87` |

Citron identifies the product and actions; positive/negative values retain
separate semantic colors and text labels. Use dark text on citron buttons.

## Voice and typography

**Find your edge. Then test it.** Be concise and process-oriented. Describe
research, backtesting, and paper trading without promising financial results.

Use Helvetica Neue, Helvetica, Arial, and sans-serif fallbacks. Keep display
headings medium weight, with tabular numerals for data. Use the symbol's angular
geometry as the decorative motif instead of fictional performance charts.

## References

Reviewed [Linear](https://linear.app/brand) and
[Vercel](https://vercel.com/geist/brands) for clear-space discipline, compact
silhouettes, monochrome resilience, and wordmark/symbol hierarchy. The Offset
artwork is constructed for BitStockerz; no reference logo assets are included.

## Application coverage

Dashboard, Trade, Strategy Lab, Backtests, authentication, AI panels, and symbol search use shared CSS tokens.
Loading, empty, and error states use the same tokens. Canvas charts read those same
tokens through computed styles. Keep new component colors in `src/styles.css`;
do not introduce independent palette hex values in component styles. Citron is
for actions and brand emphasis; mint and rose retain gain/loss meaning.
