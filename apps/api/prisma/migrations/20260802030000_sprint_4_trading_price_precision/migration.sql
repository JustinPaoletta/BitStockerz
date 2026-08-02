-- Keep trading prices compatible with the 12-integer-digit market-data range
-- while retaining eight fractional digits for fills and weighted averages.
ALTER TABLE `positions`
  MODIFY `avg_cost` DECIMAL(20, 8) NOT NULL;

ALTER TABLE `orders`
  MODIFY `avg_fill_price` DECIMAL(20, 8) NULL;

ALTER TABLE `executions`
  MODIFY `price` DECIMAL(20, 8) NOT NULL;
