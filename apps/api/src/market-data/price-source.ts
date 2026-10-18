/** Classify the exact bar set shown or tested, including seed rows stored in MySQL. */
export function classifyPriceSource(
  bars: readonly { provider?: string }[],
): string {
  const providers = new Set(
    bars.map((bar) => bar.provider?.trim().toLowerCase()).filter(Boolean),
  );
  if (providers.size === 0 || bars.some((bar) => !bar.provider?.trim())) {
    return 'unknown';
  }
  return providers.size === 1 ? [...providers][0]! : 'mixed';
}

/** Preserve whether a completed run included generated seed prices in mixed data. */
export function classifyRunPriceSource(
  bars: readonly { provider?: string }[],
): string {
  const source = classifyPriceSource(bars);
  const includesSeed = bars.some(
    (bar) => bar.provider?.trim().toLowerCase() === 'seed',
  );
  if (includesSeed && source === 'mixed') return 'mixed_with_seed';
  if (includesSeed && source === 'unknown') return 'unknown_with_seed';
  return source;
}
