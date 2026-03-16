/**
 * config/redis.ts - Redis connection options for BullMQ
 *
 * BullMQ uses its own bundled ioredis internally.
 * We export plain connection options (host/port) rather than an ioredis
 * instance to avoid version-mismatch type errors.
 */

export interface RedisConnectionOptions {
  host: string;
  port: number;
  maxRetriesPerRequest: null; // required by BullMQ
}

/**
 * Returns Redis connection options derived from environment variables.
 */
export function getRedisConnection(): RedisConnectionOptions {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    maxRetriesPerRequest: null,
  };
}
