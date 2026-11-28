function clampCamera() {
  const visibleSize = MAP_SIZE / state.zoom;
  const maxOffset = Math.max(0, MAP_SIZE - visibleSize);
  state.viewX = Math.min(maxOffset, Math.max(0, state.viewX));
  state.viewY = Math.min(maxOffset, Math.max(0, state.viewY));
}

function updateZoomLabel() {
  dom.zoomLabel.textContent =
    `倍率: ${state.zoom.toFixed(1)}x | 視界: (${state.viewX.toFixed(1)}, ${state.viewY.toFixed(1)})`;
}

function rebuildFullMapBuffer() {
  const imgData = fullMapCtx.createImageData(MAP_SIZE, MAP_SIZE);
  const pixels = imgData.data;
  const unitColor = [255, 255, 255];
  const unknownColor = [180, 180, 180];

  for (let i = 0; i < TOTAL_TILES; i++) {
    const tile = state.worldTiles[i];
    const ownerId = tile ? tile.userid : 0;
    const unitId = tile ? tile.unitid : 0;
    const rgb = unitId > 0
      ? unitColor
      : (state.countryDict[ownerId] ? state.countryDict[ownerId].rgb : unknownColor);

    const p = i * 4;
    pixels[p] = rgb[0];
    pixels[p + 1] = rgb[1];
    pixels[p + 2] = rgb[2];
    pixels[p + 3] = 255;
  }
  fullMapCtx.putImageData(imgData, 0, 0);
}

function renderRightExtension(visibleSize) {
  ctx.save();
  ctx.fillStyle = '#1e242b';
  ctx.fillRect(MAP_DRAW_WIDTH, 0, EXT_WIDTH, CANVAS_HEIGHT);

  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MAP_DRAW_WIDTH + 0.5, 0);
  ctx.lineTo(MAP_DRAW_WIDTH + 0.5, CANVAS_HEIGHT);
  ctx.stroke();

  const tile = getTile(state.selectedX, state.selectedY);
  const owner = tile ? state.countryDict[tile.userid] : null;
  const ownerRgb = owner ? owner.rgb : [180, 180, 180];

  ctx.fillStyle = `rgb(${ownerRgb[0]}, ${ownerRgb[1]}, ${ownerRgb[2]})`;
  ctx.fillRect(106, 8, 12, 12);

  if (tile && tile.unitid > 0) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(122, 8, 12, 12);
  }

  const check = canProduceInfantryAt(state.selectedX, state.selectedY);
  const canClick = check.ok && !state.isProducing;

  ctx.fillStyle = canClick ? '#2e7d32' : '#455a64';
  ctx.fillRect(
    PRODUCE_INFANTRY_BTN.x,
    PRODUCE_INFANTRY_BTN.y,
    PRODUCE_INFANTRY_BTN.w,
    PRODUCE_INFANTRY_BTN.h
  );

  ctx.strokeStyle = canClick ? '#a5d6a7' : '#78909c';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    PRODUCE_INFANTRY_BTN.x + 0.5,
    PRODUCE_INFANTRY_BTN.y + 0.5,
    PRODUCE_INFANTRY_BTN.w - 1,
    PRODUCE_INFANTRY_BTN.h - 1
  );

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 7px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    state.isProducing ? '送信中...' : '歩兵生産',
    PRODUCE_INFANTRY_BTN.x + PRODUCE_INFANTRY_BTN.w / 2,
    PRODUCE_INFANTRY_BTN.y + PRODUCE_INFANTRY_BTN.h / 2 + 0.5
  );

  ctx.restore();
}

function renderMap() {
  clampCamera();
  const visibleSize = MAP_SIZE / state.zoom;

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.drawImage(
    fullMapCanvas,
    state.viewX, state.viewY, visibleSize, visibleSize,
    0, 0, MAP_DRAW_WIDTH, MAP_DRAW_HEIGHT
  );

  const dotSize = Math.max(0.35, 1 / Math.sqrt(state.zoom));
  ctx.fillStyle = CAPITAL_HEX;
  for (const c of state.allCountries) {
    if (c.is_defeated || !hasValidCapital(c)) continue;
    const cx = c.capital_x + 0.5;
    const cy = c.capital_y + 0.5;
    const sx = ((cx - state.viewX) / visibleSize) * MAP_DRAW_WIDTH;
    const sy = ((cy - state.viewY) / visibleSize) * MAP_DRAW_HEIGHT;
    ctx.fillRect(sx - dotSize / 2, sy - dotSize / 2, dotSize, dotSize);
  }

  if (
    typeof state.selectedX === 'number' &&
    typeof state.selectedY === 'number' &&
    state.selectedX >= 0 &&
    state.selectedX < MAP_SIZE &&
    state.selectedY >= 0 &&
    state.selectedY < MAP_SIZE
  ) {
    const cellSize = MAP_DRAW_WIDTH / visibleSize;
    const selX = ((state.selectedX - state.viewX) / visibleSize) * MAP_DRAW_WIDTH;
    const selY = ((state.selectedY - state.viewY) / visibleSize) * MAP_DRAW_HEIGHT;

    ctx.save();
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = Math.max(0.25, Math.min(0.8, 0.45 / Math.sqrt(state.zoom)));
    ctx.strokeRect(selX, selY, cellSize, cellSize);
    ctx.restore();
  }

  renderRightExtension(visibleSize);
  updateZoomLabel();
}
