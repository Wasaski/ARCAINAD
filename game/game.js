// ===== Arcainad - jogo (boot robusto, cenas, multiplayer, UI) =====
// Kaboom.js + HTML/CSS UI. Reescrito para inicialização estável.

(function () {
  'use strict';

  // ===== Constantes =====
  const SAVE_KEY_LEGACY = 'arcainad_save';
  const NOTES_KEY_LEGACY = 'arcainad_terminal_notes';
  const TILE = 32;
  const SPEED = 120;
  const VIEW_W = 14 * TILE;
  const VIEW_H = 10 * TILE;

  // Resolucao dinamica: canvas preenche a tela (sem faixas pretas no mobile)
  const VIEW = { w: 448, h: 320, scale: 1 };
  // Viewport: ignora o encolhimento causado pelo teclado (mesma largura, altura menor)
  let _baseW = 0, _baseH = 0;
  function computeView(force) {
    const w = Math.max(280, window.innerWidth || 360);
    let h = Math.max(280, window.innerHeight || 640);
    const ae = document.activeElement;
    const fieldFocused = !!(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'));
    const widthChanged = (w !== _baseW);
    const looksLikeKeyboard = (fieldFocused || (UI && UI.kbOpen)) || (_baseH && h < _baseH * 0.82);
    if (!force && !widthChanged && looksLikeKeyboard && _baseH) {
      h = _baseH;                 // teclado: mantem a escala
    } else {
      _baseW = w; _baseH = h;     // viewport real mudou (rotacao/tamanho)
    }
    VIEW.w = w; VIEW.h = h;
    VIEW.scale = Math.max(1, Math.min(4, h / 340));
    return VIEW;
  }
  function viewWorld() {
    const s = VIEW.scale || 1;
    return { w: VIEW.w / s, h: VIEW.h / s };
  }
  function applyViewScale() { try { camScale(VIEW.scale || 1); } catch (e) {} }
  const PLAYER_HB = { x: 9, y: 22, w: 14, h: 8 };

  // ===== Helpers globais de status/erro (funcionam antes do Kaboom) =====
  function setBootStatus(msg, isError) {
    try {
      var el = document.getElementById('game-loading');
      if (!el) {
        el = document.createElement('div');
        el.id = 'game-loading';
        document.body.appendChild(el);
      }
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.textAlign = 'center';
      el.style.padding = '20px';
      el.style.zIndex = '9998';
      el.style.background = 'rgba(11,18,32,0.98)';
      el.style.color = isError ? '#f87171' : '#cbd5e1';
      el.style.font = '14px/1.6 Inter,system-ui,sans-serif';
      el.style.whiteSpace = 'pre-wrap';
      el.textContent = msg || '';
    } catch (e) {}
  }
  function hideBootStatus() {
    try { var el = document.getElementById('game-loading'); if (el) el.style.display = 'none'; } catch (e) {}
  }
  function showFatal(msg) {
    setBootStatus(msg, true);
    try {
      var ge = document.getElementById('game-error');
      if (ge) { ge.style.display = 'block'; ge.textContent = msg; }
    } catch (e) {}
  }

  setBootStatus('Iniciando jogo...');

  // ===== Identidade / modo online =====
  function safeJsonParse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }
  function currentUser() { return safeJsonParse(localStorage.getItem('arcainad_user') || 'null', null); }
  function saveKeyForLocal() {
    const u = currentUser();
    return (u && u.id != null) ? ('arcainad_save_u_' + u.id) : SAVE_KEY_LEGACY;
  }
  function isOnlineSession() {
    try {
      const s = safeJsonParse(sessionStorage.getItem('arcainad_online') || 'null', null);
      return !!(s && s.serverId && localStorage.getItem('arcainad_token'));
    } catch { return false; }
  }
  const ONLINE_MODE = isOnlineSession();

  // ===== DOM =====
  const interactPrompt = document.getElementById('interact-prompt');
  const fadeOverlay = document.getElementById('fade-overlay');
  const notification = document.getElementById('notification');
  const btnPause = document.getElementById('btn-pause');
  const pauseMenu = document.getElementById('pause-menu');
  const pauseMain = document.getElementById('pause-main');
  const pauseConfig = document.getElementById('pause-config');
  const pauseContinue = document.getElementById('pause-continue');
  const pauseSettings = document.getElementById('pause-settings');
  const pauseMainMenu = document.getElementById('pause-mainmenu');
  const cfgBack = document.getElementById('cfg-back');
  const cfgNight = document.getElementById('cfg-night');
  const cfgFps = document.getElementById('cfg-fps');
  const hudChip = document.getElementById('hud-chip');
  const hudFps = document.getElementById('hud-fps');
  const hudScene = document.getElementById('hud-scene');
  const cfgFullscreen = document.getElementById('cfg-fullscreen');
  const pcOverlay = document.getElementById('pc-overlay');
  const pcNotes = document.getElementById('pc-notes');
  const pcSave = document.getElementById('pc-save');
  const pcClose = document.getElementById('pc-close');
  const pcStatus = document.getElementById('pc-status');
  const actionBtn = document.getElementById('btn-action');
  const joystickZone = document.getElementById('joystick-zone');
  const joystickStick = document.getElementById('joystick-stick');
  const joystickBase = document.getElementById('joystick-base');
  const btnInventory = document.getElementById('btn-inventory');
  const inventoryOverlay = document.getElementById('inventory-overlay');
  const invClose = document.getElementById('inv-close');
  const invSlots = Array.from(document.querySelectorAll('.inv-slot'));
  const chatUi = document.getElementById('chat-ui');
  const chatHistory = document.getElementById('chat-history');
  const chatInputWrap = document.getElementById('chat-input-wrap');
  const chatInput = document.getElementById('chat-input');
  const chatBtn = document.getElementById('btn-chat');
  const speechLayer = document.getElementById('speech-layer');
  const btnDismount = document.getElementById('btn-dismount');

  // ===== Estado =====
  const UI = {
    pcOpen: false, paused: false, transitioning: false, inventoryOpen: false,
    interactTarget: null,
    joystick: { x: 0, y: 0, active: false },
    currentScene: 'lab',
    playerPos: { x: 2 * TILE, y: 7 * TILE },
    notes: '',
    hasBackpack: false,
    inventory: new Array(20).fill(null),
    selectedSlot: null,
    debug: false,
    chatOpen: false,
    typing: false,
    dialogOpen: false,
    chatMessages: [],
    color: '#39ff14',
    ridingCow: false,
  };
  window.ArcainadUI = UI;

  // preenchida pelo modulo do joystick (var = sem TDZ)
  var resetStickRef = null;

  let solidWalls = [];
  let mapBounds = { w: VIEW_W, h: VIEW_H };
  function setCollisionWorld(walls, bounds) {
    solidWalls = walls || [];
    mapBounds = bounds || { w: VIEW_W, h: VIEW_H };
  }

  // ===== Save / Load =====
  function readSave() {
    try {
      const raw = localStorage.getItem(saveKeyForLocal());
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }
  function normalizeInventory(inv) {
    const arr = new Array(20).fill(null);
    if (Array.isArray(inv)) for (let i = 0; i < 20; i++) arr[i] = (i < inv.length ? inv[i] : null);
    return arr;
  }
  function writeSave(extra) {
    if (ONLINE_MODE) return;
    const prev = readSave() || {};
    const next = Object.assign({}, prev, {
      scene: UI.currentScene,
      playerX: UI.playerPos.x,
      playerY: UI.playerPos.y,
      notes: UI.notes,
      hasBackpack: !!UI.hasBackpack,
      inventory: Array.isArray(UI.inventory) ? UI.inventory : new Array(20).fill(null),
      versao: 6,
      ownerId: (currentUser() && currentUser().id) || null,
    }, extra || {});
    try { localStorage.setItem(saveKeyForLocal(), JSON.stringify(next)); } catch {}
  }
  function initStateFromSave() {
    if (ONLINE_MODE) {
      UI.notes = '';
      UI.hasBackpack = false;
      UI.inventory = normalizeInventory(null);
      UI.currentScene = 'lab';
      UI.playerPos = { x: 2 * TILE, y: 7 * TILE };
      UI._awaitingServerState = true;
      return;
    }
    const s = readSave();
    const legacyNotes = localStorage.getItem(NOTES_KEY_LEGACY) || '';
    UI.notes = (s && typeof s.notes === 'string') ? s.notes : legacyNotes;
    UI.hasBackpack = !!(s && s.hasBackpack);
    UI.inventory = normalizeInventory(s && s.inventory);
    if (s && (s.scene === 'lab' || s.scene === 'forest') && typeof s.playerX === 'number' && typeof s.playerY === 'number') {
      UI.currentScene = s.scene;
      UI.playerPos = { x: s.playerX, y: s.playerY };
    } else {
      UI.currentScene = 'lab';
      UI.playerPos = { x: 2 * TILE, y: 7 * TILE };
      writeSave({ cena: 'laboratorio', iniciadoEm: (s && s.iniciadoEm) || new Date().toISOString() });
    }
  }

  // ===== Notificação / Prompt =====
  let notifTimer = null;
  function showNotification(text) {
    if (!notification) return;
    notification.textContent = text;
    notification.classList.remove('hidden');
    if (notifTimer) clearTimeout(notifTimer);
    notifTimer = setTimeout(() => notification.classList.add('hidden'), 2800);
  }
  function setPrompt(target) {
    UI.interactTarget = target;
    if (!interactPrompt) return;
    if (!target || UI.pcOpen || UI.paused || UI.transitioning || UI.inventoryOpen || UI.typing) {
      interactPrompt.classList.add('hidden'); return;
    }
    let text = '';
    if (target === 'pc') text = '<span class="prompt-key">E / A</span> Interagir com o Terminal';
    else if (target === 'door_forest') text = '<span class="prompt-key">E / A</span> Sair para a Floresta';
    else if (target === 'door_lab') text = '<span class="prompt-key">E / A</span> Entrar no Laboratório';
    else if (target === 'backpack') text = '<span class="prompt-key">E / A</span> Pegar mochila';
    else if (target === 'npc') text = '<span class="prompt-key">E / A</span> Conversar';
    else if (target === 'mount_cow') text = '<span class="prompt-key">E / A</span> Subir na vaca';
    interactPrompt.innerHTML = text;
    interactPrompt.classList.remove('hidden');
  }
  function updateInventoryButton() {
    if (!btnInventory) return;
    if (UI.hasBackpack) btnInventory.classList.remove('hidden'); else btnInventory.classList.add('hidden');
  }

  // ===== PC =====
  function openPC() {
    if (UI.pcOpen || UI.paused || UI.transitioning || UI.inventoryOpen || !pcOverlay) return;
    UI.pcOpen = true; setPrompt(null);
    if (pcNotes) pcNotes.value = UI.notes || '';
    if (pcStatus) pcStatus.textContent = '';
    pcOverlay.classList.remove('hidden'); pcOverlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => { try { pcNotes && pcNotes.focus(); } catch {} }, 0);
  }
  function closePC() {
    UI.pcOpen = false;
    if (pcNotes) UI.notes = pcNotes.value;
    if (!ONLINE_MODE) writeSave({ notes: UI.notes });
    if (pcOverlay) { pcOverlay.classList.add('hidden'); pcOverlay.setAttribute('aria-hidden', 'true'); }
    if (pcStatus) pcStatus.textContent = '';
  }
  function saveNotes() {
    if (pcNotes) UI.notes = pcNotes.value;
    if (!ONLINE_MODE) {
      try { localStorage.setItem(NOTES_KEY_LEGACY, UI.notes); } catch {}
      writeSave({ notes: UI.notes });
    }
    if (pcStatus) {
      pcStatus.textContent = ONLINE_MODE ? 'Anotações salvas (online).' : 'Anotações salvas.';
      setTimeout(() => {
        if (pcStatus && pcStatus.textContent && pcStatus.textContent.indexOf('Anotações salvas') === 0) pcStatus.textContent = '';
      }, 2000);
    }
    if (Net.online && Net.socket && Net.socket.connected) {
      try { Net.socket.emit('pc_notes_update', { text: UI.notes || '' }); } catch {}
    }
  }
  if (pcSave) onTap(pcSave, saveNotes);
  if (pcClose) onTap(pcClose, closePC);

  // ===== Inventário =====
  function renderInventory() {
    invSlots.forEach((slot, i) => {
      slot.classList.toggle('selected', UI.selectedSlot === i);
      const item = UI.inventory[i];
      slot.textContent = item ? (item.label || '?') : '';
    });
  }
  function openInventory() {
    if (!UI.hasBackpack || UI.paused || UI.transitioning || UI.pcOpen || !inventoryOverlay) return;
    UI.inventoryOpen = true; setPrompt(null); renderInventory();
    inventoryOverlay.classList.remove('hidden'); inventoryOverlay.setAttribute('aria-hidden', 'false');
  }
  function closeInventory() {
    UI.inventoryOpen = false;
    if (inventoryOverlay) { inventoryOverlay.classList.add('hidden'); inventoryOverlay.setAttribute('aria-hidden', 'true'); }
  }
  function toggleInventory() { if (UI.inventoryOpen) closeInventory(); else openInventory(); }
  invSlots.forEach((slot) => {
    slot.addEventListener('pointerdown', (e) => { try { e.preventDefault(); } catch (err) {} }, { passive: false });
    slot.addEventListener('click', () => {
      const idx = Number(slot.dataset.slot);
      UI.selectedSlot = (UI.selectedSlot === idx) ? null : idx;
      renderInventory();
    });
  });
  if (invClose) onTap(invClose, closeInventory);
  if (btnInventory) onTap(btnInventory, () => { if (!UI.transitioning) toggleInventory(); });

  // Toque em botao: dispara no pointerdown (resposta imediata, sem zoom de toque duplo)
  // e ignora o click sintetico que vem depois, evitando acao duplicada.
  function onTap(el, fn) {
    if (!el) return;
    let lastPointer = 0;
    el.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      lastPointer = Date.now();
      try { e.preventDefault(); } catch (err) {}
      fn(e);
    }, { passive: false });
    el.addEventListener('click', function (e) {
      if (Date.now() - lastPointer < 600) { try { e.preventDefault(); } catch (err) {} return; }
      fn(e);
    });
  }

  // ===== Pausa =====
  function showPause(show) {
    if (!pauseMenu) { UI.paused = !!show; return; }
    if (show) {
      // fecha chat e dialogos abertos antes de pausar
      if (UI.chatOpen || UI.typing) { try { openChatInput(false); } catch (e) {} }
      if (UI.dialogOpen) { try { closeDialogue(); } catch (e) {} }
      UI.paused = true;
      UI.joystick.x = 0; UI.joystick.y = 0; UI.joystick.active = false;
      UI.pcOpen = false; UI.inventoryOpen = false;
      if (pcOverlay) { pcOverlay.classList.add('hidden'); pcOverlay.setAttribute('aria-hidden', 'true'); }
      if (inventoryOverlay) { inventoryOverlay.classList.add('hidden'); inventoryOverlay.setAttribute('aria-hidden', 'true'); }
      if (pauseConfig) pauseConfig.classList.add('hidden');
      if (pauseMain) pauseMain.classList.remove('hidden');
      pauseMenu.classList.remove('hidden'); pauseMenu.setAttribute('aria-hidden', 'false');
      setPrompt(null);
    } else {
      UI.paused = false;
      pauseMenu.classList.add('hidden'); pauseMenu.setAttribute('aria-hidden', 'true');
      // garante que o canvas volte a aparecer e aceite input
      try {
        const cv = document.querySelector('#game-root canvas');
        if (cv) {
          cv.style.display = 'block';
          cv.style.visibility = 'visible';
          cv.style.opacity = '1';
          try { cv.focus({ preventScroll: true }); } catch (e) { try { cv.focus(); } catch (e2) {} }
        }
        resizeNight();
      } catch (e) {}
    }
  }
  onTap(btnPause, () => { if (!UI.transitioning) showPause(!UI.paused); });
  onTap(pauseContinue, () => showPause(false));
  onTap(pauseSettings, () => { if (pauseMain) pauseMain.classList.add('hidden'); if (pauseConfig) pauseConfig.classList.remove('hidden'); });
  onTap(cfgBack, () => { if (pauseConfig) pauseConfig.classList.add('hidden'); if (pauseMain) pauseMain.classList.remove('hidden'); });
  if (cfgFullscreen) onTap(cfgFullscreen, () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(()=>{});
    else document.exitFullscreen && document.exitFullscreen().catch(()=>{});
  });
  function setToggle(btn, on, labelOn, labelOff) {
    if (!btn) return;
    btn.classList.toggle('on', !!on);
    btn.setAttribute('aria-pressed', String(!!on));
    btn.textContent = on ? labelOn : labelOff;
  }
  if (cfgNight) onTap(cfgNight, () => {
    UI.nightEnabled = UI.nightEnabled === false;
    setToggle(cfgNight, UI.nightEnabled !== false, 'Ligada', 'Desligada');
    try { resizeNight(); } catch (e) {}
    showNotification(UI.nightEnabled === false ? 'Iluminação noturna desligada' : 'Iluminação noturna ligada');
  });
  if (cfgFps) onTap(cfgFps, () => {
    UI.showFps = UI.showFps === false;
    setToggle(cfgFps, UI.showFps !== false, 'Ligado', 'Desligado');
    if (hudChip) hudChip.style.display = UI.showFps === false ? 'none' : 'inline-flex';
  });
  if (pauseMainMenu) onTap(pauseMainMenu, () => {
    if (!ONLINE_MODE) writeSave();
    try { sessionStorage.removeItem('arcainad_online'); } catch {}
    window.location.href = '../index.html';
  });

  // ===== Transição =====
  function fadeToScene(sceneName, spawn) {
    if (UI.transitioning) return;
    if (UI.ridingCow && typeof window.__arcDoDismountCow === 'function') window.__arcDoDismountCow(true);
    UI.transitioning = true; setPrompt(null);
    if (UI.pcOpen) { if (pcNotes) UI.notes = pcNotes.value; UI.pcOpen = false; if (pcOverlay) pcOverlay.classList.add('hidden'); }
    if (UI.inventoryOpen) { UI.inventoryOpen = false; if (inventoryOverlay) inventoryOverlay.classList.add('hidden'); }
    if (!ONLINE_MODE) writeSave({ scene: sceneName, playerX: spawn.x, playerY: spawn.y });
    if (fadeOverlay) fadeOverlay.classList.add('visible');
    setTimeout(() => {
      UI.currentScene = sceneName; UI.playerPos = { x: spawn.x, y: spawn.y };
      try { if (typeof window.kaboomGo === 'function') window.kaboomGo(sceneName, spawn); } catch (e) { showFatal('Erro ao mudar de cena: ' + (e && e.message ? e.message : e)); }
      sendMovement(true);
      setTimeout(() => { if (fadeOverlay) fadeOverlay.classList.remove('visible'); UI.transitioning = false; }, 450);
    }, 450);
  }

  // ===== Interação =====
  let pendingAction = null;
  function triggerAction() {
    if (UI.transitioning || UI.paused || UI.pcOpen || UI.inventoryOpen || UI.typing) return;
    if (UI.ridingCow) {
      if (typeof window.__arcDoDismountCow === 'function') window.__arcDoDismountCow();
      return;
    }
    if (UI.interactTarget === 'pc') openPC();
    else if (UI.interactTarget === 'door_forest') fadeToScene('forest', { x: 12 * TILE, y: 12 * TILE });
    else if (UI.interactTarget === 'door_lab') fadeToScene('lab', { x: 7 * TILE, y: 7 * TILE });
    else if ((UI.interactTarget === 'backpack' || UI.interactTarget === 'mount_cow') && typeof pendingAction === 'function') pendingAction();
  }
  if (actionBtn) actionBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); triggerAction(); }, { passive: false });
  function updateDismountButton() {
    if (!btnDismount) return;
    if (UI.ridingCow) btnDismount.classList.remove('hidden'); else btnDismount.classList.add('hidden');
  }
  window.__arcDismountCow = function() {
    if (typeof window.__arcDoDismountCow === 'function') window.__arcDoDismountCow();
  };
  if (btnDismount) onTap(btnDismount, () => { if (UI.ridingCow && window.__arcDismountCow) window.__arcDismountCow(); });

  document.addEventListener('keydown', (e) => {
    if (UI.typing) return;
    if (e.key === 'F1' || e.key === 'h' || e.key === 'H') { e.preventDefault(); UI.debug = !UI.debug; showNotification(UI.debug ? 'Debug: hitboxes ON' : 'Debug: hitboxes OFF'); return; }
    if (e.key === 'Enter' && !UI.pcOpen && !UI.inventoryOpen && !UI.paused && !UI.transitioning) { e.preventDefault(); openChatInput(true); return; }
    if (e.key === 'Escape') {
      if (UI.dialogOpen) { closeDialogue(); return; }
      if (UI.chatOpen) { openChatInput(false); return; }
      if (UI.pcOpen) { closePC(); return; }
      if (UI.inventoryOpen) { closeInventory(); return; }
      if (!UI.transitioning) showPause(!UI.paused);
      return;
    }
    if ((e.key === 'e' || e.key === 'E') && !UI.pcOpen && !UI.inventoryOpen) triggerAction();
    if ((e.key === 'i' || e.key === 'I' || e.key === 'Tab') && !UI.pcOpen && !UI.transitioning) { e.preventDefault(); if (!UI.paused) toggleInventory(); }
  });

  // ===== Joystick =====
  (function setupJoystick() {
    if (!joystickZone || !joystickBase || !joystickStick) return;
    let pointerId = null;
    function getMaxDist() { return Math.max(28, (joystickBase.getBoundingClientRect().width / 2) - 18); }
    function setFromClient(clientX, clientY) {
      const r = joystickBase.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = clientX - cx, dy = clientY - cy;
      const maxDist = getMaxDist();
      const dist = Math.hypot(dx, dy);
      if (dist > maxDist && dist > 0) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }
      joystickStick.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
      const len = Math.hypot(dx, dy);
      const dead = 6;
      if (len < dead) { UI.joystick.x = 0; UI.joystick.y = 0; }
      else { UI.joystick.x = dx / maxDist; UI.joystick.y = dy / maxDist; }
    }
    function resetStick() {
      joystickStick.style.transform = 'translate(-50%, -50%)';
      UI.joystick.x = 0; UI.joystick.y = 0; UI.joystick.active = false; pointerId = null;
    }
    resetStickRef = resetStick;
    function isBlocked() { return UI.pcOpen || UI.paused || UI.transitioning || UI.inventoryOpen; }
    joystickZone.addEventListener('pointerdown', (e) => {
      // se o chat estiver aberto, um toque no joystick fecha o chat e devolve o controle
      if (UI.chatOpen || UI.typing) {
        try { openChatInput(false); } catch (err) {}
      }
      if (UI.pcOpen || UI.paused || UI.transitioning || UI.inventoryOpen) return;
      pointerId = e.pointerId; UI.joystick.active = true;
      try { joystickZone.setPointerCapture(pointerId); } catch {}
      setFromClient(e.clientX, e.clientY); e.preventDefault();
    }, { passive: false });
    joystickZone.addEventListener('pointermove', (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      setFromClient(e.clientX, e.clientY); e.preventDefault();
    }, { passive: false });
    function end(e) {
      if (pointerId === null || (e && e.pointerId !== undefined && e.pointerId !== pointerId)) return;
      try { if (e && e.pointerId !== undefined) joystickZone.releasePointerCapture(e.pointerId); } catch {}
      resetStick();
    }
    joystickZone.addEventListener('pointerup', end);
    joystickZone.addEventListener('pointercancel', end);
    joystickZone.addEventListener('lostpointercapture', resetStick);
    window.addEventListener('pointerup', end);
    window.addEventListener('blur', resetStick);
  })();

  // ===== Estado inicial / cor =====
  initStateFromSave();
  updateInventoryButton();
  try { const u = safeJsonParse(localStorage.getItem('arcainad_user') || 'null', null); if (u && /^#[0-9a-fA-F]{6}$/.test(u.color)) UI.color = u.color; } catch {}
  try { const s = safeJsonParse(sessionStorage.getItem('arcainad_online') || 'null', null); if (s && /^#[0-9a-fA-F]{6}$/.test(s.color)) UI.color = s.color; } catch {}

  // ===== Cores =====
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : { r:57, g:255, b:20 };
  }
  function applyPlayerTint(entity, hex) {
    if (!entity || !entity.exists || !entity.exists()) return;
    const c = hexToRgb(hex || UI.color);
    try { entity.use(color(c.r, c.g, c.b)); } catch(e) {}
  }

  // ===== Speech bubbles =====
  const speechBubbles = new Map();
  function addSpeechBubble(key, text, scene, worldX, worldY) {
    if (!speechLayer) return;
    const old = speechBubbles.get(key);
    if (old && old.el) try { old.el.remove(); } catch {}
    const el = document.createElement('div');
    el.className = 'speech-bubble';
    el.textContent = text || '';
    speechLayer.appendChild(el);
    const len = String(text || '').length;
    const duration = Math.max(2000, Math.min(10000, 1800 + len * 70));
    speechBubbles.set(key, { el, until: Date.now() + duration, key, text, scene, worldX, worldY });
  }
  let _canvasRect = null;
  function refreshCanvasRect() {
    const canvas = document.querySelector('#game-root canvas');
    _canvasRect = canvas ? canvas.getBoundingClientRect() : null;
  }
  window.addEventListener('resize', refreshCanvasRect);
  window.addEventListener('orientationchange', () => setTimeout(refreshCanvasRect, 300));

  function updateSpeechBubbles() {
    if (!speechLayer) return;
    if (!_canvasRect) refreshCanvasRect();
    const rect = _canvasRect;
    if (!rect) return;
    const now = Date.now();
    speechBubbles.forEach((b, k) => {
      if (now > b.until) { if (b.el) try { b.el.remove(); } catch {} speechBubbles.delete(k); return; }
      if (b.scene !== UI.currentScene) { b.el.style.display = 'none'; return; }
      b.el.style.display = 'block';
      let sx = 0, sy = 0;
      try {
        if (typeof toScreen === 'function' && typeof vec2 === 'function' && typeof width === 'function' && typeof height === 'function') {
          const s = toScreen(vec2(b.worldX, b.worldY));
          sx = rect.left + (s.x / width()) * rect.width;
          sy = rect.top + (s.y / height()) * rect.height;
        } else { sx = rect.left; sy = rect.top; }
      } catch(e) { sx = rect.left; sy = rect.top; }
      b.el.style.left = sx + 'px';
      b.el.style.top = (sy - 6) + 'px';
    });
  }
  let _lastOverlayTick = 0;
  function tickUiOverlays() {
    const now = Date.now();
    if (now - _lastOverlayTick < 66) return;
    _lastOverlayTick = now;
    updateSpeechBubbles();
  }

  // ===== Chat =====
  function renderChatHistory() {
    if (!chatHistory) return;
    chatHistory.innerHTML = '';
    const msgs = UI.chatMessages.slice(-6);
    msgs.forEach(m => {
      const row = document.createElement('div');
      row.className = 'chat-msg';
      const name = document.createElement('span');
      name.className = 'chat-name';
      name.textContent = '[' + (m.username || '?') + ']:';
      name.style.color = m.color || '#39ff14';
      const body = document.createElement('span');
      body.textContent = ' ' + (m.text || '');
      row.appendChild(name); row.appendChild(body);
      chatHistory.appendChild(row);
    });
  }
  function pushChatMessage(msg) {
    UI.chatMessages.push(msg);
    if (UI.chatMessages.length > 6) UI.chatMessages = UI.chatMessages.slice(-6);
    renderChatHistory();
  }
  function openChatInput(open) {
    UI.chatOpen = !!open;
    UI.typing = !!open;
    if (!chatInputWrap) return;
    if (open) {
      chatInputWrap.classList.remove('hidden');
      if (chatInput) {
        chatInput.value = '';
        setTimeout(() => {
          try {
            chatInput.focus();
            window.scrollTo(0, 0);
          } catch (e) {}
        }, 0);
      }
    } else {
      chatInputWrap.classList.add('hidden');
      if (chatInput) {
        try { chatInput.blur(); } catch (e) {}
      }
      // devolve o controle ao joystick imediatamente
      UI.joystick.x = 0; UI.joystick.y = 0; UI.joystick.active = false;
      try { resetStickRef && resetStickRef(); } catch (e) {}
      setTimeout(() => { try { window.scrollTo(0, 0); } catch (e) {} }, 60);
    }
  }
  function sendChat() {
    if (!chatInput) return;
    const text = (chatInput.value || '').trim();
    openChatInput(false);
    if (!text) return;
    if (Net && Net.online && Net.socket && Net.socket.connected) {
      try { Net.socket.emit('chat_message', { text }); } catch {}
    } else {
      const msg = { username: (Net && Net.username) || 'Você', color: UI.color, text };
      pushChatMessage(msg);
      addSpeechBubble('local', text, UI.currentScene, UI.playerPos.x + 16, UI.playerPos.y);
    }
  }
  if (chatBtn) onTap(chatBtn, () => openChatInput(!UI.chatOpen));
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
      else if (e.key === 'Escape') { e.preventDefault(); openChatInput(false); }
      e.stopPropagation();
    });
  }

  // ===== Multiplayer =====
  const Net = {
    online: false, socket: null, myId: null, username: null, serverId: null,
    remote: new Map(), lastSent: 0,
  };

  function applyServerMe(me, notes) {
    if (!me) return;
    if (typeof notes === 'string') UI.notes = notes;
    if (typeof me.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(me.color)) UI.color = me.color;
    UI.hasBackpack = !!me.hasBackpack;
    UI.inventory = normalizeInventory(me.inventory);
    updateInventoryButton();
    const scene = (me.scene === 'lab' || me.scene === 'forest') ? me.scene : 'lab';
    const pos = { x: (typeof me.x === 'number' ? me.x : 64), y: (typeof me.y === 'number' ? me.y : 224) };
    UI.currentScene = scene; UI.playerPos = pos; UI._awaitingServerState = false;
    if (typeof window.kaboomGo === 'function') {
      try { window.kaboomGo(scene, pos); } catch(e) { console.error(e); }
    }
    if (window.__arcPlayer) applyPlayerTint(window.__arcPlayer, UI.color);
    showNotification('Conectado: ' + (me.username || Net.username) + ' (' + scene + ')');
    setTimeout(() => sendMovement(true), 150);
  }

  function initNetwork() {
    const sess = safeJsonParse(sessionStorage.getItem('arcainad_online') || 'null', null);
    const token = localStorage.getItem('arcainad_token');
    const user = safeJsonParse(localStorage.getItem('arcainad_user') || 'null', null);
    Net.username = (user && user.username) || 'Player';
    if (!sess || !sess.serverId || !token || typeof io === 'undefined') { Net.online = false; UI._awaitingServerState = false; return; }
    Net.online = true; Net.serverId = Number(sess.serverId);
    const apiBase = sess.apiBase || localStorage.getItem('arcainad_api_base') || 'http://localhost:3000';
    try {
      Net.socket = io(apiBase, {
        auth: { token, serverId: Net.serverId, password: sess.password || '' },
        transports: ['websocket', 'polling'],
      });
    } catch (e) { console.error('Socket init error', e); Net.online = false; UI._awaitingServerState = false; return; }

    Net.socket.on('connect', () => { Net.myId = Net.socket.id; });
    Net.socket.on('joined', (data) => {
      Net.myId = Net.socket.id;
      Net.remote.clear();
      if (data && data.me) {
        applyServerMe(data.me, data.notes);
      } else if (data && typeof data.notes === 'string') {
        UI.notes = data.notes; UI._awaitingServerState = false;
      }
      ((data && data.players) || []).forEach(p => { if (p.id !== Net.myId) upsertRemote(p); });
    });
    Net.socket.on('player_joined', (p) => { if (p && p.id !== Net.myId) upsertRemote(p); });
    Net.socket.on('player_update', (p) => { if (p && p.id !== Net.myId) upsertRemote(p); });
    Net.socket.on('player_left', (p) => { if (p && p.id) removeRemote(p.id); });
    Net.socket.on('pc_notes_sync', (data) => {
      if (data && typeof data.text === 'string') {
        UI.notes = data.text;
        if (UI.pcOpen && pcNotes) pcNotes.value = UI.notes;
        showNotification((data.username || 'Jogador') + ' atualizou as notas do PC');
      }
    });
    Net.socket.on('chat_message', (msg) => {
      if (!msg) return;
      pushChatMessage(msg);
      const text = msg.text || '';
      if (msg.fromId && Net.myId && msg.fromId === Net.myId) {
        addSpeechBubble('local', text, UI.currentScene, UI.playerPos.x + 16, UI.playerPos.y);
      } else if (msg.fromId && Net.remote.has(msg.fromId)) {
        const r = Net.remote.get(msg.fromId);
        addSpeechBubble(msg.fromId, text, r.scene || UI.currentScene, (r.tx||r.x||0)+16, (r.ty||r.y||0));
      } else {
        Net.remote.forEach((r, id) => {
          if (r.username === msg.username) addSpeechBubble(id, text, r.scene||UI.currentScene, (r.tx||r.x||0)+16, (r.ty||r.y||0));
        });
      }
    });
    Net.socket.on('error_message', (d) => { if (d && d.error) showNotification(d.error); });
    Net.socket.on('connect_error', (err) => {
      const msg = err && err.message ? err.message : 'falha na conexão';
      showNotification('Online: ' + msg);
      if (/autentic|Senha|inválid|Conta/i.test(msg)) {
        setTimeout(() => { try { sessionStorage.removeItem('arcainad_online'); } catch {} window.location.href = '../index.html'; }, 1800);
      }
    });
    Net.socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') {
        showNotification('Desconectado do servidor.');
        setTimeout(() => { try { sessionStorage.removeItem('arcainad_online'); } catch {} window.location.href = '../index.html'; }, 1800);
      }
    });
  }

  function upsertRemote(p) {
    let r = Net.remote.get(p.id);
    if (!r) {
      r = { id: p.id, username: p.username || '?', color: p.color || '#00ffff', x: p.x||64, y: p.y||224, tx: p.x||64, ty: p.y||224, scene: p.scene||'lab', dir: p.dir||'down', anim: p.anim||'down-idle', hasBackpack: !!p.hasBackpack, entity: null, label: null, lastSeen: Date.now(), _spriteName: null, _color: null };
      Net.remote.set(p.id, r);
    }
    r.username = p.username || r.username;
    if (typeof p.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.color)) r.color = p.color;
    r.tx = (typeof p.x === 'number' ? p.x : r.tx);
    r.ty = (typeof p.y === 'number' ? p.y : r.ty);
    r.scene = p.scene || r.scene;
    r.dir = p.dir || r.dir;
    r.anim = p.anim || r.anim;
    r.hasBackpack = !!p.hasBackpack;
    r.lastSeen = Date.now();
  }
  function removeRemote(id) {
    const r = Net.remote.get(id);
    if (r && r.entity && r.entity.exists && r.entity.exists()) try { r.entity.destroy(); } catch {}
    Net.remote.delete(id);
  }

  function sendMovement(force) {
    if (!Net.online || !Net.socket || !Net.socket.connected) return;
    const now = Date.now();
    if (!force && now - Net.lastSent < 100) return;
    Net.lastSent = now;
    const anim = (window.__arcPlayer && typeof window.__arcPlayer.curAnim === 'function' && window.__arcPlayer.curAnim()) || (window.__arcPlayer && (window.__arcPlayer.dir + '-idle')) || 'down-idle';
    try {
      Net.socket.emit('player_movement', {
        x: UI.playerPos.x, y: UI.playerPos.y, scene: UI.currentScene,
        dir: (window.__arcPlayer && window.__arcPlayer.dir) || 'down', anim,
        hasBackpack: !!UI.hasBackpack, inventory: UI.inventory, color: UI.color,
      });
    } catch {}
  }

  initNetwork();

  // ===== Kaboom boot =====
  if (typeof kaboom !== 'function') {
    showFatal('Erro: Kaboom.js não carregou.\nVerifique a conexão com a internet e recarregue a página.');
    return;
  }
  setBootStatus('Inicializando motor gráfico...');

  function initKaboom() {
    const root = document.getElementById('game-root');
    computeView();
    const optsList = [
      { root, width: VIEW.w, height: VIEW.h, crisp: true, background: [8, 10, 20], pixelDensity: 1 },
      { root, width: VIEW.w, height: VIEW.h, background: [8, 10, 20], pixelDensity: 1 },
      { root, width: VIEW_W, height: VIEW_H, background: [8, 10, 20] },
    ];
    let lastErr = null;
    for (let i = 0; i < optsList.length; i++) {
      try {
        if (root) Array.from(root.querySelectorAll('canvas')).forEach(c => { try { c.remove(); } catch {} });
        kaboom(optsList[i]);
        return true;
      } catch (e) {
        lastErr = e;
        console.warn('kaboom init tentativa falhou', i, e);
      }
    }
    const msg = 'Erro ao iniciar motor gráfico: ' + (lastErr && lastErr.message ? lastErr.message : lastErr) +
      '\n\nDica: tente outro navegador, atualize o app do navegador ou ative aceleração de hardware/WebGL.';
    showFatal(msg);
    throw lastErr || new Error(msg);
  }
  initKaboom();
  applyViewScale();
  // initNight usa const NightFX declarado mais abaixo: diferido para depois da avaliacao
  setTimeout(() => { try { initNight(); } catch (e) { console.warn('nightfx', e); } }, 0);
  window.addEventListener('resize', () => {
    const ae = document.activeElement;
    const typing = !!(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) || (UI && UI.kbOpen);
    if (typing) return;                      // teclado abrindo/fechando: nao mexe na escala
    computeView(); applyViewScale();
    try { resizeNight(); } catch (e) {}
  });
  // O teclado do celular redimensiona a viewport: NAO recalcular escala aqui
  // (era isso que fazia a tela dar zoom e nao voltar ao normal).
  document.addEventListener('focusin', (e) => {
    const t = e && e.target;
    const isField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    if (!isField) return;
    UI.kbOpen = true;
    try { window.scrollTo(0, 0); } catch (err) {}
  });
  document.addEventListener('focusout', (e) => {
    const t = e && e.target;
    const isField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    if (!isField) return;
    setTimeout(() => {
      const ae = document.activeElement;
      const stillField = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
      if (stillField) return;
      UI.kbOpen = false;
      try { window.scrollTo(0, 0); } catch (err) {}
      try { resizeNight(); } catch (err) {}
    }, 260);
  });
  // toque duplo em qualquer area do jogo nao da zoom
  (function () {
    let lastTap = 0, lx = 0, ly = 0;
    document.addEventListener('touchstart', function (e) {
      if (e.touches && e.touches.length !== 1) { lastTap = 0; return; }
      const t = e.target;
      const tag = (t && t.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') { lastTap = 0; return; }
      const p = e.touches[0];
      const now = Date.now();
      if (now - lastTap < 340 && Math.abs(p.clientX - lx) < 26 && Math.abs(p.clientY - ly) < 26) {
        lastTap = 0;
        if (e.cancelable) e.preventDefault();
        return;
      }
      lastTap = now; lx = p.clientX; ly = p.clientY;
    }, { passive: false });
  })();
  // se o navegador (ou o teclado) deixou a pagina em zoom, tenta voltar para 1
  let _unzoomBusy = false;
  function forceUnzoom() {
    try {
      const vv = window.visualViewport;
      if (!vv) return;
      if (vv.scale > 1.02) {
        var meta = document.querySelector('meta[name="viewport"]');
        if (meta) meta.content = meta.content;   // reinicia a viewport
        window.scrollTo(0, 0);
        _unzoomBusy = true;
        setTimeout(() => { _unzoomBusy = false; }, 400);
      }
    } catch (e) {}
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => { if (_unzoomBusy) return; forceUnzoom(); });
    window.visualViewport.addEventListener('scroll', () => { if (window.visualViewport.scale > 1.05) forceUnzoom(); });
  }

  // bloqueia zoom por gesto (pinch) no iOS
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false });
  });
  // bloqueia zoom de clique duplo em areas do jogo (nao em campos de texto)
  document.addEventListener('dblclick', function (e) {
    const t = e.target;
    const tag = (t && t.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      const ae = document.activeElement;
      const typing = !!(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) || (UI && UI.kbOpen);
      if (typing) return;
      computeView(); applyViewScale();
      try { resizeNight(); } catch (e) {}
    }, 320);
  });

  // garantir canvas visível
  try {
    const root = document.getElementById('game-root');
    if (root) {
      root.querySelectorAll('canvas').forEach(c => {
        c.style.display = 'block';
        c.style.position = 'relative';
        c.style.zIndex = '1';
        c.style.maxWidth = '100%';
        c.style.maxHeight = '100%';
      });
    }
  } catch {}

  setBootStatus('Carregando assets...');

  // Carrega fonte pixelada para nomes
  try {
    loadFont('press-start', 'https://fonts.gstatic.com/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK3nVivM.woff2');
  } catch(e) { console.warn('loadFont press-start falhou', e); }
  try {
    loadFont('pixel', 'https://fonts.gstatic.com/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK3nVivM.woff2');
  } catch(e) {}

  // ===== Assets =====
  const PLAYER_ANIMS = { sliceX: 4, sliceY: 4, anims: {
    'down-idle': 0, 'down-walk': { from: 0, to: 3, loop: true, speed: 8 },
    'up-idle': 4, 'up-walk': { from: 4, to: 7, loop: true, speed: 8 },
    'left-idle': 8, 'left-walk': { from: 8, to: 11, loop: true, speed: 8 },
    'right-idle': 12, 'right-walk': { from: 12, to: 15, loop: true, speed: 8 },
  }};

  const NPC_ANIMS = { sliceX: 4, sliceY: 1, anims: {
    idle: 0,
    walk: { from: 0, to: 3, loop: true, speed: 6 },
  }};

  try {
    loadSprite('tiles_lab', 'assets/tileset_lab.png', { sliceX: 2, sliceY: 1 });
    loadSprite('lab_floor', 'assets/lab_floor.png');
    loadSprite('shadow', 'assets/obj_shadow.png');
    loadSprite('tree_trunk', 'assets/obj_tree_trunk.png');
    loadSprite('tree_canopy', 'assets/obj_tree_canopy.png');
    loadSprite('npc_robot', 'assets/npc_robot.png', NPC_ANIMS);
    loadSprite('npc_scientist', 'assets/npc_scientist.png', NPC_ANIMS);
    loadSprite('npc_merchant', 'assets/npc_merchant.png', NPC_ANIMS);
    loadSprite('player_base', 'assets/player_base.png', PLAYER_ANIMS);
    loadSprite('player_with_backpack', 'assets/player_with_backpack.png', PLAYER_ANIMS);
    loadSprite('pc', 'assets/pc_sprite.png');
    loadSprite('tiles_forest', 'assets/tileset_forest.png', { sliceX: 4, sliceY: 1 });
    loadSprite('tree', 'assets/obj_tree.png');
    loadSprite('bush', 'assets/obj_bush.png');
    loadSprite('lab_exterior', 'assets/obj_lab_exterior.png');
    loadSprite('mountain', 'assets/obj_mountain.png');
    loadSprite('farm_tile', 'assets/tileset_farm.png');
    loadSprite('fence', 'assets/obj_fence.png', { sliceX: 4, sliceY: 1 });
    loadSprite('backpack_item', 'assets/obj_backpack.png');
    loadSprite('forest_ground', 'assets/forest_ground.png');
    loadSprite('cow_skate', 'assets/obj_cow_skate.png', { sliceX: 2, sliceY: 1, anims: { ride: { from: 0, to: 1, loop: true, speed: 6 } } });
  } catch (e) {
    showFatal('Erro ao carregar assets: ' + (e && e.message ? e.message : e));
    return;
  }

  window.kaboomGo = (name, opts) => go(name, opts || {});

  // ===== HUD: FPS + cena =====
  let _fpsAcc = 0, _fpsFrames = 0, _fpsShown = 0;
  let _lowWindows = 0, _highWindows = 0;
  let _quality = 0;
  function applyQuality(level, silent) {
    if (level === _quality) return;
    _quality = level;
    UI.quality = level;
    UI.nightEnabled = level < 2;
    if (typeof cfgNight !== 'undefined' && cfgNight) setToggle(cfgNight, UI.nightEnabled, 'Ligada', 'Desligada');
    NIGHT_RES = level >= 1 ? 0.26 : 0.4;
    try { NightFX.grad = null; resizeNight(); } catch (e) {}
    _cullMargin = level >= 1 ? 76 : 120;
    if (!silent) {
      showNotification(level >= 2
        ? 'Qualidade reduzida automaticamente para ganhar FPS'
        : (level === 1 ? 'Efeitos reduzidos (mais FPS)' : 'Qualidade completa restaurada'));
    }
  }
  function tickHud(step) {
    _fpsAcc += step; _fpsFrames++;
    if (_fpsAcc < 0.5) return;
    _fpsShown = Math.round(_fpsFrames / _fpsAcc);
    _fpsAcc = 0; _fpsFrames = 0;
    // qualidade adaptativa
    if (UI.qualityLock !== true) {
      if (_fpsShown < 38) { _lowWindows++; _highWindows = 0; } else if (_fpsShown > 55) { _highWindows++; _lowWindows = 0; } else { _lowWindows = 0; _highWindows = 0; }
      if (_lowWindows >= 3 && _quality < 2) { _lowWindows = 0; applyQuality(_quality + 1); }
      else if (_highWindows >= 6 && _quality > 0) { _highWindows = 0; applyQuality(_quality - 1); }
    }
    if (hudFps) hudFps.textContent = String(_fpsShown);
    if (hudScene) hudScene.textContent = (UI.currentScene === 'forest') ? 'FLORESTA' : 'LAB';
    if (hudChip) {
      hudChip.classList.toggle('warn', _fpsShown < 40);
      hudChip.classList.toggle('bad', _fpsShown < 24);
    }
  }

  // ===== Colisão / helpers de cena =====
  function ysort(obj, baseOffset) { const off = baseOffset || obj.height || 0; obj.onUpdate(() => { obj.z = obj.pos.y + off; }); }
  function playerSpriteName() { return UI.hasBackpack ? 'player_with_backpack' : 'player_base'; }
  function applyPlayerSprite(player) {
    const anim = (typeof player.curAnim === 'function' && player.curAnim()) || (player.dir + '-idle');
    player.use(sprite(playerSpriteName(), { anim }));
    applyPlayerTint(player, UI.color);
  }
  function playerRect(player) { return { x: player.pos.x + PLAYER_HB.x, y: player.pos.y + PLAYER_HB.y, w: PLAYER_HB.w, h: PLAYER_HB.h }; }
  function intersects(a, b) { return a.x < b.x + b.width && a.x + a.w > b.x && a.y < b.y + b.height && a.y + a.h > b.y; }
  function resolveCollisions(player, axis) {
    const r = playerRect(player);
    for (let i = 0; i < solidWalls.length; i++) {
      const w = solidWalls[i];
      if (!intersects(r, w)) continue;
      if (axis === 'x') {
        if (r.x + r.w/2 < w.x + w.width/2) player.pos.x = w.x - (PLAYER_HB.x + PLAYER_HB.w);
        else player.pos.x = w.x + w.width - PLAYER_HB.x;
      } else {
        if (r.y + r.h/2 < w.y + w.height/2) player.pos.y = w.y - (PLAYER_HB.y + PLAYER_HB.h);
        else player.pos.y = w.y + w.height - PLAYER_HB.y;
      }
      r.x = player.pos.x + PLAYER_HB.x; r.y = player.pos.y + PLAYER_HB.y;
    }
  }
  function clampPlayer(player) {
    const minX = -PLAYER_HB.x;
    const minY = -PLAYER_HB.y;
    const maxX = mapBounds.w - (PLAYER_HB.x + PLAYER_HB.w);
    const maxY = mapBounds.h - (PLAYER_HB.y + PLAYER_HB.h);
    player.pos.x = Math.max(minX, Math.min(maxX, player.pos.x));
    player.pos.y = Math.max(minY, Math.min(maxY, player.pos.y));
  }

  const COW_HB = { x: 8, y: 24, w: 32, h: 18 };
  function entityRect(ent, hb) { return { x: ent.pos.x + hb.x, y: ent.pos.y + hb.y, w: hb.w, h: hb.h }; }
  function resolveCollisionsHB(ent, axis, hb) {
    const r = entityRect(ent, hb);
    for (let i = 0; i < solidWalls.length; i++) {
      const w = solidWalls[i];
      if (!intersects(r, w)) continue;
      if (axis === 'x') {
        if (r.x + r.w/2 < w.x + w.width/2) ent.pos.x = w.x - (hb.x + hb.w);
        else ent.pos.x = w.x + w.width - hb.x;
      } else {
        if (r.y + r.h/2 < w.y + w.height/2) ent.pos.y = w.y - (hb.y + hb.h);
        else ent.pos.y = w.y + w.height - hb.y;
      }
      r.x = ent.pos.x + hb.x; r.y = ent.pos.y + hb.y;
    }
  }
  function clampEntity(ent, hb) {
    const minX = -hb.x;
    const minY = -hb.y;
    const maxX = mapBounds.w - (hb.x + hb.w);
    const maxY = mapBounds.h - (hb.y + hb.h);
    ent.pos.x = Math.max(minX, Math.min(maxX, ent.pos.x));
    ent.pos.y = Math.max(minY, Math.min(maxY, ent.pos.y));
  }

  function addPlayer(spawn) {
    const shadow = add([sprite('shadow'), pos(spawn.x + 4, spawn.y + 24), anchor('topleft'), z(2), opacity(0.5)]);
    const player = add([
      sprite(playerSpriteName(), { anim: 'down-idle' }),
      pos(spawn.x, spawn.y),
      anchor('topleft'),
      z(10),
      'player',
      { dir: 'down' },
    ]);
    ysort(player, 30);
    window.__arcPlayer = player;
    window.__arcPlayerShadow = shadow;
    applyPlayerTint(player, UI.color);
    return player;
  }

  function setupPlayerControls(player, getTarget, camTargetFn) {
    const playAnim = (name) => { try { if (player.curAnim() !== name) player.play(name); } catch {} };
    player.onUpdate(() => {
      const blocked = UI.paused || UI.pcOpen || UI.transitioning || UI.inventoryOpen || UI.typing || UI.dialogOpen;
      if (blocked) {
        if (!UI.ridingCow) playAnim(player.dir + '-idle');
        if (UI.ridingCow && window.__arcRideCow && window.__arcRideCow.exists && window.__arcRideCow.exists()) {
          UI.playerPos = { x: window.__arcRideCow.pos.x, y: window.__arcRideCow.pos.y };
          player.pos.x = window.__arcRideCow.pos.x + 8; player.pos.y = window.__arcRideCow.pos.y - 8;
        } else {
          UI.playerPos = { x: player.pos.x, y: player.pos.y };
        }
        setPrompt(null);
        const lb = speechBubbles.get('local'); if (lb) { lb.worldX = UI.playerPos.x + 16; lb.worldY = UI.playerPos.y; lb.scene = UI.currentScene; }
        if (camTargetFn) camTargetFn();
        tickUiOverlays();
        return;
      }

      // Montado na vaca
      if (UI.ridingCow && window.__arcRideCow && window.__arcRideCow.exists && window.__arcRideCow.exists()) {
        const cow = window.__arcRideCow;
        let dx = 0, dy = 0;
        if (isKeyDown('left') || isKeyDown('a')) dx -= 1;
        if (isKeyDown('right') || isKeyDown('d')) dx += 1;
        if (isKeyDown('up') || isKeyDown('w')) dy -= 1;
        if (isKeyDown('down') || isKeyDown('s')) dy += 1;
        if (UI.joystick.active || Math.abs(UI.joystick.x) > 0.05 || Math.abs(UI.joystick.y) > 0.05) { dx += UI.joystick.x; dy += UI.joystick.y; }
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        if (len > 0.05) {
          let remaining = (SPEED + 40) * dt();
          const STEP = 4;
          let guard = 0;
          while (remaining > 0.0001 && guard++ < 64) {
            const step = Math.min(STEP, remaining);
            remaining -= step;
            cow.pos.x += dx * step; resolveCollisionsHB(cow, 'x', COW_HB);
            cow.pos.y += dy * step; resolveCollisionsHB(cow, 'y', COW_HB);
          }
          clampEntity(cow, COW_HB);
          if (dx < -0.05) cow.flipX = true; else if (dx > 0.05) cow.flipX = false;
        }
        cow.z = cow.pos.y + 44;
        // jogador acompanha a vaca
        player.pos.x = cow.pos.x + 8;
        player.pos.y = cow.pos.y - 10;
        player.z = cow.z + 1;
        playAnim((player.dir || 'down') + '-idle');
        UI.playerPos = { x: cow.pos.x, y: cow.pos.y };
        setPrompt(null); // sem prompt de interação enquanto monta (botão Sair fica visível)
        if (camTargetFn) camTargetFn();
        sendMovement(false);
        const lb = speechBubbles.get('local'); if (lb) { lb.worldX = cow.pos.x + 24; lb.worldY = cow.pos.y - 6; lb.scene = UI.currentScene; }
        tickUiOverlays();
        return;
      }

      let dx = 0, dy = 0;
      if (isKeyDown('left') || isKeyDown('a')) dx -= 1;
      if (isKeyDown('right') || isKeyDown('d')) dx += 1;
      if (isKeyDown('up') || isKeyDown('w')) dy -= 1;
      if (isKeyDown('down') || isKeyDown('s')) dy += 1;
      if (UI.joystick.active || Math.abs(UI.joystick.x) > 0.05 || Math.abs(UI.joystick.y) > 0.05) { dx += UI.joystick.x; dy += UI.joystick.y; }
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      if (len > 0.05) {
        // movimentacao em sub-passos: sem tremer na parede, sem furar em alta velocidade
        let remaining = SPEED * dt();
        const STEP = 4;
        let guard = 0;
        while (remaining > 0.0001 && guard++ < 64) {
          const step = Math.min(STEP, remaining);
          remaining -= step;
          player.pos.x += dx * step; resolveCollisions(player, 'x');
          player.pos.y += dy * step; resolveCollisions(player, 'y');
        }
        clampPlayer(player);
        if (Math.abs(dx) > Math.abs(dy)) player.dir = dx > 0 ? 'right' : 'left'; else player.dir = dy > 0 ? 'down' : 'up';
        playAnim(player.dir + '-walk');
      } else {
        playAnim(player.dir + '-idle');
      }
      if (window.__arcPlayerShadow) {
        window.__arcPlayerShadow.pos.x = player.pos.x + 4;
        window.__arcPlayerShadow.pos.y = player.pos.y + 24;
        window.__arcPlayerShadow.z = player.pos.y - 1;
      }
      UI.playerPos = { x: player.pos.x, y: player.pos.y };
      setPrompt(getTarget ? getTarget() : null);
      if (camTargetFn) camTargetFn();
      sendMovement(false);
      const lb = speechBubbles.get('local'); if (lb) { lb.worldX = player.pos.x + 16; lb.worldY = player.pos.y; lb.scene = UI.currentScene; }
      tickUiOverlays();
    });
  }

  function addDebugLayer() {
    onDraw(() => {
      if (!UI.debug) return;
      for (let i = 0; i < solidWalls.length; i++) {
        const w = solidWalls[i];
        drawRect({ pos: vec2(w.x, w.y), width: w.width, height: w.height, color: rgb(255,0,0), opacity: 0.35, fill: true });
        drawRect({ pos: vec2(w.x, w.y), width: w.width, height: w.height, color: rgb(255,0,0), opacity: 0.9, fill: false });
      }
    });
  }

  // ===== Remotos =====
  function remoteSpriteName(r) { return r.hasBackpack ? 'player_with_backpack' : 'player_base'; }
  function ensureRemoteEntity(r, sceneName) {
    if (r.scene !== sceneName) {
      if (r.entity && r.entity.exists && r.entity.exists()) try { r.entity.destroy(); } catch {}
      r.entity = null; return;
    }
    if (!r.entity || !(r.entity.exists && r.entity.exists())) {
      r.x = r.tx; r.y = r.ty;
      const e = add([sprite(remoteSpriteName(r), { anim: r.anim || 'down-idle' }), pos(r.x, r.y), anchor('topleft'), z(9), 'remote_player']);
      ysort(e, 30);
      r.entity = e; r._spriteName = remoteSpriteName(r); r._color = r.color;
      applyPlayerTint(e, r.color);
    } else {
      const want = remoteSpriteName(r);
      if (r._spriteName !== want) {
        r.entity.use(sprite(want, { anim: r.anim || 'down-idle' }));
        r._spriteName = want; r._color = null;
      }
      if (r._color !== r.color) { r._color = r.color; applyPlayerTint(r.entity, r.color); }
    }
  }
  function updateRemotePlayers(sceneName) {
    Net.remote.forEach((r) => {
      ensureRemoteEntity(r, sceneName);
      if (!r.entity || !(r.entity.exists && r.entity.exists())) return;
      const lf = 1 - Math.pow(0.001, dt() * 12);
      r.x = r.x + (r.tx - r.x) * lf;
      r.y = r.y + (r.ty - r.y) * lf;
      r.entity.pos.x = r.x; r.entity.pos.y = r.y;
      if (r.entity.curAnim() !== r.anim && r.anim) { try { r.entity.play(r.anim); } catch(e){} }
      const b = speechBubbles.get(r.id); if (b) { b.worldX = r.x + 16; b.worldY = r.y; b.scene = r.scene; }
    });
  }
  function drawRemoteNames() {
    function drawNameTag(name, tx, ty, hex) {
      const nm = String(name || '?');
      const approxW = Math.max(28, nm.length * 8);
      // fundo
      drawRect({ pos: vec2(tx - approxW/2 - 2, ty - 12), width: approxW + 4, height: 14, color: rgb(0,0,0), opacity: 0.65 });
      const c = hexToRgb(hex || '#39ff14');
      // contorno preto (4 direções)
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(o => drawText({ text: nm, pos: vec2(tx+o[0]*1, ty-5+o[1]), size: 9, anchor: 'center', color: rgb(0,0,0), font: 'press-start' }));
      // texto principal
      drawText({ text: nm, pos: vec2(tx, ty - 5), size: 9, anchor: 'center', color: rgb(c.r,c.g,c.b), font: 'press-start' });
    }
    onDraw(() => {
      let errCount = 0;
      try {
        if (window.__arcPlayer && window.__arcPlayer.exists && window.__arcPlayer.exists()) {
          drawNameTag((Net && Net.username) || (currentUser() && currentUser().username) || 'Você', window.__arcPlayer.pos.x + 16, window.__arcPlayer.pos.y - 6, UI.color);
        }
        Net.remote.forEach((r) => {
          if (!r.entity || !(r.entity.exists && r.entity.exists()) || r.entity.hidden) return;
          if (r.scene !== UI.currentScene) return;
          drawNameTag(r.username || '?', r.entity.pos.x + 16, r.entity.pos.y - 6, r.color || '#00ffff');
        });
      } catch(e) {
        errCount++;
        if (errCount < 3) console.warn('drawRemoteNames erro', e);
      }
    });
  }


  // ===== Culling cacheado (lista unica por cena) =====
  let SCENE_CULL = [];
  let _cullMargin = 120;
  function cacheCulling() {
    SCENE_CULL = [];
    const push = (tag, w, h) => {
      const arr = get(tag);
      for (let i = 0; i < arr.length; i++) {
        arr[i]._cw = w; arr[i]._ch = h;
        SCENE_CULL.push(arr[i]);
      }
    };
    push('tree', 72, 96);
    push('bush', 32, 32);
    push('mountain', 32, 32);
    push('fence', 32, 32);
  }

  // ===== NPCs (IA basica + dialogo) =====
  const NPC_LIST = [];
  const LAMPS = [
    { x: 2.5 * TILE, y: 2.2 * TILE, r: 96 },
    { x: 11.4 * TILE, y: 2.2 * TILE, r: 96 },
    { x: 7 * TILE, y: 8.4 * TILE, r: 86 },
    { x: 7 * TILE, y: 4.4 * TILE, r: 70 },
  ];

  function spawnNpc(kind, x, y, name, lines) {
    const npc = add([
      sprite('npc_' + kind, { anim: 'idle' }),
      pos(x, y),
      anchor('topleft'),
      z(y + 30),
      'npc',
      { kind, name, lines, dir: 'down', t: 1 + Math.random() * 2, state: 'idle', tx: x, ty: y, speed: 24, anim: 'idle' },
    ]);
    const shadow = add([sprite('shadow'), pos(x + 4, y + 24), anchor('topleft'), z(y - 1), opacity(0.45)]);
    npc.shadow = shadow;
    NPC_LIST.push(npc);
    return npc;
  }

  function npcBlockedAt(x, y) {
    const r = { x: x + 9, y: y + 22, w: 14, h: 8 };
    for (let i = 0; i < solidWalls.length; i++) if (intersects(r, solidWalls[i])) return true;
    return false;
  }

  function nearestNpc(fromPos, maxDist) {
    let best = null, bestD = maxDist;
    for (let i = 0; i < NPC_LIST.length; i++) {
      const n = NPC_LIST[i];
      if (!n || !n.exists || !n.exists()) continue;
      const d = Math.hypot((n.pos.x + 16) - fromPos.x, (n.pos.y + 16) - fromPos.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  function updateNpcs(step) {
    const p = window.__arcPlayer;
    for (let i = 0; i < NPC_LIST.length; i++) {
      const n = NPC_LIST[i];
      if (!n || !n.exists || !n.exists()) continue;
      if (n.shadow && n.shadow.exists && n.shadow.exists()) {
        n.shadow.pos.x = n.pos.x + 4;
        n.shadow.pos.y = n.pos.y + 24;
        n.shadow.z = n.pos.y - 1;
      }
      const pdx = p ? (p.pos.x - n.pos.x) : 9999;
      const pdy = p ? (p.pos.y - n.pos.y) : 9999;
      const near = Math.hypot(pdx, pdy) < 72;
      if (near) {
        n.dir = Math.abs(pdx) > Math.abs(pdy) ? (pdx > 0 ? 'right' : 'left') : (pdy > 0 ? 'down' : 'up');
        if (n.anim !== 'idle') { try { n.play('idle'); } catch (e) {} n.anim = 'idle'; }
        n.z = n.pos.y + 30;
        continue;
      }
      n.t -= step;
      if (n.state === 'idle') {
        if (n.t <= 0) {
          const ang = Math.random() * Math.PI * 2;
          const dist = 18 + Math.random() * 46;
          n.tx = n.pos.x + Math.cos(ang) * dist;
          n.ty = n.pos.y + Math.sin(ang) * dist;
          n.state = 'walk';
        }
      } else {
        const dx = n.tx - n.pos.x, dy = n.ty - n.pos.y;
        const d = Math.hypot(dx, dy);
        if (d < 3) {
          n.state = 'idle';
          n.t = 1.2 + Math.random() * 2.6;
        } else {
          const st = Math.min(n.speed * step, d);
          const nx = n.pos.x + (dx / d) * st;
          const ny = n.pos.y + (dy / d) * st;
          let movedX = false, movedY = false;
          if (!npcBlockedAt(nx, n.pos.y)) { n.pos.x = nx; movedX = true; }
          if (!npcBlockedAt(n.pos.x, ny)) { n.pos.y = ny; movedY = true; }
          if (movedX || movedY) {
            n.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
            if (n.anim !== 'walk') { try { n.play('walk'); } catch (e) {} n.anim = 'walk'; }
          } else {
            n.state = 'idle';
            n.t = 1.4 + Math.random() * 2;
          }
        }
      }
      n.z = n.pos.y + 30;
    }
  }

  // ===== Dialogo =====
  let dlgTimer = null;
  function openDialogue(npc) {
    const el = document.getElementById('dialogue');
    const nm = document.getElementById('dlg-name');
    const tx = document.getElementById('dlg-text');
    if (!el || !npc) return;
    const lines = npc.lines || ['...'];
    const line = lines[Math.floor(Math.random() * lines.length)];
    if (nm) nm.textContent = npc.name || '???';
    if (tx) tx.textContent = line;
    el.classList.remove('hidden');
    UI.dialogOpen = true;
    setPrompt(null);
    if (dlgTimer) clearTimeout(dlgTimer);
    dlgTimer = setTimeout(closeDialogue, 4200);
  }
  function closeDialogue() {
    const el = document.getElementById('dialogue');
    if (el) el.classList.add('hidden');
    UI.dialogOpen = false;
    if (dlgTimer) { clearTimeout(dlgTimer); dlgTimer = null; }
  }

  // ===== Iluminacao noturna (Luna Alpha) =====
  const NightFX = { canvas: null, ctx: null, raf: 0, last: 0, tex: null, grad: null, w: 0, h: 0 };
  let NIGHT_RES = 0.4;

  function nightLightTexture() {
    if (NightFX.tex) return NightFX.tex;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,1)');
    grd.addColorStop(0.5, 'rgba(0,0,0,0.52)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    NightFX.tex = c;
    return c;
  }

  function resizeNight() {
    const c = NightFX.canvas;
    if (!c) return;
    const w = Math.max(2, Math.round(window.innerWidth * NIGHT_RES));
    const h = Math.max(2, Math.round(window.innerHeight * NIGHT_RES));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      NightFX.grad = null;
    }
    c.style.width = '100%';
    c.style.height = '100%';
    NightFX.w = w; NightFX.h = h;
  }

  function initNight() {
    const c = document.getElementById('nightfx');
    if (!c) return;
    NightFX.canvas = c;
    NightFX.ctx = c.getContext('2d');
    resizeNight();
    const loop = (ts) => {
      NightFX.raf = requestAnimationFrame(loop);
      if (ts - NightFX.last < 50) return;
      NightFX.last = ts;
      drawNight();
    };
    NightFX.raf = requestAnimationFrame(loop);
  }

  function worldToScreen(wx, wy) {
    try {
      if (typeof toScreen === 'function' && typeof vec2 === 'function') {
        const s = toScreen(vec2(wx, wy));
        const cv = document.querySelector('#game-root canvas');
        const rect = cv ? cv.getBoundingClientRect() : { left: 0, top: 0, width: VIEW.w, height: VIEW.h };
        const sx = (s.x / Math.max(1, VIEW.w)) * rect.width + rect.left;
        const sy = (s.y / Math.max(1, VIEW.h)) * rect.height + rect.top;
        return { x: sx, y: sy };
      }
    } catch (e) {}
    return null;
  }

  function drawNight() {
    const c = NightFX.canvas, ctx = NightFX.ctx;
    if (!c || !ctx) return;
    if (UI.nightEnabled === false) { ctx.clearRect(0, 0, c.width, c.height); return; }
    const W = c.width, H = c.height;
    if (!NightFX.grad) {
      const g0 = ctx.createLinearGradient(0, 0, 0, H);
      g0.addColorStop(0, 'rgba(12, 18, 52, 0.6)');
      g0.addColorStop(1, 'rgba(6, 10, 30, 0.48)');
      NightFX.grad = g0;
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = NightFX.grad;
    ctx.fillRect(0, 0, W, H);

    // luzes: textura unica pre-renderizada (muito mais rapido que criar gradiente por luz)
    const tex = nightLightTexture();
    // converte raio world -> CSS -> resolucao do canvas de luz
    const worldToCss = (VIEW.scale || 1);
    const put = (wx, wy, radius, strength) => {
      const p = worldToScreen(wx, wy);
      if (!p) return;
      const cx = p.x * NIGHT_RES;
      const cy = p.y * NIGHT_RES;
      const r = Math.max(8, radius * worldToCss * 0.55 * NIGHT_RES);
      ctx.globalAlpha = strength;
      ctx.drawImage(tex, cx - r, cy - r, r * 2, r * 2);
    };
    ctx.globalCompositeOperation = 'destination-out';

    const pl = window.__arcPlayer;
    if (pl && pl.exists && pl.exists()) put(pl.pos.x + 16, pl.pos.y + 12, 190, 1);
    if (window.__arcRideCow && window.__arcRideCow.exists && window.__arcRideCow.exists()) {
      put(window.__arcRideCow.pos.x + 24, window.__arcRideCow.pos.y + 18, 130, 0.9);
    }
    if (UI.currentScene === 'lab') {
      for (let i = 0; i < LAMPS.length; i++) put(LAMPS[i].x, LAMPS[i].y, LAMPS[i].r, 0.85);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ===== Cena: Lab =====
  scene('lab', (opts) => {
    UI.currentScene = 'lab'; pendingAction = null;
    const spawn = opts && typeof opts.x === 'number' ? opts : { x: 2 * TILE, y: 7 * TILE };
    const MW = 14, MH = 10, mapW = MW*TILE, mapH = MH*TILE;
    const MAP = [
      'WWWWWWWWWWWWWW','W............W','W............W','W............W','W.....P......W',
      'W............W','W............W','W............W','W............W','WWWWWWDWWWWWWW',
    ];
    let pcCenter = vec2(0,0), doorCenter = vec2(0,0);
    // chao pre-renderizado (cache estatico) - zero linhas de grade
    add([sprite('lab_floor'), pos(0, 0), z(0)]);
    for (let y = 0; y < MAP.length; y++) {
      for (let x = 0; x < MAP[y].length; x++) {
        const ch = MAP[y][x], wx = x*TILE, wy = y*TILE;
        if (ch === 'W') add([sprite('tiles_lab', { frame: 1 }), pos(wx, wy), z(1)]);
        else if (ch === 'P') {
          pcCenter = vec2(wx + TILE/2, wy + TILE/2);
          const pcObj = add([sprite('pc'), pos(wx - 8, wy - 12), z(2)]);
          ysort(pcObj, 44);
        } else if (ch === 'D') {
          doorCenter = vec2(wx + TILE/2, wy + TILE/2);
          add([sprite('tiles_lab', { frame: 0 }), pos(wx, wy), z(1)]);
          add([rect(20, 6), pos(wx + 6, wy + 26), color(57,255,20), opacity(0.9), z(2)]);
          add([rect(20, 4), pos(wx + 6, wy + 22), color(0,255,255), opacity(0.5), z(2)]);
        }
      }
    }

    const walls = [];
    const t = TILE;
    walls.push({ x: 0, y: 0, width: mapW, height: t });
    walls.push({ x: 0, y: mapH - t, width: 6*t, height: t });
    walls.push({ x: 7*t, y: mapH - t, width: 7*t, height: t });
    walls.push({ x: 0, y: 0, width: t, height: mapH });
    walls.push({ x: mapW - t, y: 0, width: t, height: mapH });
    walls.push({ x: 6*t - 8 + 8, y: 4*t - 12 + 30, width: 32, height: 14 });
    const M = 2000;
    walls.push({ x: -M, y: -M, width: mapW + 2*M, height: M });
    walls.push({ x: -M, y: mapH, width: mapW + 2*M, height: M });
    walls.push({ x: -M, y: -M, width: M, height: mapH + 2*M });
    walls.push({ x: mapW, y: -M, width: M, height: mapH + 2*M });
    setCollisionWorld(walls, { w: mapW, h: mapH });

    const player = addPlayer(spawn);
    let backpackObj = null, backpackCenter = vec2(-999,-999);
    if (!UI.hasBackpack) {
      const bx = 10*TILE + 4, by = 2*TILE + 4; backpackCenter = vec2(bx + 12, by + 12);
      backpackObj = add([sprite('backpack_item'), pos(bx, by), z(3), 'backpack_item']);
      ysort(backpackObj, by + 22);
    }
    function pickupBackpack() {
      if (UI.hasBackpack || !backpackObj) return;
      const obj = backpackObj; backpackObj = null;
      if (obj && obj.exists && obj.exists()) { obj.opacity = 0.3; wait(0.08, () => { if (obj.exists && obj.exists()) obj.destroy(); }); }
      UI.hasBackpack = true; updateInventoryButton(); applyPlayerSprite(player);
      writeSave({ hasBackpack: true, inventory: UI.inventory });
      showNotification('Mochila equipada! Inventário desbloqueado.');
      setPrompt(null);
    }

    const camTarget = () => vec2(mapW/2, mapH/2);
    camPos(camTarget());
    spawnNpc('scientist', 9 * TILE, 3 * TILE, 'Dra. Vex', [
      'Ora, ora... uma chama viva no meu laboratório.',
      'A lua está linda hoje. Não deixe a chama apagar.',
      'Anotações? O terminal está logo ali, use a tecla E.',
    ]);
    spawnNpc('robot', 11 * TILE, 6 * TILE, 'MOT-7', [
      'Bip. Todos os sistemas... quase... operacionais.',
      'Bip bop. Detectei umidade no setor leste.',
      'A vaca de skate não consta na minha base de dados.',
    ]);

    setupPlayerControls(player, () => {
      const p = player.pos.add(16,16);
      if (!UI.hasBackpack && backpackObj && backpackObj.exists && backpackObj.exists() && p.dist(backpackCenter) < 40) { pendingAction = pickupBackpack; return 'backpack'; }
      const nearNpc = nearestNpc(p, 54);
      if (nearNpc) { pendingAction = () => openDialogue(nearNpc); return 'npc'; }
      if (p.dist(pcCenter) < 56) { pendingAction = null; return 'pc'; }
      if (p.dist(doorCenter) < 44) { pendingAction = null; return 'door_forest'; }
      pendingAction = null; return null;
    }, () => camPos(camTarget()));

    add([text('E/A interagir | I mochila | Enter chat', { size: 7, font: 'sans-serif' }), pos(6,6), fixed(), color(180,220,255), opacity(0.85), z(100)]);
    addDebugLayer();
    drawRemoteNames();
    onUpdate(() => { const st = dt(); tickHud(st); updateNpcs(st); updateRemotePlayers('lab'); });
    sendMovement(true);
  });

  // ===== Cena: Floresta =====
  scene('forest', (opts) => {
    UI.currentScene = 'forest'; pendingAction = null;
    const MW = 40, MH = 30, mapW = MW*TILE, mapH = MH*TILE;
    const spawn = opts && typeof opts.x === 'number' ? opts : { x: 12 * TILE, y: 12 * TILE };

    add([sprite('forest_ground'), pos(0,0), z(0)]);

    function addMountain(tx, ty) { const m = add([sprite('mountain'), pos(tx*TILE, ty*TILE), z(5), 'mountain']); ysort(m, 30); }
    for (let x = 0; x < MW; x++) { addMountain(x, 0); addMountain(x, MH-1); }
    for (let y = 1; y < MH-1; y++) { addMountain(0, y); addMountain(MW-1, y); }
    for (let x = 1; x < MW-1; x++) { addMountain(x, 1); addMountain(x, MH-2); }
    for (let y = 2; y < MH-2; y++) { addMountain(1, y); addMountain(MW-2, y); }

    const ranch = { x1: 26, y1: 18, x2: 33, y2: 23 };
    const gateTx = ranch.x1 + 3, gateTy = ranch.y2 + 1;
    function addFence(tx, ty, frame) { const f = add([sprite('fence', { frame }), pos(tx*TILE, ty*TILE), z(5), 'fence']); ysort(f, 30); }
    for (let x = ranch.x1 - 1; x <= ranch.x2 + 1; x++) {
      addFence(x, ranch.y1 - 1, 0);
      if (x === gateTx) addFence(x, gateTy, 3); else addFence(x, gateTy, 0);
    }
    for (let y = ranch.y1; y <= ranch.y2; y++) { addFence(ranch.x1 - 1, y, 1); addFence(ranch.x2 + 1, y, 1); }
    addFence(ranch.x1 - 1, ranch.y1 - 1, 2); addFence(ranch.x2 + 1, ranch.y1 - 1, 2);
    addFence(ranch.x1 - 1, ranch.y2 + 1, 2); addFence(ranch.x2 + 1, ranch.y2 + 1, 2);

    const labX = spawn.x - 48, labY = spawn.y - 150;
    const labObj = add([sprite('lab_exterior'), pos(labX, labY), z(5), 'lab_building']); ysort(labObj, 112);
    const labDoorCenter = vec2(labX + 64, labY + 108);

    const walls = [];
    const M = 4000;
    walls.push({ x: -M, y: -M, width: mapW + 2*M, height: M });
    walls.push({ x: -M, y: mapH, width: mapW + 2*M, height: M });
    walls.push({ x: -M, y: -M, width: M, height: mapH + 2*M });
    walls.push({ x: mapW, y: -M, width: M, height: mapH + 2*M });
    const b = 2*TILE;
    walls.push({ x: 0, y: 0, width: mapW, height: b });
    walls.push({ x: 0, y: mapH - b, width: mapW, height: b });
    walls.push({ x: 0, y: 0, width: b, height: mapH });
    walls.push({ x: mapW - b, y: 0, width: b, height: mapH });

    const fx1 = (ranch.x1 - 1) * TILE, fy1 = (ranch.y1 - 1) * TILE;
    const fx2 = (ranch.x2 + 2) * TILE, fy2 = (ranch.y2 + 2) * TILE;
    const fenceT = 10;
    walls.push({ x: fx1, y: fy1 + TILE - fenceT, width: fx2 - fx1, height: fenceT });
    walls.push({ x: fx1, y: fy1, width: fenceT, height: fy2 - fy1 });
    walls.push({ x: fx2 - fenceT, y: fy1, width: fenceT, height: fy2 - fy1 });
    walls.push({ x: fx1, y: fy2 - fenceT, width: (gateTx*TILE - fx1), height: fenceT });
    walls.push({ x: (gateTx+1)*TILE, y: fy2 - fenceT, width: (fx2 - (gateTx+1)*TILE), height: fenceT });

    const doorW = 24, doorX = labX + 52;
    walls.push({ x: labX + 18, y: labY + 28, width: 92, height: 50 });
    walls.push({ x: labX + 18, y: labY + 78, width: (doorX - (labX + 18)), height: 34 });
    walls.push({ x: doorX + doorW, y: labY + 78, width: (labX + 110 - (doorX + doorW)), height: 34 });

    setCollisionWorld(walls, { w: mapW, h: mapH });

    // Easter egg: vaca andando de skate (montável)
    UI.ridingCow = false;
    window.__arcRideCow = null;
    window.__arcDoDismountCow = null;
    if (typeof updateDismountButton === 'function') updateDismountButton();

    const cowPath = { x1: 5 * TILE, x2: 22 * TILE, y: 14 * TILE };
    const cowSkater = add([
      sprite('cow_skate', { anim: 'ride' }),
      pos(cowPath.x1, cowPath.y),
      anchor('topleft'),
      z(6),
      'cow_skate',
      { dir: 1, speed: 42, patrol: true },
    ]);
    cowSkater.flipX = false;
    ysort(cowSkater, 44);
    cowSkater.onUpdate(() => {
      if (UI.paused || UI.pcOpen || UI.inventoryOpen) return;
      if (UI.ridingCow && window.__arcRideCow === cowSkater) {
        cowSkater.z = cowSkater.pos.y + 44;
        return; // controle pelo jogador
      }
      cowSkater.pos.x += cowSkater.dir * cowSkater.speed * dt();
      if (cowSkater.pos.x >= cowPath.x2) { cowSkater.pos.x = cowPath.x2; cowSkater.dir = -1; cowSkater.flipX = true; }
      else if (cowSkater.pos.x <= cowPath.x1) { cowSkater.pos.x = cowPath.x1; cowSkater.dir = 1; cowSkater.flipX = false; }
      cowSkater.z = cowSkater.pos.y + 44;
    });

    function placeTree(tx, ty) {
      const px = tx * TILE - 16, py = ty * TILE - 56;
      const baseY = py + 88;
      // objetos estaticos: z fixo (sem onUpdate por entidade = muito mais leve)
      add([sprite('shadow'), pos(px + 8, baseY - 14), anchor('topleft'), z(baseY - 20), opacity(0.4)]);
      add([sprite('tree_trunk'), pos(px, py), anchor('topleft'), z(baseY)]);
      add([sprite('tree_canopy'), pos(px - 4, py - 4), anchor('topleft'), z(baseY - 28)]);
      walls.push({ x: px + 26, y: baseY - 16, width: 14, height: 14 });
    }
    function placeBush(tx, ty) {
      const px = tx*TILE, py = ty*TILE - 4;
      const bu = add([sprite('bush'), pos(px, py), z(5), 'bush']); ysort(bu, 26);
      walls.push({ x: px + 8, y: py + 20, width: 16, height: 8 });
    }
    function blocked(tx, ty) {
      if (tx <= 2 || ty <= 2 || tx >= MW-3 || ty >= MH-3) return true;
      const px = tx*TILE, py = ty*TILE;
      if (px > labX - 40 && px < labX + 168 && py > labY - 20 && py < labY + 150) return true;
      if (Math.abs(tx - 12) <= 2 && Math.abs(ty - 12) <= 3) return true;
      if (tx >= ranch.x1 - 3 && tx <= ranch.x2 + 3 && ty >= ranch.y1 - 3 && ty <= ranch.y2 + 4) return true;
      if (ty === 12 && tx > 2 && tx < MW-3) return true;
      if (tx === 12 && ty > 2 && ty < MH-3) return true;
      if (ty === 20 && tx > 2 && tx < 30) return true;
      if (tx === 24 && ty > 10 && ty < 26) return true;
      return false;
    }
    let seed = 1337; function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    for (let ty = 3; ty < MH-3; ty++) for (let tx = 3; tx < MW-3; tx++) {
      if (blocked(tx, ty)) continue; const r = rnd();
      if (r < 0.10) placeTree(tx, ty); else if (r < 0.17) placeBush(tx, ty);
    }
    [[14,14],[10,14],[15,10],[18,13],[20,11],[22,14],[8,16],[16,16]].forEach(([x,y]) => { if (!blocked(x,y)) placeBush(x,y); });
    cacheCulling();

    onUpdate(() => {
      const c = camPos(); const margin = _cullMargin;
      const vw = viewWorld();
      const vx = c.x - vw.w/2 - margin, vy = c.y - vw.h/2 - margin;
      const vx2 = c.x + vw.w/2 + margin, vy2 = c.y + vw.h/2 + margin;
      const list = SCENE_CULL;
      for (let ci = 0; ci < list.length; ci++) {
        const o = list[ci];
        if (!o || !o.exists || !o.exists()) continue;
        o.hidden = (o.pos.x + o._cw < vx || o.pos.x > vx2 || o.pos.y + o._ch < vy || o.pos.y > vy2);
      }
    });

    const player = addPlayer(spawn);
    let camCurrent = player.pos.add(16,16); camPos(camCurrent);

    function mountCow() {
      if (UI.ridingCow || !cowSkater || !(cowSkater.exists && cowSkater.exists())) return;
      UI.ridingCow = true;
      window.__arcRideCow = cowSkater;
      player.hidden = true;
      pendingAction = null;
      if (typeof updateDismountButton === 'function') updateDismountButton();
      showNotification('Você subiu na vaca! Use o joystick/setas para andar e "Sair" para descer.');
      setPrompt(null);
    }
    window.__arcDoDismountCow = function(silent) {
      if (!UI.ridingCow) return;
      const cow = window.__arcRideCow;
      UI.ridingCow = false;
      window.__arcRideCow = null;
      if (typeof updateDismountButton === 'function') updateDismountButton();
      if (player && player.exists && player.exists()) {
        player.hidden = false;
        if (cow && cow.exists && cow.exists()) {
          player.pos.x = cow.pos.x - 10;
          player.pos.y = cow.pos.y + 20;
          resolveCollisions(player, 'x'); resolveCollisions(player, 'y'); clampPlayer(player);
        }
        UI.playerPos = { x: player.pos.x, y: player.pos.y };
      }
      if (!silent) showNotification('Você desceu da vaca.');
      setPrompt(null);
    };

    function updateCam() {
      let target;
      if (UI.ridingCow && cowSkater && cowSkater.exists && cowSkater.exists()) target = cowSkater.pos.add(24,24);
      else target = player.pos.add(16,16);
      const lerpFactor = 1 - Math.pow(0.001, dt());
      camCurrent = camCurrent.lerp(target, lerpFactor);
      const vw = viewWorld();
      const halfW = Math.min(vw.w / 2, mapW / 2), halfH = Math.min(vw.h / 2, mapH / 2);
      camCurrent = vec2(Math.max(halfW, Math.min(mapW - halfW, camCurrent.x)), Math.max(halfH, Math.min(mapH - halfH, camCurrent.y)));
      camPos(camCurrent);
    }

    spawnNpc('merchant', 16 * TILE, 15 * TILE, 'Toko, o Viajante', [
      'Olá viajante... a lua está linda hoje.',
      'Vendo bugigangas de três mundos. Aceito segredos.',
      'Dizem que a vaca de skate é mais rápida que o vento.',
    ]);

    setupPlayerControls(player, () => {
      if (UI.ridingCow) { pendingAction = null; return null; }
      const p = player.pos.add(16,16);
      if (cowSkater && cowSkater.exists && cowSkater.exists() && p.dist(cowSkater.pos.add(24,24)) < 52) { pendingAction = mountCow; return 'mount_cow'; }
      const nearNpc = nearestNpc(p, 54);
      if (nearNpc) { pendingAction = () => openDialogue(nearNpc); return 'npc'; }
      if (p.dist(labDoorCenter) < 50) { pendingAction = null; return 'door_lab'; }
      pendingAction = null; return null;
    }, updateCam);

    add([text('Floresta | E/A: interagir/subir | Sair: descer da vaca | I mochila', { size: 7, font: 'sans-serif' }), pos(6,6), fixed(), color(180,220,255), opacity(0.85), z(100)]);
    addDebugLayer();
    drawRemoteNames();
    onUpdate(() => { const st = dt(); tickHud(st); updateNpcs(st); updateRemotePlayers('forest'); });
    sendMovement(true);
  });

  try {
    const q = new URLSearchParams(location.search).get('q');
    if (q === 'low') { UI.qualityLock = true; applyQuality(2, true); }
    else if (q === 'full') { UI.qualityLock = true; applyQuality(0, true); }
  } catch (e) {}

  // ===== Início (robusto) =====
  function startGame() {
    try {
      if (window.__arcainadStarted) return;
      window.__arcainadStarted = true;

      if (!ONLINE_MODE) writeSave({
        notes: UI.notes, scene: UI.currentScene, playerX: UI.playerPos.x, playerY: UI.playerPos.y,
        hasBackpack: UI.hasBackpack, inventory: UI.inventory,
      });
      const sceneName = (UI.currentScene === 'forest') ? 'forest' : 'lab';
      const spawn = { x: UI.playerPos.x, y: UI.playerPos.y };
      setBootStatus('Iniciando cena: ' + sceneName + '...');
      go(sceneName, spawn);

      let revealed = false;
      function revealIfReady() {
        if (revealed) return;
        const root = document.getElementById('game-root');
        const canvas = root && root.querySelector('canvas');
        if (!canvas) return;
        try {
          canvas.style.display = 'block';
          canvas.style.maxWidth = '100%';
          canvas.style.maxHeight = '100%';
        } catch {}
        revealed = true;
        hideBootStatus();
        // monitoramento após exibir
        setTimeout(function monitor() {
          const r = document.getElementById('game-root');
          const c = r && r.querySelector('canvas');
          if (!c) {
            showFatal('Erro: o canvas do jogo foi perdido após iniciar.\nRecarregue a página.');
            return;
          }
          try {
            const rect = c.getBoundingClientRect();
            if (rect.width < 10 || rect.height < 10) {
              // pode ser temporário em algumas transições; não fatal imediato
            }
          } catch {}
          setTimeout(monitor, 2000);
        }, 2000);
      }

      // tentativas por rAF
      let rafCount = 0;
      function rafCheck() {
        rafCount++;
        revealIfReady();
        if (!revealed && rafCount < 300) requestAnimationFrame(rafCheck);
      }
      try { requestAnimationFrame(rafCheck); } catch {}

      // fallback por tempo (importante para headless/mobile com rAF irregular)
      setTimeout(revealIfReady, 150);
      setTimeout(revealIfReady, 500);
      setTimeout(revealIfReady, 1200);
      setTimeout(revealIfReady, 2500);

      // hook kaboom (se disponível) para revelar no primeiro frame de atualização
      try {
        if (typeof onUpdate === 'function') {
          let once = false;
          onUpdate(() => { if (!once) { once = true; revealIfReady(); } });
        }
      } catch {}

      // timeout de erro se canvas nunca aparecer
      setTimeout(() => {
        const root = document.getElementById('game-root');
        const canvas = root && root.querySelector('canvas');
        if (!canvas) {
          showFatal('Erro: o canvas do jogo não foi criado.\nRecarregue a página. Se persistir, tente outro navegador ou verifique suporte a WebGL.');
        } else if (!revealed) {
          revealIfReady();
        }
      }, 8000);

    } catch (e) {
      console.error('Erro ao iniciar jogo:', e);
      showFatal('Erro ao iniciar cena: ' + (e && e.message ? e.message : e) + '\nRecarregue a página.');
    }
  }

  // aguardar assets e iniciar
  try {
    if (typeof onLoad === 'function') {
      onLoad(() => { setBootStatus('Assets carregados. Iniciando...'); startGame(); });
      // fallback de segurança caso onLoad não dispare
      setTimeout(() => {
        const loading = document.getElementById('game-loading');
        if (loading && loading.style.display !== 'none') {
          // ainda carregando/iniciando - tenta iniciar mesmo assim
          try { startGame(); } catch {}
        }
      }, 12000);
    } else if (typeof onLoading === 'function') {
      // fallback raro
      setBootStatus('Carregando assets...');

  // Carrega fonte pixelada para nomes
  try {
    loadFont('press-start', 'https://fonts.gstatic.com/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK3nVivM.woff2');
  } catch(e) { console.warn('loadFont press-start falhou', e); }
  try {
    loadFont('pixel', 'https://fonts.gstatic.com/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK3nVivM.woff2');
  } catch(e) {}
      setTimeout(startGame, 800);
    } else {
      setBootStatus('Carregando assets...');

  // Carrega fonte pixelada para nomes
  try {
    loadFont('press-start', 'https://fonts.gstatic.com/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK3nVivM.woff2');
  } catch(e) { console.warn('loadFont press-start falhou', e); }
  try {
    loadFont('pixel', 'https://fonts.gstatic.com/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK3nVivM.woff2');
  } catch(e) {}
      setTimeout(startGame, 800);
    }
  } catch (e) {
    setTimeout(startGame, 800);
  }

})();
