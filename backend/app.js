const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const aiRoutes = require('./routes/ai');
const taskRoutes = require('./routes/tasks');
require('./listeners');

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
  next();
});

const distPath = path.join(__dirname, '..', 'frontend', 'dist');
const publicPath = path.join(__dirname, 'public');
const staticPath = fs.existsSync(distPath) ? distPath : publicPath;

app.use(express.static(staticPath));
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/tasks', taskRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

module.exports = app;
