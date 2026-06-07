const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'enterprise-ultra-secure-token-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 28800000 } // 8 Hour shift duration
}));

const DB_PATH = './enterprise_vault.db';
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error("Database initialization fault:", err.message);
    else console.log('Connected to secure relational SQLite database engine.');
});

// Relational Schema & Constraints Definition
db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON;");
    
    // Users & RBAC Configuration
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, role TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Customer Master Profiles
    db.run(`CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, address TEXT, notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Inventory Asset Tracking
    db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, sku TEXT UNIQUE, stock_qty INTEGER, min_stock INTEGER, cost_price REAL, selling_price REAL
    )`);
    
    // Inventory Chronological Ledger Logs
    db.run(`CREATE TABLE IF NOT EXISTS inventory_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, type TEXT, quantity INTEGER, reference TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(product_id) REFERENCES inventory(id) ON DELETE CASCADE
    )`);
    
    // Transactional Invoices
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_no TEXT UNIQUE, customer_id INTEGER, product_id INTEGER, date TEXT, due_date TEXT,
        quantity INTEGER, rate REAL, discount REAL, base_amount REAL, gst REAL, cess REAL, grand_total REAL, profit REAL, payment_status TEXT,
        FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY(product_id) REFERENCES inventory(id) ON DELETE SET NULL
    )`);
    
    // Payments Collected
    db.run(`CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, transaction_id INTEGER, amount REAL, date TEXT, method TEXT, notes TEXT,
        FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
    )`);
    
    // Operating Expenses Ledger
    db.run(`CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, category TEXT, amount REAL, date TEXT, notes TEXT
    )`);

    // System-wide Immutable Audit Logs
    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, action TEXT, details TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Default Initialization Seeds (Admin and Staff if empty)
    db.get("SELECT COUNT(*) as count FROM users", [], (err, row) => {
        if (row && row.count === 0) {
            db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, ['admin', bcrypt.hashSync('admin123', 10), 'Admin']);
            db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, ['staff', bcrypt.hashSync('staff123', 10), 'Staff']);
            db.run(`INSERT INTO audit_logs (username, action, details) VALUES ('SYSTEM', 'SEED', 'Default RBAC credentials populated.')`);
        }
    });
});

// Middleware: Session Check and RBAC Gatekeeper
const guard = (allowedRoles = ['Admin', 'Staff']) => {
    return (req, res, next) => {
        if (req.session && req.session.uid) {
            if (allowedRoles.includes(req.session.role)) return next();
            return res.status(403).json({ error: 'Privilege level access denied.' });
        }
        res.status(401).json({ error: 'Session unauthenticated or expired.' });
    };
};

// Helper function to commit audit parameters programmatically
function logActivity(username, action, details) {
    db.run(`INSERT INTO audit_logs (username, action, details) VALUES (?, ?, ?)`, [username, action, details]);
}

// --- API LAYER GATEWAY ---

// Authentication Router
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (user && bcrypt.compareSync(password, user.password)) {
            req.session.uid = user.id;
            req.session.username = user.username;
            req.session.role = user.role;
            logActivity(user.username, 'LOGIN', `Authenticated successfully via role: ${user.role}`);
            res.json({ success: true, username: user.username, role: user.role });
        } else {
            res.status(401).json({ success: false, message: 'Invalid server handshake credentials.' });
        }
    });
});
app.get('/api/auth/check', (req, res) => res.json({ authed: !!req.session.uid, username: req.session.username || null, role: req.session.role || null }));
app.post('/api/auth/logout', (req, res) => {
    if(req.session.username) logActivity(req.session.username, 'LOGOUT', 'User destroyed active context');
    req.session.destroy(); 
    res.json({ success: true }); 
});

// Audit Streaming Endpoints
app.get('/api/audit', guard(['Admin']), (req, res) => {
    db.all(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100`, (err, rows) => res.json(rows));
});

