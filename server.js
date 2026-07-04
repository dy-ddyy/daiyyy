const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== 管理员密码验证 ==========
app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(403).json({ error: '密码错误' });
  }
});

// ========== 数据存储（JSON 文件） ==========
// Railway 上 /data 目录是持久化的，本地就用当前目录
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const WORKERS_FILE = path.join(DATA_DIR, 'workers.json');

function readJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return [];
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ========== API：订单 ==========

// 获取所有订单
app.get('/api/orders', (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  res.json(orders);
});

// 添加订单
app.post('/api/orders', (req, res) => {
  const { gameName, rankInfo, price, customer, notes } = req.body;
  if (!gameName || !rankInfo) {
    return res.status(400).json({ error: '游戏名称和段位要求必填' });
  }
  if (!price || price <= 0) {
    return res.status(400).json({ error: '请输入有效价格' });
  }

  const orders = readJSON(ORDERS_FILE);
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  const order = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    game_name: gameName,
    rank_info: rankInfo,
    price: parseFloat(price),
    customer: customer || '未填写',
    notes: notes || '',
    status: 'pending',
    worker: '',
    created_at: now,
    done_at: ''
  };

  orders.unshift(order);
  writeJSON(ORDERS_FILE, orders);
  res.json(order);
});

// 接单
app.put('/api/orders/:id/claim', (req, res) => {
  const { worker } = req.body;
  if (!worker) return res.status(400).json({ error: '请提供打手名称' });

  const orders = readJSON(ORDERS_FILE);
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.status !== 'pending') return res.status(400).json({ error: '该订单已被接走' });

  order.status = 'doing';
  order.worker = worker;
  writeJSON(ORDERS_FILE, orders);
  res.json(order);
});

// 完成订单
app.put('/api/orders/:id/finish', (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.status !== 'doing') return res.status(400).json({ error: '订单状态不正确' });

  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  order.status = 'done';
  order.done_at = now;
  writeJSON(ORDERS_FILE, orders);
  res.json(order);
});

// 取消订单
app.put('/api/orders/:id/cancel', (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });

  order.status = 'cancelled';
  order.worker = '';
  writeJSON(ORDERS_FILE, orders);
  res.json(order);
});

// 清空已完成/已取消的订单
app.delete('/api/orders/clear', (req, res) => {
  let orders = readJSON(ORDERS_FILE);
  const before = orders.length;
  orders = orders.filter(o => o.status !== 'done' && o.status !== 'cancelled');
  writeJSON(ORDERS_FILE, orders);
  res.json({ deleted: before - orders.length });
});

// ========== API：打手 ==========

app.get('/api/workers', (req, res) => {
  res.json(readJSON(WORKERS_FILE));
});

app.post('/api/workers', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: '请输入打手名称' });

  const workers = readJSON(WORKERS_FILE);
  if (workers.includes(name)) return res.status(400).json({ error: '该打手已存在' });

  workers.push(name);
  writeJSON(WORKERS_FILE, workers);
  res.json({ name });
});

// ========== 启动 ==========
app.listen(PORT, () => {
  console.log(`派单系统已启动 → http://localhost:${PORT}`);
});
