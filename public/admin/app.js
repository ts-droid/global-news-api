document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentUser = null;
    let currentToken = localStorage.getItem('admin_token');
    let currentView = 'dashboard';

    // Elements
    const loginOverlay = document.getElementById('loginOverlay');
    const loginForm = document.getElementById('loginForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const viewContainer = document.getElementById('viewContainer');
    const sidebarItems = document.querySelectorAll('.sidebar li');
    const viewTitle = document.getElementById('viewTitle');

    // Initialize
    async function init() {
        if (!currentToken) {
            showLogin();
        } else {
            // Validate token and get stats
            try {
                await fetchStats();
                hideLogin();
            } catch (err) {
                showLogin();
            }
        }
    }

    // View Management
    function switchView(viewName) {
        currentView = viewName;
        sidebarItems.forEach(item => {
            item.classList.toggle('active', item.dataset.view === viewName);
        });
        
        const titles = {
            'dashboard': 'Dashboard',
            'sources': 'Nyhetskällor',
            'prompts': 'AI Prompter',
            'stats': 'API Statistik'
        };
        viewTitle.textContent = titles[viewName] || 'Admin';

        renderView(viewName);
    }

    async function renderView(view) {
        if (view === 'dashboard') {
            await fetchStats();
        } else if (view === 'sources') {
            await fetchSources();
        }
        // Other views stubbed
    }

    // API Calls
    async function apiFetch(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...(currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {}),
            ...options.headers
        };

        const response = await fetch(endpoint, { ...options, headers });
        const data = await response.json();

        if (response.status === 401 || response.status === 403) {
            handleLogout();
            throw new Error('Session expired');
        }

        if (data.status === 'error') throw new Error(data.message);
        return data;
    }

    async function fetchStats() {
        try {
            const data = await apiFetch('/api/stats');
            document.getElementById('totalSourcesStat').textContent = data.data.totalSources;
            document.getElementById('cacheSizeStat').textContent = data.data.cacheStats.size;
            document.getElementById('lastRefreshStat').textContent = 'Just nu';
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        }
    }

    async function fetchSources() {
        try {
            const data = await apiFetch('/api/admin/sources');
            renderSourcesTable(data.data);
        } catch (err) {
            console.error('Failed to fetch sources:', err);
        }
    }

    function renderSourcesTable(sources) {
        viewContainer.innerHTML = `
            <div class="panel glass">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Namn</th>
                            <th>Kategori</th>
                            <th>Region</th>
                            <th>Status</th>
                            <th>Åtgärder</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sources.map(s => `
                            <tr>
                                <td>${s.name}</td>
                                <td>${s.category}</td>
                                <td>${s.region}</td>
                                <td><span class="status-pill ${s.isActive ? 'active' : 'inactive'}">${s.isActive ? 'Aktiv' : 'Inaktiv'}</span></td>
                                <td><button class="btn-icon"><i class="fas fa-edit"></i></button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // Auth flows
    function showLogin() {
        loginOverlay.classList.remove('hidden');
    }

    function hideLogin() {
        loginOverlay.classList.add('hidden');
    }

    function handleLogout() {
        localStorage.removeItem('admin_token');
        currentToken = null;
        currentUser = null;
        showLogin();
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const data = await apiFetch('/api/admin/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            if (data.token) {
                currentToken = data.token;
                localStorage.setItem('admin_token', currentToken);
                hideLogin();
                await fetchStats();
            } else if (data.requirePasswordChange) {
                alert('Du måste byta lösenord. Implementeras snart.');
            }
        } catch (err) {
            document.getElementById('authError').textContent = err.message;
            document.getElementById('authError').classList.remove('hidden');
        }
    });

    logoutBtn.addEventListener('click', handleLogout);

    sidebarItems.forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.view));
    });

    // Start
    init();
});
