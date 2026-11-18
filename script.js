// ===== Arcainad - Menu + Lobby Multiplayer (cores, admin servidor) =====
(function () {
  'use strict';

  const SAVE_KEY = 'arcainad_save';
  const TOKEN_KEY = 'arcainad_token';
  const USER_KEY = 'arcainad_user';
  const LAST_UID_KEY = 'arcainad_last_user_id';
  const API_BASE = () => localStorage.getItem('arcainad_api_base') || window.ARCAINAD_API_BASE || 'http://localhost:3000';
  const PLAYER_COLORS = ['#39ff14', '#b026ff', '#00ffff', '#ff8c00', '#ff4fd8', '#ffffff', '#ffe600'];

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) { window.location.href = 'login.html'; return; }
  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch {}
  if (currentUser && currentUser.id != null) {
    const prev = localStorage.getItem(LAST_UID_KEY);
    if (prev && prev !== String(currentUser.id)) { localStorage.removeItem(SAVE_KEY); }
    localStorage.setItem(LAST_UID_KEY, String(currentUser.id));
  }

  const btnOnline = document.getElementById('btn-online');
  const btnContinuar = document.getElementById('btn-continuar');
  const btnNovo = document.getElementById('btn-novo');
  const btnCreditos = document.getElementById('btn-creditos');
  const btnSair = document.getElementById('btn-sair');
  const btnLogout = document.getElementById('btn-logout');
  const modalCreditos = document.getElementById('modal-creditos');
  const saveStatus = document.getElementById('save-status');
  const userInfo = document.getElementById('user-info');
  const colorWrap = document.getElementById('player-colors');

  const lobbyOverlay = document.getElementById('lobby-overlay');
  const createOverlay = document.getElementById('create-overlay');
  const joinPassOverlay = document.getElementById('joinpass-overlay');
  const srvSetOverlay = document.getElementById('server-settings-overlay');
  const serversList = document.getElementById('servers-list');
  const lobbyMsg = document.getElementById('lobby-msg');
  const createMsg = document.getElementById('create-msg');
  const srvSetMsg = document.getElementById('srvset-msg');

  let pendingJoinServer = null;
  let settingsServer = null;

  function setUserInfo() {
    if (userInfo) userInfo.textContent = currentUser && currentUser.username ? ('Usuário: ' + currentUser.username) : '';
  }
  setUserInfo();

  // mesma regra do jogo: save por conta quando logado, senao save legado
  function saveKey() {
    const uid = (currentUser && currentUser.id != null) ? currentUser.id : null;
    return uid != null ? ('arcainad_save_u_' + uid) : SAVE_KEY;
  }
  function lerSave() {
    const raw = localStorage.getItem(saveKey()) || localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    try { const d = JSON.parse(raw); return (d && typeof d === 'object') ? d : null; } catch { return null; }
  }
  function atualizarEstadoContinuar() {
    const dados = lerSave();
    const temSave = !!dados;
    btnContinuar.disabled = !temSave;
    btnContinuar.setAttribute('aria-disabled', String(!temSave));
    if (saveStatus) saveStatus.textContent = temSave ? 'Save local detectado — pronto para continuar.' : '';
    const hint = document.getElementById('continue-hint');
    if (hint) hint.textContent = temSave ? ('cena: ' + (dados.scene === 'forest' ? 'floresta' : 'laboratorio')) : 'nenhum save local';
  }
  function continuarJogoLocal() {
    const dados = lerSave();
    if (!dados) { atualizarEstadoContinuar(); return; }
    sessionStorage.removeItem('arcainad_online');
    window.location.href = 'game/index.html';
  }
  function novoJogoLocal() {
    try {
      localStorage.removeItem(saveKey());
      localStorage.removeItem(SAVE_KEY);
      const rm = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('arcainad_save_u_') === 0) rm.push(k);
      }
      rm.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
    try { sessionStorage.removeItem('arcainad_online'); } catch (e) {}
    window.location.href = 'game/index.html';
  }
  function openModal(el) { el.classList.add('is-open'); el.setAttribute('aria-hidden', 'false'); }
  function closeModal(el) { el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true'); }

  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem(TOKEN_KEY) }, opts.headers || {});
    const res = await fetch(API_BASE() + path, Object.assign({}, opts, { headers }));
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { doLogout(false); throw new Error('Sessão expirada'); }
    if (!res.ok) throw new Error(data.error || ('Erro HTTP ' + res.status));
    return data;
  }
  function doLogout(redirect) {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); sessionStorage.removeItem('arcainad_online'); } catch {}
    if (redirect !== false) window.location.href = 'login.html';
  }

  // ===== Cores do jogador =====
  function renderColorPicker() {
    if (!colorWrap) return;
    colorWrap.innerHTML = '';
    const selected = (currentUser && currentUser.color) || '#39ff14';
    PLAYER_COLORS.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'color-swatch' + (c.toLowerCase() === selected.toLowerCase() ? ' selected' : '');
      b.style.background = c; b.title = c; b.setAttribute('aria-label', 'Cor ' + c);
      b.addEventListener('click', () => selectColor(c));
      colorWrap.appendChild(b);
    });
  }
  async function selectColor(color) {
    try {
      const data = await api('/api/me', { method: 'PATCH', body: JSON.stringify({ color }) });
      currentUser = data.user || currentUser;
      localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
      renderColorPicker();
    } catch (e) { if (lobbyMsg) lobbyMsg.textContent = e.message; else saveStatus.textContent = e.message; }
  }
  renderColorPicker();

  function renderServers(servers) {
    serversList.innerHTML = '';
    if (!servers.length) { lobbyMsg.textContent = 'Nenhum servidor encontrado. Crie um servidor ou atualize.'; return; }
    lobbyMsg.textContent = 'Servidores: ' + servers.length;
    servers.forEach(s => {
      const row = document.createElement('div'); row.className = 'server-row';
      const info = document.createElement('div'); info.className = 'server-info';
      info.innerHTML = '<div class="server-name"></div><div class="server-meta"></div>';
      const tags = [];
      if (s.has_password) tags.push('senha');
      if (s.is_member) tags.push(s.role || 'membro');
      if (typeof s.online_count === 'number') tags.push('online: ' + s.online_count + '/8');
      info.querySelector('.server-name').textContent = (s.server_name || 'Servidor') + (tags.length ? ' [' + tags.join(', ') + ']' : '');
      info.querySelector('.server-meta').textContent = 'Dono: ' + (s.owner_name || '?') + ' | ID: ' + s.id;
      const actions = document.createElement('div'); actions.className = 'server-actions';
      if (s.is_owner) {
        const gear = document.createElement('button'); gear.type = 'button'; gear.className = 'icon-btn'; gear.textContent = '⚙'; gear.title = 'Configurações (dono)';
        gear.addEventListener('click', () => openServerSettings(s));
        actions.appendChild(gear);
      }
      const btn = document.createElement('button'); btn.className = 'menu-btn small-btn'; btn.type = 'button'; btn.textContent = 'Entrar';
      btn.addEventListener('click', () => tryJoinServer(s));
      actions.appendChild(btn);
      row.appendChild(info); row.appendChild(actions);
      serversList.appendChild(row);
    });
  }

  async function loadServers() {
    lobbyMsg.textContent = 'Carregando servidores...'; serversList.innerHTML = '';
    try { const data = await api('/api/servers/browse', { method: 'GET' }); {
        const list = data.servers || [];
        renderServers(list);
        const chip = document.getElementById('lobby-count');
        if (chip) chip.textContent = list.length + ' servidor' + (list.length === 1 ? '' : 'es');
      }
    }
    catch (e) { lobbyMsg.textContent = e.message || 'Falha ao listar servidores.'; }
  }

  function tryJoinServer(server) {
    pendingJoinServer = server;
    if (server.has_password) { document.getElementById('join-pass').value = ''; document.getElementById('joinpass-msg').textContent = ''; openModal(joinPassOverlay); }
    else enterServer(server.id, '');
  }
  function enterServer(serverId, password) {
    sessionStorage.setItem('arcainad_online', JSON.stringify({ serverId, password: password || '', apiBase: API_BASE(), userId: currentUser && currentUser.id, username: currentUser && currentUser.username, color: currentUser && currentUser.color }));
    window.location.href = 'game/index.html';
  }

  async function createServer() {
    const name = (document.getElementById('server-name').value || '').trim();
    const pass = document.getElementById('server-pass').value || '';
    if (!name) { createMsg.textContent = 'Informe o nome do servidor.'; return; }
    createMsg.textContent = 'Criando...';
    try { await api('/api/servers', { method: 'POST', body: JSON.stringify({ server_name: name, password: pass }) }); createMsg.textContent = 'Servidor criado.'; closeModal(createOverlay); await loadServers(); }
    catch (e) { createMsg.textContent = e.message || 'Falha ao criar servidor.'; }
  }

  // ===== Configurações do servidor (dono) =====
  function openServerSettings(s) {
    settingsServer = s;
    document.getElementById('srvset-name').value = s.server_name || '';
    document.getElementById('srvset-pass').value = '';
    srvSetMsg.textContent = '';
    openModal(srvSetOverlay);
  }
  async function saveServerSettings() {
    if (!settingsServer) return;
    const name = (document.getElementById('srvset-name').value || '').trim();
    const pass = document.getElementById('srvset-pass').value; // vazio = remover senha
    srvSetMsg.textContent = 'Salvando...';
    try {
      const body = { server_name: name, password: pass };
      await api('/api/servers/' + settingsServer.id, { method: 'PATCH', body: JSON.stringify(body) });
      srvSetMsg.textContent = 'Alterações salvas.';
      await loadServers();
      setTimeout(() => closeModal(srvSetOverlay), 400);
    } catch (e) { srvSetMsg.textContent = e.message || 'Falha ao salvar (verifique se você é o dono).'; }
  }
  async function deleteServer() {
    if (!settingsServer) return;
    if (!confirm('Tem certeza que deseja excluir este servidor?')) return;
    if (!confirm('Confirmação final: todos os dados deste servidor serão perdidos. Excluir?')) return;
    srvSetMsg.textContent = 'Excluindo...';
    try {
      await api('/api/servers/' + settingsServer.id, { method: 'DELETE' });
      closeModal(srvSetOverlay); settingsServer = null; await loadServers();
    } catch (e) { srvSetMsg.textContent = e.message || 'Falha ao excluir (apenas o criador pode excluir).'; }
  }

  if (btnNovo) btnNovo.addEventListener('click', novoJogoLocal);
  btnOnline.addEventListener('click', () => { openModal(lobbyOverlay); loadServers(); });
  btnContinuar.addEventListener('click', continuarJogoLocal);
  btnCreditos.addEventListener('click', () => openModal(modalCreditos));
  btnSair.addEventListener('click', () => { window.location.href = 'https://www.google.com'; });
  document.getElementById('btn-fechar-creditos').addEventListener('click', () => closeModal(modalCreditos));
  btnLogout.addEventListener('click', () => { doLogout(true); });
  document.getElementById('btn-close-lobby').addEventListener('click', () => closeModal(lobbyOverlay));
  document.getElementById('btn-refresh-servers').addEventListener('click', loadServers);
  document.getElementById('btn-create-server').addEventListener('click', () => { document.getElementById('server-name').value=''; document.getElementById('server-pass').value=''; createMsg.textContent=''; openModal(createOverlay); });
  document.getElementById('btn-cancel-create').addEventListener('click', () => closeModal(createOverlay));
  document.getElementById('btn-confirm-create').addEventListener('click', createServer);
  document.getElementById('btn-cancel-join').addEventListener('click', () => closeModal(joinPassOverlay));
  document.getElementById('btn-confirm-join').addEventListener('click', () => { if (!pendingJoinServer) return; const pass = document.getElementById('join-pass').value || ''; closeModal(joinPassOverlay); enterServer(pendingJoinServer.id, pass); });
  document.getElementById('btn-srvset-cancel').addEventListener('click', () => closeModal(srvSetOverlay));
  document.getElementById('btn-srvset-save').addEventListener('click', saveServerSettings);
  document.getElementById('btn-srvset-delete').addEventListener('click', deleteServer);

  [lobbyOverlay, createOverlay, joinPassOverlay, modalCreditos, srvSetOverlay].forEach(el => { if (el) el.addEventListener('click', (e) => { if (e.target === el) closeModal(el); }); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') [createOverlay, joinPassOverlay, modalCreditos, srvSetOverlay, lobbyOverlay].forEach(el => { if (el && el.classList.contains('is-open')) closeModal(el); }); });

  // atalhos de teclado
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const ae = document.activeElement;
    const tag = (ae && ae.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
    const primary = document.querySelector('.menu-btn.primary');
    if (primary) { e.preventDefault(); primary.click(); }
  });

  atualizarEstadoContinuar();
})();
