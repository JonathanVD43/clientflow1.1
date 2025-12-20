// src/lib/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

function disabledRatelimit() {
  return {
    limit: async () => ({
      success: true,
      limit: 0,
      remaining: 0,
      reset: 0,
    }),
  };
}

function makeRedis() {
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = makeRedis();

export const uploadRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      prefix: "rl:upload",
    })
  : disabledRatelimit();

export const apiRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, "1 m"),
      prefix: "rl:api",
    })
  : disabledRatelimit();

export const tokenCheckRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "10 m"),
      prefix: "rl:token-check",
    })
  : disabledRatelimit();
