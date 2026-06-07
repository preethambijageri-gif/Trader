const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'saas-ultra-secure-token-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // 1 Hour session life
}));

const db = new sqlite3.Database('./business_vault.db', (err) => {
    if (err) console.error("Database connection failure:", err.message);
    else console.log('Connected to secure SQLite instance.');
});

// Relational Schema Definition
db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON;");
    
    db.run(`CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY, username TEXT, password TEXT)`);
    
    db.run(`CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, address TEXT, notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, sku TEXT UNIQUE, stock_qty INTEGER, min_stock INTEGER, cost_price REAL, selling_price REAL
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, product_id INTEGER, date TEXT, quantity INTEGER, 
        rate REAL, discount REAL, amount REAL, gst REAL, cess REAL, grand_total REAL, profit REAL,
        FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY(product_id) REFERENCES inventory(id) ON DELETE SET NULL
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, amount REAL, date TEXT, method TEXT,
        FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, category TEXT, amount REAL, date TEXT, notes TEXT
    )`);

    // Default Seed (User: admin / Pass: password123)
    db.get("SELECT * FROM admin WHERE username = 'admin'", [], (err, row) => {
        if (!row) {
            const hashed = bcrypt.hashSync('password123', 10);
            db.run(`INSERT INTO admin (username, password) VALUES ('admin', ?)`, [hashed]);
        }
    });
});

// Auth Guard Middleware
const guard = (req, res, next) => {
    if (req.session && req.session.uid) next();
    else res.status(401).json({ error: 'Session expired or unauthenticated.' });
};

// --- API ENDPOINTS ---

