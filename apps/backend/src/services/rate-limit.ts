import type { RateLimitBucket } from '../models.ts';
import type { BackendStore } from '../store.ts';
import { createId, nowIso } from '../utils.ts';

export interface RateLimitPolicy {
  key: string;
  limit: number;
  windowSeconds: number;
  blockSeconds?: number;
}

export class RateLimitService {
  constructor(private readonly store: BackendStore) {}

  consume(policy: RateLimitPolicy): RateLimitBucket {
    const now = Date.now();
    const existing = this.store.rateLimitBuckets.get(policy.key);
    if (existing?.blockedUntil && Date.parse(existing.blockedUntil) > now) {
      throw new Error('Rate limit exceeded. Try again later.');
    }

    const windowMs = policy.windowSeconds * 1000;
    if (!existing || Date.parse(existing.windowStart) + windowMs <= now) {
      const bucket: RateLimitBucket = {
        id: existing?.id ?? createId('rate_limit'),
        key: policy.key,
        windowStart: nowIso(),
        count: 1,
      };
      this.store.rateLimitBuckets.set(policy.key, bucket);
      return bucket;
    }

    existing.count += 1;
    if (existing.count > policy.limit) {
      existing.blockedUntil = new Date(now + (policy.blockSeconds ?? policy.windowSeconds) * 1000).toISOString();
      throw new Error('Rate limit exceeded. Try again later.');
    }
    return existing;
  }
}
