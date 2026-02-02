/**
 * RFC 7807 Problem Details + BitStockerz extensions.
 * All error responses use this shape.
 */
export interface FieldError {
  field: string;
  reason: string;
}

export interface ProblemDetailsDto {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  requestId: string;
  fieldErrors?: FieldError[];
}
