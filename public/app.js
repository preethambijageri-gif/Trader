let charts = {};
let activeCustomerId = null;
let activeCustomerProfile = {};
let globalInventoryRegistry = [];
let localUserSessionContext = { username: null, role: null };

document.addEventListener('DOMContentLoaded', () => {
    // Gracefully handle initial auth checks
    checkAuthenticationState();
    
    // Set default dates for inputs
    const today = new Date().toISOString().split('T')[0];
    ['tx-date', 'tx-due-date', 'e-date'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = today;
    });

    // Add Enter key listener for seamless login execution
    const loginFields = ['username', 'password'];
    loginFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') login();
            });
        }
    });
});

// Front-End Interactive Toast Framework Node
function launchToast(msg, type = 'info') {
    const box = document.getElementById('toast-box');
    if (!box) return;
    const toast = document.createElement('div');
    toast.className = `glass px-5 py-3.5 rounded-xl text-xs font-bold text-white shadow-2xl flex items-center gap-3 border transition-all duration-300 transform translate-x-20 opacity-0`;
    
    if (type === 'success') toast.style.borderColor = '#10b981';
    else if (type === 'error') toast.style.borderColor = '#f43f5e';
    else toast.style.borderColor = '#3b82f6';
    
    toast.innerHTML = `<i class="fa-solid ${type==='success'?'fa-circle-check':type==='error'?'fa-triangle-exclamation':'fa-circle-info'}"></i> <span>${msg}</span>`;
    box.appendChild(toast);
    
    setTimeout(() => { toast.classList.remove('translate-x-20', 'opacity-0'); }, 10);
    setTimeout(() => {
        toast.classList.add('translate-x-20', 'opacity-0');
        setTimeout(() => toast.remove(), 400);
    }, 4500);
}

// Security Session Interceptor Matrix with Defensive Error Catching
async function checkAuthenticationState() {
    try {
        const response = await fetch('/api/auth/check');
        if (!response.ok) throw new Error("Server handshake rejected");
        
        const data = await response.json();
        if (data.authed) {
            localUserSessionContext.username = data.username;
            localUserSessionContext.role = data.role;
            
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('app-screen').style.display = 'flex';
            
            document.getElementById('user-display-name').innerText = data.username;
            document.getElementById('user-display-role').innerText = `Role Context: ${data.role}`;
            document.getElementById('user-badge').innerText = data.username.slice(0,2);
            
            // RBAC UI Element Management Modifiers
            if (data.role !== 'Admin') {
                const auditBtn = document.getElementById('nav-audit-btn');
                const backupBtn = document.getElementById('admin-backup-btn');
                const restoreBtn = document.getElementById('admin-restore-lbl');
                if (auditBtn) auditBtn.style.display = 'none';
                if (backupBtn) backupBtn.style.display = 'none';
                if (restoreBtn) restoreBtn.style.display = 'none';
            }
            nav('dashboard');
        }
    } catch (e) {
        console.error("Initialization Connection Fault:", e);
        launchToast("Offline Engine Mode: Ensure backend service port 3000 is running.", "error");
    }
}

async function login() {
    const userEl = document.getElementById('username');
    const passEl = document.getElementById('password');
    if (!userEl || !passEl) return;

    const username = userEl.value.trim();
    const password = passEl.value.trim();

    if (!username || !password) {
        launchToast("Access Denied: Credentials fields cannot be empty.", "error");
        return;
    }

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username, password })
        });
        
        if (res.ok) {
            launchToast("Cryptographic Session Credentials Validated", "success");
            await checkAuthenticationState();
        } else {
            const errData = await res.json().catch(() => ({}));
            launchToast(errData.message || "Authentication Error: Credentials Signature Invalid", "error");
        }
    } catch (e) { 
        launchToast("Fatal connection failure. Is server.js running?", "error"); 
    }
}

async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch(e) {}
    location.reload();
}

// Workspace Structural Layout View Controller Switcher
function nav(sectionId) {
    document.querySelectorAll('.stage').forEach(el => el.classList.add('hidden'));
    const targetStage = document.getElementById(`view-${sectionId}`);
    if (targetStage) targetStage.classList.remove('hidden');
    
    if (sectionId === 'dashboard') loadAnalyticalDashboard();
    if (sectionId === 'customers') loadCustomerDirectory();
    if (sectionId === 'inventory') { loadStockInventoryTable(); updateInventoryDropdownSelectors(); }
    if (sectionId === 'transactions') { loadTransactionalPrerequisites(); loadInvoicesTable(); }
    if (sectionId === 'expenses') loadExpenseTable();
    if (sectionId === 'audit') loadAuditLogsTable();
}

