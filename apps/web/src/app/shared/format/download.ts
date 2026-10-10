import { Capacitor } from '@capacitor/core';
import { nativeBridge } from '../../core/native/bridge';

export async function downloadText(
  filename: string,
  contents: string,
  type = 'text/csv;charset=utf-8',
): Promise<void> {
  if (Capacitor.getPlatform() === 'ios') {
    await nativeBridge.shareText({ filename, contents });
    return;
  }
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: unknown[][]): string {
  return (
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? '');
            if (/^\s*[=+@-]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(','),
      )
      .join('\r\n') + '\r\n'
  );
}
