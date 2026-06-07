// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'super-secret-ledger-key',
    resave: false,
    saveUninitialized: true
}));

const db = new sqlite3.Database('./ledger.db', (err) => {
    if (err) console.error(err.message);
    console.log('Connected to the SQLite database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY, username TEXT, password TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, address TEXT, notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, date TEXT, description TEXT, quantity INTEGER, rate REAL, amount REAL, gst REAL, cess REAL, grand_total REAL, FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, amount REAL, date TEXT, FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE)`);
    db.run("PRAGMA foreign_keys = ON;");

    db.get("SELECT * FROM admin", (err, row) => {
        if (!row) db.run(`INSERT INTO admin (username, password) VALUES ('admin', 'password123')`);
    });
});

const requireAuth = (req, res, next) => {
    if (req.session.loggedIn) next();
    else res.status(401).json({ error: 'Unauthorized' });
};

// Auth Routes
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM admin WHERE username = ? AND password = ?`, [username, password], (err, row) => {
        if (row) { req.session.loggedIn = true; res.json({ success: true }); } 
        else res.status(401).json({ success: false, message: 'Invalid credentials' });
    });
});
app.get('/api/check-auth', (req, res) => res.json({ loggedIn: req.session.loggedIn === true }));
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

// Dashboard
app.get('/api/dashboard', requireAuth, (req, res) => {
    const stats = { totalSales: 0, totalReceived: 0, pending: 0, customers: 0 };
    db.get(`SELECT SUM(grand_total) as totalSales FROM transactions`, (err, row) => {
        stats.totalSales = row?.totalSales || 0;
        db.get(`SELECT SUM(amount) as totalReceived FROM payments`, (err, row) => {
            stats.totalReceived = row?.totalReceived || 0;
            stats.pending = stats.totalSales - stats.totalReceived;
            db.get(`SELECT COUNT(*) as count FROM customers`, (err, row) => {
                stats.customers = row?.count || 0;
                res.json(stats);
            });
        });
    });
});

// Customers CRUD
app.get('/api/customers', requireAuth, (req, res) => {
    db.all(`SELECT * FROM customers ORDER BY id DESC`, [], (err, rows) => res.json(rows));
});
app.post('/api/customers', requireAuth, (req, res) => {
    const { name, phone, address, notes } = req.body;
    db.run(`INSERT INTO customers (name, phone, address, notes) VALUES (?, ?, ?, ?)`, 
        [name, phone, address, notes], function(err) { res.json({ id: this.lastID }); });
});
app.put('/api/customers/:id', requireAuth, (req, res) => {
    const { name, phone, address, notes } = req.body;
    db.run(`UPDATE customers SET name=?, phone=?, address=?, notes=? WHERE id=?`, 
        [name, phone, address, notes, req.params.id], function(err) { res.json({ success: true }); });
});
app.delete('/api/customers/:id', requireAuth, (req, res) => {
    db.run(`DELETE FROM customers WHERE id=?`, req.params.id, function(err) { res.json({ success: true }); });
});

// Transactions
app.get('/api/transactions', requireAuth, (req, res) => {
    db.all(`SELECT t.*, c.name as customer_name FROM transactions t JOIN customers c ON t.customer_id = c.id ORDER BY t.date DESC, t.id DESC`, [], (err, rows) => res.json(rows));
});
app.post('/api/transactions', requireAuth, (req, res) => {
    const { customer_id, date, description, quantity, rate, amount, gst, cess, grand_total } = req.body;
    db.run(`INSERT INTO transactions (customer_id, date, description, quantity, rate, amount, gst, cess, grand_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [customer_id, date, description, quantity, rate, amount, gst, cess, grand_total], function(err) { res.json({ id: this.lastID }); });
});

// Payments
app.post('/api/payments', requireAuth, (req, res) => {
    const { customer_id, amount, date } = req.body;
    db.run(`INSERT INTO payments (customer_id, amount, date) VALUES (?, ?, ?)`, [customer_id, amount, date], function(err) { res.json({ id: this.lastID }); });
});

// Ledger & Reports
app.get('/api/ledger/:customer_id', requireAuth, (req, res) => {
    const sql = `
        SELECT id, date, 'Invoice' as type, description, grand_total as debit, 0 as credit FROM transactions WHERE customer_id = ?
        UNION ALL
        SELECT id, date, 'Payment' as type, 'Payment Received' as description, 0 as debit, amount as credit FROM payments WHERE customer_id = ?
        ORDER BY date ASC, type ASC
    `;
    db.all(sql, [req.params.customer_id, req.params.customer_id], (err, rows) => res.json(rows));
});

app.get('/api/reports/dues', requireAuth, (req, res) => {
    const sql = `
        SELECT c.id, c.name, c.phone, 
               COALESCE(SUM(t.grand_total), 0) as total_billed, 
               COALESCE(p.total_paid, 0) as total_paid,
               (COALESCE(SUM(t.grand_total), 0) - COALESCE(p.total_paid, 0)) as balance
        FROM customers c
        LEFT JOIN transactions t ON c.id = t.customer_id
        LEFT JOIN (SELECT customer_id, SUM(amount) as total_paid FROM payments GROUP BY customer_id) p ON c.id = p.customer_id
        GROUP BY c.id HAVING balance > 0 ORDER BY balance DESC
    `;
    db.all(sql, [], (err, rows) => res.json(rows));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
