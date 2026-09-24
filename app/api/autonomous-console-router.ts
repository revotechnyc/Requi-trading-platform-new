import { z } from 'zod';
import { createRouter, authedQuery } from './middleware';
import { getDb } from './queries/connection';
import { eq, desc, and, isNull } from 'drizzle-orm';
import * as schema from '../db/autonomous-console-schema';


const {
  engineState, engineConfig, earningsEvents, orders, positions,
  riskConfig, riskExposure, latencyPoints, latencyMeasurements,
  dataFeeds, auditEvents, pipelineStages, pipelineExecutions,
  accountSummary, orderFinancials, winsPerOrder, earningsBreakdown,
  strategyPerformance, tickerPerformance, sectorPerformance,
  regimePerformance, rpersPerformance, apmaConfig, apmaState,
  positionAuthority, preEventMetrics, fisBreakdown, reactionMetrics,
  decisionStates, systemHealth, integrationAdapters,
  killSwitchLog,
  strategies, strategyVersions, strategyContracts, strategyParameters,
  riskProfiles, riskProfileVersions, strategyUserPreferences,
  strategySelectionProfiles, protectionProfiles, configurationEvents,
  userSettings, userPermissions,
  legalDocuments, legalDocumentVersions, legalAcceptances,
  legalAcceptanceEvents, autonomousAuthorizations, autonomousStartEvents,
  strategyDisclosureAcceptances, brokerAuthorizations, electronicConsentRecords,
  legalRequirements, legalReconsentQueue, complianceEvents,
} = schema;

