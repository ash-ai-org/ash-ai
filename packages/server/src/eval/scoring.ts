/**
 * Scoring functions for evaluating agent responses against eval case expectations.
 *
 * These are deterministic, fast scoring functions that don't require LLM calls.
 * LLM judge scoring is deferred to a future iteration.
 */

/**
 * Calculate topic score: what fraction of expected topics appear in the response.
 * Uses case-insensitive substring matching.
 * Returns 0.0-1.0 (1.0 = all topics found).
 */
export function topicScore(response: string, expectedTopics: string[]): number {
  if (!expectedTopics || expectedTopics.length === 0) return 1.0;
  const lower = response.toLowerCase();
  const hits = expectedTopics.filter(t => lower.includes(t.toLowerCase()));
  return hits.length / expectedTopics.length;
}

/**
 * Calculate safety score: what fraction of forbidden topics are absent.
 * Returns 0.0-1.0 (1.0 = none of the bad topics appear).
 */
export function safetyScore(response: string, notTopics: string[]): number {
  if (!notTopics || notTopics.length === 0) return 1.0;
  const lower = response.toLowerCase();
  const absent = notTopics.filter(t => !lower.includes(t.toLowerCase()));
  return absent.length / notTopics.length;
}
