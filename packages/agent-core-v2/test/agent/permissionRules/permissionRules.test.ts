import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SyncDescriptor } from '#/_base/di/descriptors';
import { DisposableStore } from '#/_base/di/lifecycle';
import { TestInstantiationService } from '#/_base/di/test';
import { IConfigService } from '#/app/config/config';
import { PERMISSION_SECTION } from '#/agent/permissionRules/configSection';
import { IAgentPermissionRulesService, type PermissionApprovalResultRecord, type PermissionRule } from '#/agent/permissionRules/permissionRules';
import { IPermissionRulesConfigBridge, PermissionRulesConfigBridge } from '#/agent/permissionRules/permissionRulesConfigBridge';
import { AgentPermissionRulesService } from '#/agent/permissionRules/permissionRulesService';
import { PermissionRulesModel } from '#/agent/permissionRules/permissionRulesOps';
import { AppendLogStore } from '#/persistence/backends/node-fs/appendLogStore';
import { InMemoryStorageService } from '#/persistence/backends/memory/inMemoryStorageService';
import { IAppendLogStore } from '#/persistence/interface/appendLogStore';
import { IFileSystemStorageService } from '#/persistence/interface/storage';
import { IAgentWireService } from '#/wire/tokens';
import type { PersistedRecord } from '#/wire/wireService';
import { WireService } from '#/wire/wireServiceImpl';

const SCOPE = 'wire';
const KEY = 'permission-rules-test';

const allowRule: PermissionRule = { decision: 'allow', scope: 'session-runtime', pattern: 'Read(**)' };
const denyRule: PermissionRule = { decision: 'deny', scope: 'user', pattern: 'Bash(rm *)' };

function sessionApproval(pattern: string): PermissionApprovalResultRecord {
  return {
    turnId: 1,
    toolCallId: 'call-1',
    toolName: 'Bash',
    action: 'Bash(rm -rf /tmp/x)',
    sessionApprovalRule: pattern,
    result: { decision: 'approved', scope: 'session' },
  };
}

let disposables: DisposableStore;
let ix: TestInstantiationService;
let log: IAppendLogStore;
let svc: IAgentPermissionRulesService;

beforeEach(() => {
  disposables = new DisposableStore();
  ix = disposables.add(new TestInstantiationService());
  ix.stub(IFileSystemStorageService, new InMemoryStorageService());
  ix.set(IAppendLogStore, new SyncDescriptor(AppendLogStore));
  ix.set(IAgentWireService, new SyncDescriptor(WireService, [{ logScope: SCOPE, logKey: KEY }]));
  ix.set(IAgentPermissionRulesService, new SyncDescriptor(AgentPermissionRulesService));
  log = ix.get(IAppendLogStore);
  svc = ix.get(IAgentPermissionRulesService);
});

afterEach(() => disposables.dispose());

async function readRecords(): Promise<PersistedRecord[]> {
  const out: PersistedRecord[] = [];
  for await (const record of log.read<PersistedRecord>(SCOPE, KEY)) {
    out.push(record);
  }
  return out;
}

