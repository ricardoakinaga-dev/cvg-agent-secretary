const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/db/index.js', () => ({ query: mockQuery }));

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HandoffRepository,
  handoffRepository,
  type HandoffRow,
  type OperationalRuleRow,
  type NotificationRow,
} from '../../src/modules/handoff/repository';
import {
  FollowupRepository,
  followupRepository,
  type FollowupTask,
} from '../../src/modules/handoff/followupRepository';
import {
  createFollowupTask,
  createHandoff,
  getOperationalRules,
  notifySector,
} from '../../src/modules/handoff/tools';

const now = new Date('2026-02-03T04:05:06.000Z');

function handoffRow(overrides: Partial<HandoffRow> = {}): HandoffRow {
  return {
    id: 'handoff-1', conversation_id: 'conv-1', contact_id: null,
    trigger_type: 'risk', trigger_reason: 'clinical risk', status: 'pending',
    priority: 'high', summary: null, pending_questions: ['question'],
    what_was_answered: null, what_is_missing: null, risk_level: 'high',
    created_at: now, completed_at: null, resolved_by: null,
    resolution_notes: null, ...overrides,
  };
}

function ruleRow(overrides: Partial<OperationalRuleRow> = {}): OperationalRuleRow {
  return {
    id: 'rule-1', rule_type: 'policy', name: 'Policy', description: null,
    content: { enabled: true }, is_active: true, priority: 10,
    effective_from: now, effective_to: null, created_by: null, created_at: now,
    ...overrides,
  };
}

function notificationRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'notification-1', sector: 'clinico', conversation_id: null,
    contact_id: null, message: 'Review', priority: 'medium', status: 'pending',
    sent_at: null, read_at: null, created_at: now, ...overrides,
  };
}

function followupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1', conversation_id: null, contact_id: null, task_type: 'callback',
    title: 'Call back', description: null, due_date: null, priority: 'medium',
    status: 'pending', assigned_to: null, completed_at: null, completed_by: null,
    created_at: now, ...overrides,
  };
}

describe('handoff repository coverage', () => {
  const repository = new HandoffRepository();
  beforeEach(() => vi.clearAllMocks());

  it('creates and maps a handoff with tenant-safe defaults', async () => {
    mockQuery.mockResolvedValue({ rows: [handoffRow({ pending_questions: null as unknown as string[] })] });

    const result = await repository.create({
      conversationId: 'conv-1', triggerType: 'risk', triggerReason: 'reason',
    });

    expect(mockQuery.mock.calls[0][1]).toEqual([
      '1', 'conv-1', null, 'risk', 'reason', 'medium', null, '[]', null, null, 'low',
    ]);
    expect(result.pendingQuestions).toEqual([]);
  });

  it('finds the latest handoff and returns null when absent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [handoffRow()] }).mockResolvedValueOnce({ rows: [] });
    await expect(repository.findByConversation('conv-1')).resolves.toEqual(
      expect.objectContaining({ id: 'handoff-1', conversationId: 'conv-1' }),
    );
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 'conv-1']);
    await expect(repository.findByConversation('missing')).resolves.toBeNull();
  });

  it('updates status and rejects a missing handoff', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [handoffRow({ status: 'completed' })] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(repository.updateStatus('handoff-1', 'completed', 'agent', 'done'))
      .resolves.toEqual(expect.objectContaining({ status: 'completed' }));
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 'completed', 'completed', 'agent', 'done', 'handoff-1']);
    await expect(repository.updateStatus('missing', 'cancelled')).rejects.toThrow('Handoff not found');
  });

  it('cancels active handoffs and handles a null row count', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: null });
    await expect(repository.cancelPendingByConversation('conv-1', 'expired')).resolves.toBe(0);
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 'conv-1', 'system', 'expired']);
  });

  it('gets operational rules with and without a type', async () => {
    mockQuery.mockResolvedValue({ rows: [ruleRow()] });

    await expect(repository.getOperationalRules('policy')).resolves.toEqual([
      expect.objectContaining({ id: 'rule-1', ruleType: 'policy', content: { enabled: true } }),
    ]);
    expect(mockQuery.mock.calls[0][0]).toContain('rule_type = $2');
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 'policy']);

    await repository.getOperationalRules();
    expect(mockQuery.mock.calls[1][0]).not.toContain('rule_type = $2');
    expect(mockQuery.mock.calls[1][1]).toEqual(['1']);
  });

  it('creates and updates sector notifications', async () => {
    mockQuery.mockResolvedValue({ rows: [notificationRow()] });
    await expect(repository.createNotification({ sector: 'clinico', message: 'Review' }))
      .resolves.toEqual(expect.objectContaining({ id: 'notification-1', sector: 'clinico' }));
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 'clinico', null, null, 'Review', 'medium']);

    await repository.updateNotificationStatus('notification-1', 'read');
    expect(mockQuery.mock.calls[1][1]).toEqual(['1', 'read', 'notification-1']);
  });

  it.each([
    ['create', () => repository.create({ conversationId: 'c', triggerType: 't', triggerReason: 'r' })],
    ['find', () => repository.findByConversation('c')],
    ['update', () => repository.updateStatus('id', 'pending')],
    ['cancel', () => repository.cancelPendingByConversation('c', 'reason')],
    ['rules', () => repository.getOperationalRules()],
    ['notification create', () => repository.createNotification({ sector: 'clinico', message: 'm' })],
    ['notification update', () => repository.updateNotificationStatus('id', 'failed')],
  ])('propagates database errors from %s', async (_name, invoke) => {
    mockQuery.mockRejectedValue(new Error('database unavailable'));
    await expect(invoke()).rejects.toThrow('database unavailable');
  });
});

