/** RFC 4180 quoting plus spreadsheet formula neutralization for user-controlled text. */
export function csv(
  rows: (string | number | boolean | null | undefined)[][],
): string {
  return (
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? '');
            if (/^\s*[=+@-]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text))
              text = `'${text}`;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(','),
      )
      .join('\r\n') + '\r\n'
  );
}
