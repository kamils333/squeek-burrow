// Read-only client for the public Squeekchain API (https://docs.squeekchain.com/developers/api).
// Tries the API directly first; if the browser request fails (e.g. CORS), falls back to the
// same-origin rewrite at /sq (see next.config.mjs).

const DIRECT = "https://api.squeekchain.com";
const PROXY = "/sq";

let useProxy = false;

async function getJson<T>(path: string): Promise<T | null> {
  const bases = useProxy ? [PROXY] : [DIRECT, PROXY];
  for (const base of bases) {
    try {
      const res = await fetch(base + path, { cache: "no-cache" });
      if (!res.ok) return null; // 429 / 5xx: treat as unknown this tick
      const data = (await res.json()) as T;
      if (base === PROXY) useProxy = true;
      return data;
    } catch {
      // network / CORS error -> try next base
    }
  }
  return null;
}

export type Measurement = {
  freshness: "online" | "stale";
  observedAt: string;
  counterEpoch: string;
  cumulativeWorkUnits: string;
  provenance: string;
  coreStatus: string;
  rpmMilli: number | null;
  speedMmPerSecond: number | null;
  distanceMm: number | null;
};

export type StatusResponse = { measurement?: Measurement | null; status?: string };

export type StatsBucket = {
  startMinuteUtc: number;
  coverage: "complete" | "partial" | "missing" | "future";
  workUnits: string | null;
};
export type StatsDay = { date: string; distanceMm: string | number | null; buckets: StatsBucket[] };
export type StatsResponse = { status?: string; activity?: { days?: StatsDay[] } };

export async function fetchStatus(): Promise<Measurement | null> {
  const data = await getJson<StatusResponse>("/v1/status");
  if (!data || data.status === "unavailable") return null;
  return data.measurement ?? null;
}

export async function fetchStats7d(): Promise<StatsResponse | null> {
  const data = await getJson<StatsResponse>("/v1/measurement/stats?range=7d");
  if (!data || data.status === "unavailable") return null;
  return data;
}

/**
 * Real wheel turns recorded between `fromMs` and `toMs`, from the half-hour buckets.
 * A Squeekchain "day" runs 12:00 UTC -> 12:00 UTC, so a bucket whose startMinuteUtc is
 * before 12:00 belongs to the following calendar date. Partially overlapping buckets
 * are counted pro rata.
 */
export function turnsBetween(stats: StatsResponse, fromMs: number, toMs: number): number {
  const days = stats.activity?.days ?? [];
  const HALF_HOUR = 30 * 60 * 1000;
  let total = 0;
  for (const day of days) {
    const dayBase = Date.parse(day.date + "T00:00:00Z");
    if (Number.isNaN(dayBase)) continue;
    for (const b of day.buckets ?? []) {
      if (!b.workUnits) continue;
      const work = Number(b.workUnits);
      if (!Number.isFinite(work) || work <= 0) continue;
      const offsetDays = b.startMinuteUtc < 720 ? 1 : 0;
      const start = dayBase + offsetDays * 86400000 + b.startMinuteUtc * 60000;
      const end = start + HALF_HOUR;
      const overlap = Math.min(end, toMs) - Math.max(start, fromMs);
      if (overlap <= 0) continue;
      total += work * Math.min(1, overlap / HALF_HOUR);
    }
  }
  return Math.floor(total);
}

export function isRunning(m: Measurement | null): boolean {
  if (!m || m.freshness !== "online") return false;
  return (m.speedMmPerSecond ?? 0) > 0 || (m.rpmMilli ?? 0) > 0;
}
