// E2E tests assume in-memory seed mode (Sprint 1.x). Force test env so Prisma
// stays disabled even when the developer shell exports DATABASE_URL from .env.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
delete process.env.DATABASE_URL;

// Milestone 6 Kernel defaults for stub-mode e2e (no OpenAI key required).
process.env.AI_ENABLED = process.env.AI_ENABLED ?? 'true';
process.env.AI_PROVIDER = process.env.AI_PROVIDER ?? 'stub';
process.env.AI_MODEL = process.env.AI_MODEL ?? 'gpt-4.1-mini';
process.env.AI_DAILY_CALL_LIMIT = process.env.AI_DAILY_CALL_LIMIT ?? '20';
