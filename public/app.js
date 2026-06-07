let charts = {};
let activeCustomerId = null;
let globalInventoryRegistry = [];

document.addEventListener('DOMContentLoaded', () => {
    checkAuthenticationState();
    const today = new Date().toISOString().split('T')[0];
    ['tx-date', 'e-date'].forEach(id => {
        const input = document.getElementById(id);
        if(input) input.value = today;
    });
});

// Toast Banners
function launchToast(msg, type = 'info') {
    const box = document.getElementById('toast-box');
    const toast = document.createElement('div');
    toast.className = `glass px-5 py-3 rounded-xl text-sm font-semibold text-white shadow-xl flex items-center gap-3 border transition-all duration-300 transform translate-x-20 opacity-0`;
    
    if (type === 'success') toast.style.borderColor = '#10b981';
    else if (type === 'error') toast.style.borderColor = '#f43f5e';
    else toast.style.borderColor = '#3b82f6';
    
    toast.innerHTML = `<i class="fa-solid ${type==='success'?'fa-circle-check':type==='error'?'fa-triangle-exclamation':'fa-circle-info'}"></i> <span>${msg}</span>`;
    box.appendChild(toast);
    
    setTimeout(() => { toast.classList.remove('translate-x-20', 'opacity-0'); }, 10);
    setTimeout(() => {
        toast.classList.add('translate-x-20', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Authentication Handlers
async function checkAuthenticationState() {
    const data = await (await fetch('/api/auth/check')).json();
    if(data.authed) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'flex';
        nav('dashboard');
    }
}

async function login() {
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: document.getElementById('username').value, password: document.getElementById('password').value})
        });
        if(res.ok) {
            launchToast("Authentication Handshake Complete", "success");
            checkAuthenticationState();
        } else {
            launchToast("Invalid Credentials", "error");
        }
    } catch (e) { launchToast("Network connection failed", "error"); }
}

async function logout() {
    await fetch('/api/auth/logout', {method: 'POST'});
    location.reload();
}

// Theme Handlers
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    launchToast(`Switched workspace theme to ${next}`);
    renderAnalyticsCharts();
}

// View Controller Routing
function nav(sectionId) {
    document.querySelectorAll('.stage').forEach(el => el.classList.add('hidden'));
    document.getElementById(`view-${sectionId}`).classList.remove('hidden');
    
    if (sectionId === 'dashboard') loadAnalyticalDashboard();
    if (sectionId === 'customers') loadCustomerDirectory();
    if (sectionId === 'inventory') loadStockInventoryTable();
    if (sectionId === 'transactions') { loadTransactionalPrerequisites(); loadInvoicesTable(); }
    if (sectionId === 'expenses') loadExpenseTable();
}

// Live Search Row Filtering
function filterTable(tableId, inputId) {
    const filter = document.getElementById(inputId).value.toLowerCase();
    const rows = document.getElementById(tableId).getElementsByTagName('tbody')[0].rows;
    for (let row of rows) {
        row.style.display = row.innerText.toLowerCase().includes(filter) ? '' : 'none';
    }
}

