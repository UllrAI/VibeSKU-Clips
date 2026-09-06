const utcTimestamp = {
  to: 1114,
  from: [1114],
  serialize: (value: Date | string) =>
    (value instanceof Date ? value : new Date(value))
      .toISOString()
      .replace("T", " ")
      .replace("Z", ""),
  parse: (value: string) => new Date(`${value.replace(" ", "T")}Z`),
};

/**
 * Driver timing behaves the same on every deployment, so it is a constant here
 * rather than an environment variable. Only the pool size, which follows the
 * instance's connection budget, stays configurable.
 */
export const POOL_TIMING = {
  /** Close idle connections after five minutes. */
  idleTimeout: 300,
  /** Recycle a connection after four hours. */
  maxLifetime: 14_400,
  /** Matches the readiness deadline so failed connects cannot accumulate. */
  connectTimeout: 4,
} as const;

export const utcConnectionOptions = {
  connection: {
    TimeZone: "UTC",
  },
  types: {
    utcTimestamp,
  },
};