// Dashboard Deep Analytics Engine
app.get('/api/analytics/summary', guard(), (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const metrics = { todaySales: 0, todayProfit: 0, totalProfit: 0, pendingDues: 0, lowStockCount: 0, overdueAccounts: 0 };
    
    db.get(`SELECT COALESCE(SUM(grand_total),0) as ts, COALESCE(SUM(profit),0) as tp FROM transactions WHERE date = ?`, [today], (err, tToday) => {
        metrics.todaySales = tToday?.ts || 0;
        metrics.todayProfit = tToday?.tp || 0;
        
        db.get(`SELECT COALESCE(SUM(profit),0) as totalP FROM transactions`, (err, tAll) => {
            db.get(`SELECT COALESCE(SUM(amount),0) as te FROM expenses`, (err, exp) => {
                metrics.totalProfit = (tAll?.totalP || 0) - (exp?.te || 0);
                
                db.get(`SELECT (COALESCE(SUM(grand_total),0) - (SELECT COALESCE(SUM(amount),0) FROM payments)) as dues FROM transactions`, (err, dues) => {
                    metrics.pendingDues = dues?.dues || 0;
                    if(metrics.pendingDues < 0) metrics.pendingDues = 0;
                    
                    db.get(`SELECT COUNT(*) as lowCount FROM inventory WHERE stock_qty <= min_stock`, (err, inv) => {
                        metrics.lowStockCount = inv?.lowCount || 0;
                        
                        db.get(`SELECT COUNT(DISTINCT customer_id) as overdue FROM transactions WHERE date(due_date) < date(?) AND payment_status != 'Fully Paid'`, [today], (err, ovr) => {
                            metrics.overdueAccounts = ovr?.overdue || 0;
                            res.json(metrics);
                        });
                    });
                });
            });
        });
    });
});

app.get('/api/analytics/charts', guard(), (req, res) => {
    db.all(`SELECT substr(date,1,7) as month, SUM(grand_total) as revenue, SUM(profit) as net_profit FROM transactions GROUP BY month ORDER BY month DESC LIMIT 6`, (err, txRows) => {
        db.all(`SELECT substr(date,1,7) as month, SUM(amount) as value FROM expenses GROUP BY month ORDER BY month DESC LIMIT 6`, (err, expRows) => {
            db.all(`SELECT i.name, SUM(t.quantity) as volume FROM transactions t JOIN inventory i ON t.product_id = i.id GROUP BY t.product_id ORDER BY volume DESC LIMIT 5`, (err, topProducts) => {
                res.json({ txHistory: txRows.reverse(), expHistory: expRows.reverse(), leadingProducts: topProducts });
            });
        });
    });
});

// Master Inventory Controller API
app.get('/api/inventory', guard(), (req, res) => {
    db.all(`SELECT *, (stock_qty <= min_stock) as alert FROM inventory ORDER BY name ASC`, (err, rows) => res.json(rows));
});

app.post('/api/inventory', guard(['Admin', 'Staff']), (req, res) => {
    const { name, sku, stock_qty, min_stock, cost_price, selling_price } = req.body;
    db.run(`INSERT INTO inventory (name, sku, stock_qty, min_stock, cost_price, selling_price) VALUES (?,?,?,?,?,?)`,
        [name, sku, stock_qty, min_stock, cost_price, selling_price], function(err) {
            if(err) return res.status(400).json({ error: 'SKU must be completely unique.' });
            logActivity(req.session.username, 'STOCK_ADD', `Registered new master asset tracking line item: ${name} (SKU: ${sku})`);
            db.run(`INSERT INTO inventory_logs (product_id, type, quantity, reference) VALUES (?, 'IN', ?, 'Initial Base Balancing Setup')`, [this.lastID, stock_qty]);
            res.json({ id: this.lastID });
        });
});

app.post('/api/inventory/adjust', guard(['Admin']), (req, res) => {
    const { product_id, type, quantity, reference } = req.body; // type: 'IN' or 'OUT'
    const modifier = type === 'IN' ? quantity : -quantity;
    
    db.serialize(() => {
        db.run(`UPDATE inventory SET stock_qty = stock_qty + ? WHERE id = ?`, [modifier, product_id]);
        db.run(`INSERT INTO inventory_logs (product_id, type, quantity, reference) VALUES (?, ?, ?, ?)`, [product_id, type, quantity, reference]);
        logActivity(req.session.username, 'STOCK_ADJUST', `Manual balancing intervention applied to ID: ${product_id} (${type} x${quantity})`);
        res.json({ success: true });
    });
});