// Analytics Metrics
async function loadAnalyticalDashboard() {
    const stats = await (await fetch('/api/analytics/summary')).json();
    document.getElementById('m-sales').innerText = `₹${stats.sales.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    document.getElementById('m-profit').innerText = `₹${stats.profit.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    document.getElementById('m-pending').innerText = `₹${stats.pending.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    document.getElementById('m-customers').innerText = stats.customers;
    renderAnalyticsCharts();
}

async function renderAnalyticsCharts() {
    const data = await (await fetch('/api/analytics/charts')).json();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textThemeColor = isDark ? '#f8fafc' : '#1e293b';

    if (charts.sales) charts.sales.destroy();
    if (charts.dues) charts.dues.destroy();

    charts.sales = new Chart(document.getElementById('chart-sales').getContext('2d'), {
        type: 'line',
        data: {
            labels: data.salesGraph.map(x => x.month),
            datasets: [{
                label: 'Gross Operations Revenue',
                data: data.salesGraph.map(x => x.revenue),
                borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.1)', fill: true, tension: 0.4
            }]
        },
        options: { plugins: { legend: { labels: { color: textThemeColor } } } }
    });

    charts.dues = new Chart(document.getElementById('chart-dues').getContext('2d'), {
        type: 'bar',
        data: {
            labels: data.dueGraph.map(x => x.name),
            datasets: [{
                label: 'Outstanding Balance Burdens',
                data: data.dueGraph.map(x => x.due),
                backgroundColor: '#f43f5e', borderRadius: 8
            }]
        },
        options: { plugins: { legend: { labels: { color: textThemeColor } } } }
    });
}

// Customers Layer
async function loadCustomerDirectory() {
    const data = await (await fetch('/api/customers')).json();
    const tbody = document.querySelector('#table-cust tbody');
    tbody.innerHTML = data.map(c => `
        <tr>
            <td class="p-4 font-mono text-xs text-purple-400">#CUST-${c.id}</td>
            <td class="p-4 font-bold">${c.name}</td>
            <td class="p-4">${c.phone}</td>
            <td class="p-4 opacity-70">${c.address}</td>
            <td class="p-4 no-print flex gap-2">
                <button onclick="launchCustomerLedgerPanel(${c.id}, '${c.name}', '${c.phone}')" class="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-semibold hover:bg-blue-500 hover:text-white transition">Statement / Profile</button>
                <button onclick="deleteCustomer(${c.id})" class="px-2 py-1 bg-rose-500/10 text-rose-400 rounded-lg text-xs hover:bg-rose-500 hover:text-white transition"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`).join('');
}

async function addCustomer() {
    const payload = {
        name: document.getElementById('c-name').value, phone: document.getElementById('c-phone').value,
        address: document.getElementById('c-address').value, notes: document.getElementById('c-notes').value
    };
    if(!payload.name || !payload.phone) return launchToast("Missing core data elements.", "error");
    await fetch('/api/customers', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    ['c-name', 'c-phone', 'c-address', 'c-notes'].forEach(id => document.getElementById(id).value = '');
    launchToast("Customer profile created successfully", "success");
    loadCustomerDirectory();
}

async function deleteCustomer(id) {
    if(confirm("Permanently wipe this ledger profile? This removes all associated invoices.")) {
        await fetch(`/api/customers/${id}`, { method: 'DELETE' });
        loadCustomerDirectory();
    }
}

// Inventory Layer
async function loadStockInventoryTable() {
    const data = await (await fetch('/api/inventory')).json();
    globalInventoryRegistry = data; 
    const tbody = document.querySelector('#table-inv tbody');
    tbody.innerHTML = data.map(i => `
        <tr class="${i.alert ? 'bg-rose-500/5' : ''}">
            <td class="p-4 font-bold">${i.name}</td>
            <td class="p-4 font-mono text-xs opacity-70">${i.sku}</td>
            <td class="p-4 font-semibold">${i.stock_qty} units</td>
            <td class="p-4">₹${i.cost_price.toFixed(2)}</td>
            <td class="p-4">₹${i.selling_price.toFixed(2)}</td>
            <td class="p-4">${i.alert ? '<span class="text-xs bg-rose-500/20 text-rose-400 px-2.5 py-1 rounded-full font-bold">STOCK SHORTAGE</span>' : '<span class="text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full font-bold">NOMINAL STOCK</span>'}</td>
        </tr>`).join('');
}

async function addInventory() {
    const payload = {
        name: document.getElementById('i-name').value, sku: document.getElementById('i-sku').value,
        stock_qty: parseInt(document.getElementById('i-qty').value), min_stock: parseInt(document.getElementById('i-min').value),
        cost_price: parseFloat(document.getElementById('i-cost').value), selling_price: parseFloat(document.getElementById('i-sell').value)
    };
    await fetch('/api/inventory', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    launchToast("Stock catalog verified and saved", "success");
    ['i-name', 'i-sku', 'i-qty', 'i-min', 'i-cost', 'i-sell'].forEach(id => document.getElementById(id).value = '');
    loadStockInventoryTable();
}

// Invoices Layer
async function loadTransactionalPrerequisites() {
    const custs = await (await fetch('/api/customers')).json();
    await loadStockInventoryTable(); 

    const cSel = document.getElementById('tx-cust-sel');
    cSel.innerHTML = '<option value="">Target Account Selection...</option>';
    custs.forEach(c => cSel.innerHTML += `<option value="${c.id}">${c.name}</option>`);

    const iSel = document.getElementById('tx-inv-sel');
    iSel.innerHTML = '<option value="">Product Selection...</option>';
    globalInventoryRegistry.forEach(i => iSel.innerHTML += `<option value="${i.id}">${i.name} (In Stock: ${i.stock_qty})</option>`);
}

function autoFillPrice() {
    const pid = document.getElementById('tx-inv-sel').value;
    const match = globalInventoryRegistry.find(x => x.id == pid);
    if(match) {
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
        date: document.getElementById('tx-date').value, quantity: parseInt(document.getElementById('tx-qty-input').value),
        rate: parseFloat(document.getElementById('tx-rate-input').value), discount: parseFloat(document.getElementById('tx-disc-input').value) || 0,
        gst: parseFloat(document.getElementById('tx-gst-input').value) || 0, cess: parseFloat(document.getElementById('tx-cess-input').value) || 0,
        grand_total: runTaxEngine()
    };
    
    if(!payload.customer_id || !payload.product_id || !payload.quantity) return launchToast("Incomplete criteria form inputs", "error");

    const response = await fetch('/api/transactions', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    if(response.ok) {
        launchToast("Invoice posted and catalog balanced", "success");
        ['tx-qty-input', 'tx-rate-input', 'tx-disc-input', 'tx-gst-input', 'tx-cess-input'].forEach(id => document.getElementById(id).value = '');
        loadInvoicesTable();
    } else {
        const errorMsg = await response.json();
        launchToast(errorMsg.error || "Execution fault", "error");
    }
}

async function loadInvoicesTable() {
    const data = await (await fetch('/api/transactions')).json();
    document.querySelector('#table-tx tbody').innerHTML = data.map(t => `
        <tr>
            <td class="p-4 font-mono text-xs">${t.date}</td>
            <td class="p-4 font-bold">${t.customer_name}</td>
            <td class="p-4">${t.product_name || 'Legacy Deletion Item'} <span class="text-xs opacity-60">x ${t.quantity}</span></td>
            <td class="p-4 font-semibold text-cyan-400">₹${t.grand_total.toFixed(2)}</td>
            <td class="p-4 text-emerald-400 font-mono">+₹${t.profit.toFixed(2)}</td>
            <td class="p-4 no-print"><button onclick="voidInvoice(${t.id})" class="text-rose-500 text-xs font-bold hover:underline">VOID</button></td>
        </tr>`).join('');
}

async function voidInvoice(id) {
    if(confirm("Void this trade transaction? Stock levels will be added back into inventory.")) {
        await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
        loadInvoicesTable();
    }
}

// Expenses Layer
async function loadExpenseTable() {
    const data = await (await fetch('/api/expenses')).json();
    document.querySelector('#table-exp tbody').innerHTML = data.map(e => `
        <tr>
            <td class="p-4 font-mono text-xs">${e.date}</td>
            <td class="p-4 font-bold">${e.title}</td>
            <td class="p-4"><span class="text-xs px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">${e.category}</span></td>
            <td class="p-4 text-rose-400 font-semibold">-₹${e.amount.toFixed(2)}</td>
        </tr>`).join('');
}

async function addExpense() {
    const payload = {
        title: document.getElementById('e-title').value, category: document.getElementById('e-cat').value,
        amount: parseFloat(document.getElementById('e-amt').value), date: document.getElementById('e-date').value, notes: ''
    };
    if(!payload.title || !payload.amount) return launchToast("Incomplete expense form items", "error");
    await fetch('/api/expenses', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    launchToast("Debit recorded against operating margin profile", "info");
    document.getElementById('e-title').value = '';
    document.getElementById('e-amt').value = '';
    loadExpenseTable();
}

// Customer Isolated Ledger System
async function launchCustomerLedgerPanel(id, name, phone) {
    activeCustomerId = id;
    document.querySelectorAll('.stage').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-ledger-panel').classList.remove('hidden');
    document.getElementById('ledger-title-header').innerText = `Statement Profile: ${name}`;
    
    // WhatsApp Formatting Link
    document.getElementById('wa-link').href = `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=Dear%20customer,%20please%20review%20your%20current%20outstanding%20statement%20of%20accounts.`;
    
    const data = await (await fetch(`/api/customers/${id}/history`)).json();
    let trackingLiability = 0;
    
    document.querySelector('#table-ledger tbody').innerHTML = data.map(r => {
        trackingLiability += (r.debit - r.credit);
        return `
            <tr>
                <td class="p-4 font-mono text-xs opacity-70">${r.date}</td>
                <td class="p-4"><span class="px-2 py-0.5 rounded text-xs font-bold ${r.type==='Invoice'?'bg-blue-500/10 text-blue-400':'bg-emerald-500/10 text-emerald-400'}">${r.type}</span></td>
                <td class="p-4 font-medium">${r.details}</td>
                <td class="p-4 text-rose-400 font-mono">${r.debit > 0 ? '₹'+r.debit.toFixed(2) : '-'}</td>
                <td class="p-4 text-emerald-400 font-mono">${r.credit > 0 ? '₹'+r.credit.toFixed(2) : '-'}</td>
                <td class="p-4 font-bold ${trackingLiability > 0 ? 'text-rose-400' : 'text-slate-300'}">₹${trackingLiability.toFixed(2)}</td>
            </tr>`;
    }).join('');
}

async function submitLedgerPayment() {
    const payload = {
        customer_id: activeCustomerId, amount: parseFloat(document.getElementById('ledger-pay-amt').value),
        date: new Date().toISOString().split('T')[0], method: document.getElementById('ledger-pay-method').value
    };
    if(!payload.amount) return launchToast("Enter a collection value amount", "error");
    await fetch('/api/payments', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    launchToast("Credit payment balanced successfully", "success");
    document.getElementById('ledger-pay-amt').value = '';
    nav('customers'); 
}

// CSV Universal Matrix Generator
function exportTableToCSV(tableId, targetFilename) {
    const table = document.getElementById(tableId);
    let rows = [];
    for (let r of table.rows) {
        let cols = [];
        for (let cell of r.cells) {
            if(!cell.classList.contains('no-print')) {
                cols.push('"' + cell.innerText.replace(/"/g, '""') + '"');
            }
        }
        rows.push(cols.join(","));
    }
    const universalLink = document.createElement("a");
    universalLink.href = "data:text/csv;charset=utf-8," + encodeURI(rows.join("\n"));
    universalLink.download = `${targetFilename}_generation_${new Date().getTime()}.csv`;
    universalLink.click();
}
