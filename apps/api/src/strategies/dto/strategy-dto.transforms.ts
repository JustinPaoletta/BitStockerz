import type { TransformFnParams } from 'class-transformer';

export function trimRawStringValue(params: TransformFnParams): unknown {
  const candidate = readRawValue(params);
  return typeof candidate === 'string' ? candidate.trim() : candidate;
}

export function preserveRawValue(params: TransformFnParams): unknown {
  return readRawValue(params);
}

function readRawValue({ key, obj, value }: TransformFnParams): unknown {
  if (
    typeof key === 'string' &&
    typeof obj === 'object' &&
    obj !== null &&
    Object.prototype.hasOwnProperty.call(obj, key)
  ) {
    return (obj as Record<string, unknown>)[key];
  }

  return value;
}
