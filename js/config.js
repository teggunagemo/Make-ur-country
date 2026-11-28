const SUPABASE_URL = 'https://qmtokeiqblcdcfqvpdzg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_TmSpj-OvbgolXIQOck0l_A_PVke17LC';

const MAP_SIZE = 100;
const TOTAL_TILES = MAP_SIZE * MAP_SIZE;
const MAP_DRAW_WIDTH = 100;
const MAP_DRAW_HEIGHT = 100;
const EXT_WIDTH = 60;
const CANVAS_WIDTH = MAP_DRAW_WIDTH + EXT_WIDTH;
const CANVAS_HEIGHT = MAP_DRAW_HEIGHT;
const CAPITAL_HEX = '#FFD700';
const INFANTRY_UNIT_ID = 1;

const PRODUCE_INFANTRY_BTN = {
  x: 106,
  y: 28,
  w: 48,
  h: 16
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;
const DRAG_THRESHOLD_PX = 5;

const dom = {
  statusSpan: document.getElementById('my-country-info'),
  infoBar: document.getElementById('info-bar'),
  zoomLabel: document.getElementById('zoom-label'),
  canvas: document.getElementById('map-canvas'),
  logoutBtn: document.getElementById('logout-btn'),
  zoomInBtn: document.getElementById('zoom-in-btn'),
  zoomOutBtn: document.getElementById('zoom-out-btn'),
  zoomResetBtn: document.getElementById('zoom-reset-btn')
};

const ctx = dom.canvas.getContext('2d');

const fullMapCanvas = document.createElement('canvas');
fullMapCanvas.width = MAP_SIZE;
fullMapCanvas.height = MAP_SIZE;
const fullMapCtx = fullMapCanvas.getContext('2d');

const state = {
  headers: null,
  isProducing: false,
  worldTiles: Array.from({ length: TOTAL_TILES }, (_, idx) => ({
    x: idx % MAP_SIZE,
    y: Math.floor(idx / MAP_SIZE),
    userid: 0,
    unitid: 0
  })),
  allCountries: [],
  countryDict: {},
  myCountry: null,
  selectedX: 50,
  selectedY: 50,
  zoom: 1,
  viewX: 0,
  viewY: 0,
  isPointerDown: false,
  isDragging: false,
  dragStartClientX: 0,
  dragStartClientY: 0,
  dragStartViewX: 0,
  dragStartViewY: 0
};

function showFatalError(message) {
  console.error('[Make ur country]', message);
  dom.statusSpan.className = 'error-text';
  dom.statusSpan.textContent = 'エラー: ' + message;
  dom.infoBar.textContent = '処理を停止しました。';
}

function getTileIndex(x, y) {
  return y * MAP_SIZE + x;
}

function getTile(x, y) {
  if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) return null;
  return state.worldTiles[getTileIndex(x, y)];
}

function isPointInRect(px, py, rect) {
  return (
    px >= rect.x &&
    px <= rect.x + rect.w &&
    py >= rect.y &&
    py <= rect.y + rect.h
  );
}

function cidToRgb(cidStr) {
  if (!cidStr) return [200, 200, 200];
  const hex = String(cidStr).replace('#', '').trim();
  if (hex.length !== 6) return [200, 200, 200];
  const num = parseInt(hex, 16);
  if (Number.isNaN(num)) return [200, 200, 200];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function hasValidCapital(country) {
  return (
    country &&
    typeof country.capital_x === 'number' &&
    typeof country.capital_y === 'number' &&
    country.capital_x >= 0 &&
    country.capital_x < MAP_SIZE &&
    country.capital_y >= 0 &&
    country.capital_y < MAP_SIZE
  );
}

function canProduceInfantryAt(x, y) {
  const tile = getTile(x, y);
  if (!tile || !state.myCountry) {
    return { ok: false, reason: '選択マスまたは自国情報が不正です' };
  }
  if (tile.userid !== state.myCountry.id) {
    return { ok: false, reason: `座標 (${x}, ${y}) は自国領土ではありません` };
  }
  if (tile.unitid > 0) {
    return { ok: false, reason: `座標 (${x}, ${y}) にはすでにユニット（ID:${tile.unitid}）がいます` };
  }
  return { ok: true, tile };
}