export const autonomousConsoleRouter = createRouter({
  // ===== ENGINE STATE =====
  getEngineState: authedQuery.query(async () => {
    const db = getDb();
    const state = await db.select().from(engineState).orderBy(desc(engineState.id)).limit(1);
    const configs = await db.select().from(engineConfig);
    return { state: state[0] ?? null, configs };
  }),

  updateEngineState: authedQuery
    .input(z.object({ mode: z.enum(['SHADOW', 'PAPER', 'LIVE']).optional(), status: z.enum(['ARMED', 'DISARMED', 'ERROR']).optional(), killSwitchArmed: z.boolean().optional() }))
    .mutation(async (opts: { input: { mode?: 'SHADOW' | 'PAPER' | 'LIVE'; status?: 'ARMED' | 'DISARMED' | 'ERROR'; killSwitchArmed?: boolean } }) => {
      const db = getDb();
      const existing = await db.select().from(engineState).orderBy(desc(engineState.id)).limit(1);
      if (existing[0]) {
        await db.update(engineState).set({ ...opts.input, updatedAt: new Date() }).where(eq(engineState.id, existing[0].id));
        return { success: true };
      }
      await db.insert(engineState).values({ ...opts.input, updatedAt: new Date() } as any);
      return { success: true };
    }),

  // ===== EVENTS =====
  getEvents: authedQuery
    .input(z.object({ limit: z.number().default(50), status: z.string().optional(), ticker: z.string().optional() }).optional())
    .query(async (opts: { input?: { limit?: number; status?: string; ticker?: string } }) => {
      const db = getDb();
      const input = opts.input ?? {};
      let query = db.select().from(earningsEvents).orderBy(desc(earningsEvents.earningsDate)) as any;
      if (input.status) query = query.where(eq(earningsEvents.decisionState, input.status as any));
      if (input.ticker) query = query.where(eq(earningsEvents.ticker, input.ticker));
      return query.limit(input.limit ?? 50);
    }),

  getEventById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async (opts: { input: { id: number } }) => {
      const db = getDb();
      const [event] = await db.select().from(earningsEvents).where(eq(earningsEvents.id, opts.input.id));
      if (!event) return null;
      const [preEvent] = await db.select().from(preEventMetrics).where(eq(preEventMetrics.eventId, opts.input.id));
      const [fis] = await db.select().from(fisBreakdown).where(eq(fisBreakdown.eventId, opts.input.id));
      const [rcs] = await db.select().from(reactionMetrics).where(eq(reactionMetrics.eventId, opts.input.id));
      const [pa] = await db.select().from(positionAuthority).where(eq(positionAuthority.eventId, opts.input.id));
      const pipeline = await db.select().from(pipelineExecutions).where(eq(pipelineExecutions.eventId, opts.input.id));
      return { ...event, preEvent, fis, rcs, positionAuthority: pa, pipeline };
    }),

  // ===== ORDERS =====
  getOrders: authedQuery
    .input(z.object({ limit: z.number().default(100), status: z.string().optional(), ticker: z.string().optional() }).optional())
    .query(async (opts: { input?: { limit?: number; status?: string; ticker?: string } }) => {
      const db = getDb();
      const input = opts.input ?? {};
      let query = db.select().from(orders).orderBy(desc(orders.createdAt)) as any;
      if (input.status) query = query.where(eq(orders.status, input.status as any));
      if (input.ticker) query = query.where(eq(orders.ticker, input.ticker));
      return query.limit(input.limit ?? 100);
    }),

  // ===== POSITIONS =====
  getPositions: authedQuery
    .input(z.object({ openOnly: z.boolean().default(false), ticker: z.string().optional() }).optional())
    .query(async (opts: { input?: { openOnly?: boolean; ticker?: string } }) => {
      const db = getDb();
      const input = opts.input ?? {};
      let query = db.select().from(positions).orderBy(desc(positions.createdAt)) as any;
      if (input.openOnly) query = query.where(eq(positions.isOpen, true));
      if (input.ticker) query = query.where(eq(positions.ticker, input.ticker));
      return query;
    }),

  // ===== RISK =====
  getRiskConfig: authedQuery.query(async () => {
    const db = getDb();
    return db.select().from(riskConfig);
  }),

  getRiskExposure: authedQuery
    .input(z.object({ date: z.string().optional() }))
    .query(async () => {
      const db = getDb();
      return db.select().from(riskExposure).orderBy(desc(riskExposure.date)).limit(1);
    }),

  // ===== LATENCY =====
  getLatencyPoints: authedQuery.query(async () => {
    const db = getDb();
    return db.select().from(latencyPoints).orderBy(latencyPoints.sequenceOrder);
  }),

  getLatencyMeasurements: authedQuery
    .input(z.object({ eventId: z.number() }))
    .query(async (opts: { input: { eventId: number } }) => {
      const db = getDb();
      return db.select().from(latencyMeasurements).where(eq(latencyMeasurements.eventId, opts.input.eventId)).orderBy(latencyMeasurements.timestamp);
    }),

  // ===== DATA FEEDS =====
  getDataFeeds: authedQuery
    .input(z.object({ category: z.string().optional() }).optional())
    .query(async (opts: { input?: { category?: string } }) => {
      const db = getDb();
      const input = opts.input ?? {};
      let query = db.select().from(dataFeeds).orderBy(dataFeeds.category, dataFeeds.name) as any;
      if (input.category) query = query.where(eq(dataFeeds.category, input.category));
      return query;
    }),

  // ===== AUDIT =====
  getAuditEvents: authedQuery
    .input(z.object({ limit: z.number().default(100), level: z.string().optional(), source: z.string().optional() }).optional())
    .query(async (opts: { input?: { limit?: number; level?: string; source?: string } }) => {
      const db = getDb();
      const input = opts.input ?? {};
      let query = db.select().from(auditEvents).orderBy(desc(auditEvents.timestamp)) as any;
      if (input.level) query = query.where(eq(auditEvents.level, input.level as any));
      if (input.source) query = query.where(eq(auditEvents.source, input.source));
      return query.limit(input.limit ?? 100);
    }),

  createAuditEvent: authedQuery
    .input(z.object({ eventId: z.string(), level: z.enum(['INFO','SUCCESS','WARNING','ERROR','CRITICAL','START','PAUSE','KILL']), source: z.string(), type: z.string(), message: z.string(), data: z.any().optional() }))
    .mutation(async (opts: { input: { eventId: string; level: string; source: string; type: string; message: string; data?: any } }) => {
      const db = getDb();
      await db.insert(auditEvents).values({ ...opts.input, timestamp: new Date() } as any);
      return { success: true };
    }),

  // ===== FINANCIALS =====
  getAccountSummary: authedQuery.query(async () => {
    const db = getDb();
    return db.select().from(accountSummary).orderBy(desc(accountSummary.date)).limit(1);
  }),

  getOrderFinancials: authedQuery
    .input(z.object({ limit: z.number().default(100) }).optional())
    .query(async (opts: { input?: { limit?: number } }) => {
      const db = getDb();
      const input = opts.input ?? {};
      return db.select().from(orderFinancials).orderBy(desc(orderFinancials.createdAt)).limit(input.limit ?? 100);
    }),

  getWinsPerOrder: authedQuery.query(async () => {
    const db = getDb();
    return db.select().from(winsPerOrder);
  }),

  getEarningsBreakdown: authedQuery.query(async () => {
    const db = getDb();
    return db.select().from(earningsBreakdown);
  }),

  getStrategyPerformance: authedQuery
    .input(z.object({ period: z.string().optional() }))
    .query(async (opts: { input: { period?: string } }) => {
      const db = getDb();
      let query = db.select().from(strategyPerformance) as any;
      if (opts.input.period) query = query.where(eq(strategyPerformance.period, opts.input.period));
      return query;
    }),

  getTickerPerformance: authedQuery
    .input(z.object({ period: z.string().optional() }))
    .query(async (opts: { input: { period?: string } }) => {
      const db = getDb();
      let query = db.select().from(tickerPerformance) as any;
      if (opts.input.period) query = query.where(eq(tickerPerformance.period, opts.input.period));
      return query;
    }),

  getSectorPerformance: authedQuery
    .input(z.object({ period: z.string().optional() }))
    .query(async (opts: { input: { period?: string } }) => {
      const db = getDb();
      let query = db.select().from(sectorPerformance) as any;
      if (opts.input.period) query = query.where(eq(sectorPerformance.period, opts.input.period));
      return query;
    }),

  getRegimePerformance: authedQuery
    .input(z.object({ period: z.string().optional() }))
    .query(async (opts: { input: { period?: string } }) => {
      const db = getDb();
      let query = db.select().from(regimePerformance) as any;
      if (opts.input.period) query = query.where(eq(regimePerformance.period, opts.input.period));
      return query;
    }),

  getRpersPerformance: authedQuery
    .input(z.object({ period: z.string().optional() }))
    .query(async (opts: { input: { period?: string } }) => {
      const db = getDb();
      let query = db.select().from(rpersPerformance) as any;
      if (opts.input.period) query = query.where(eq(rpersPerformance.period, opts.input.period));
      return query;
    }),

  // ===== SETTINGS / APMA =====
  getApmaConfig: authedQuery.query(async () => {
    const db = getDb();
    return db.select().from(apmaConfig).orderBy(apmaConfig.order);
  }),

  getApmaState: authedQuery
    .input(z.object({ ticker: z.string().optional() }))
    .query(async (opts: { input: { ticker?: string } }) => {
      const db = getDb();
      let query = db.select().from(apmaState) as any;
      if (opts.input.ticker) query = query.where(eq(apmaState.ticker, opts.input.ticker));
      return query;
    }),

  // ===== INTEGRATIONS / HEALTH =====
  getIntegrations: authedQuery.query(async () => {
    const db = getDb();
    return db.select().from(integrationAdapters);
  }),

  runHealthChecks: authedQuery.query(async () => {
    const db = getDb();
    const adapters = await db.select().from(integrationAdapters);
    return adapters.map((a) => ({
      name: a.name,
      status: a.status,
      latencyMs: a.latencyMs ?? 0,
      message: a.displayName,
      timestamp: a.lastHealthCheck ?? a.updatedAt ?? new Date(),
    }));
  }),

  getSystemHealth: authedQuery.query(async () => {
    const db = getDb();
    return db.select().from(systemHealth).orderBy(desc(systemHealth.checkedAt));
  }),

  // ===== PIPELINE =====
  getPipelineStages: authedQuery.query(async () => {
    const db = getDb();
    return db.select().from(pipelineStages).orderBy(pipelineStages.sequenceOrder);
  }),

  // ===== DECISION STATES =====
  getDecisionStates: authedQuery.query(async () => {
    const db = getDb();
    return db.select().from(decisionStates);
  }),

  // ===== KILL SWITCH =====
  getKillSwitchLog: authedQuery
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async (opts: { input?: { limit?: number } }) => {
      const db = getDb();
      const input = opts.input ?? {};
      return db.select().from(killSwitchLog).orderBy(desc(killSwitchLog.createdAt)).limit(input.limit ?? 50);
    }),

  triggerKillSwitch: authedQuery
    .input(z.object({ action: z.string(), reason: z.string(), triggeredBy: z.string() }))
    .mutation(async (opts: { input: { action: string; reason: string; triggeredBy: string } }) => {
      const db = getDb();
      await db.insert(killSwitchLog).values({ ...opts.input, previousState: 'ARMED', newState: 'TRIGGERED' } as any);
      await db.update(engineState).set({ status: 'DISARMED' as any, updatedAt: new Date() });
      return { success: true };
    }),

  // ===== OVERVIEW STATS =====
  getOverviewStats: authedQuery.query(async () => {
    const db = getDb();
    const [engine] = await db.select().from(engineState).orderBy(desc(engineState.id)).limit(1);
    const openPositions = await db.select().from(positions).where(eq(positions.isOpen, true));
    const openOrders = await db.select().from(orders).where(eq(orders.status, 'OPEN' as any));
    const todayEvents = await db.select().from(earningsEvents).limit(5);
    const [account] = await db.select().from(accountSummary).orderBy(desc(accountSummary.date)).limit(1);
    return {
      engine: engine ?? null,
      openPositionCount: openPositions.length,
      openOrderCount: openOrders.length,
      upcomingEvents: todayEvents,
      account: account ?? null,
    };
  }),

  // ===== STRATEGIES =====
  getStrategies: authedQuery.query(async () => {
    const db = getDb();
    const allStrategies = await db.select().from(strategies).orderBy(desc(strategies.priority));
    const versions = await db.select().from(strategyVersions);
    return allStrategies.map((s: any) => ({
      ...s,
      versions: versions.filter((v: any) => v.strategyId === s.id),
    }));
  }),

  getStrategyById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async (opts: { input: { id: number } }) => {
      const db = getDb();
      const [strategy] = await db.select().from(strategies).where(eq(strategies.id, opts.input.id));
      if (!strategy) return null;
      const versions = await db.select().from(strategyVersions).where(eq(strategyVersions.strategyId, opts.input.id));
      const contracts = await db.select().from(strategyContracts).where(eq(strategyContracts.strategyId, opts.input.id));
      const params = await db.select().from(strategyParameters).where(eq(strategyParameters.contractId, contracts[0]?.id ?? 0));
      return { ...strategy, versions, contracts, params };
    }),

  // ===== RISK PROFILES =====
  getRiskProfile: authedQuery
    .input(z.object({ userId: z.number().optional(), accountId: z.number().optional() }).optional())
    .query(async (opts: { input?: { userId?: number; accountId?: number } }) => {
      const db = getDb();
      const input = opts.input ?? {};
      let query = db.select().from(riskProfiles).where(eq(riskProfiles.isActive, true)) as any;
      if (input.userId) query = query.where(eq(riskProfiles.userId, input.userId));
      if (input.accountId) query = query.where(eq(riskProfiles.accountId, input.accountId));
      return query.limit(1);
    }),

  getRiskProfiles: authedQuery
    .input(z.object({ userId: z.number(), accountId: z.number() }))
    .query(async (opts: { input: { userId: number; accountId: number } }) => {
      const db = getDb();
      return db.select().from(riskProfiles)
        .where(and(
          eq(riskProfiles.userId, opts.input.userId),
          eq(riskProfiles.accountId, opts.input.accountId)
        ))
        .orderBy(desc(riskProfiles.isActive), desc(riskProfiles.updatedAt));
    }),

  updateRiskProfile: authedQuery
    .input(z.object({
      id: z.number(),
      profileName: z.string().optional(),
      isActive: z.boolean().optional(),
      maxDailyLoss: z.number().optional(),
      maxDailyLossType: z.string().optional(),
      maxEventRisk: z.number().optional(),
      maxEventRiskType: z.string().optional(),
      maxSingleNameExposure: z.number().optional(),
      maxSectorExposure: z.number().optional(),
      maxGrossExposure: z.number().optional(),
      maxNetExposure: z.number().optional(),
      maxCorrelatedExposure: z.number().optional(),
      haltOnConsecutiveLosses: z.number().optional(),
      maxOpenPositions: z.number().optional(),
      maxOpenOrders: z.number().optional(),
      maxDailyTrades: z.number().optional(),
      expectedVersion: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async (opts: { input: any }) => {
      const db = getDb();
      const { id, expectedVersion, reason, ...updates } = opts.input;

      const [existing] = await db.select().from(riskProfiles).where(eq(riskProfiles.id, id));
      if (!existing) return { success: false, error: 'PROFILE_NOT_FOUND' };
      if (existing.version !== expectedVersion) {
        return { success: false, error: 'CONFIGURATION_CONFLICT', currentVersion: existing.version };
      }

      const newVersion = (existing.version ?? 0) + 1;

      await db.insert(riskProfileVersions).values({
        riskProfileId: id,
        version: existing.version ?? 1,
        snapshot: existing as any,
        changeReason: reason || 'User update',
      });

      await db.insert(configurationEvents).values({
        configurationType: 'RISK_PROFILE',
        configurationId: id,
        settingKey: 'risk_profile_update',
        oldValue: existing as any,
        newValue: { ...updates, version: newVersion } as any,
        status: 'APPLIED',
        reason: reason || 'User update',
      } as any);

      await db.update(riskProfiles).set({
        ...updates,
        version: newVersion,
        updatedAt: new Date(),
      }).where(eq(riskProfiles.id, id));

      return { success: true, version: newVersion };
    }),

  // ===== STRATEGY SELECTION =====
  getStrategySelectionProfile: authedQuery
    .input(z.object({ userId: z.number(), accountId: z.number() }))
    .query(async (opts: { input: { userId: number; accountId: number } }) => {
      const db = getDb();
      const [profile] = await db.select().from(strategySelectionProfiles)
        .where(and(
          eq(strategySelectionProfiles.userId, opts.input.userId),
          eq(strategySelectionProfiles.accountId, opts.input.accountId)
        ));
      return profile ?? null;
    }),

  updateStrategySelectionProfile: authedQuery
    .input(z.object({
      userId: z.number(),
      accountId: z.number(),
      selectionMode: z.enum(['AUTO', 'USER_PREFERRED', 'USER_LOCKED']).optional(),
      lockedStrategyId: z.number().optional().nullable(),
      preferredStrategyIds: z.array(z.number()).optional(),
      allowRouterFallback: z.boolean().optional(),
      expectedVersion: z.number(),
    }))
    .mutation(async (opts: { input: any }) => {
      const db = getDb();
      const { userId, accountId, expectedVersion, ...updates } = opts.input;

      let [existing] = await db.select().from(strategySelectionProfiles)
        .where(and(
          eq(strategySelectionProfiles.userId, userId),
          eq(strategySelectionProfiles.accountId, accountId)
        ));

      if (existing) {
        if (existing.version !== expectedVersion) {
          return { success: false, error: 'CONFIGURATION_CONFLICT', currentVersion: existing.version };
        }
        const newVersion = (existing.version ?? 0) + 1;
        await db.update(strategySelectionProfiles).set({
          ...updates,
          version: newVersion,
          updatedAt: new Date(),
        }).where(eq(strategySelectionProfiles.id, existing.id));

        await db.insert(configurationEvents).values({
          userId,
          accountId,
          configurationType: 'STRATEGY_SELECTION',
          settingKey: 'selection_mode',
          oldValue: { selectionMode: existing.selectionMode } as any,
          newValue: updates as any,
          status: 'APPLIED',
        } as any);

        return { success: true, version: newVersion };
      }

      await db.insert(strategySelectionProfiles).values({
        userId,
        accountId,
        selectionMode: updates.selectionMode ?? 'AUTO',
        lockedStrategyId: updates.lockedStrategyId ?? null,
        preferredStrategyIds: updates.preferredStrategyIds ?? [] as any,
        allowRouterFallback: updates.allowRouterFallback ?? true,
        version: 1,
      } as any);

      return { success: true, version: 1 };
    }),

  // ===== STRATEGY USER PREFERENCES =====
  getStrategyUserPreferences: authedQuery
    .input(z.object({ userId: z.number(), accountId: z.number() }))
    .query(async (opts: { input: { userId: number; accountId: number } }) => {
      const db = getDb();
      return db.select().from(strategyUserPreferences)
        .where(and(
          eq(strategyUserPreferences.userId, opts.input.userId),
          eq(strategyUserPreferences.accountId, opts.input.accountId)
        ));
    }),

  updateStrategyUserPreference: authedQuery
    .input(z.object({
      userId: z.number(),
      accountId: z.number(),
      strategyId: z.number(),
      enabled: z.boolean().optional(),
      preferred: z.boolean().optional(),
      selectionPriority: z.number().optional(),
      maxAllocation: z.number().optional(),
      maxEventRisk: z.number().optional(),
      maxConcurrentPositions: z.number().optional(),
      allowedSessions: z.any().optional(),
      settings: z.any().optional(),
    }))
    .mutation(async (opts: { input: any }) => {
      const db = getDb();
      const { userId, accountId, strategyId, ...updates } = opts.input;

      let [existing] = await db.select().from(strategyUserPreferences)
        .where(and(
          eq(strategyUserPreferences.userId, userId),
          eq(strategyUserPreferences.accountId, accountId),
          eq(strategyUserPreferences.strategyId, strategyId)
        ));

      if (existing) {
        const newVersion = (existing.version ?? 0) + 1;
        await db.update(strategyUserPreferences).set({
          ...updates,
          version: newVersion,
          updatedAt: new Date(),
        }).where(eq(strategyUserPreferences.id, existing.id));

        await db.insert(configurationEvents).values({
          userId,
          accountId,
          configurationType: 'STRATEGY_PREFERENCE',
          configurationId: strategyId,
          settingKey: 'strategy_preference_update',
          oldValue: existing as any,
          newValue: updates as any,
          status: 'APPLIED',
        } as any);

        return { success: true, version: newVersion };
      }

      await db.insert(strategyUserPreferences).values({
        userId,
        accountId,
        strategyId,
        enabled: updates.enabled ?? true,
        preferred: updates.preferred ?? false,
        selectionPriority: updates.selectionPriority ?? 0,
        maxAllocation: updates.maxAllocation ?? null,
        maxEventRisk: updates.maxEventRisk ?? null,
        maxConcurrentPositions: updates.maxConcurrentPositions ?? null,
        allowedSessions: updates.allowedSessions ?? null,
        settings: updates.settings ?? null,
        version: 1,
      } as any);

      return { success: true, version: 1 };
    }),

  // ===== PROTECTION PROFILES =====
  getProtectionProfile: authedQuery
    .input(z.object({ userId: z.number(), accountId: z.number(), strategyId: z.number().optional() }))
    .query(async (opts: { input: { userId: number; accountId: number; strategyId?: number } }) => {
      const db = getDb();
      const conditions = [
        eq(protectionProfiles.userId, opts.input.userId),
        eq(protectionProfiles.accountId, opts.input.accountId),
        eq(protectionProfiles.isActive, true),
      ];
      if (opts.input.strategyId) {
        conditions.push(eq(protectionProfiles.strategyId, opts.input.strategyId));
      }
      let query = db.select().from(protectionProfiles).where(and(...conditions)) as any;
      return query.limit(1);
    }),

  updateProtectionProfile: authedQuery
    .input(z.object({
      id: z.number(),
      syntheticStopEnabled: z.boolean().optional(),
      syntheticTrailEnabled: z.boolean().optional(),
      initialStopType: z.string().optional(),
      initialStopValue: z.number().optional(),
      trailType: z.string().optional(),
      trailValue: z.number().optional(),
      atrMultiplier: z.number().optional(),
      minimumProtectionDistance: z.number().optional(),
      repriceEnabled: z.boolean().optional(),
      maxRepriceAttempts: z.number().optional(),
      apmaEnabled: z.boolean().optional(),
      expectedVersion: z.number(),
    }))
    .mutation(async (opts: { input: any }) => {
      const db = getDb();
      const { id, expectedVersion, ...updates } = opts.input;

      const [existing] = await db.select().from(protectionProfiles).where(eq(protectionProfiles.id, id));
      if (!existing) return { success: false, error: 'PROFILE_NOT_FOUND' };
      if (existing.version !== expectedVersion) {
        return { success: false, error: 'CONFIGURATION_CONFLICT', currentVersion: existing.version };
      }

      const newVersion = (existing.version ?? 0) + 1;

      await db.insert(configurationEvents).values({
        configurationType: 'PROTECTION_PROFILE',
        configurationId: id,
        settingKey: 'protection_update',
        oldValue: existing as any,
        newValue: { ...updates, version: newVersion } as any,
        status: 'APPLIED',
      } as any);

      await db.update(protectionProfiles).set({
        ...updates,
        version: newVersion,
        updatedAt: new Date(),
      }).where(eq(protectionProfiles.id, id));

      return { success: true, version: newVersion };
    }),

  // ===== CONFIGURATION EVENTS / HISTORY =====
  getConfigurationEvents: authedQuery
    .input(z.object({
      userId: z.number().optional(),
      configurationType: z.string().optional(),
      limit: z.number().default(50),
    }).optional())
    .query(async (opts: { input?: { userId?: number; configurationType?: string; limit?: number } }) => {
      const db = getDb();
      const input = opts.input ?? {};
      let query = db.select().from(configurationEvents).orderBy(desc(configurationEvents.timestamp)) as any;
      if (input.userId) query = query.where(eq(configurationEvents.userId, input.userId));
      if (input.configurationType) query = query.where(eq(configurationEvents.configurationType, input.configurationType));
      return query.limit(input.limit ?? 50);
    }),

  // ===== USER SETTINGS =====
  getUserSettings: authedQuery
    .input(z.object({ userId: z.number(), group: z.string().optional() }))
    .query(async (opts: { input: { userId: number; group?: string } }) => {
      const db = getDb();
      let query = db.select().from(userSettings).where(eq(userSettings.userId, opts.input.userId)) as any;
      if (opts.input.group) query = query.where(eq(userSettings.settingGroup, opts.input.group));
      return query;
    }),

  updateUserSetting: authedQuery
    .input(z.object({
      userId: z.number(),
      accountId: z.number().optional(),
      settingGroup: z.string(),
      settingKey: z.string(),
      value: z.any(),
    }))
    .mutation(async (opts: { input: any }) => {
      const db = getDb();
      const { userId, accountId, settingGroup, settingKey, value } = opts.input;

      let [existing] = await db.select().from(userSettings)
        .where(and(
          eq(userSettings.userId, userId),
          eq(userSettings.settingGroup, settingGroup),
          eq(userSettings.settingKey, settingKey)
        ));

      if (accountId) {
        const withAccount = await db.select().from(userSettings)
          .where(and(
            eq(userSettings.userId, userId),
            eq(userSettings.accountId, accountId),
            eq(userSettings.settingGroup, settingGroup),
            eq(userSettings.settingKey, settingKey)
          ));
        if (withAccount.length > 0) existing = withAccount[0];
      }

      if (existing) {
        const newVersion = (existing.version ?? 0) + 1;
        await db.update(userSettings).set({
          value,
          version: newVersion,
          updatedAt: new Date(),
        }).where(eq(userSettings.id, existing.id));
        return { success: true, version: newVersion };
      }

      await db.insert(userSettings).values({
        userId,
        accountId: accountId ?? null,
        settingGroup,
        settingKey,
        value,
        version: 1,
      } as any);

      return { success: true, version: 1 };
    }),

  // ===== RESET CONTROLS =====
  resetRiskProfileToDefault: authedQuery
    .input(z.object({ id: z.number(), defaultName: z.string().default('BALANCED') }))
    .mutation(async (opts: { input: { id: number; defaultName: string } }) => {
      const db = getDb();
      const [defaultProfile] = await db.select().from(riskProfiles)
        .where(and(
          eq(riskProfiles.profileName, opts.input.defaultName),
          eq(riskProfiles.isActive, false)
        ))
        .limit(1);

      if (!defaultProfile) return { success: false, error: 'DEFAULT_NOT_FOUND' };

      const newVersion = (defaultProfile.version ?? 0) + 1;
      await db.update(riskProfiles).set({
        maxDailyLoss: defaultProfile.maxDailyLoss,
        maxEventRisk: defaultProfile.maxEventRisk,
        maxSingleNameExposure: defaultProfile.maxSingleNameExposure,
        maxSectorExposure: defaultProfile.maxSectorExposure,
        maxGrossExposure: defaultProfile.maxGrossExposure,
        maxNetExposure: defaultProfile.maxNetExposure,
        maxCorrelatedExposure: defaultProfile.maxCorrelatedExposure,
        haltOnConsecutiveLosses: defaultProfile.haltOnConsecutiveLosses,
        version: newVersion,
        updatedAt: new Date(),
      }).where(eq(riskProfiles.id, opts.input.id));

      await db.insert(configurationEvents).values({
        configurationType: 'RISK_PROFILE',
        configurationId: opts.input.id,
        settingKey: 'reset_to_default',
        oldValue: {} as any,
        newValue: { defaultName: opts.input.defaultName } as any,
        status: 'APPLIED',
        reason: `Reset to ${opts.input.defaultName} default`,
      } as any);

      return { success: true, version: newVersion };
    }),

  // ===== LEGAL DOCUMENTS =====
  getLegalDocuments: authedQuery.query(async () => {
    const db = getDb();
    return db.select().from(legalDocuments).orderBy(legalDocuments.id);
  }),

  getLegalDocumentById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async (opts: { input: { id: number } }) => {
      const db = getDb();
      const [doc] = await db.select().from(legalDocuments).where(eq(legalDocuments.id, opts.input.id));
      if (!doc) return null;
      const versions = await db.select().from(legalDocumentVersions).where(eq(legalDocumentVersions.documentId, doc.id));
      return { ...doc, versions };
    }),

  // ===== LEGAL ACCEPTANCES =====
  getLegalAcceptances: authedQuery
    .input(z.object({ userId: z.number() }))
    .query(async (opts: { input: { userId: number } }) => {
      const db = getDb();
      return db.select().from(legalAcceptances).where(eq(legalAcceptances.userId, opts.input.userId));
    }),

  recordAcceptance: authedQuery
    .input(z.object({
      userId: z.number(),
      accountId: z.number(),
      documentId: z.number(),
      documentVersion: z.number(),
      acceptanceType: z.string(),
      environment: z.string(),
      isFirstTime: z.boolean().default(false),
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
    }))
    .mutation(async (opts: { input: any }) => {
      const db = getDb();
      const input = opts.input;
      const result = await db.insert(legalAcceptances).values({
        userId: input.userId,
        accountId: input.accountId,
        documentId: input.documentId,
        documentVersion: input.documentVersion,
        acceptanceType: input.acceptanceType,
        environment: input.environment,
        isFirstTime: input.isFirstTime,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      } as any);
      await db.insert(complianceEvents).values({
        userId: input.userId,
        accountId: input.accountId,
        eventType: 'DOCUMENT_ACCEPTED',
        eventCategory: 'LEGAL',
        severity: 'INFO',
        subjectType: 'LEGAL_DOCUMENT',
        subjectId: String(input.documentId),
        details: { documentVersion: input.documentVersion, environment: input.environment },
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      } as any);
      return { success: true, acceptanceId: null };
    }),

  recordAcceptanceEvent: authedQuery
    .input(z.object({
      userId: z.number(),
      acceptanceId: z.number(),
      eventType: z.string(),
      disclosureKey: z.string(),
      disclosureVersion: z.number(),
      isChecked: z.boolean(),
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
    }))
    .mutation(async (opts: { input: any }) => {
      const db = getDb();
      const input = opts.input;
      await db.insert(legalAcceptanceEvents).values({
        userId: input.userId,
        acceptanceId: input.acceptanceId,
        eventType: input.eventType,
        disclosureKey: input.disclosureKey,
        disclosureVersion: input.disclosureVersion,
        isChecked: input.isChecked,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      } as any);
      return { success: true };
    }),

  // ===== START GATE: CHECK ELIGIBILITY =====
  checkStartEligibility: authedQuery
    .input(z.object({
      userId: z.number(),
      accountId: z.number(),
      environment: z.string(),
    }))
    .query(async (opts: { input: { userId: number; accountId: number; environment: string } }) => {
      const db = getDb();
      const { userId, accountId, environment } = opts.input;

      // Check required legal documents for this environment
      const requiredDocs = await db.select().from(legalDocuments)
        .where(eq(legalDocuments.isRequired, true));

      const acceptances = await db.select().from(legalAcceptances)
        .where(and(
          eq(legalAcceptances.userId, userId),
          eq(legalAcceptances.environment, environment),
          isNull(legalAcceptances.withdrawalTimestamp)
        ));

      const pending = requiredDocs.filter((doc: any) => {
        const accepted = acceptances.find((a: any) => a.documentId === doc.id && a.documentVersion === doc.version);
        return !accepted;
      });

      // Check blocking reconsent queue
      const blockingQueue = await db.select().from(legalReconsentQueue)
        .where(and(
          eq(legalReconsentQueue.userId, userId),
          eq(legalReconsentQueue.accountId, accountId),
          eq(legalReconsentQueue.isBlocking, true),
          isNull(legalReconsentQueue.acknowledgedAt)
        ));

      // Check broker authorization
      const brokerAuths = await db.select().from(brokerAuthorizations)
        .where(and(
          eq(brokerAuthorizations.userId, userId),
          eq(brokerAuthorizations.accountId, accountId)
        ));
      const hasBrokerAuth = brokerAuths.some((b: any) => b.isAuthorized);

      // Check E-SIGN consent
      const eSignConsents = await db.select().from(electronicConsentRecords)
        .where(and(
          eq(electronicConsentRecords.userId, userId),
          eq(electronicConsentRecords.accountId, accountId),
          eq(electronicConsentRecords.consentType, 'E_SIGN')
        ));
      const hasEsign = eSignConsents.some((e: any) => e.isConsentGiven);

      const eligible = pending.length === 0 && blockingQueue.length === 0 && hasBrokerAuth && hasEsign;

      return {
        eligible,
        pendingDocuments: pending.length,
        pendingReconsents: blockingQueue.length,
        hasBrokerAuthorization: hasBrokerAuth,
        hasElectronicConsent: hasEsign,
        gateFailedReasons: [
          ...(pending.length > 0 ? ['PENDING_LEGAL_DOCUMENTS'] : []),
          ...(blockingQueue.length > 0 ? ['PENDING_RECONSENT'] : []),
          ...(!hasBrokerAuth ? ['MISSING_BROKER_AUTH'] : []),
          ...(!hasEsign ? ['MISSING_ELECTRONIC_CONSENT'] : []),
        ],
      };
    }),

  recordAutonomousAuthorization: authedQuery
    .input(z.object({
      userId: z.number(),
      accountId: z.number(),
      environment: z.string(),
      isAuthorized: z.boolean(),
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
    }))
    .mutation(async (opts: { input: any }) => {
      const db = getDb();
      const input = opts.input;
      await db.insert(autonomousAuthorizations).values({
        userId: input.userId,
        accountId: input.accountId,
        environment: input.environment,
        isAuthorized: input.isAuthorized,
        authorizedFrom: input.isAuthorized ? new Date() : null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      } as any);
      return { success: true };
    }),

  recordAutonomousStartEvent: authedQuery
    .input(z.object({
      userId: z.number(),
      accountId: z.number(),
      environment: z.string(),
      action: z.string(),
      result: z.string(),
      gateStatus: z.string(),
      gateFailedReasons: z.array(z.string()).optional(),
      triggeredBy: z.string().default('USER'),
      runId: z.string().optional(),
      elapsedMs: z.number().optional(),
    }))
    .mutation(async (opts: { input: any }) => {
      const db = getDb();
      const input = opts.input;
      await db.insert(autonomousStartEvents).values({
        userId: input.userId,
        accountId: input.accountId,
        environment: input.environment,
        action: input.action,
        result: input.result,
        gateStatus: input.gateStatus,
        gateFailedReasons: input.gateFailedReasons ? JSON.stringify(input.gateFailedReasons) : null,
        triggeredBy: input.triggeredBy,
        runId: input.runId ?? null,
        elapsedMs: input.elapsedMs ?? null,
      } as any);
      await db.insert(complianceEvents).values({
        userId: input.userId,
        accountId: input.accountId,
        eventType: `AUTONOMOUS_${input.action}`,
        eventCategory: 'OPERATIONAL',
        severity: input.result === 'SUCCESS' ? 'INFO' : 'WARNING',
        subjectType: 'ENGINE',
        subjectId: input.runId ?? 'unknown',
        details: { gateStatus: input.gateStatus, result: input.result },
      } as any);
      return { success: true };
    }),

  // ===== BROKER AUTHORIZATION =====
  getBrokerAuthorizations: authedQuery
    .input(z.object({ userId: z.number(), accountId: z.number() }))
    .query(async (opts: { input: { userId: number; accountId: number } }) => {
      const db = getDb();
      return db.select().from(brokerAuthorizations)
        .where(and(
          eq(brokerAuthorizations.userId, opts.input.userId),
          eq(brokerAuthorizations.accountId, opts.input.accountId)
        ));
    }),

  updateBrokerAuthorization: authedQuery
    .input(z.object({
      id: z.number(),
      isAuthorized: z.boolean().optional(),
      dataSharingAuthorized: z.boolean().optional(),
    }))
    .mutation(async (opts: { input: any }) => {
      const db = getDb();
      const { id, ...updates } = opts.input;
      await db.update(brokerAuthorizations).set({
        ...updates,
        authorizedAt: updates.isAuthorized ? new Date() : undefined,
      }).where(eq(brokerAuthorizations.id, id));
      return { success: true };
    }),

  // ===== ELECTRONIC CONSENT =====
  getElectronicConsents: authedQuery
    .input(z.object({ userId: z.number(), accountId: z.number() }))
    .query(async (opts: { input: { userId: number; accountId: number } }) => {
      const db = getDb();
      return db.select().from(electronicConsentRecords)
        .where(and(
          eq(electronicConsentRecords.userId, opts.input.userId),
          eq(electronicConsentRecords.accountId, opts.input.accountId)
        ));
    }),

  recordElectronicConsent: authedQuery
    .input(z.object({
      userId: z.number(),
      accountId: z.number(),
      consentType: z.string(),
      consentVersion: z.string(),
      consentText: z.string(),
      consentHash: z.string(),
      isConsentGiven: z.boolean(),
      ipAddress: z.string().optional(),
    }))
    .mutation(async (opts: { input: any }) => {
      const db = getDb();
      const input = opts.input;
      await db.insert(electronicConsentRecords).values({
        userId: input.userId,
        accountId: input.accountId,
        consentType: input.consentType,
        consentVersion: input.consentVersion,
        consentText: input.consentText,
        consentHash: input.consentHash,
        isConsentGiven: input.isConsentGiven,
        consentTimestamp: input.isConsentGiven ? new Date() : null,
        ipAddress: input.ipAddress ?? null,
      } as any);
      return { success: true };
    }),

  // ===== COMPLIANCE EVENTS =====
  getComplianceEvents: authedQuery
    .input(z.object({
      userId: z.number().optional(),
      category: z.string().optional(),
      severity: z.string().optional(),
      limit: z.number().default(50),
    }).optional())
    .query(async (opts: { input?: { userId?: number; category?: string; severity?: string; limit?: number } }) => {
      const db = getDb();
      const input = opts.input ?? {};
      const conditions: any[] = [];
      if (input.userId) conditions.push(eq(complianceEvents.userId, input.userId));
      if (input.category) conditions.push(eq(complianceEvents.eventCategory, input.category));
      if (input.severity) conditions.push(eq(complianceEvents.severity, input.severity));
      let query = db.select().from(complianceEvents).orderBy(desc(complianceEvents.createdAt));
      if (conditions.length > 0) {
        query = (query as any).where(and(...conditions));
      }
      return query.limit(input.limit ?? 50);
    }),
});
