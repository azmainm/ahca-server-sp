const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/openai', require('./routes/openai'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'After Hours Call Server is running' });
});

app.listen(PORT, () => {
  console.log(`AHCA Server running on port ${PORT}`);
});
