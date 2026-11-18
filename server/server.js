/**
 * Arcainad - Backend Multiplayer (admin, cores, chat)
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const initSqlJs = require('sql.js');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'arcainad-dev-secret-change-me';
const DB_PATH = path.join(__dirname, 'arcainad.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const MAX_PLAYERS_PER_SERVER = 8;
const ALLOWED_COLORS = ['#39ff14', '#b026ff', '#00ffff', '#ff8c00', '#ff4fd8', '#ffffff', '#ffe600'];

let db;

async function loadDb() {
  const SQL = await initSqlJs();
  db = fs.existsSync(DB_PATH) ? new SQL.Database(fs.readFileSync(DB_PATH)) : new SQL.Database();
  db.run(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  // migrações leves
  try { db.run("ALTER TABLE users ADD COLUMN color TEXT NOT NULL DEFAULT '#39ff14'"); } catch {}
  try { db.run("ALTER TABLE users ADD COLUMN updated_at TEXT"); } catch {}
  saveDb();
}
function saveDb() { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); }
function all(sql, params = []) { const stmt = db.prepare(sql); stmt.bind(params); const rows = []; while (stmt.step()) rows.push(stmt.getAsObject()); stmt.free(); return rows; }
function get(sql, params = []) { return all(sql, params)[0] || null; }
function run(sql, params = []) { db.run(sql, params); saveDb(); }

function signToken(user) { return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' }); }
function verifyToken(token) { try { return jwt.verify(token, JWT_SECRET); } catch { return null; } }
function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const payload = verifyToken(h.startsWith('Bearer ') ? h.slice(7) : null);
  if (!payload) return res.status(401).json({ error: 'Não autenticado' });
  req.user = { id: payload.sub, username: payload.username };
  next();
}
function safeJson(str, fallback) { try { return str ? JSON.parse(str) : fallback; } catch { return fallback; } }
function normalizeInventory(inv) { const arr = new Array(20).fill(null); if (Array.isArray(inv)) for (let i = 0; i < 20; i++) arr[i] = (i < inv.length ? inv[i] : null); return arr; }
function validColor(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c); }
function sanitizeText(s, max) { return String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max || 200); }

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/register', async (req, res) => {
  try {
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    const color = validColor(req.body && req.body.color) ? req.body.color : '#39ff14';
    if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Usuário deve ter 3-20 caracteres' });
    if (!/^[a-zA-Z0-9_\-]+$/.test(username)) return res.status(400).json({ error: 'Usuário: use letras, números, _ ou -' });
    if (password.length < 4) return res.status(400).json({ error: 'Senha deve ter pelo menos 4 caracteres' });
    if (get('SELECT id FROM users WHERE lower(username)=lower(?)', [username])) return res.status(409).json({ error: 'Usuário já existe' });
    const hash = await bcrypt.hash(password, 10);
    run('INSERT INTO users (username, password_hash, color) VALUES (?, ?, ?)', [username, hash, color]);
    const user = get('SELECT id, username, color FROM users WHERE lower(username)=lower(?)', [username]);
    res.json({ token: signToken(user), user: { id: user.id, username: user.username, color: user.color || '#39ff14' } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro no registro' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    const user = get('SELECT id, username, password_hash, color FROM users WHERE lower(username)=lower(?)', [username]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    res.json({ token: signToken(user), user: { id: user.id, username: user.username, color: user.color || '#39ff14' } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro no login' }); }
});

app.get('/api/me', authMiddleware, (req, res) => {
  const u = get('SELECT id, username, color FROM users WHERE id = ?', [req.user.id]);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({ user: { id: u.id, username: u.username, color: u.color || '#39ff14' } });
});

app.patch('/api/me', authMiddleware, (req, res) => {
  const color = validColor(req.body && req.body.color) ? req.body.color : null;
  if (!color) return res.status(400).json({ error: 'Cor inválida' });
  run('UPDATE users SET color = ? WHERE id = ?', [color, req.user.id]);
  const u = get('SELECT id, username, color FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: { id: u.id, username: u.username, color: u.color || '#39ff14' } });
});

app.get('/api/servers', authMiddleware, (req, res) => {
  const rows = all(`
    SELECT s.id, s.server_name, s.owner_id, (s.password_hash IS NOT NULL) AS has_password,
           s.updated_at, u.username AS owner_name, m.role
    FROM servers s JOIN server_members m ON m.server_id = s.id JOIN users u ON u.id = s.owner_id
    WHERE m.user_id = ? ORDER BY s.updated_at DESC`, [req.user.id]).map(r => ({ ...r, is_member: 1, is_owner: r.owner_id === req.user.id ? 1 : 0 }));
  res.json({ servers: rows });
});

app.get('/api/servers/browse', authMiddleware, (req, res) => {
  const rows = all(`
    SELECT s.id, s.server_name, s.owner_id, (s.password_hash IS NOT NULL) AS has_password,
           s.updated_at, u.username AS owner_name,
           CASE WHEN m.user_id IS NULL THEN 0 ELSE 1 END AS is_member,
           COALESCE(m.role, '') AS role
    FROM servers s JOIN users u ON u.id = s.owner_id
    LEFT JOIN server_members m ON m.server_id = s.id AND m.user_id = ?
    ORDER BY s.updated_at DESC LIMIT 100`, [req.user.id]);
  const out = rows.map(r => { const st = roomState.get(Number(r.id)); return { ...r, is_owner: r.owner_id === req.user.id ? 1 : 0, online_count: st ? st.players.size : 0 }; });
  res.json({ servers: out });
});

app.post('/api/servers', authMiddleware, async (req, res) => {
  try {
    const name = sanitizeText(req.body && req.body.server_name, 32);
    const password = String((req.body && req.body.password) || '');
    if (name.length < 3) return res.status(400).json({ error: 'Nome do servidor: 3-32 caracteres' });
    const passHash = password ? await bcrypt.hash(password, 10) : null;
    const initialSave = JSON.stringify({ createdAt: new Date().toISOString(), players: {}, notes: '', version: 2 });
    run('INSERT INTO servers (owner_id, server_name, password_hash, save_data) VALUES (?, ?, ?, ?)', [req.user.id, name, passHash, initialSave]);
    const server = get('SELECT id, server_name FROM servers WHERE owner_id = ? ORDER BY id DESC LIMIT 1', [req.user.id]);
    run('INSERT OR IGNORE INTO server_members (server_id, user_id, role) VALUES (?, ?, ?)', [server.id, req.user.id, 'owner']);
    res.json({ server: { id: server.id, server_name: server.server_name, has_password: !!passHash } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar servidor' }); }
});

// Configurações do servidor (apenas dono) - segurança no backend
app.patch('/api/servers/:id', authMiddleware, async (req, res) => {
  try {
    const sid = Number(req.params.id);
    const server = get('SELECT id, owner_id, server_name, password_hash FROM servers WHERE id = ?', [sid]);
    if (!server) return res.status(404).json({ error: 'Servidor não encontrado' });
    if (Number(server.owner_id) !== Number(req.user.id)) return res.status(403).json({ error: 'Proibido: apenas o criador pode alterar este servidor' });
    const body = req.body || {};
    if (body.server_name !== undefined) {
      const name = sanitizeText(body.server_name, 32);
      if (name.length < 3) return res.status(400).json({ error: 'Nome do servidor: 3-32 caracteres' });
      run('UPDATE servers SET server_name = ?, updated_at = datetime(\'now\') WHERE id = ?', [name, sid]);
    }
    if (body.password !== undefined) {
      const pass = String(body.password || '');
      const passHash = pass ? await bcrypt.hash(pass, 10) : null;
      run('UPDATE servers SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?', [passHash, sid]);
    }
    const updated = get('SELECT id, server_name, (password_hash IS NOT NULL) AS has_password FROM servers WHERE id = ?', [sid]);
    res.json({ server: { id: updated.id, server_name: updated.server_name, has_password: !!updated.has_password } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao atualizar servidor' }); }
});

app.delete('/api/servers/:id', authMiddleware, (req, res) => {
  try {
    const sid = Number(req.params.id);
    const server = get('SELECT id, owner_id FROM servers WHERE id = ?', [sid]);
    if (!server) return res.status(404).json({ error: 'Servidor não encontrado' });
    if (Number(server.owner_id) !== Number(req.user.id)) return res.status(403).json({ error: 'Proibido: apenas o criador pode excluir este servidor' });
    // desconecta jogadores online nesta sala
    const st = roomState.get(sid);
    if (st) {
      st.players.forEach((_, socketId) => { const s = io.sockets.sockets.get(socketId); if (s) { s.emit('error_message', { error: 'Servidor excluído pelo criador.' }); s.disconnect(true); } });
      roomState.delete(sid);
    }
    run('DELETE FROM server_members WHERE server_id = ?', [sid]);
    run('DELETE FROM servers WHERE id = ?', [sid]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao excluir servidor' }); }
});

app.use(express.static(path.join(__dirname, '..')));

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const roomState = new Map();

function ensureSaveShape(save) { if (!save || typeof save !== 'object') save = {}; if (!save.players || typeof save.players !== 'object') save.players = {}; if (typeof save.notes !== 'string') save.notes = ''; return save; }
function getRoom(serverId) {
  if (!roomState.has(serverId)) {
    const row = get('SELECT save_data FROM servers WHERE id = ?', [serverId]);
    roomState.set(serverId, { players: new Map(), save: ensureSaveShape(safeJson(row && row.save_data, {})) });
  }
  return roomState.get(serverId);
}
function userKey(userId) { return 'u:' + String(userId); }
function getSavedPlayerState(st, userId, username) {
  st.save = ensureSaveShape(st.save);
  let ps = st.save.players[userKey(userId)] || (username && st.save.players[username]);
  if (!ps || typeof ps !== 'object') return null;
  return { scene: (ps.scene === 'lab' || ps.scene === 'forest') ? ps.scene : 'lab', x: typeof ps.x === 'number' ? ps.x : 64, y: typeof ps.y === 'number' ? ps.y : 224, dir: typeof ps.dir === 'string' ? ps.dir : 'down', hasBackpack: !!ps.hasBackpack, inventory: normalizeInventory(ps.inventory), color: validColor(ps.color) ? ps.color : null };
}
function persistPlayer(st, p) {
  st.save = ensureSaveShape(st.save);
  st.save.players[userKey(p.userId)] = { userId: p.userId, username: p.username, scene: p.scene || 'lab', x: p.x, y: p.y, dir: p.dir || 'down', hasBackpack: !!p.hasBackpack, inventory: normalizeInventory(p.inventory), color: p.color || '#39ff14', updatedAt: new Date().toISOString() };
}
function persistRoom(serverId) {
  const st = roomState.get(serverId); if (!st) return;
  st.save = ensureSaveShape(st.save); st.save.updatedAt = new Date().toISOString();
  run('UPDATE servers SET save_data = ?, updated_at = datetime(\'now\') WHERE id = ?', [JSON.stringify(st.save), serverId]);
}

io.use(async (socket, next) => {
  try {
    const auth = socket.handshake.auth || {};
    const payload = verifyToken(auth.token);
    if (!payload) return next(new Error('Não autenticado'));
    const serverId = Number(auth.serverId);
    if (!serverId) return next(new Error('Servidor inválido'));
    const server = get('SELECT id, server_name, password_hash, owner_id FROM servers WHERE id = ?', [serverId]);
    if (!server) return next(new Error('Servidor não encontrado'));
    if (server.password_hash) {
      const ok = await bcrypt.compare(String(auth.password || ''), server.password_hash);
      if (!ok) return next(new Error('Senha do servidor incorreta'));
    }
    const dbUser = get('SELECT id, username, color FROM users WHERE id = ?', [payload.sub]);
    if (!dbUser) return next(new Error('Conta inválida'));
    socket.data.user = { id: dbUser.id, username: dbUser.username, color: validColor(dbUser.color) ? dbUser.color : '#39ff14' };
    socket.data.serverId = serverId;
    run('INSERT OR IGNORE INTO server_members (server_id, user_id, role) VALUES (?, ?, ?)', [serverId, dbUser.id, server.owner_id === dbUser.id ? 'owner' : 'member']);
    next();
  } catch (e) { next(new Error('Falha na autenticação')); }
});

io.on('connection', (socket) => {
  const { user, serverId } = socket.data;
  const room = `server:${serverId}`;
  const st = getRoom(serverId);

  if (st.players.size >= MAX_PLAYERS_PER_SERVER) { socket.emit('error_message', { error: 'Servidor cheio (máx. 8 jogadores)' }); socket.disconnect(true); return; }
  for (const [sid, p] of st.players.entries()) {
    if (p.userId === user.id && sid !== socket.id) { const old = io.sockets.sockets.get(sid); if (old) { old.emit('error_message', { error: 'Conectado em outra sessão.' }); old.disconnect(true); } st.players.delete(sid); }
  }

  socket.join(room);
  const saved = getSavedPlayerState(st, user.id, user.username);
  const player = {
    id: socket.id, userId: user.id, username: user.username,
    color: validColor(saved && saved.color) ? saved.color : (validColor(user.color) ? user.color : '#39ff14'),
    scene: saved ? saved.scene : 'lab', x: saved ? saved.x : 64, y: saved ? saved.y : 224,
    dir: saved ? saved.dir : 'down', anim: (saved ? saved.dir : 'down') + '-idle',
    hasBackpack: saved ? !!saved.hasBackpack : false, inventory: saved ? normalizeInventory(saved.inventory) : new Array(20).fill(null),
  };
  st.players.set(socket.id, player);

  socket.emit('joined', {
    serverId,
    me: { id: player.id, userId: player.userId, username: player.username, color: player.color, scene: player.scene, x: player.x, y: player.y, dir: player.dir, anim: player.anim, hasBackpack: !!player.hasBackpack, inventory: player.inventory },
    players: Array.from(st.players.values()).map(p => ({ id: p.id, username: p.username, color: p.color, scene: p.scene, x: p.x, y: p.y, dir: p.dir, anim: p.anim, hasBackpack: !!p.hasBackpack })),
    notes: (st.save && st.save.notes) || ''
  });
  socket.to(room).emit('player_joined', { id: player.id, username: player.username, color: player.color, scene: player.scene, x: player.x, y: player.y, dir: player.dir, anim: player.anim, hasBackpack: !!player.hasBackpack });

  socket.on('player_movement', (data) => {
    if (!data) return;
    const p = st.players.get(socket.id); if (!p) return;
    if (typeof data.x === 'number') p.x = data.x;
    if (typeof data.y === 'number') p.y = data.y;
    if (data.scene === 'lab' || data.scene === 'forest') p.scene = data.scene;
    if (typeof data.dir === 'string') p.dir = data.dir;
    if (typeof data.anim === 'string') p.anim = data.anim;
    if (typeof data.hasBackpack === 'boolean') p.hasBackpack = data.hasBackpack;
    if (Array.isArray(data.inventory)) p.inventory = normalizeInventory(data.inventory);
    if (validColor(data.color)) p.color = data.color; // aceita cor da sessão se válida
    persistPlayer(st, p);
    socket.to(room).emit('player_update', { id: p.id, username: p.username, color: p.color, scene: p.scene, x: p.x, y: p.y, dir: p.dir, anim: p.anim, hasBackpack: !!p.hasBackpack });
  });

  socket.on('pc_notes_update', (data) => {
    const text = sanitizeText(data && data.text, 5000);
    st.save = ensureSaveShape(st.save); st.save.notes = text;
    socket.to(room).emit('pc_notes_sync', { username: user.username, text });
  });

  socket.on('chat_message', (data) => {
    const p = st.players.get(socket.id); if (!p) return;
    const text = sanitizeText(data && data.text, 160);
    if (!text) return;
    const msg = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), fromId: p.id, username: p.username, color: p.color || '#39ff14', text, ts: Date.now() };
    io.to(room).emit('chat_message', msg);
  });

  socket.on('disconnect', () => {
    const p = st.players.get(socket.id); if (p) persistPlayer(st, p);
    st.players.delete(socket.id);
    socket.to(room).emit('player_left', { id: socket.id, username: user.username });
    persistRoom(serverId);
    if (st.players.size === 0) { roomState.delete(serverId); console.log(`[server ${serverId}] vazio; progresso salvo.`); }
  });
});

(async () => {
  await loadDb();
  httpServer.listen(PORT, () => { console.log(`Arcainad server rodando em http://localhost:${PORT}`); console.log(`DB: ${DB_PATH}`); });
})();

process.on('SIGINT', () => { try { roomState.forEach((_, id) => persistRoom(id)); saveDb(); } catch {} process.exit(0); });
process.on('SIGTERM', () => { try { roomState.forEach((_, id) => persistRoom(id)); saveDb(); } catch {} process.exit(0); });
