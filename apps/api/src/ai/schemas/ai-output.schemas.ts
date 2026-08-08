import { z } from 'zod';

const codeSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
  .max(64);

const severitySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const explainStrategyOutputSchema = z.object({
  explanation: z.string().min(1).max(4000),
  warnings: z
    .array(
      z.object({
        code: codeSchema,
        severity: severitySchema,
        message: z.string().min(1).max(500),
        evidence_paths: z.array(z.string().min(1).max(200)).max(10),
      }),
    )
    .max(10),
});

export const validateStrategyOutputSchema = z.object({
  warnings: z
    .array(
      z.object({
        code: codeSchema,
        severity: severitySchema,
        message: z.string().min(1).max(500),
        evidence_paths: z.array(z.string().min(1).max(200)).max(10),
      }),
    )
    .max(10),
});

export const explainBacktestOutputSchema = z.object({
  explanation: z.string().min(1).max(4000),
  issues: z
    .array(
      z.object({
        code: codeSchema,
        severity: severitySchema,
        message: z.string().min(1).max(500),
        evidence: z.array(z.string().min(1).max(200)).max(10),
      }),
    )
    .max(10),
});

export const suggestImprovementsOutputSchema = z.object({
  suggestions: z
    .array(
      z.object({
        code: codeSchema,
        title: z.string().min(1).max(120),
        description: z.string().min(1).max(1000),
        evidence: z.array(z.string().min(1).max(200)).max(10),
      }),
    )
    .max(5),
});
