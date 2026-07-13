/**
 * `permissionRules` domain (L3) — bridge from the `permission` config section
 * into the agent's rules model.
 *
 * Seeds `IAgentPermissionRulesService` with the user-configured `[permission]`
 * rules (`deny` / `allow` / `ask`, merged into `rules` by this domain's
 * `configSection`) so the `user-configured-*` policies have a data source —
 * the v2 counterpart of v1's `initialRules` handed to the main agent's
 * `PermissionManager` at creation. Constructed eagerly at Agent scope (ignited
 * in `agentLifecycle.igniteEagerServices`, before the first turn): because
 * `permission.rules.add` is a transient Op, every fresh agent scope —
 * creation, resume, fork, or sub-agent — re-seeds from config, matching the
 * Ops' "hosts re-supply them on resume" contract. Unlike v1 (main agent only,
 * sub-agents inherited mode/session-approvals through a parent chain), v2 has
 * no parent rule chain, so every agent scope is seeded.
 *
 * Seeding is once per scope: the rules model is append-only (no remove Op),
 * so a runtime `[permission]` edit cannot be reconciled into a live agent and
 * applies to newly created sessions instead — same as v1, which captured the
 * rules at session construction.
 */

import { InstantiationType } from '#/_base/di/extensions';
import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';
import { Disposable } from '#/_base/di/lifecycle';
import { LifecycleScope, registerScopedService } from '#/_base/di/scope';
import { IConfigService } from '#/app/config/config';

import { IAgentPermissionRulesService } from './permissionRules';
import { PERMISSION_SECTION, type PermissionConfig } from './configSection';

export interface IPermissionRulesConfigBridge {
  readonly _serviceBrand: undefined;
}

export const IPermissionRulesConfigBridge: ServiceIdentifier<IPermissionRulesConfigBridge> =
  createDecorator<IPermissionRulesConfigBridge>('permissionRulesConfigBridge');

export class PermissionRulesConfigBridge extends Disposable implements IPermissionRulesConfigBridge {
  declare readonly _serviceBrand: undefined;

  constructor(
    @IConfigService config: IConfigService,
    @IAgentPermissionRulesService rules: IAgentPermissionRulesService,
  ) {
    super();
    // `config.get` is safe here: agent scopes are created after the config
    // service has loaded (same assumption as `ensureMainAgent` reading the
    // default permission mode). An absent section yields no rules.
    rules.addRules(config.get<PermissionConfig>(PERMISSION_SECTION)?.rules ?? []);
  }
}

registerScopedService(
  LifecycleScope.Agent,
  IPermissionRulesConfigBridge,
  PermissionRulesConfigBridge,
  InstantiationType.Eager,
  'permissionRules',
);
