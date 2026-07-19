// E2E tests assume in-memory seed mode (Sprint 1.x). Force test env so Prisma
// stays disabled even when the developer shell exports DATABASE_URL from .env.
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
