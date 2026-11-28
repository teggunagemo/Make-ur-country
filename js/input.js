function clientToCanvasCoord(clientX, clientY) {
  const rect = dom.canvas.getBoundingClientRect();
  return {
    cx: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    cy: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT
  };
}

function clientToMapCoord(clientX, clientY) {
  const { cx, cy } = clientToCanvasCoord(clientX, clientY);
  const visibleSize = MAP_SIZE / state.zoom;
  return {
    mapX: state.viewX + (cx / MAP_DRAW_WIDTH) * visibleSize,
    mapY: state.viewY + (cy / MAP_DRAW_HEIGHT) * visibleSize
  };
}

function setZoomAt(nextZoom, focusX = MAP_SIZE / 2, focusY = MAP_SIZE / 2) {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  if (clamped === state.zoom) return;

  const prevVisible = MAP_SIZE / state.zoom;
  const nextVisible = MAP_SIZE / clamped;
  const relX = (focusX - state.viewX) / prevVisible;
  const relY = (focusY - state.viewY) / prevVisible;

  state.zoom = clamped;
  state.viewX = focusX - relX * nextVisible;
  state.viewY = focusY - relY * nextVisible;
  clampCamera();
  renderMap();
}

async function produceInfantryAtSelected(headers) {
  if (state.isProducing || !headers) return;

  const check = canProduceInfantryAt(state.selectedX, state.selectedY);
  if (!check.ok) {
    dom.infoBar.textContent = check.reason;
    return;
  }

  state.isProducing = true;
  renderMap();

  try {
    const tile = check.tile;
    const packet = {
      type: 'produce_unit',
      unit_type: 'infantry',
      unitid: INFANTRY_UNIT_ID,
      x: tile.x,
      y: tile.y,
      userid: state.myCountry.id,
      created_at: new Date().toISOString()
    };

    // 生産完了後に packet_queue へパケットを送信
    await enqueuePacket(headers, packet);

    // 画面表示用のローカル状態も反映（サーバー側トリガやポーリングと合わせる場合は調整可）
    tile.unitid = INFANTRY_UNIT_ID;
    rebuildFullMapBuffer();
    dom.infoBar.textContent = `歩兵生産パケットを送信しました: 座標 (${tile.x}, ${tile.y})`;
  } finally {
    state.isProducing = false;
    renderMap();
  }
}

function handleExtensionClick(cx, cy) {
  if (isPointInRect(cx, cy, PRODUCE_INFANTRY_BTN)) {
    produceInfantryAtSelected(state.headers).catch((err) => {
      state.isProducing = false;
      renderMap();
      showFatalError(err && err.message ? err.message : String(err));
    });
    return;
  }

  dom.infoBar.textContent = `拡張パネルクリック: (${cx.toFixed(1)}, ${cy.toFixed(1)})`;
}

function handleCanvasClick(clientX, clientY) {
  const { cx, cy } = clientToCanvasCoord(clientX, clientY);
  if (cx >= MAP_DRAW_WIDTH) {
    handleExtensionClick(cx, cy);
    return;
  }

  const { mapX, mapY } = clientToMapCoord(clientX, clientY);
  const x = Math.floor(mapX);
  const y = Math.floor(mapY);
  const tile = getTile(x, y);
  if (!tile) return;

  state.selectedX = x;
  state.selectedY = y;

  const ownerName = state.countryDict[tile.userid]
    ? state.countryDict[tile.userid].name
    : `不明(ID:${tile.userid})`;
  const capCountry = state.allCountries.find(
    (c) => !c.is_defeated && c.capital_x === x && c.capital_y === y
  );
  const capText = capCountry ? ` | ★首都: ${capCountry.country_name || `国ID:${capCountry.id}`}` : '';

  dom.infoBar.textContent =
    `座標 (${x}, ${y}) | 領有: ${ownerName} | ユニット: ${tile.unitid === 0 ? 'なし' : tile.unitid}${capText}`;

  renderMap();
}

function bindEvents() {
  window.addEventListener('error', (event) => {
    showFatalError(event.message || '予期しないスクリプトエラー');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason && event.reason.message ? event.reason.message : String(event.reason);
    showFatalError(reason || '非同期処理エラー');
  });

  dom.logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('sb_access_token');
    window.location.href = './index.html';
  });

  dom.canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const { cx } = clientToCanvasCoord(e.clientX, e.clientY);
    if (cx >= MAP_DRAW_WIDTH) return;

    state.isPointerDown = true;
    state.isDragging = false;
    state.dragStartClientX = e.clientX;
    state.dragStartClientY = e.clientY;
    state.dragStartViewX = state.viewX;
    state.dragStartViewY = state.viewY;
    dom.canvas.setPointerCapture(e.pointerId);
    dom.canvas.classList.add('dragging');
  });

  dom.canvas.addEventListener('pointermove', (e) => {
    if (!state.isPointerDown) return;
    const dx = e.clientX - state.dragStartClientX;
    const dy = e.clientY - state.dragStartClientY;
    if (!state.isDragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      state.isDragging = true;
    }
    if (state.isDragging) {
      const rect = dom.canvas.getBoundingClientRect();
      const mapDisplayWidth = rect.width * (MAP_DRAW_WIDTH / CANVAS_WIDTH);
      const mapDisplayHeight = rect.height * (MAP_DRAW_HEIGHT / CANVAS_HEIGHT);
      const visibleSize = MAP_SIZE / state.zoom;
      state.viewX = state.dragStartViewX - (dx / mapDisplayWidth) * visibleSize;
      state.viewY = state.dragStartViewY - (dy / mapDisplayHeight) * visibleSize;
      renderMap();
    }
  });

  dom.canvas.addEventListener('pointerup', (e) => {
    if (!state.isPointerDown) return;
    const wasDragging = state.isDragging;
    state.isPointerDown = false;
    state.isDragging = false;
    dom.canvas.classList.remove('dragging');
    if (dom.canvas.hasPointerCapture(e.pointerId)) {
      dom.canvas.releasePointerCapture(e.pointerId);
    }
    if (!wasDragging) {
      handleCanvasClick(e.clientX, e.clientY);
    }
  });

  dom.canvas.addEventListener('click', (e) => {
    if (state.isPointerDown || state.isDragging) return;
    const { cx } = clientToCanvasCoord(e.clientX, e.clientY);
    if (cx >= MAP_DRAW_WIDTH) {
      handleCanvasClick(e.clientX, e.clientY);
    }
  });

  dom.canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { cx } = clientToCanvasCoord(e.clientX, e.clientY);
    if (cx >= MAP_DRAW_WIDTH) return;
    const { mapX, mapY } = clientToMapCoord(e.clientX, e.clientY);
    setZoomAt(e.deltaY < 0 ? state.zoom * ZOOM_STEP : state.zoom / ZOOM_STEP, mapX, mapY);
  }, { passive: false });

  dom.zoomInBtn.addEventListener('click', () => {
    const visibleSize = MAP_SIZE / state.zoom;
    setZoomAt(state.zoom * ZOOM_STEP, state.viewX + visibleSize / 2, state.viewY + visibleSize / 2);
  });

  dom.zoomOutBtn.addEventListener('click', () => {
    const visibleSize = MAP_SIZE / state.zoom;
    setZoomAt(state.zoom / ZOOM_STEP, state.viewX + visibleSize / 2, state.viewY + visibleSize / 2);
  });

  dom.zoomResetBtn.addEventListener('click', () => {
    state.zoom = 1;
    state.viewX = 0;
    state.viewY = 0;
    renderMap();
  });
}
