const jsonServer = require('json-server');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');

const server = jsonServer.create();
const router = jsonServer.router(path.join(__dirname, 'db.json'));
const middlewares = jsonServer.defaults({ logger: true, noCors: false });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mock-api-secret-key';

// In-memory store for UI-configured endpoints
let mockEndpoints = [];

server.use(middlewares);
server.use(jsonServer.bodyParser);

// ─── HEALTH ───────────────────────────────────────────────────────────────────
server.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    configuredEndpoints: mockEndpoints.length,
    endpoints: [
      { method: 'GET',    path: '/health' },
      { method: 'POST',   path: '/__config',        description: 'Sync endpoints from UI' },
      { method: 'GET',    path: '/__config',         description: 'Get current config' },
      { method: 'GET',    path: '/users' },
      { method: 'GET',    path: '/users/:id' },
      { method: 'POST',   path: '/users' },
      { method: 'PUT',    path: '/users/:id' },
      { method: 'PATCH',  path: '/users/:id' },
      { method: 'DELETE', path: '/users/:id' },
      { method: 'GET',    path: '/products' },
      { method: 'POST',   path: '/products' },
      { method: 'DELETE', path: '/products/:id' },
      { method: 'GET',    path: '/orders' },
      { method: 'POST',   path: '/orders' },
      { method: 'DELETE', path: '/orders/:id' },
      { method: 'POST',   path: '/auth/login' },
      { method: 'POST',   path: '/auth/register' },
      { method: 'GET',    path: '/auth/me' },
    ]
  });
});

// ─── CONFIG SYNC (called by UI) ───────────────────────────────────────────────
server.post('/__config', (req, res) => {
  mockEndpoints = req.body.endpoints || [];
  console.log(`[config] synced ${mockEndpoints.length} endpoints from UI`);
  res.json({ success: true, count: mockEndpoints.length });
});

server.get('/__config', (req, res) => {
  res.json({ success: true, endpoints: mockEndpoints });
});

// ─── AUTH ─────────────────────────────────────────────────────────────────────
server.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }
  const token = jwt.sign({ id: 1, email, role: 'user' }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ success: true, token, expiresIn: 3600, user: { id: 1, email, role: 'user' } });
});

server.post('/auth/register', (req, res) => {
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

server.get('/auth/me', (req, res) => {
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

// ─── DYNAMIC MOCK HANDLER (UI-configured endpoints) ──────────────────────────
function pathMatches(pattern, actual) {
  const pp = pattern.split('/');
  const ap = actual.split('/');
  if (pp.length !== ap.length) return false;
  return pp.every((seg, i) => seg.startsWith(':') || seg === ap[i]);
}

function resolvePlaceholders(body) {
  const names  = ['Alice Johnson', 'Bob Smith', 'Carol White', 'Dani Patel'];
  const emails = ['alice@demo.io', 'bob@test.com', 'carol@example.net'];
  const phones = ['+1-555-0172', '+44-20-7123-4567', '+91-98765-43210'];
  return (body || '')
    .replace(/\{\{timestamp\}\}/g, new Date().toISOString())
    .replace(/\{\{uuid\}\}/g, crypto.randomUUID())
    .replace(/\{\{faker\.name\}\}/g,  names[Math.floor(Math.random() * names.length)])
    .replace(/\{\{faker\.email\}\}/g, emails[Math.floor(Math.random() * emails.length)])
    .replace(/\{\{faker\.phone\}\}/g, phones[Math.floor(Math.random() * phones.length)])
    .replace(/\{\{random\.int\}\}/g,  String(Math.floor(Math.random() * 1000)));
}

server.use((req, res, next) => {
  // Skip internal routes
  if (req.path.startsWith('/__config') || req.path.startsWith('/auth') || req.path === '/health') {
    return next();
  }

  const match = mockEndpoints.find(ep => {
    if (!ep.enabled) return false;
    if (ep.method !== req.method) return false;
    return pathMatches(ep.path, req.path);
  });

  if (!match) return next();

  const scenario = match.activeScenario
    ? match.scenarios?.find(s => s.id === match.activeScenario)
    : null;

  const statusCode = scenario ? scenario.statusCode : match.statusCode;
  const rawBody    = scenario ? scenario.body : match.responseBody;
  const body       = resolvePlaceholders(rawBody);

  // Set configured headers
  match.headers?.forEach(h => { if (h.key) res.setHeader(h.key, h.value); });

  setTimeout(() => {
    res.status(statusCode);
    if ((match.contentType || '').includes('json')) {
      try { res.json(JSON.parse(body)); }
      catch { res.send(body); }
    } else {
      res.send(body);
    }
  }, match.delay || 0);
});

// ─── JSON-SERVER CRUD (fallback) ──────────────────────────────────────────────
router.render = (req, res) => {
  const data = res.locals.data;
  if (Array.isArray(data) && (req.query.page || req.query.limit)) {
    const limit = parseInt(req.query.limit) || 10;
    const page  = parseInt(req.query.page)  || 1;
    const start = (page - 1) * limit;
    return res.json({
      success: true,
      data: data.slice(start, start + limit),
      pagination: { page, limit, total: data.length, pages: Math.ceil(data.length / limit) }
    });
  }
  res.json(Array.isArray(data) ? { success: true, data, total: data.length } : { success: true, data });
};

server.use(router);

server.listen(PORT, () => {
  console.log(`Mock API Server  →  http://localhost:${PORT}`);
  console.log(`API Studio UI    →  http://localhost:${PORT}/index.html`);
  console.log(`Health check     →  http://localhost:${PORT}/health`);
});
