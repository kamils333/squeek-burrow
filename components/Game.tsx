"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Wheel from "./Wheel";
import { fetchStats7d, fetchStatus, isRunning, turnsBetween, type Measurement } from "@/lib/api";
import {
  UPGRADES,
  fmt,
  liveMultiplier,
  load,
  newGame,
  offlineCapHours,
  passivePerSec,
  reset,
  save,
  seedsPerTurn,
  upgradeCost,
  type GameState,
  type Upgrade,
} from "@/lib/game";

const POLL_MS = 5000;
const TICK_MS = 200;
const RUNNING_GRACE_MS = 30000; // still "running" if a turn arrived within this window
const MAX_TURNS_PER_POLL = 2000; // ignore implausible counter jumps

type Feed = "connecting" | "live" | "stale" | "down";
type LogLine = { id: number; at: number; text: string };
type Welcome = { hours: number; passive: number; turns: number; turnSeeds: number; statsOk: boolean };

export default function Game() {
  const [state, setState] = useState<GameState | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [feed, setFeed] = useState<Feed>("connecting");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [welcome, setWelcome] = useState<Welcome | null>(null);
  const [pop, setPop] = useState<{ id: number; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const stateRef = useRef<GameState | null>(null);
  const runningRef = useRef(false);
  const lastTurnAt = useRef(0);
  const counter = useRef<{ epoch: string; cum: bigint } | null>(null);
  const logId = useRef(0);
  const booted = useRef(false);

  stateRef.current = state;
  runningRef.current = running;

  const addLog = useCallback((text: string) => {
    const id = ++logId.current;
    setLog((l) => [{ id, at: Date.now(), text }, ...l].slice(0, 8));
  }, []);

  // ---- load + offline settlement -------------------------------------------------
  useEffect(() => {
    if (booted.current) return; // guard against double-mount in dev
    booted.current = true;
    const s = load();
    const now = Date.now();
    const elapsed = Math.max(0, now - s.lastSeen);
    const capMs = offlineCapHours(s.levels.storage) * 3600000;
    const credited = Math.min(elapsed, capMs);
    s.lastSeen = now;
    save(s);
    setState(s);

    if (elapsed < 60000) {
      addLog("Burrow opened. Waiting for Squeektoshi…");
      return;
    }
    const passive = passivePerSec(s.levels.field) * (credited / 1000);
    (async () => {
      const stats = await fetchStats7d();
      const turns = stats ? turnsBetween(stats, now - credited, now) : 0;
      const turnSeeds = turns * seedsPerTurn(s.levels.wheel) * liveMultiplier(s.levels.cheer);
      const gained = passive + turnSeeds;
      setState((cur) =>
        cur
          ? {
              ...cur,
              seeds: cur.seeds + gained,
              totalSeeds: cur.totalSeeds + gained,
              totalTurnsHarvested: cur.totalTurnsHarvested + turns,
            }
          : cur,
      );
      setWelcome({ hours: credited / 3600000, passive, turns, turnSeeds, statsOk: !!stats });
      addLog(`Welcome back: +${fmt(gained)} seeds while you were away.`);
    })();
  }, [addLog]);

  // ---- live polling ----------------------------------------------------------------
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      const m = await fetchStatus();
      if (stop) return;
      if (!m) {
        setFeed("down");
        setMeasurement(null);
        return;
      }
      setMeasurement(m);
      setFeed(m.freshness === "online" ? "live" : "stale");

      let cum: bigint;
      try {
        cum = BigInt(m.cumulativeWorkUnits);
      } catch {
        return;
      }
      const prev = counter.current;
      counter.current = { epoch: m.counterEpoch, cum };
      if (!prev) {
        // first reading: trust the device's own speed until real turns arrive
        if (isRunning(m) && Date.now() - Date.parse(m.observedAt) < 15000) lastTurnAt.current = Date.now();
        return;
      }
      if (prev.epoch !== m.counterEpoch || cum <= prev.cum) return;
      const delta = Number(cum - prev.cum);
      if (delta > MAX_TURNS_PER_POLL) return;

      lastTurnAt.current = Date.now();
      const s = stateRef.current;
      if (!s) return;
      const gain = delta * seedsPerTurn(s.levels.wheel) * liveMultiplier(s.levels.cheer);
      setState((cur) =>
        cur
          ? {
              ...cur,
              seeds: cur.seeds + gain,
              totalSeeds: cur.totalSeeds + gain,
              totalTurnsHarvested: cur.totalTurnsHarvested + delta,
            }
          : cur,
      );
      setPop({ id: Date.now(), text: `+${fmt(gain)}` });
      addLog(`Squeektoshi ran ${delta} turn${delta === 1 ? "" : "s"} → +${fmt(gain)} seeds`);
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [addLog]);

  // ---- game tick (passive income, running flag, autosave) --------------------------
  useEffect(() => {
    let last = Date.now();
    let lastSave = last;
    const id = setInterval(() => {
      const now = Date.now();
      const dt = (now - last) / 1000;
      last = now;
      const isRun = now - lastTurnAt.current < RUNNING_GRACE_MS;
      if (isRun !== runningRef.current) setRunning(isRun);
      setState((cur) => {
        if (!cur) return cur;
        const rate = passivePerSec(cur.levels.field) * (isRun ? liveMultiplier(cur.levels.cheer) : 1);
        const next = { ...cur, seeds: cur.seeds + rate * dt, totalSeeds: cur.totalSeeds + rate * dt, lastSeen: now };
        if (now - lastSave > 5000) {
          lastSave = now;
          save(next);
        }
        return next;
      });
    }, TICK_MS);
    const flush = () => stateRef.current && save({ ...stateRef.current, lastSeen: Date.now() });
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, []);

  const buy = (u: Upgrade) => {
    setState((cur) => {
      if (!cur) return cur;
      const lvl = cur.levels[u.id];
      const cost = upgradeCost(u, lvl);
      if (cur.seeds < cost) return cur;
      const next = { ...cur, seeds: cur.seeds - cost, levels: { ...cur.levels, [u.id]: lvl + 1 } };
      save(next);
      return next;
    });
    addLog(`Bought ${u.name}.`);
  };

  const doReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    reset();
    const fresh = newGame();
    save(fresh);
    setState(fresh);
    setConfirmReset(false);
    setLog([]);
    addLog("Fresh burrow dug.");
  };

  if (!state) return <main className="loading">Digging the burrow…</main>;

  const mult = running ? liveMultiplier(state.levels.cheer) : 1;
  const rate = passivePerSec(state.levels.field) * mult;
  const rpm = (measurement?.rpmMilli ?? 0) / 1000;
  const kmh = ((measurement?.speedMmPerSecond ?? 0) * 3.6) / 1000;
  const todayKm = (measurement?.distanceMm ?? 0) / 1e6;

  const badge =
    feed === "connecting"
      ? { cls: "badge", text: "CONNECTING" }
      : feed === "down"
        ? { cls: "badge off", text: "FEED OFFLINE" }
        : running
          ? { cls: "badge live", text: "● LIVE — RUNNING" }
          : feed === "stale"
            ? { cls: "badge off", text: "WHEEL OFFLINE" }
            : { cls: "badge", text: "RESTING" };

  return (
    <main>
      <header className="top">
        <div>
          <h1>SQUEEK BURROW</h1>
          <p className="sub">An idle game powered by Squeektoshi&apos;s real wheel on Squeekchain</p>
        </div>
        <span className={badge.cls}>{badge.text}</span>
      </header>

      <section className="hero">
        <div className="wheel-wrap">
          <Wheel rpm={rpm} running={running} />
          {pop && (
            <span key={pop.id} className="pop">
              {pop.text}
            </span>
          )}
        </div>
        <div className="panel">
          <div className="seeds">
            <span className="label">SEEDS</span>
            <span className="big">🌻 {fmt(state.seeds)}</span>
            <span className="rate">
              +{fmt(rate, 1)}/sec idle · {fmt(seedsPerTurn(state.levels.wheel) * mult)} per real turn
              {running && <b> · ×{mult.toFixed(2)} live boost</b>}
            </span>
          </div>
          <dl className="stats">
            <div>
              <dt>Speed</dt>
              <dd>{running ? `${kmh.toFixed(2)} km/h` : "—"}</dd>
            </div>
            <div>
              <dt>Wheel</dt>
              <dd>{running ? `${rpm.toFixed(1)} rpm` : "—"}</dd>
            </div>
            <div>
              <dt>Today (real)</dt>
              <dd>{measurement ? `${todayKm.toFixed(2)} km` : "—"}</dd>
            </div>
            <div>
              <dt>Turns harvested</dt>
              <dd>{fmt(state.totalTurnsHarvested)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="upgrades">
        <h2>UPGRADES</h2>
        {UPGRADES.map((u) => {
          const lvl = state.levels[u.id];
          const cost = upgradeCost(u, lvl);
          const capped = u.id === "storage" && offlineCapHours(lvl) >= 168;
          const can = state.seeds >= cost && !capped;
          return (
            <button key={u.id} className="upgrade" disabled={!can} onClick={() => buy(u)}>
              <span className="icon">{u.icon}</span>
              <span className="info">
                <b>
                  {u.name} <small>Lv {lvl}</small>
                </b>
                <span>{u.describe(lvl)}</span>
              </span>
              <span className="cost">{capped ? "MAX" : `🌻 ${fmt(cost)}`}</span>
            </button>
          );
        })}
      </section>

      <section className="log">
        <h2>BURROW LOG</h2>
        <ul>
          {log.map((l) => (
            <li key={l.id}>
              <time>{new Date(l.at).toLocaleTimeString("en-GB")}</time> {l.text}
            </li>
          ))}
        </ul>
      </section>

      <footer>
        <p>
          Seeds are a game score only — not SQK, not tokens, no wallet needed. Real wheel data from the public{" "}
          <a href="https://docs.squeekchain.com/" target="_blank" rel="noreferrer">
            Squeekchain API
          </a>{" "}
          (Sepolia). Community project for the{" "}
          <a href="https://squeekchain.com/genesis" target="_blank" rel="noreferrer">
            Squeekchain Genesis
          </a>{" "}
          Buildooooor badge. Not affiliated with Squeekchain.
        </p>
        <button className="reset" onClick={doReset}>
          {confirmReset ? "Click again to wipe your burrow" : "Reset game"}
        </button>
      </footer>

      {welcome && (
        <div className="modal" onClick={() => setWelcome(null)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <h2>WELCOME BACK</h2>
            <p>While you were away ({welcome.hours.toFixed(1)}h credited):</p>
            <ul>
              <li>🌻 Sunflower field: +{fmt(welcome.passive)}</li>
              <li>
                🐹 Squeektoshi ran {fmt(welcome.turns)} turns: +{fmt(welcome.turnSeeds)}
              </li>
            </ul>
            {!welcome.statsOk && <p className="muted">Wheel history was unavailable, so only the field paid out.</p>}
            <button onClick={() => setWelcome(null)}>Collect</button>
          </div>
        </div>
      )}
    </main>
  );
}
