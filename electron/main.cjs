const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

// Lets gan-web-bluetooth read the cube's address from its advertisement
// (watchAdvertisements), so you usually don't have to type it.
app.commandLine.appendSwitch('enable-experimental-web-platform-features');

const CUBE_NAME = /^(GAN|MG|AiCube)/;
const SCAN_TIMEOUT = 10000;

/**
 * GAN cubes encrypt with their Bluetooth address, which macOS hides from
 * Chromium. The cube also puts it (reversed) in the last 6 bytes of its
 * advertisement's manufacturer data, which CoreBluetooth does expose, so read
 * it there with a native BLE scan. Cubes advertise rarely (an i Carry 2 can go
 * 20s+ between packets), so scanning starts as soon as Connect is clicked and
 * every address seen is cached.
 */
let noble = null;
const macs = new Map(); // advertised name → address
const waiters = new Set();
let scanStop = null;
let scanning = false;

function onDiscover(p) {
  const ad = p.advertisement, md = ad.manufacturerData;
  if (!CUBE_NAME.test(ad.localName || '')) return;
  // GAN company IDs are 0x??01, little-endian in the first two bytes.
  if (!md || md.length < 8 || md[0] !== 0x01) return;
  const mac = [...md.subarray(md.length - 6)].reverse().map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
  macs.set(ad.localName, mac);
  for (const w of waiters) w();
}

async function startMacScan(duration = 30000) {
  clearTimeout(scanStop);
  scanStop = setTimeout(() => { scanning = false; noble?.stopScanningAsync().catch(() => {}); }, duration);
  if (scanning) return;
  scanning = true;
  if (!noble) {
    noble = require('@stoprocent/noble');
    noble.on('discover', onDiscover);
  }
  try {
    await noble.waitForPoweredOnAsync(5000);
    await noble.startScanningAsync([], true);
  } catch (err) {
    scanning = false;
    throw err;
  }
}

/** Address for the cube Chromium picked; falls back to the only other GAN cube seen. */
async function scanCubeMac(name, timeout = 30000) {
  const pick = () => macs.get(name) || (macs.size === 1 ? [...macs.values()][0] : null);
  if (pick()) return pick();
  await startMacScan(timeout);
  return new Promise((resolve) => {
    const done = (mac) => { clearTimeout(timer); waiters.delete(check); resolve(mac); };
    const check = () => { if (macs.has(name)) done(macs.get(name)); };
    const timer = setTimeout(() => done(pick()), timeout);
    waiters.add(check);
  });
}
ipcMain.handle('scan-cube-mac', (_e, name) => scanCubeMac(name).catch((err) => {
  console.log('MAC scan failed:', err.message);
  return null;
}));

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 880,
    minWidth: 1100,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });

  // Replace Chrome's device picker: connect to the first GAN cube found.
  let scan = null;
  win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    if (!scan || scan.callback !== callback) {
      startMacScan().catch((err) => console.log('MAC scan failed:', err.message));
      scan = { callback, timer: setTimeout(() => { scan = null; callback(''); }, SCAN_TIMEOUT) };
    }
    const cube = devices.find((d) => CUBE_NAME.test(d.deviceName));
    if (cube) {
      clearTimeout(scan.timer);
      scan = null;
      callback(cube.deviceId);
    }
  });

  // Run the renderer's connect with a user gesture, which Web Bluetooth requires.
  ipcMain.handle('connect-with-gesture', () =>
    win.webContents.executeJavaScript('window.__connectCube()', true).catch(() => {}));

  // In development, show renderer errors in the terminal.
  if (!app.isPackaged) {
    win.webContents.on('console-message', (e) => {
      if (e.level === 'error' || e.level === 'warning') console.log(`[renderer ${e.level}]`, e.message);
    });
  }

  if (process.env.VITE_DEV_URL) win.loadURL(process.env.VITE_DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
// The native BLE module can keep the process alive, so exit hard.
app.on('window-all-closed', () => app.exit(0));
