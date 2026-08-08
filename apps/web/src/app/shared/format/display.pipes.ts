import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'bsCurrency' })
export class BsCurrencyPipe implements PipeTransform {
  transform(value: string | null | undefined, fallback = '—'): string {
    if (value == null || value === '') return fallback;
    const amount = Number(String(value).replace(/^\+/, ''));
    if (!Number.isFinite(amount)) return fallback;
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
}

@Pipe({ name: 'bsDateTime' })
export class BsDateTimePipe implements PipeTransform {
  transform(value: string | null | undefined, fallback = '—'): string {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }
}

@Pipe({ name: 'bsSigned' })
export class BsSignedPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (value == null || value === '') return '';
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '';
    if (amount > 0) return `+${value}`;
    return value;
  }
}