describe('followup repository coverage', () => {
  const repository = new FollowupRepository();
  beforeEach(() => vi.clearAllMocks());

  it('creates, finds, lists, and completes tenant-scoped followups', async () => {
    const completed = followupRow({ status: 'completed', completed_by: 'agent', completed_at: now });
    mockQuery
      .mockResolvedValueOnce({ rows: [followupRow()] })
      .mockResolvedValueOnce({ rows: [followupRow()] })
      .mockResolvedValueOnce({ rows: [followupRow({ priority: 'high' })] })
      .mockResolvedValueOnce({ rows: [completed] });

    const created = await repository.create({ taskType: 'callback', title: 'Call back' });
    expect(created.id).toBe('task-1');
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', null, null, 'callback', 'Call back', null, null, 'medium']);

    await expect(repository.findByConversation('conv-1')).resolves.toHaveLength(1);
    expect(mockQuery.mock.calls[1][1]).toEqual(['1', 'conv-1']);

    await expect(repository.findPending(7)).resolves.toEqual([
      expect.objectContaining({ priority: 'high' }),
    ]);
    expect(mockQuery.mock.calls[2][1]).toEqual(['1', 7]);

    await expect(repository.updateStatus('task-1', 'completed', 'agent')).resolves.toEqual(
      expect.objectContaining({ status: 'completed', completedBy: 'agent' }),
    );
    expect(mockQuery.mock.calls[3][1]).toEqual(['1', 'completed', 'agent', 'task-1']);
  });

  it('uses the pending default limit and rejects a missing task', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await repository.findPending();
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', 50]);
    await expect(repository.updateStatus('missing', 'cancelled')).rejects.toThrow('Followup task not found');
  });

  it.each([
    ['create', () => repository.create({ taskType: 'info', title: 'Info' })],
    ['find', () => repository.findByConversation('conv')],
    ['pending', () => repository.findPending()],
    ['update', () => repository.updateStatus('id', 'in_progress')],
  ])('propagates database errors from %s', async (_name, invoke) => {
    mockQuery.mockRejectedValue(new Error('database unavailable'));
    await expect(invoke()).rejects.toThrow('database unavailable');
  });
});

