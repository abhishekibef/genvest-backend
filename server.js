const express = require('express');
const app = express();

// SIMPLE TEST - NO DATABASE, NO COMPLEXITY
app.get('/', (req, res) => {
    res.send('✅ Server is running!');
});

app.get('/api/test', (req, res) => {
    res.json({ message: 'Backend is working! 🚀' });
});

// CRITICAL: Must bind to 0.0.0.0
const PORT = parseInt(process.env.PORT, 10) || 5000;
console.log(`🚀 Attempting to start on port ${PORT}...`);

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Listening on 0.0.0.0:${PORT}`);
});

server.on('error', (err) => {
    console.error('❌ Server error:', err.message);
});
