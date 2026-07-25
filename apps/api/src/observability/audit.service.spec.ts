import type { AuthService } from '../auth/auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AuditService, MAX_IN_MEMORY_AUDIT_EVENTS } from './audit.service';

describe('AuditService', () => {
  it('stores events in memory when Prisma is disabled', async () => {
    const prisma = { isEnabled: false } as PrismaService;
    const auth = {
      ensureUserPersisted: jest.fn(),
    } as unknown as AuthService;
    const service = new AuditService(prisma, auth);

    await service.record({
      userId: 'user-1',
      eventType: 'auth.login',
      payload: { email: 'a@example.com', access_token: 'secret' },
    });

    const events = service.getInMemoryEventsForTests();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('auth.login');
    expect(events[0].payload).toEqual({ email: 'a@example.com' });
    expect(auth.ensureUserPersisted).not.toHaveBeenCalled();
  });

  it('persists through Prisma when enabled', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      isEnabled: true,
      auditEvent: { create },
    } as unknown as PrismaService;
    const auth = {
      ensureUserPersisted: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const service = new AuditService(prisma, auth);

    await service.record({
      userId: 'user-1',
      eventType: 'job.created',
      payload: { job_id: 'j1' },
    });

    expect(auth.ensureUserPersisted).toHaveBeenCalledWith('user-1');
    expect(create).toHaveBeenCalled();
  });

  it('swallows persistence failures', async () => {
    const prisma = {
      isEnabled: true,
      auditEvent: {
        create: jest.fn().mockRejectedValue(new Error('db down')),
      },
    } as unknown as PrismaService;
    const auth = {
      ensureUserPersisted: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const service = new AuditService(prisma, auth);

    await expect(
      service.record({ eventType: 'auth.logout', payload: {} }),
    ).resolves.toBeUndefined();
  });

  it('resets in-memory events for tests', async () => {
    const service = new AuditService(
      { isEnabled: false } as PrismaService,
      { ensureUserPersisted: jest.fn() } as unknown as AuthService,
    );
    await service.record({ eventType: 'job.created' });
    service.resetForTests();
    expect(service.getInMemoryEventsForTests()).toHaveLength(0);
  });

  it('trims the in-memory ring buffer when capacity is exceeded', async () => {
    const service = new AuditService(
      { isEnabled: false } as PrismaService,
      { ensureUserPersisted: jest.fn() } as unknown as AuthService,
    );

    for (let index = 0; index < MAX_IN_MEMORY_AUDIT_EVENTS + 5; index += 1) {
      await service.record({ eventType: `event.${index}` });
    }

    const events = service.getInMemoryEventsForTests();
    expect(events).toHaveLength(MAX_IN_MEMORY_AUDIT_EVENTS);
    expect(events[0].eventType).toBe('event.5');
  });

  it('swallows non-error throwables while recording', async () => {
    const prisma = {
      isEnabled: true,
      auditEvent: {
        create: jest.fn().mockRejectedValue('hard-fail'),
      },
    } as unknown as PrismaService;
    const auth = {
      ensureUserPersisted: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const service = new AuditService(prisma, auth);

    await expect(
      service.record({ eventType: 'auth.login' }),
    ).resolves.toBeUndefined();
  });
});