describe('handoff tool coverage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it.each([
    ['low', 'low'], ['medium', 'medium'], ['high', 'high'], ['critical', 'critical'],
  ] as const)('maps %s risk to %s priority', async (riskLevel, priority) => {
    vi.spyOn(handoffRepository, 'create').mockResolvedValue({
      ...handoffRow({ risk_level: riskLevel, priority }),
      conversationId: 'conv-1', contactId: null, triggerType: 'risk', triggerReason: 'reason',
      pendingQuestions: [], whatWasAnswered: null, whatIsMissing: null, riskLevel,
      createdAt: now, completedAt: null, resolvedBy: null, resolutionNotes: null,
    } as unknown as Awaited<ReturnType<typeof handoffRepository.create>>);

    await expect(createHandoff({
      conversationId: 'conv-1', triggerType: 'risk', triggerReason: 'reason', riskLevel,
    })).resolves.toEqual(expect.objectContaining({ success: true, handoffId: 'handoff-1' }));
    expect(handoffRepository.create).toHaveBeenCalledWith(expect.objectContaining({ priority, riskLevel }));
  });

  it('validates required handoff fields and propagates repository failure', async () => {
    await expect(createHandoff({ conversationId: '', triggerType: '', triggerReason: '' }))
      .rejects.toThrow('conversationId, triggerType, and triggerReason are required');
    vi.spyOn(handoffRepository, 'create').mockRejectedValue(new Error('write failed'));
    await expect(createHandoff({ conversationId: 'c', triggerType: 't', triggerReason: 'r' }))
      .rejects.toThrow('write failed');
  });

  it('validates and creates a sector notification', async () => {
    vi.spyOn(handoffRepository, 'createNotification').mockResolvedValue({
      id: 'n-1', sector: 'financeiro', conversationId: null, contactId: null,
      message: 'review', priority: 'urgent', status: 'pending', sentAt: null,
      readAt: null, createdAt: now,
    });
    await expect(notifySector({ sector: 'financeiro', message: 'review', priority: 'urgent' }))
      .resolves.toEqual({ success: true, notificationId: 'n-1', sector: 'financeiro' });
    await expect(notifySector({ sector: '' as 'clinico', message: '' })).rejects.toThrow('sector and message are required');
    await expect(notifySector({ sector: 'invalid' as 'clinico', message: 'x' })).rejects.toThrow('Invalid sector');
  });

  it('validates, parses the due date, and creates a followup task', async () => {
    vi.spyOn(followupRepository, 'create').mockResolvedValue(followupRow() as unknown as FollowupTask);
    await expect(createFollowupTask({
      taskType: 'callback', title: 'Call', dueDate: '2026-04-05T06:07:08.000Z', priority: 'high',
    })).resolves.toEqual({ success: true, taskId: 'task-1', title: 'Call' });
    expect(followupRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      dueDate: new Date('2026-04-05T06:07:08.000Z'), priority: 'high',
    }));
    await expect(createFollowupTask({ taskType: '' as 'info', title: '' })).rejects.toThrow('taskType and title are required');
    await expect(createFollowupTask({ taskType: 'invalid' as 'info', title: 'x' })).rejects.toThrow('Invalid taskType');
  });

  it('maps operational rules and propagates tool dependencies failures', async () => {
    vi.spyOn(handoffRepository, 'getOperationalRules').mockResolvedValue([{
      id: 'r-1', ruleType: 'policy', name: 'Rule', description: null,
      content: { a: 1 }, isActive: true, priority: 1, effectiveFrom: now,
      effectiveTo: null, createdBy: null, createdAt: now,
    }]);
    await expect(getOperationalRules({ ruleType: 'policy' })).resolves.toEqual({
      success: true,
      rules: [{ id: 'r-1', name: 'Rule', description: null, type: 'policy', content: { a: 1 } }],
    });

    vi.spyOn(handoffRepository, 'getOperationalRules').mockRejectedValue(new Error('read failed'));
    await expect(getOperationalRules({})).rejects.toThrow('read failed');
    vi.spyOn(handoffRepository, 'createNotification').mockRejectedValue(new Error('notify failed'));
    await expect(notifySector({ sector: 'clinico', message: 'x' })).rejects.toThrow('notify failed');
    vi.spyOn(followupRepository, 'create').mockRejectedValue(new Error('task failed'));
    await expect(createFollowupTask({ taskType: 'info', title: 'x' })).rejects.toThrow('task failed');
  });
});
