import { createDecorator } from "#/_base/di/instantiation";
import type { ApprovalResponse } from "@moonshot-ai/protocol";

export interface PermissionApprovalResultRecord {
  readonly turnId: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly action: string;
  readonly sessionApprovalRule?: string;
  readonly result: ApprovalResponse;
}

export type PermissionRuleDecision = 'allow' | 'deny' | 'ask';

/**
 * Rule provenance. `session-runtime` stores rules produced by
 * "approve for session"; `turn-override`, `project`, and `user` are
 * reserved for static-loaded rules surfaced by external callers.
 */
export type PermissionRuleScope = 'turn-override' | 'session-runtime' | 'project' | 'user';

/**
 * A single permission rule. `pattern` is the DSL form (`Read(/etc/**)`,
 * `Bash(rm *)`, or bare `Write`). Rule arguments are interpreted only by
 * tools that provide a matcher; other tools match by name only.
 */
export interface PermissionRule {
  readonly decision: PermissionRuleDecision;
  readonly scope: PermissionRuleScope;
  readonly pattern: string;
  readonly reason?: string;
}

export interface IAgentPermissionRulesService {
  readonly _serviceBrand: undefined;

  readonly rules: readonly PermissionRule[];
  readonly sessionApprovalRulePatterns: readonly string[];
  addRules(rules: readonly PermissionRule[]): void;
  /**
   * Copy the source agent's current rules and session-approval patterns into
   * this agent (deduped). Used at sub-agent / fork creation so children
   * inherit the parent's user-approved memory, mirroring v1's `parent` chain
   * as an explicit snapshot — the same idiom as the inherited permission mode
   * and user tools.
   */
  inheritPermissionFrom(source: IAgentPermissionRulesService): void;
  recordApprovalResult(record: PermissionApprovalResultRecord): void;
}

export const IAgentPermissionRulesService =
  createDecorator<IAgentPermissionRulesService>('agentPermissionRulesService');