// Theme Handlers
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    launchToast(`Switched workspace theme context to ${next}`);
    if(!document.getElementById('view-dashboard').classList.contains('hidden')) renderAnalyticsCharts();
}

// Dynamic Omni Global Lookup Filtering Matrix Engine
function triggerGlobalSearch() {
    const query = document.getElementById('global-search-input').value.toLowerCase();
    const openStage = document.querySelector('.stage:not(.hidden)');
    if(!openStage) return;
    
    const targetTable = openStage.querySelector('table');
    if(!targetTable) return;
    
    const rows = targetTable.getElementsByTagName('tbody')[0].rows;
    for (let row of rows) {
        row.style.display = row.innerText.toLowerCase().includes(query) ? '' : 'none';
    }
}

// Dashboard Summary Computations Stream
async function loadAnalyticalDashboard() {
    try {
        const stats = await (await fetch('/api/analytics/summary')).json();
        document.getElementById('db-today-sales').innerText = `₹${stats.todaySales.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
        document.getElementById('db-today-profit').innerText = `₹${stats.todayProfit.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
        document.getElementById('db-total-profit').innerText = `₹${stats.totalProfit.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
        document.getElementById('db-pending-dues').innerText = `₹${stats.pendingDues.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
        
        document.getElementById('db-alert-stock').innerHTML = `<i class="fa-solid fa-box mr-1"></i> ${stats.lowStockCount} Shortage Warnings`;
        document.getElementById('db-alert-overdue').innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> ${stats.overdueAccounts} Overdue Profiles`;
        
        renderAnalyticsCharts();
    } catch (e) { console.error("Dashboard compute metrics error", e); }
}

async function renderAnalyticsCharts() {
    try {
        const data = await (await fetch('/api/analytics/charts')).json();
        const textThemeColor = document.documentElement.getAttribute('data-theme') === 'dark' ? '#f8fafc' : '#0f172a';

        if (charts.sales) charts.sales.destroy();
        if (charts.products) charts.products.destroy();

        charts.sales = new Chart(document.getElementById('canvas-sales').getContext('2d'), {
            type: 'line',
            data: {
                labels: data.txHistory.map(x => x.month),
                dataSets: [
                    { label: 'Gross Revenue Pipeline', data: data.txHistory.map(x => x.revenue), borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.05)', fill: true, tension: 0.35 },
                    { label: 'Net Operations Margins', data: data.txHistory.map(x => x.net_profit), borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.05)', fill: true, tension: 0.35 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: textThemeColor, font: { weight: 'bold' } } } } }
        });

        charts.products = new Chart(document.getElementById('canvas-products').getContext('2d'), {
            type: 'bar',
            data: {
                labels: data.leadingProducts.map(x => x.name),
                dataSets: [{ label: 'Operational Volume Units Sold', data: data.leadingProducts.map(x => x.volume), backgroundColor: '#a855f7', borderRadius: 6 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: textThemeColor, font: { weight: 'bold' } } } } }
        });
    } catch(e) {}
}

// CRM Layer Management Engine
async function loadCustomerDirectory() {
    const data = await (await fetch('/api/customers')).json();
    const tbody = document.querySelector('#table-cust tbody');
    tbody.innerHTML = data.map(c => `
        <tr class="hover:bg-white/5 transition border-b border-white/5">
            <td class="p-4 font-mono text-xs text-purple-400 font-bold">#CRM-ID-${c.id}</td>
            <td class="p-4 font-black">${c.name}</td>
            <td class="p-4">${c.phone}</td>
            <td class="p-4 opacity-60 text-xs font-medium">${c.address}</td>
            <td class="p-4 no-print text-right">
                <button onclick="launchIsolatedClientLedgerStack(${c.id}, '${c.name}', '${c.phone}')" class="px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-500 hover:text-white transition">Statement / Post Payment</button>
            </td>
        </tr>`).join('');
}

async function addCustomer() {
    const payload = {
        name: document.getElementById('c-name').value, phone: document.getElementById('c-phone').value,
        address: document.getElementById('c-address').value, notes: document.getElementById('c-notes').value
    };
    if (!payload.name || !payload.phone) return launchToast("Aborted: Missing critical structural customer metadata.", "error");
    await fetch('/api/customers', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    ['c-name', 'c-phone', 'c-address', 'c-notes'].forEach(id => document.getElementById(id).value = '');
    launchToast("Account setup added successfully to CRM engine data nodes.", "success");
    loadCustomerDirectory();
}

// Warehouse Inventory Asset Class Core Operations
async function loadStockInventoryTable() {
    const data = await (await fetch('/api/inventory')).json();
    globalInventoryRegistry = data;
    document.querySelector('#table-inv tbody').innerHTML = data.map(i => `
        <tr class="${i.alert ? 'bg-rose-500/5 animate-pulse' : ''} hover:bg-white/5 transition border-b border-white/5">
            <td class="p-4 font-black">${i.name}</td>
            <td class="p-4 font-mono text-xs text-emerald-400 font-bold">${i.sku}</td>
            <td class="p-4 font-bold text-slate-200">${i.stock_qty} units</td>
            <td class="p-4 opacity-70">₹${i.cost_price.toFixed(2)}</td>
            <td class="p-4 font-semibold text-cyan-400">₹${i.selling_price.toFixed(2)}</td>
            <td class="p-4">${i.alert ? '<span class="text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded font-black">SHORTAGE DETECTED</span>' : '<span class="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-black">NOMINAL STATUS</span>'}</td>
        </tr>`).join('');
}

async function updateInventoryDropdownSelectors() {
    const data = await (await fetch('/api/inventory')).json();
    const sel = document.getElementById('adj-product-sel');
    if(sel) {
        sel.innerHTML = '<option value="">Target Inventory Pipeline Item...</option>';
        data.forEach(i => sel.innerHTML += `<option value="${i.id}">${i.name} [SKU: ${i.sku}] (Current: ${i.stock_qty})</option>`);
    }
}

async function addInventory() {
    const payload = {
        name: document.getElementById('i-name').value, sku: document.getElementById('i-sku').value,
        stock_qty: parseInt(document.getElementById('i-qty').value) || 0, min_stock: parseInt(document.getElementById('i-min').value) || 0,
        cost_price: parseFloat(document.getElementById('i-cost').value) || 0, selling_price: parseFloat(document.getElementById('i-sell').value) || 0
    };
    const res = await fetch('/api/inventory', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    if(res.ok) {
        launchToast("Asset item class catalog verification valid and saved.", "success");
        ['i-name', 'i-sku', 'i-qty', 'i-min', 'i-cost', 'i-sell'].forEach(id => document.getElementById(id).value = '');
        loadStockInventoryTable();
        updateInventoryDropdownSelectors();
    } else {
        launchToast("Error logging class tracking index node parameters.", "error");
    }
}

async function submitInventoryAdjustment() {
    const payload = {
        product_id: document.getElementById('adj-product-sel').value, type: document.getElementById('adj-type').value,
        quantity: parseInt(document.getElementById('adj-qty').value) || 0, reference: document.getElementById('adj-ref').value
    };
    if(!payload.product_id || !payload.quantity) return launchToast("Missing alignment structural inputs", "error");
    await fetch('/api/inventory/adjust', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    launchToast("Warehouse adjustment executed and saved successfully", "success");
    document.getElementById('adj-qty').value = '';
    document.getElementById('adj-ref').value = '';
    loadStockInventoryTable();
    updateInventoryDropdownSelectors();
}

// Commercial Invoicing & Trading Calculations
async function loadTransactionalPrerequisites() {
    const custs = await (await fetch('/api/customers')).json();
    await loadStockInventoryTable(); 

    const cSel = document.getElementById('tx-cust-sel');
    cSel.innerHTML = '<option value="">Target Client Master Account Selection...</option>';
    custs.forEach(c => cSel.innerHTML += `<option value="${c.id}">${c.name}</option>`);

    const iSel = document.getElementById('tx-inv-sel');
    iSel.innerHTML = '<option value="">Warehouse Stock Asset Selection...</option>';
    globalInventoryRegistry.forEach(i => iSel.innerHTML += `<option value="${i.id}">${i.name} (Qty Available: ${i.stock_qty})</option>`);
}

function autoFillPrice() {
    const pid = document.getElementById('tx-inv-sel').value;
    const match = globalInventoryRegistry.find(x => x.id == pid);
    if (match) {
        document.getElementById('tx-rate-input').value = match.selling_price;
        document.getElementById('tx-qty-input').value = 1;
        runTaxEngine();
    }
}

function runTaxEngine() {
    const q = parseFloat(document.getElementById('tx-qty-input').value) || 0;
    const r = parseFloat(document.getElementById('tx-rate-input').value) || 0;
    const d = parseFloat(document.getElementById('tx-disc-input').value) || 0;
    const g = parseFloat(document.getElementById('tx-gst-input').value) || 0;
    const c = parseFloat(document.getElementById('tx-cess-input').value) || 0;

    const base = (q * r) - d;
    const aggregate = base + g + c;
    document.getElementById('tx-aggregate-lbl').innerText = `₹${aggregate.toFixed(2)}`;
    return aggregate;
}

async function commitTransaction() {
    const payload = {
        customer_id: document.getElementById('tx-cust-sel').value, product_id: document.getElementById('tx-inv-sel').value,
        date: document.getElementById('tx-date').value, due_date: document.getElementById('tx-due-date').value,
        quantity: parseInt(document.getElementById('tx-qty-input').value) || 0, rate: parseFloat(document.getElementById('tx-rate-input').value) || 0,
        discount: parseFloat(document.getElementById('tx-disc-input').value) || 0, gst: parseFloat(document.getElementById('tx-gst-input').value) || 0,
        cess: parseFloat(document.getElementById('tx-cess-input').value) || 0, payment_status: document.getElementById('tx-pay-status').value,
        grand_total: runTaxEngine()
    };
    
    if(!payload.customer_id || !payload.product_id || !payload.quantity) return launchToast("Missing fields criteria form details.", "error");

    const response = await fetch('/api/transactions', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    if(response.ok) {
        launchToast("Outbound commercial trade document logged and finalized.", "success");
        ['tx-qty-input', 'tx-rate-input', 'tx-disc-input', 'tx-gst-input', 'tx-cess-input'].forEach(id => document.getElementById(id).value = '');
        loadInvoicesTable();
    } else {
        const err = await response.json();
        launchToast(err.error || "Execution structural framework fault.", "error");
    }
}

async function loadInvoicesTable() {
    const data = await (await fetch('/api/transactions')).json();
    const today = new Date();
    
    document.querySelector('#table-tx tbody').innerHTML = data.map(t => {
        const dueDateObj = new Date(t.due_date);
        const timeDiff = dueDateObj - today;
        const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        
        let maturityBadge = '';
        if(t.payment_status === 'Fully Paid') {
            maturityBadge = `<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded text-[10px] font-bold">SETTLED</span>`;
        } else if (daysRemaining < 0) {
            maturityBadge = `<span class="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2.5 py-0.5 rounded text-[10px] font-black">OVERDUE (${Math.abs(daysRemaining)}d ago)</span>`;
        } else {
            maturityBadge = `<span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded text-[10px] font-bold">DUE (${daysRemaining}d left)</span>`;
        }

        return `
        <tr class="hover:bg-white/5 transition border-b border-white/5">
            <td class="p-4 font-mono text-xs"><div class="font-black text-slate-100">${t.invoice_no}</div><div class="opacity-50 text-[10px]">Issued: ${t.date}</div></td>
            <td class="p-4 font-bold text-slate-300">${t.customer_name}</td>
            <td class="p-4 text-xs">${t.product_name || 'Asset Deleted'} <span class="opacity-50">x${t.quantity}</span></td>
            <td class="p-4 font-mono font-bold text-cyan-400">₹${t.grand_total.toFixed(2)}</td>
            <td class="p-4">${maturityBadge}</td>
            <td class="p-4 no-print text-right">
                ${localUserSessionContext.role === 'Admin' ? `<button onclick="voidInvoice(${t.id})" class="px-2 py-1 text-rose-500 hover:bg-rose-500/10 rounded-lg text-xs font-bold transition">VOID</button>` : '-'}
            </td>
        </tr>`;
    }).join('');
}

async function voidInvoice(id) {
    if(confirm("Confirm severe administrative action: Void transaction invoice? Base stock reserves will be re-credited into physical inventory storage mapping points.")) {
        await fetch(`/api/transactions/${id}`, { method: 'DELETE'
