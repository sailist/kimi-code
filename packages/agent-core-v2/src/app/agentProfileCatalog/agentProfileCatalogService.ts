/**
 * `agentProfileCatalog` domain (L3) — `IAgentProfileCatalogService` impl.
 *
 * Snapshots the module-level contributions on construction. Register-after-
 * construction is not supported: like `IAgentToolRegistryService`, the
 * expectation is that contributions accumulate at import time before the
 * container resolves the service. `getDefault()` throws a plain `Error` when
 * the builtin default profile is missing — that is a programming-time
 * invariant violation, not a request failure, so it does not warrant a wire
 * error code.
 */

import { InstantiationType } from '#/_base/di/extensions';
import { LifecycleScope, registerScopedService } from '#/_base/di/scope';

import type { AgentProfile } from './agentProfileCatalog';
import { DEFAULT_AGENT_PROFILE_NAME, IAgentProfileCatalogService } from './agentProfileCatalog';
import { getAgentProfileContributions } from './contribution';

export class AgentProfileCatalogService implements IAgentProfileCatalogService {
  declare readonly _serviceBrand: undefined;

  private readonly byName: Map<string, AgentProfile>;
  private readonly ordered: readonly AgentProfile[];

  constructor() {
    const contributions = getAgentProfileContributions();
    this.ordered = [...contributions];
    this.byName = new Map(this.ordered.map((def) => [def.name, def]));
  }

  get(name: string): AgentProfile | undefined {
    return this.byName.get(name);
  }

  getDefault(): AgentProfile {
    const profile = this.byName.get(DEFAULT_AGENT_PROFILE_NAME);
    if (profile === undefined) {
      throw new Error(
        `Default agent profile "${DEFAULT_AGENT_PROFILE_NAME}" is not registered`,
      );
    }
    return profile;
  }

  list(): readonly AgentProfile[] {
    return this.ordered;
  }

  getSubagent(
    callerProfileName: string | undefined,
    subagentName: string,
  ): AgentProfile | undefined {
    const declaration = this.subagentDeclaration(callerProfileName);
    if (declaration === undefined || !(subagentName in declaration)) return undefined;
    const target = this.byName.get(subagentName);
    if (target === undefined) return undefined;
    return applySubagentDescription(target, declaration[subagentName]?.description);
  }

  listSubagents(callerProfileName: string | undefined): readonly AgentProfile[] {
    const declaration = this.subagentDeclaration(callerProfileName);
    if (declaration === undefined) return [];
    const out: AgentProfile[] = [];
    for (const [name, subagent] of Object.entries(declaration)) {
      const target = this.byName.get(name);
      if (target !== undefined) {
        out.push(applySubagentDescription(target, subagent.description));
      }
    }
    return out;
  }

  /** v1's fallback: a profile without its own `subagents` declaration may
   *  spawn the default profile's declared subagent types. */
  private subagentDeclaration(
    callerProfileName: string | undefined,
  ): AgentProfile['subagents'] {
    return (
      (callerProfileName === undefined
        ? undefined
        : this.byName.get(callerProfileName)?.subagents) ??
      this.byName.get(DEFAULT_AGENT_PROFILE_NAME)?.subagents
    );
  }
}

/** v1's `applySubagentDescriptions`: the declaration's description overrides
 *  the target profile's own only when the target has none. */
function applySubagentDescription(
  target: AgentProfile,
  description: string | undefined,
): AgentProfile {
  if (description === undefined || target.description !== undefined) return target;
  return { ...target, description };
}

registerScopedService(
  LifecycleScope.App,
  IAgentProfileCatalogService,
  AgentProfileCatalogService,
  InstantiationType.Delayed,
  'agentProfileCatalog',
);