// Security
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM admin WHERE username = ?", [username], (err, user) => {
        if (user && bcrypt.compareSync(password, user.password)) {
            req.session.uid = user.id;
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }
    });
});
app.get('/api/auth/check', (req, res) => res.json({ authed: !!req.session.uid }));
app.post('/api/auth/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

// Deep Metrics Engine
app.get('/api/analytics/summary', guard, (req, res) => {
    const metrics = { sales: 0, profit: 0, paid: 0, pending: 0, customers: 0, expenses: 0 };
    db.get(`SELECT SUM(grand_total) as ts, SUM(profit) as tp FROM transactions`, (err, t) => {
        metrics.sales = t?.ts || 0;
        metrics.profit = t?.tp || 0;
        db.get(`SELECT SUM(amount) as tp FROM payments`, (err, p) => {
            metrics.paid = p?.tp || 0;
            metrics.pending = metrics.sales - metrics.paid;
            db.get(`SELECT SUM(amount) as te FROM expenses`, (err, e) => {
                metrics.expenses = e?.te || 0;
                metrics.profit -= metrics.expenses; // Net profit subtraction
                db.get(`SELECT COUNT(*) as tc FROM customers`, (err, c) => {
                    metrics.customers = c?.tc || 0;
                    res.json(metrics);
                });
            });
        });
    });
});

// Chart Streams
app.get('/api/analytics/charts', guard, (req, res) => {
    db.all(`SELECT substr(date,1,7) as month, SUM(grand_total) as revenue FROM transactions GROUP BY month ORDER BY month DESC LIMIT 6`, (err, salesRows) => {
        db.all(`SELECT c.name, (COALESCE(SUM(t.grand_total),0) - COALESCE(p.paid,0)) as due FROM customers c 
                LEFT JOIN transactions t ON c.id = t.customer_id 
                LEFT JOIN (SELECT customer_id, SUM(amount) as paid FROM payments GROUP BY customer_id) p ON c.id = p.customer_id
                GROUP BY c.id HAVING due > 0 ORDER BY due DESC LIMIT 5`, (err, dueRows) => {
            res.json({ salesGraph: salesRows.reverse(), dueGraph: dueRows });
        });
    });
});

// Inventory Control
app.get('/api/inventory', guard, (req, res) => {
    db.all(`SELECT *, (stock_qty <= min_stock) as alert FROM inventory ORDER BY name ASC`, (err, rows) => res.json(rows));
});
app.post('/api/inventory', guard, (req, res) => {
    const { name, sku, stock_qty, min_stock, cost_price, selling_price } = req.body;
    db.run(`INSERT INTO inventory (name, sku, stock_qty, min_stock, cost_price, selling_price) VALUES (?,?,?,?,?,?)`,
        [name, sku, stock_qty, min_stock, cost_price, selling_price], function() { res.json({ id: this.lastID }); });
});

// Transactions Engine with Inventory Balance Tracking
app.post('/api/transactions', guard, (req, res) => {
    const { customer_id, product_id, date, quantity, rate, discount, gst, cess, grand_total } = req.body;
    db.get(`SELECT cost_price, stock_qty FROM inventory WHERE id = ?`, [product_id], (err, prod) => {
        if(!prod || prod.stock_qty < quantity) return res.status(400).json({ error: 'Insufficient inventory stock levels.' });
        
        const gross_cost = prod.cost_price * quantity;
        const profit = grand_total - gross_cost - gst - cess;

        db.serialize(() => {
            db.run(`INSERT INTO transactions (customer_id, product_id, date, quantity, rate, discount, amount, gst, cess, grand_total, profit) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                    [customer_id, product_id, date, quantity, rate, discount, (quantity*rate)-discount, gst, cess, grand_total, profit]);
            db.run(`UPDATE inventory SET stock_qty = stock_qty - ? WHERE id = ?`, [quantity, product_id]);
            res.json({ success: true });
        });
    });
});

app.get('/api/transactions', guard, (req, res) => {
    db.all(`SELECT t.*, c.name as customer_name, i.name as product_name FROM transactions t 
            JOIN customers c ON t.customer_id = c.id 
            LEFT JOIN inventory i ON t.product_id = i.id ORDER BY t.date DESC`, (err, rows) => res.json(rows));
});

app.delete('/api/transactions/:id', guard, (req, res) => {
    db.get(`SELECT product_id, quantity FROM transactions WHERE id = ?`, [req.params.id], (err, row) => {
        if(row) {
            db.serialize(() => {
                db.run(`UPDATE inventory SET stock_qty = stock_qty + ? WHERE id = ?`, [row.quantity, row.product_id]);
                db.run(`DELETE FROM transactions WHERE id = ?`, [req.params.id]);
                res.json({ success: true });
            });
        } else res.status(404).json({ error: 'Record missing.' });
    });
});

// Customer Directory
app.get('/api/customers', guard, (req, res) => db.all(`SELECT * FROM customers`, (err, r) => res.json(r)));
app.post('/api/customers', guard, (req, res) => {
    const { name, phone, address, notes } = req.body;
    db.run(`INSERT INTO customers (name, phone, address, notes) VALUES (?,?,?,?)`, [name, phone, address, notes], () => res.json({ success: true }));
});
app.delete('/api/customers/:id', guard, (req, res) => db.run(`DELETE FROM customers WHERE id = ?`, [req.params.id], () => res.json({ success: true })));

// Client Running Ledger Compile via SQL UNION
app.get('/api/customers/:id/history', guard, (req, res) => {
    const sql = `
        SELECT date, 'Invoice' as type, description || ' (' || quantity || ' units)' as details, grand_total as debit, 0 as credit FROM transactions t LEFT JOIN inventory i ON t.product_id = i.id WHERE customer_id = ?
        UNION ALL 
        SELECT date, 'Payment' as type, 'Method: ' || method as details, 0 as debit, amount as credit FROM payments WHERE customer_id = ?
        ORDER BY date ASC`;
    db.all(sql, [req.params.id, req.params.id], (err, rows) => res.json(rows));
});

// Financial Expenses
app.get('/api/expenses', guard, (req, res) => db.all(`SELECT * FROM expenses ORDER BY date DESC`, (err, r) => res.json(r)));
app.post('/api/expenses', guard, (req, res) => {
    const { title, category, amount, date, notes } = req.body;
    db.run(`INSERT INTO expenses (title, category, amount, date, notes) VALUES (?,?,?,?,?)`, [title, category, amount, date, notes], () => res.json({ success: true }));
});

// Balance Payment Receipts
app.post('/api/payments', guard, (req, res) => {
    const { customer_id, amount, date, method } = req.body;
    db.run(`INSERT INTO payments (customer_id, amount, date, method) VALUES (?,?,?,?)`, [customer_id, amount, date, method], () => res.json({ success: true }));
});

app.listen(PORT, () => console.log(`System deployed on port ${PORT}`));
