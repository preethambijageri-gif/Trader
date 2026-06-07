document.addEventListener('DOMContentLoaded', () => checkAuth());

async function checkAuth() {
    const res = await fetch('/api/check-auth');
    const data = await res.json();
    if (data.loggedIn) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'flex';
        // Set dates to today by default
        document.getElementById('tx-date').valueAsDate = new Date();
        document.getElementById('pay-date').valueAsDate = new Date();
        showSection('dashboard');
    }
}

async function login() {
    const res = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: document.getElementById('username').value, password: document.getElementById('password').value })
    });
    const data = await res.json();
    if (data.success) checkAuth();
    else document.getElementById('login-error').style.display = 'block';
}

async function logout() { await fetch('/api/logout', { method: 'POST' }); location.reload(); }

function showSection(id) {
    document.querySelectorAll('.view-section').forEach(sec => sec.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    
    if(id === 'dashboard') loadDashboard();
    if(id === 'customers') loadCustomers();
    if(id === 'transactions') { loadCustomersList(); loadTransactions(); }
    if(id === 'payments') loadCustomersList();
    if(id === 'ledger') loadCustomersList();
    if(id === 'reports') loadDuesReport();
}

// Global UI Helper
function filterTable(tableId, inputId) {
    const filter = document.getElementById(inputId).value.toLowerCase();
    const rows = document.getElementById(tableId).getElementsByTagName('tbody')[0].getElementsByTagName('tr');
    for (let row of rows) {
        row.style.display = row.innerText.toLowerCase().includes(filter) ? '' : 'none';
    }
}

// Dashboard
async function loadDashboard() {
    const data = await (await fetch('/api/dashboard')).json();
    document.getElementById('dash-sales').innerText = `₹${data.totalSales.toFixed(2)}`;
    document.getElementById('dash-received').innerText = `₹${data.totalReceived.toFixed(2)}`;
    document.getElementById('dash-pending').innerText = `₹${data.pending.toFixed(2)}`;
}

// Customers
async function loadCustomersList() {
    const customers = await (await fetch('/api/customers')).json();
    document.querySelectorAll('.cust-dropdown').forEach(select => {
        select.innerHTML = '<option value="">Select Customer...</option>';
        customers.forEach(c => select.innerHTML += `<option value="${c.id}">${c.name}</option>`);
    });
}

async function loadCustomers() {
    const customers = await (await fetch('/api/customers')).json();
    const tbody = document.querySelector('#customers-table tbody');
    tbody.innerHTML = '';
    customers.forEach(c => {
        tbody.innerHTML += `<tr>
            <td>${c.id}</td><td>${c.name}</td><td>${c.phone}</td><td>${c.address}</td><td>${c.notes}</td>
            <td class="no-print">
                <button class="edit" onclick="editCustomer(${c.id}, '${c.name}', '${c.phone}', '${c.address}', '${c.notes}')">Edit</button>
                <button class="danger" onclick="deleteCustomer(${c.id})">Del</button>
            </td>
        </tr>`;
    });
}

function resetCustomerForm() {
    document.getElementById('cust-id').value = '';
    ['cust-name', 'cust-phone', 'cust-address', 'cust-notes'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('cust-btn').innerText = 'Add Customer';
}

function editCustomer(id, name, phone, address, notes) {
    document.getElementById('cust-id').value = id;
    document.getElementById('cust-name').value = name;
    document.getElementById('cust-phone').value = phone;
    document.getElementById('cust-address').value = address;
    document.getElementById('cust-notes').value = notes !== 'undefined' ? notes : '';
    document.getElementById('cust-btn').innerText = 'Update Customer';
}

async function saveCustomer() {
    const id = document.getElementById('cust-id').value;
    const payload = {
        name: document.getElementById('cust-name').value, phone: document.getElementById('cust-phone').value,
        address: document.getElementById('cust-address').value, notes: document.getElementById('cust-notes').value
    };
    
    if(id) await fetch(`/api/customers/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    else await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    
    resetCustomerForm();
    loadCustomers();
}

async function deleteCustomer(id) {
    if(confirm('Are you sure? This deletes all associated transactions and payments!')) {
        await fetch(`/api/customers/${id}`, { method: 'DELETE' });
        loadCustomers();
    }
}

// Transactions & Payments
function calcTotal() {
    const vals = ['tx-qty', 'tx-rate', 'tx-gst', 'tx-cess'].map(id => parseFloat(document.getElementById(id).value) || 0);
    const grand = (vals[0] * vals[1]) + vals[2] + vals[3];
    document.getElementById('tx-grand').innerText = grand.toFixed(2);
    return { amount: vals[0]*vals[1], grand };
}

async function addTransaction() {
    const payload = {
        customer_id: document.getElementById('tx-customer').value, date: document.getElementById('tx-date').value,
        description: document.getElementById('tx-desc').value, quantity: document.getElementById('tx-qty').value,
        rate: document.getElementById('tx-rate').value, gst: document.getElementById('tx-gst').value,
        cess: document.getElementById('tx-cess').value, grand_total: calcTotal().grand, amount: calcTotal().amount
    };
    if(!payload.customer_id || !payload.date) return alert('Required fields missing');
    await fetch('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    ['tx-desc','tx-qty','tx-rate','tx-gst','tx-cess'].forEach(id => document.getElementById(id).value = '');
    loadTransactions();
}

async function loadTransactions() {
    const txs = await (await fetch('/api/transactions')).json();
    const tbody = document.querySelector('#transactions-table tbody');
    tbody.innerHTML = txs.map(t => `<tr><td>${t.id}</td><td>${t.date}</td><td>${t.customer_name}</td><td>${t.description}</td><td>₹${t.grand_total.toFixed(2)}</td></tr>`).join('');
}

async function addPayment() {
    const payload = {
        customer_id: document.getElementById('pay-customer').value,
        date: document.getElementById('pay-date').value,
        amount: parseFloat(document.getElementById('pay-amount').value)
    };
    if(!payload.customer_id || !payload.amount) return alert('Required fields missing');
    await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    document.getElementById('pay-amount').value = '';
    alert('Payment Recorded Successfully!');
}

// Ledger & Reports
async function generateLedger() {
    const sel = document.getElementById('ledger-customer');
    const cid = sel.value;
    if(!cid) return;
    document.getElementById('ledger-title').innerText = `Ledger Statement: ${sel.options[sel.selectedIndex].text}`;
    
    const rows = await (await fetch(`/api/ledger/${cid}`)).json();
    let balance = 0;
    const tbody = document.querySelector('#ledger-table tbody');
    tbody.innerHTML = rows.map(r => {
        balance += (r.debit - r.credit);
        return `<tr><td>${r.date}</td><td>${r.type}</td><td>${r.description}</td>
                <td style="color:#ef476f;">${r.debit > 0 ? '₹'+r.debit.toFixed(2) : '-'}</td>
                <td style="color:#06d6a0;">${r.credit > 0 ? '₹'+r.credit.toFixed(2) : '-'}</td>
                <td><b>₹${balance.toFixed(2)}</b></td></tr>`;
    }).join('');
}

async function loadDuesReport() {
    const dues = await (await fetch('/api/reports/dues')).json();
    document.querySelector('#dues-table tbody').innerHTML = dues.map(d => 
        `<tr><td>${d.name}</td><td>${d.phone}</td><td>₹${d.total_billed.toFixed(2)}</td><td>₹${d.total_paid.toFixed(2)}</td><td style="color:#ef476f; font-weight:bold;">₹${d.balance.toFixed(2)}</td></tr>`
    ).join('');
}

// Export Utility
function exportCSV() {
    // Finds whichever section is currently active and exports its table
    const activeSection = Array.from(document.querySelectorAll('.view-section')).find(s => s.style.display === 'block');
    const table = activeSection.querySelector('table');
    if(!table) return alert('No table found to export on this screen.');

    let csv = [];
    for (let row of table.rows) {
        let cols = [];
        for (let cell of row.cells) if(!cell.classList.contains('no-print')) cols.push('"' + cell.innerText.replace(/"/g, '""') + '"');
        csv.push(cols.join(","));
    }
    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv.join("\n"));
    link.download = `ledger_export_${new Date().getTime()}.csv`;
    link.click();
}
