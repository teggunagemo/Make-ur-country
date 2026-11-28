async function startGame() {
  bindEvents();

  const token = localStorage.getItem('sb_access_token');
  if (!token) {
    window.location.href = './index.html';
    return;
  }

  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token}`
  };
  state.headers = headers;

  dom.statusSpan.textContent = '1. ログイン情報を確認中...';
  const user = await getCurrentUser(headers);
  if (!user) {
    localStorage.removeItem('sb_access_token');
    window.location.href = './index.html';
    return;
  }

  dom.statusSpan.textContent = '2. 国家データを取得中...';
  state.allCountries = await loadCountries(headers);
  state.countryDict = { 0: { name: '未占領地', rgb: [144, 238, 144] } };
  state.myCountry = null;

  for (const c of state.allCountries) {
    const rawCid = c.Cid || c.cid || '888888';
    state.countryDict[c.id] = {
      name: c.country_name || `国ID:${c.id}`,
      rgb: cidToRgb(rawCid)
    };
    if (c.user_id === user.email) {
      state.myCountry = c;
    }
  }

  if (!state.myCountry) {
    showFatalError(`${user.email} の国データが countries に見つかりません`);
    return;
  }

  const myCid = state.myCountry.Cid || state.myCountry.cid || '888888';
  dom.statusSpan.innerHTML =
    `あなたの国：<b>${state.myCountry.country_name}</b> (ID: ${state.myCountry.id} / 色: <span style="background:#${myCid}; padding:0 8px; border:1px solid #000;">#${myCid}</span>)`;

  dom.infoBar.textContent = '3. タイルデータ（10,000行）をダウンロード中...';
  state.worldTiles = await fetchAllTiles(headers);

  dom.infoBar.textContent = '4. 初期領土と首都を確認中...';
  await setupInitialTerritory(headers);

  rebuildFullMapBuffer();
  renderMap();
}

startGame().catch((err) => {
  showFatalError(err && err.message ? err.message : String(err));
});