app.get('/api/inventory/logs', guard(), (req, res) => {
    db.all(`SELECT l.*, i.name as product_name, i.sku FROM inventory_logs l JOIN inventory i ON l.product_id = i.id ORDER BY l.timestamp DESC LIMIT 100`, (err, rows) => res.json(rows));
});

// Commercial Trade Invoicing Processing Engine
app.post('/api/transactions', guard(['Admin', 'Staff']), (req, res) => {
    const { customer_id, product_id, date, due_date, quantity, rate, discount, gst, cess, grand_total, payment_status } = req.body;
    const invNo = 'INV-' + Date.now().toString().slice(-8).toUpperCase();
    
    db.get(`SELECT cost_price, stock_qty, name FROM inventory WHERE id = ?`, [product_id], (err, prod) => {
        if (!prod || prod.stock_qty < quantity) return res.status(400).json({ error: 'Transaction aborted due to insufficient active asset warehouse stock.' });
        
        const base_amount = (quantity * rate) - discount;
        const gross_cost = prod.cost_price * quantity;
        const profit = grand_total - gross_cost - gst - cess;

        db.serialize(() => {
            db.run(`INSERT INTO transactions (invoice_no, customer_id, product_id, date, due_date, quantity, rate, discount, base_amount, gst, cess, grand_total, profit, payment_status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                    [invNo, customer_id, product_id, date, due_date, quantity, rate, discount, base_amount, gst, cess, grand_total, profit, payment_status], function() {
                        const txId = this.lastID;
                        db.run(`UPDATE inventory SET stock_qty = stock_qty - ? WHERE id = ?`, [quantity, product_id]);
                        db.run(`INSERT INTO inventory_logs (product_id, type, quantity, reference) VALUES (?, 'OUT', ?, ?)`, [product_id, quantity, `Auto deduction via transaction: ${invNo}`]);
                        logActivity(req.session.username, 'INVOICE_GEN', `Finalized trading execution document ${invNo} total value ₹${grand_total}`);
                        
                        if(payment_status === 'Fully Paid') {
                            db.run(`INSERT INTO payments (customer_id, transaction_id, amount, date, method, notes) VALUES (?, ?, ?, ?, 'Prepaid Checkout Counter', 'Autocreated full settlement')`, 
                                [customer_id, txId, grand_total, date]);
                        }
                        res.json({ success: true, invoice_no: invNo });
                    });
        });
    });
});

app.get('/api/transactions', guard(), (req, res) => {
    db.all(`SELECT t.*, c.name as customer_name, c.phone as customer_phone, i.name as product_name FROM transactions t 
            JOIN customers c ON t.customer_id = c.id 
            LEFT JOIN inventory i ON t.product_id = i.id ORDER BY t.date DESC`, (err, rows) => res.json(rows));
});

app.patch('/api/transactions/:id/status', guard(['Admin', 'Staff']), (req, res) => {
    const { payment_status } = req.body;
    db.run(`UPDATE transactions SET payment_status = ? WHERE id = ?`, [payment_status, req.params.id], function() {
        logActivity(req.session.username, 'INVOICE_PATCH', `Status parameters updated to "${payment_status}" for transactional document index: ${req.params.id}`);
        res.json({ success: true });
    });
});

app.delete('/api/transactions/:id', guard(['Admin']), (req, res) => {
    db.get(`SELECT invoice_no, product_id, quantity FROM transactions WHERE id = ?`, [req.params.id], (err, row) => {
        if (row) {
            db.serialize(() => {
                db.run(`UPDATE inventory SET stock_qty = stock_qty + ? WHERE id = ?`, [row.quantity, row.product_id]);
                db.run(`INSERT INTO inventory_logs (product_id, type, quantity, reference) VALUES (?, 'IN', ?, ?)`, [row.product_id, row.quantity, `Reversal adjustment tracking: ${row.invoice_no} Voided`]);
                db.run(`DELETE FROM transactions WHERE id = ?`, [req.params.id]);
                logActivity(req.session.username, 'INVOICE_VOID', `Executed administrative deletion protocol over trade ledger documentation: ${row.invoice_no}`);
                res.json({ success: true });
            });
        } else res.status(404).json({ error: 'Record missing matching profile reference.' });
    });
});

// CRM Directory Layer Endpoints
app.get('/api/customers', guard(), (req, res) => db.all(`SELECT * FROM customers`, (err, r) => res.json(r)));
app.post('/api/customers', guard(['Admin', 'Staff']), (req, res) => {
    const { name, phone, address, notes } = req.body;
    db.run(`INSERT INTO customers (name, phone, address, notes) VALUES (?,?,?,?)`, [name, phone, address, notes], () => {
        logActivity(req.session.username, 'CUSTOMER_CRM_NEW', `Profile registered for customer: ${name}`);
        res.json({ success: true });
    });
});

app.get('/api/customers/:id/history', guard(), (req, res) => {
    const sql = `
        SELECT date, due_date, invoice_no as ref_id, 'Invoice' as type, description || ' (' || quantity || ' items)' as details, grand_total as debit, 0 as credit FROM transactions t LEFT JOIN inventory i ON t.product_id = i.id WHERE customer_id = ?
        UNION ALL 
        SELECT date, '-' as due_date, 'PAY-'||id as ref_id, 'Payment' as type, 'Processing Channel: ' || method || ' / ' || notes as details, 0 as debit, amount as credit FROM payments WHERE customer_id = ?
        ORDER BY date ASC`;
    db.all(sql, [req.params.id, req.params.id], (err, rows) => res.json(rows));
});

// Operations Outflow Expenses Tracker
app.get('/api/expenses', guard(), (req, res) => db.all(`SELECT * FROM expenses ORDER BY date DESC`, (err, r) => res.json(r)));
app.post('/api/expenses', guard(['Admin', 'Staff']), (req, res) => {
    const { title, category, amount, date, notes } = req.body;
    db.run(`INSERT INTO expenses (title, category, amount, date, notes) VALUES (?,?,?,?,?)`, [title, category, amount, date, notes], () => {
        logActivity(req.session.username, 'EXPENSE_OUT', `Authorized operational expense card release: ${title} [₹${amount}]`);
        res.json({ success: true });
    });
});

// Client Credit Collection Accounting Ledger
app.post('/api/payments', guard(['Admin', 'Staff']), (req, res) => {
    const { customer_id, amount, date, method, notes } = req.body;
    db.run(`INSERT INTO payments (customer_id, amount, date, method, notes) VALUES (?,?,?,?,?)`, [customer_id, amount, date, method, notes], function() {
        logActivity(req.session.username, 'CREDIT_COLLECT', `Posted collection ledger credit for account ID: ${customer_id} of value ₹${amount}`);
        res.json({ success: true });
    });
});

// Enterprise Data Vault Safety System (Backup Infrastructure)
app.get('/api/vault/export', guard(['Admin']), (req, res) => {
    try {
        const fileContents = fs.readFileSync(DB_PATH);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename=ledger_vault_safe_${Date.now()}.db`);
        logActivity(req.session.username, 'BACKUP_EXPORT', 'Executed direct local secure binary backup pipeline compilation.');
        res.send(fileContents);
    } catch(e) {
        res.status(500).json({ error: 'System error executing storage pipeline compile.' });
    }
});

app.post('/api/vault/import', guard(['Admin']), (req, res) => {
    const { payloadBase64 } = req.body;
    if(!payloadBase64) return res.status(400).json({ error: 'Data payload array structure corrupt.' });
    
    try {
        const buffer = Buffer.from(payloadBase64, 'base64');
        db.close((err) => {
            fs.writeFileSync(DB_PATH, buffer);
            logActivity('RECOVERY_DAEMON', 'BACKUP_IMPORT', 'Database raw file signature successfully restored over filesystem.');
            res.json({ success: true });
            process.exit(0); // Safely let host cluster reinitialize the engine instance
        });
    } catch (e) {
        res.status(500).json({ error: 'Malformed system database schema conversion exception error.' });
    }
});

app.listen(PORT, () => console.log(`System running operational workflows on port ${PORT}`));
