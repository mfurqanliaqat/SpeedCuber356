import { connectGanCube, cubeTimestampLinearFit, now } from 'gan-web-bluetooth';
import { cubeMac } from './store.js';

export { now };

/**
 * Thin wrapper over gan-web-bluetooth. `askMac(name)` is called only when the
 * cube's address can't be read from its advertisement; the answer is saved.
 */
export class GanLink {
  constructor({ onEvent, onStatus, askMac }) {
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.askMac = askMac;
    this.conn = null;
    this.sub = null;
  }

  get connected() { return !!this.conn; }

  async connect() {
    if (this.conn) return;
    this.onStatus({ state: 'connecting' });
    try {
      const conn = await connectGanCube(async (device, isFallback) => {
        const saved = cubeMac.get(device.name);
        if (saved) return saved;
        if (isFallback) return this.askMac(device.name);
        this.onStatus({ state: 'connecting', detail: 'Reading cube address… keep turning the cube' });
        return (await window.native?.scanCubeMac(device.name)) || null;
      });
      this.conn = conn;
      cubeMac.set(conn.deviceName, conn.deviceMAC);
      this.sub = conn.events$.subscribe((e) => {
        if (e.type === 'DISCONNECT') this.dropped();
        else this.onEvent(e);
      });
      this.onStatus({ state: 'connected', name: conn.deviceName });
      await conn.sendCubeCommand({ type: 'REQUEST_HARDWARE' });
      await conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
      await conn.sendCubeCommand({ type: 'REQUEST_BATTERY' });
    } catch (err) {
      this.conn = null;
      this.onStatus({ state: 'disconnected', error: err?.message || String(err) });
    }
  }

  dropped() {
    this.sub?.unsubscribe();
    this.sub = null;
    this.conn = null;
    this.onStatus({ state: 'disconnected' });
  }

  async disconnect() {
    const c = this.conn;
    this.dropped();
    await c?.disconnect().catch(() => {});
  }

  send(type) { return this.conn?.sendCubeCommand({ type }); }
}

/**
 * Solve time from the cube's own clock, fitted against the host clock
 * (csTimer's method). Returns per-move ms since the first move.
 */
export function fitTimes(moves) {
  const filled = moves.map((m, i) => ({
    ...m,
    localTimestamp: m.localTimestamp ?? moves[i - 1]?.localTimestamp ?? now(),
  }));
  const usable = filled.filter((m) => m.cubeTimestamp != null).length >= 2;
  if (!usable) {
    const t0 = filled[0].localTimestamp;
    return filled.map((m) => m.localTimestamp - t0);
  }
  return cubeTimestampLinearFit(filled).map((m) => m.cubeTimestamp);
}
