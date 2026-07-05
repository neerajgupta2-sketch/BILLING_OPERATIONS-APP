const express = require('express');
const cors = require('cors');
const path = require('path');

const uploadRoutes = require('./routes/upload');
const dashboardRoutes = require('./routes/dashboard');
const caseRoutes = require('./routes/cases');
const exportRoutes = require('./routes/export');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', uploadRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/export', exportRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Serve frontend (static files)
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Billing Operations app running at http://localhost:${PORT}`);
});
