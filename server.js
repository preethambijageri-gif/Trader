const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// API ROUTES
// ==========================================

// Login Authentication
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    // Hardcoded credentials for system initialization
    if (username === 'admin' && password === 'admin') {
        res.json({ 
            success: true, 
            message: 'Access Granted',
            user: { username: 'admin', role: 'Administrator' }
        });
    } else {
        res.status(401).json({ 
            success: false, 
            message: 'Authentication Failed: Invalid Credentials' 
        });
    }
});

// ==========================================
// FALLBACK & STARTUP
// ==========================================

// SPA Routing: Redirect everything else to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Launch Server
app.listen(PORT, () => {
    console.log(`[Trader OS] Server live at http://localhost:${PORT}`);
});
