const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const jsonServer = require('json-server');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mock-api-secret-key';

app.use(cors());
app.use(express.json());

// Serve the API Studio frontend
app.use(express.static(__dirname));

// ─── HEALTH / ENDPOINT LISTING ───────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    endpoints: [
      { method: 'GET',    path: '/health',           description: 'List all endpoints' },
      { method: 'GET',    path: '/users',             description: 'List users (supports ?page=1&limit=10)' },
      { method: 'GET',    path: '/users/:id',         description: 'Get user by ID' },
      { method: 'POST',   path: '/users',             description: 'Create user' },
      { method: 'PUT',    path: '/users/:id',         description: 'Update user' },
      { method: 'PATCH',  path: '/users/:id',         description: 'Partial update user' },
      { method: 'DELETE', path: '/users/:id',         description: 'Delete user' },
      { method: 'GET',    path: '/products',          description: 'List products' },
      { method: 'POST',   path: '/products',          description: 'Create product' },
      { method: 'DELETE', path: '/products/:id',      description: 'Delete product' },
      { method: 'GET',    path: '/orders',            description: 'List orders' },
      { method: 'POST',   path: '/orders',            description: 'Create order' },
      { method: 'DELETE', path: '/orders/:id',        description: 'Delete order' },
      { method: 'POST',   path: '/auth/login',        description: 'Returns mock JWT token' },
      { method: 'POST',   path: '/auth/register',     description: 'Creates user, validates fields' },
      { method: 'GET',    path: '/auth/me',           description: 'Returns user from Bearer token' },
    ]
  });
});

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }
  const token = jwt.sign({ id: 1, email, role: 'user' }, JWT_SECRET, { expiresIn: '1h' });
  res.json({
    success: true,
    token,
    expiresIn: 3600,
    user: { id: 1, email, role: 'user' }
  });
});

app.post('/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  const errors = [];
  if (!name)     errors.push('name is required');
  if (!email)    errors.push('email is required');
  if (!password) errors.push('password is required');
  if (password && password.length < 6) errors.push('password must be at least 6 characters');
  if (errors.length) return res.status(422).json({ success: false, errors });

  const token = jwt.sign({ id: Date.now(), email, role: 'user' }, JWT_SECRET, { expiresIn: '1h' });
  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    token,
    user: { id: Date.now(), name, email, role: 'user', createdAt: new Date().toISOString() }
  });
});

app.get('/auth/me', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authorization header required' });
  }
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    res.json({ success: true, user: decoded });
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
});

// ─── JSON SERVER FOR CRUD ROUTES ──────────────────────────────────────────────
const router = jsonServer.router(path.join(__dirname, 'db.json'));
const middlewares = jsonServer.defaults({ logger: false, noCors: true });

// Pagination support: ?page=1&limit=10
router.render = (req, res) => {
  const data = res.locals.data;
  const total = Array.isArray(data) ? data.length : null;

  if (Array.isArray(data) && (req.query.page || req.query.limit)) {
    const limit = parseInt(req.query.limit) || 10;
    const page  = parseInt(req.query.page)  || 1;
    const start = (page - 1) * limit;
    return res.json({
      success: true,
      data: data.slice(start, start + limit),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  }

  res.json(Array.isArray(data) ? { success: true, data, total } : { success: true, data });
};

app.use(middlewares);
app.use(router);

app.listen(PORT, () => {
  console.log(`Mock API Server running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API Studio:   http://localhost:${PORT}/`);
});
