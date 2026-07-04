const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dyd121';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const WORKERS_FILE = path.join(DATA_DIR, 'workers.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch (e) { return []; }
}
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
function hash(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// ==================== 管理员登录 ====================
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: '密码错误' });
  }
});

// ==================== 打手注册/登录 ====================
app.post('/api/workers/register', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: '请填写打手名和密码' });
  if (password.length < 4) return res.status(400).json({ error: '密码至少4位' });

  const workers = readJSON(WORKERS_FILE);
  const norm = workers.filter(w => typeof w === 'object');
  if (norm.find(w => w.name === name)) return res.status(400).json({ error: '该打手名已被注册' });

  norm.push({ name, password_hash: hash(password), online: false, busy: false, online_since: 0, tags: [] });
  writeJSON(WORKERS_FILE, norm);
  res.json({ name });
});

app.post('/api/workers/login', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: '请填写打手名和密码' });

  const workers = readJSON(WORKERS_FILE);
  const w = workers.find(w => typeof w === 'object' && w.name === name);
  if (!w) return res.status(401).json({ error: '打手不存在' });
  if (w.password_hash !== hash(password)) return res.status(401).json({ error: '密码错误' });

  // 返回打手信息和标签
  res.json({ name: w.name, tags: w.tags || [] });
});

// ==================== 打手接单类型标签 ====================
app.get('/api/workers/tags', (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: '请提供打手名' });
  const workers = readJSON(WORKERS_FILE);
  const w = workers.find(w => typeof w === 'object' && w.name === name);
  if (!w) return res.status(404).json({ error: '打手不存在' });
  res.json({ tags: w.tags || [] });
});

app.post('/api/workers/tags', (req, res) => {
  const { name, tags } = req.body;
  if (!name) return res.status(400).json({ error: '请提供打手名' });
  const workers = readJSON(WORKERS_FILE);
  const w = workers.find(w => typeof w === 'object' && w.name === name);
  if (!w) return res.status(404).json({ error: '打手不存在' });
  w.tags = Array.isArray(tags) ? tags : [];
  writeJSON(WORKERS_FILE, workers);
  res.json({ name: w.name, tags: w.tags });
});

// ==================== 打手上下线（加入排队/退出排队） ====================
app.post('/api/workers/toggle-online', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: '请提供打手名' });

  const workers = readJSON(WORKERS_FILE);
  const w = workers.find(w => typeof w === 'object' && w.name === name);
  if (!w) return res.status(404).json({ error: '打手不存在' });

  w.online = !w.online;
  if (w.online) {
    w.online_since = Date.now();
    w.busy = false;
  } else {
    w.online_since = 0;
    w.busy = false;
  }
  writeJSON(WORKERS_FILE, workers);
  res.json({ name: w.name, online: w.online, busy: w.busy });
});

// ==================== 打手完成订单（回到排队状态） ====================
app.post('/api/workers/complete', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: '请提供打手名' });

  const workers = readJSON(WORKERS_FILE);
  const w = workers.find(w => typeof w === 'object' && w.name === name);
  if (!w) return res.status(404).json({ error: '打手不存在' });
  if (!w.busy) return res.status(400).json({ error: '你当前没有被派单' });

  w.busy = false;
  w.online = true;
  w.online_since = Date.now();
  writeJSON(WORKERS_FILE, workers);
  res.json({ name: w.name, online: w.online, busy: w.busy });
});

// ==================== 管理员派单（指定打手） ====================
app.post('/api/workers/dispatch', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: '请提供打手名' });

  const workers = readJSON(WORKERS_FILE);
  const w = workers.find(w => typeof w === 'object' && w.name === name);
  if (!w) return res.status(404).json({ error: '打手不存在' });
  if (!w.online) return res.status(400).json({ error: '该打手不在线' });
  if (w.busy) return res.status(400).json({ error: '该打手正在忙' });

  w.busy = true;
  w.online = false;
  writeJSON(WORKERS_FILE, workers);
  res.json({ name: w.name, busy: true });
});

// ==================== 管理员取消派单 ====================
app.post('/api/workers/undispatch', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: '请提供打手名' });

  const workers = readJSON(WORKERS_FILE);
  const w = workers.find(w => typeof w === 'object' && w.name === name);
  if (!w) return res.status(404).json({ error: '打手不存在' });
  if (!w.busy) return res.status(400).json({ error: '该打手没有被派单' });

  w.busy = false;
  w.online = true;
  w.online_since = Date.now();
  writeJSON(WORKERS_FILE, workers);
  res.json({ name: w.name, online: true, busy: false });
});

// ==================== 管理员删除打手 ====================
app.delete('/api/workers/:name', (req, res) => {
  const name = req.params.name;
  const workers = readJSON(WORKERS_FILE);
  const w = workers.find(w => typeof w === 'object' && w.name === name);
  if (!w) return res.status(404).json({ error: '打手不存在' });
  if (w.online || w.busy) return res.status(400).json({ error: '该打手在线或忙碌中，无法删除' });

  writeJSON(WORKERS_FILE, workers.filter(w => !(typeof w === 'object' && w.name === name)));
  res.json({ success: true });
});

// ==================== 获取所有打手状态 ====================
app.get('/api/workers/status', (req, res) => {
  const workers = readJSON(WORKERS_FILE);
  const list = workers.filter(w => typeof w === 'object').map(w => ({
    name: w.name,
    online: w.online || false,
    busy: w.busy || false,
    online_since: w.online_since || 0,
    tags: w.tags || []
  }));
  // 排序：在线的按上线时间排前面，忙碌的排后面
  list.sort((a, b) => {
    if (a.online && !b.online) return -1;
    if (!a.online && b.online) return 1;
    if (a.online && b.online) return a.online_since - b.online_since;
    return 0;
  });
  res.json(list);
});

app.listen(PORT, () => {
  console.log(`排队系统已启动 → http://localhost:${PORT}`);
});