describe('AgentPermissionRulesService (wire-backed)', () => {
  it('addRules appends rules and exposes the accumulated rules', () => {
    expect(svc.rules).toEqual([]);

    svc.addRules([allowRule]);
    expect(svc.rules).toEqual([allowRule]);
    svc.addRules([denyRule]);
    expect(svc.rules).toEqual([allowRule, denyRule]);

    // Empty add is a no-op: it does not dispatch.
    svc.addRules([]);
    expect(svc.rules).toEqual([allowRule, denyRule]);
  });

  it('records a session approval pattern', () => {
    const approval = sessionApproval('Bash(rm *)');
    svc.recordApprovalResult(approval);

    expect(svc.sessionApprovalRulePatterns).toEqual(['Bash(rm *)']);

    // Duplicate session approval is deduped by the model.
    svc.recordApprovalResult(approval);
    expect(svc.sessionApprovalRulePatterns).toEqual(['Bash(rm *)']);
  });

  it('ignores non-session approvals for the pattern set', () => {
    const oneTime: PermissionApprovalResultRecord = {
      turnId: 2,
      toolCallId: 'call-2',
      toolName: 'Write',
      action: 'Write(/tmp/x)',
      result: { decision: 'approved' },
    };
    svc.recordApprovalResult(oneTime);
    expect(svc.sessionApprovalRulePatterns).toEqual([]);
  });

  it('only persists approval records (permission.rules.add is live-only)', async () => {
    svc.addRules([allowRule]);
    svc.recordApprovalResult(sessionApproval('Bash(rm *)'));

    const records = await readRecords();
    expect(records).toEqual([
      {
        type: 'permission.record_approval_result',
        turnId: 1,
        toolCallId: 'call-1',
        toolName: 'Bash',
        action: 'Bash(rm -rf /tmp/x)',
        sessionApprovalRule: 'Bash(rm *)',
        result: { decision: 'approved', scope: 'session' },
        time: expect.any(Number),
      },
    ]);
    expect(records.every((record) => 'payload' in record === false)).toBe(true);
  });

  it('replay rebuilds session approval patterns only (rules are not persisted)', async () => {
    svc.addRules([allowRule, denyRule]);
    svc.recordApprovalResult(sessionApproval('Bash(rm *)'));
    const records = await readRecords();

    const ix2 = disposables.add(new TestInstantiationService());
    ix2.stub(IFileSystemStorageService, new InMemoryStorageService());
    ix2.set(IAppendLogStore, new SyncDescriptor(AppendLogStore));
    ix2.set(
      IAgentWireService,
      new SyncDescriptor(WireService, [{ logScope: SCOPE, logKey: 'permission-rules-replay' }]),
    );
    const log2 = ix2.get(IAppendLogStore);
    const fresh = ix2.get(IAgentWireService);

    let changes = 0;
    disposables.add(fresh.subscribe(PermissionRulesModel, () => (changes += 1)));

    void fresh.replay(...records);

    expect(fresh.getModel(PermissionRulesModel)).toEqual({
      rules: [],
      sessionApprovalRulePatterns: ['Bash(rm *)'],
    });
    // Replay is silent: no subscriber notification and nothing written back to
    // the wire log.
    expect(changes).toBe(0);
    const written: PersistedRecord[] = [];
    for await (const record of log2.read<PersistedRecord>(SCOPE, 'permission-rules-replay')) {
      written.push(record);
    }
    expect(written).toEqual([]);
  });
});

describe('PermissionRulesConfigBridge', () => {
  function stubConfig(value: unknown): void {
    ix.stub(IConfigService, {
      get: ((domain: string) => (domain === PERMISSION_SECTION ? value : undefined)) as IConfigService['get'],
    } as unknown as IConfigService);
    ix.set(IPermissionRulesConfigBridge, new SyncDescriptor(PermissionRulesConfigBridge));
  }

  it('seeds the rules service from the [permission] config section', () => {
    const configRules: PermissionRule[] = [
      { decision: 'deny', scope: 'user', pattern: 'Bash(rm *)' },
      { decision: 'allow', scope: 'user', pattern: 'Read(**)' },
    ];
    stubConfig({ rules: configRules });

    ix.get(IPermissionRulesConfigBridge);

    expect(svc.rules).toEqual(configRules);
  });

  it('seeds nothing when the [permission] section is absent', () => {
    stubConfig(undefined);

    ix.get(IPermissionRulesConfigBridge);

    expect(svc.rules).toEqual([]);
  });
});

describe('AgentPermissionRulesService.inheritPermissionFrom', () => {
  function sourceService(
    rules: readonly PermissionRule[],
    patterns: readonly string[],
  ): IAgentPermissionRulesService {
    return {
      _serviceBrand: undefined,
      rules,
      sessionApprovalRulePatterns: patterns,
      addRules: () => {},
      inheritPermissionFrom: () => {},
      recordApprovalResult: () => {},
    };
  }

  it('copies rules and session-approval patterns from the source, deduped', () => {
    svc.addRules([allowRule]);
    svc.recordApprovalResult(sessionApproval('Bash(npm test)'));

    svc.inheritPermissionFrom(
      sourceService([allowRule, denyRule], ['Bash(npm test)', 'Read(**)']),
    );

    // `allowRule` and 'Bash(npm test)' were already present: no duplicates.
    expect(svc.rules).toEqual([allowRule, denyRule]);
    expect(svc.sessionApprovalRulePatterns).toEqual(['Bash(npm test)', 'Read(**)']);
  });

  it('is a no-op when the source has nothing to inherit', () => {
    svc.inheritPermissionFrom(sourceService([], []));

    expect(svc.rules).toEqual([]);
    expect(svc.sessionApprovalRulePatterns).toEqual([]);
  });

  it('does not persist inherited rules or patterns (live-only)', async () => {
    svc.inheritPermissionFrom(sourceService([denyRule], ['Read(**)']));

    expect(await readRecords()).toEqual([]);
  });
});
