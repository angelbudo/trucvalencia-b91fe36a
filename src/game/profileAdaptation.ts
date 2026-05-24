/**
 * Maps a learned PlayerProfile (the human's playstyle) to bot tuning
 * parameters. Pure module — used both in client and edge functions.
 *
 *  - aggressiveness: how often the human calls envit/truc (0..1).
 *  - bluff_rate: fraction of calls done with weak hands (0..1).
 *  - accept_threshold: fraction of opp calls the human accepts (0..1).
 */
export interface PlayerProfile {
  device_id?: string;
  games_played: number;
  aggressiveness: number;
  bluff_rate: number;
  accept_threshold: number;
}

export interface BotTuning {
  /** Multiplier on bot's own envit/truc calling probability (>=0). */
  callPropensity: number;
  /** Multiplier on bot's own bluff probability (>=0). */
  bluffPropensity: number;
  /** Delta added to bot's accept-strength threshold (negative = accept more). */
  acceptThresholdDelta: number;
  /** Delta added to bot's envit-accept EV margin. */
  envitAcceptDelta: number;
  /**
   * Multiplier on the probability that the bot asks its partner before
   * playing a card. Conservative bots ask more (>1), aggressive bots ask
   * less (<1). Used by `shouldConsultPartner`.
   */
  consultRate: number;
  /**
   * Hard rule for "conservative" difficulty: only accept envit when the
   * bot has very high winning chances (myEnvit ≥ 31), OR when its team
   * already won the first trick AND either the bot itself or its partner
   * (deduced from chat answers) holds a top truc card (manilla d'oros,
   * manilla d'espases, As bastos, As espases). Otherwise reject. Disabled
   * in balanced/aggressive.
   */
  conservativeMode?: boolean;
}

export const NEUTRAL_TUNING: BotTuning = {
  callPropensity: 1,
  bluffPropensity: 1,
  acceptThresholdDelta: 0,
  envitAcceptDelta: 0,
  consultRate: 1,
  conservativeMode: false,
};

/**
 * Difficulty preset chosen by the player. Controls how MUCH information the
 * bots try to gather from their partner before playing, and how strict they
 * are when accepting envit/truc bets. Bluffing/lying is NOT controlled here
 * — that's handled separately by the bot honesty profile.
 *
 *  - conservative: ask a lot before playing, accept envit only with very
 *    strong hands (≥31) or when the team already won the first trick and
 *    holds a top truc card (own hand or partner's signal).
 *  - balanced: ask a moderate amount; pure adaptive behaviour.
 *  - aggressive: rarely ask before playing, accept envit/truc more loosely
 *    even with marginal hands.
 */
export type BotDifficulty = "conservative" | "balanced" | "aggressive";

export const DEFAULT_DIFFICULTY: BotDifficulty = "conservative";

export function applyDifficulty(t: BotTuning, d: BotDifficulty | null | undefined): BotTuning {
  if (!d || d === "balanced") return { ...t, conservativeMode: false };
  if (d === "conservative") {
    return {
      // Conservative: ask the partner a lot, very tight envit acceptance.
      callPropensity: Math.max(0.4, t.callPropensity * 0.7),
      bluffPropensity: t.bluffPropensity,
      acceptThresholdDelta: t.acceptThresholdDelta + 10,
      envitAcceptDelta: t.envitAcceptDelta - 4,
      consultRate: Math.min(2, t.consultRate * 1.8),
      conservativeMode: true,
    };
  }
  // aggressive
  return {
    callPropensity: Math.min(2, t.callPropensity * 1.2),
    bluffPropensity: t.bluffPropensity,
    acceptThresholdDelta: t.acceptThresholdDelta - 7,
    envitAcceptDelta: t.envitAcceptDelta + 2,
    consultRate: Math.max(0.25, t.consultRate * 0.45),
    conservativeMode: false,
  };
}

/**
 * Reliability ramp: profile barely influences anything until ~5 games,
 * full influence at 20+ games. Avoids overfitting to first hand.
 */
function influence(gamesPlayed: number): number {
  if (gamesPlayed <= 0) return 0;
  if (gamesPlayed >= 20) return 1;
  return gamesPlayed / 20;
}

export function tuningFromProfile(profile: PlayerProfile | null | undefined): BotTuning {
  if (!profile) return NEUTRAL_TUNING;
  const k = influence(profile.games_played);
  if (k === 0) return NEUTRAL_TUNING;

  // Counter-strategy:
  //  - Aggressive human → bot tightens calls (lower propensity, accept more carefully).
  //  - Conservative human → bot calls more (their fold rate is high).
  const aggDelta = profile.aggressiveness - 0.5; // -0.35..+0.4
  const callPropensity = 1 - aggDelta * 0.6 * k;

  //  - Human bluffs a lot → bot bluffs less (gets called) but accepts MORE (calls likely fake).
  //  - Human never bluffs → bot bluffs more, and folds easier to their calls.
  const bluffDelta = profile.bluff_rate - 0.15; // -0.13..+0.45
  const bluffPropensity = Math.max(0.3, 1 - bluffDelta * 1.2 * k);
  const envitAcceptDelta = bluffDelta * 1.5 * k;

  //  - Human folds a lot (low accept) → bot's bluffs are profitable: lower own thresholds.
  //  - Human accepts a lot → bot must have stronger hands to call.
  const acceptDelta = profile.accept_threshold - 0.5;
  const acceptThresholdDelta = -acceptDelta * 15 * k; // ±7.5 strength points

  return {
    callPropensity: Math.max(0.4, Math.min(1.6, callPropensity)),
    bluffPropensity: Math.max(0.2, Math.min(2.5, bluffPropensity)),
    acceptThresholdDelta,
    envitAcceptDelta,
    consultRate: 1,
  };
}