async function getCurrentUser(headers) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers });
  if (!res.ok) return null;
  return res.json();
}

async function loadCountries(headers) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/countries?select=*`, { headers });
  if (!res.ok) {
    throw new Error('countries 取得失敗: ' + (await res.text()));
  }
  return res.json();
}

async function fetchAllTiles(headers) {
  const tiles = Array.from({ length: TOTAL_TILES }, (_, idx) => ({
    x: idx % MAP_SIZE,
    y: Math.floor(idx / MAP_SIZE),
    userid: 0,
    unitid: 0
  }));

  const pageSize = 1000;
  for (let start = 0; start < TOTAL_TILES; start += pageSize) {
    const end = Math.min(TOTAL_TILES - 1, start + pageSize - 1);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/world_tiles?select=x,y,userid,unitid&order=y.asc,x.asc`,
      {
        headers: {
          ...headers,
          'Range': `${start}-${end}`
        }
      }
    );

    if (!res.ok) {
      throw new Error('world_tiles 取得失敗: ' + (await res.text()));
    }

    const rows = await res.json();
    for (const row of rows) {
      if (
        typeof row.x === 'number' &&
        typeof row.y === 'number' &&
        row.x >= 0 && row.x < MAP_SIZE &&
        row.y >= 0 && row.y < MAP_SIZE
      ) {
        const idx = getTileIndex(row.x, row.y);
        tiles[idx] = {
          x: row.x,
          y: row.y,
          userid: Number(row.userid ?? 0),
          unitid: Number(row.unitid ?? 0)
        };
      }
    }
  }

  return tiles;
}

async function upsertTiles(headers, updatedTiles) {
  if (!updatedTiles || updatedTiles.length === 0) return;

  const payload = updatedTiles.map((t) => ({
    x: t.x,
    y: t.y,
    userid: t.userid,
    unitid: t.unitid,
    updated_at: new Date().toISOString()
  }));

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/world_tiles?on_conflict=x,y`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    }
  );

  if (!res.ok) {
    throw new Error('world_tiles 保存失敗: ' + (await res.text()));
  }
}

async function enqueuePacket(headers, packet) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/packet_queue`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(packet)
  });

  if (!res.ok) {
    throw new Error('packet_queue 送信失敗: ' + (await res.text()));
  }
}

async function saveCapital(headers, countryId, x, y, isDefeated = false) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/countries?id=eq.${countryId}`, {
    method: 'PATCH',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      capital_x: x,
      capital_y: y,
      is_defeated: isDefeated
    })
  });

  if (!res.ok) {
    throw new Error('首都座標の保存失敗: ' + (await res.text()));
  }

  const updatedRows = await res.json();
  const updated = updatedRows[0] || { capital_x: x, capital_y: y, is_defeated: isDefeated };
  state.allCountries = state.allCountries.map((c) => (c.id === countryId ? { ...c, ...updated } : c));
  if (state.myCountry && state.myCountry.id === countryId) {
    state.myCountry = { ...state.myCountry, ...updated };
  }
}

function collect3x3EmptyTiles(centerX, centerY) {
  const targets = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tile = getTile(centerX + dx, centerY + dy);
      if (tile && tile.userid === 0) {
        targets.push(tile);
      }
    }
  }
  return targets;
}

async function setupInitialTerritory(headers) {
  const firstOwnedTile = state.worldTiles.find((t) => t.userid === state.myCountry.id);

  if (!firstOwnedTile) {
    const emptyTiles = state.worldTiles.filter((t) => t.userid === 0);
    if (emptyTiles.length === 0) {
      dom.infoBar.textContent = '空き地がありません。';
      return;
    }

    const centerTile = emptyTiles[Math.floor(Math.random() * emptyTiles.length)];
    const targets = collect3x3EmptyTiles(centerTile.x, centerTile.y);

    for (const tile of targets) {
      tile.userid = state.myCountry.id;
    }

    await upsertTiles(headers, targets);
    await saveCapital(headers, state.myCountry.id, centerTile.x, centerTile.y, false);

    state.selectedX = centerTile.x;
    state.selectedY = centerTile.y;
    dom.infoBar.textContent =
      `建国完了！首都 (${centerTile.x}, ${centerTile.y}) を中心に ${targets.length} マス（3×3）を確保しました。`;
    return;
  }

  if (!hasValidCapital(state.myCountry)) {
    await saveCapital(headers, state.myCountry.id, firstOwnedTile.x, firstOwnedTile.y, false);
  }

  if (hasValidCapital(state.myCountry)) {
    state.selectedX = state.myCountry.capital_x;
    state.selectedY = state.myCountry.capital_y;
  }

  dom.infoBar.textContent =
    `読み込み完了！首都: (${state.myCountry.capital_x}, ${state.myCountry.capital_y}) | ドラッグで移動・ホイールでズーム`;
}
