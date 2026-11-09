// Squeek Burrow — game state and economy. Everything is local to the player's browser.

export type UpgradeId = "wheel" | "field" | "cheer" | "storage";

export type Upgrade = {
  id: UpgradeId;
  name: string;
  icon: string;
  baseCost: number;
  describe: (level: number) => string;
};

export const COST_GROWTH = 1.15;
export const MAX_OFFLINE_HOURS = 168; // 7 days, the window the stats API covers

export const UPGRADES: Upgrade[] = [
  {
    id: "wheel",
    name: "Wheel Tuning",
    icon: "⚙️",
    baseCost: 25,
    describe: (l) => `${fmt(seedsPerTurn(l))} seed${seedsPerTurn(l) === 1 ? "" : "s"} per real wheel turn`,
  },
  {
    id: "field",
    name: "Sunflower Field",
    icon: "🌻",
    baseCost: 10,
    describe: (l) => `${fmt(passivePerSec(l), 1)} seeds/sec while idle`,
  },
  {
    id: "cheer",
    name: "Cheer Squad",
    icon: "📣",
    baseCost: 100,
    describe: (l) => `×${liveMultiplier(l).toFixed(2)} on everything while Squeektoshi runs`,
  },
  {
    id: "storage",
    name: "Seed Storage",
    icon: "🏚️",
    baseCost: 50,
    describe: (l) => `Offline earnings for up to ${offlineCapHours(l)}h`,
  },
];

export const seedsPerTurn = (wheel: number) => 1 + wheel;
export const passivePerSec = (field: number) => 0.2 + 0.5 * field;
export const liveMultiplier = (cheer: number) => 2 + 0.25 * cheer;
export const offlineCapHours = (storage: number) => Math.min(MAX_OFFLINE_HOURS, 8 + 8 * storage);

export function upgradeCost(u: Upgrade, level: number): number {
  return Math.ceil(u.baseCost * Math.pow(COST_GROWTH, level));
}

export type GameState = {
  version: 1;
  seeds: number;
  totalSeeds: number;
  totalTurnsHarvested: number;
  levels: Record<UpgradeId, number>;
  lastSeen: number; // ms epoch, updated while the page is open
  createdAt: number;
};

export function newGame(now = Date.now()): GameState {
  return {
    version: 1,
    seeds: 0,
    totalSeeds: 0,
    totalTurnsHarvested: 0,
    levels: { wheel: 0, field: 0, cheer: 0, storage: 0 },
    lastSeen: now,
    createdAt: now,
  };
}

const KEY = "squeek-burrow:v1";

export function load(): GameState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as GameState;
      if (s && s.version === 1 && s.levels) return { ...newGame(), ...s, levels: { ...newGame().levels, ...s.levels } };
    }
  } catch {
    /* storage unavailable or corrupt -> fresh game */
  }
  return newGame();
}

export function save(s: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function reset() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function fmt(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  const units = ["", "K", "M", "B", "T", "Qa", "Qi"];
  let i = 0;
  let v = n;
  while (Math.abs(v) >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  if (i === 0) return abs < 100 && digits > 0 ? v.toFixed(digits) : Math.floor(v).toLocaleString("en-US");
  return v.toFixed(2) + units[i];
}
