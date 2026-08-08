/** Retain one client order id until inputs change or a terminal response arrives. */
export function nextClientOrderId(
  previous: string,
  inputsChanged: boolean,
  terminalResponse: boolean,
): string {
  if (inputsChanged || terminalResponse || !previous) {
    return crypto.randomUUID();
  }
  return previous;
}
