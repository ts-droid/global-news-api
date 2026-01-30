document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentUser = null;
    let currentToken = localStorage.getItem('admin_token');
    let currentView = 'dashboard';
    let testPassed = false;

    // Elements
    const loginOverlay = document.getElementById('loginOverlay');
    const loginForm = document.getElementById('loginForm');
    const authError = document.getElementById('authError');
    const logoutBtn = document.getElementById('logoutBtn');
    
    const views = document.querySelectorAll('.view');
    const sidebarItems = document.querySelectorAll('.sidebar li');
    const viewTitle = document.getElementById('viewTitle');
    
    // Sources elements
    const sourcesTableBody = document.getElementById('sourcesTableBody');
    const addSourceBtn = document.getElementById('addSourceBtn');
    const sourceModal = document.getElementById('sourceModal');
    const closeSourceModal = document.getElementById('closeSourceModal');
    const cancelSourceBtn = document.getElementById('cancelSourceBtn');
    const sourceForm = document.getElementById('sourceForm');
    const testRssBtn = document.getElementById('testRssBtn');
    const testResult = document.getElementById('testResult');
    const saveSourceBtn = document.getElementById('saveSourceBtn');

    // Initialize
    async function init() {
        if (!currentToken) {
            showLogin();
        } else {
            try {
                // Initial load
                await switchView('dashboard');
                hideLogin();
            } catch (err) {
                console.error('Init failed:', err);
                showLogin();
            }
        }
    }

    // View Management
    async function switchView(viewName) {
        currentView = viewName;
        
        // Update sidebar
        sidebarItems.forEach(item => {
            item.classList.toggle('active', item.dataset.view === viewName);
        });
        
        // Update Title
        const titles = {
            'dashboard': 'Dashboard',
            'sources': 'Nyhetskällor',
            'prompts': 'AI Prompter',
            'stats': 'API Statistik'
        };
        viewTitle.textContent = titles[viewName] || 'Admin';

        // Toggle visibility
        views.forEach(v => {
            if (v.id === viewName + 'View') {
                v.classList.remove('hidden');
                v.classList.add('active');
            } else {
                v.classList.add('hidden');
                v.classList.remove('active');
            }
        });

        // Trigger data load
        if (viewName === 'dashboard') {
            await fetchStats();
        } else if (viewName === 'sources') {
            await fetchSources();
        }
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
            throw new Error('Sensionen har gått ut. Vänligen logga in igen.');
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
        if (!sourcesTableBody) return;
        
        sourcesTableBody.innerHTML = sources.map(s => `
            <tr>
                <td>
                    <div class="source-info">
                        <strong>${s.name}</strong>
                        <br/><small style="color:var(--text-secondary)">${s.code}</small>
                    </div>
                </td>
                <td>${s.category}</td>
                <td>${s.region}</td>
                <td><span class="status-pill ${s.isActive ? 'active' : 'inactive'}">${s.isActive ? 'Aktiv' : 'Inaktiv'}</span></td>
                <td>
                    <button class="btn-icon" onclick="alert('Edit id: ${s.id}')"><i class="fas fa-edit"></i></button>
                </td>
            </tr>
        `).join('');
    }

    // Modal Handling
    addSourceBtn.addEventListener('click', () => {
        sourceModal.classList.remove('hidden');
        sourceForm.reset();
        testResult.classList.add('hidden');
        saveSourceBtn.disabled = true;
        testPassed = false;
    });

    const hideModal = () => sourceModal.classList.add('hidden');
    closeSourceModal.addEventListener('click', hideModal);
    cancelSourceBtn.addEventListener('click', hideModal);

    testRssBtn.addEventListener('click', async () => {
        const rssUrl = document.getElementById('sourceRssUrl').value;
        if (!rssUrl) return alert('Ange en RSS URL först');
        
        testRssBtn.disabled = true;
        testRssBtn.textContent = 'Testar...';
        testResult.classList.remove('hidden');
        testResult.className = 'test-status';
        testResult.textContent = 'Validerar feed...';

        try {
            const result = await apiFetch('/api/admin/sources/test', {
                method: 'POST',
                body: JSON.stringify({ rssUrl })
            });
            
            testResult.classList.add('success');
            testResult.innerHTML = `<i class="fas fa-check-circle"></i> OK! Hittade <strong>${result.data.itemCount}</strong> artiklar. <br/> "${result.data.title}"`;
            saveSourceBtn.disabled = false;
            testPassed = true;
        } catch (err) {
            testResult.classList.add('error');
            testResult.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${err.message}`;
            saveSourceBtn.disabled = true;
            testPassed = false;
        } finally {
            testRssBtn.disabled = false;
            testRssBtn.textContent = 'Testa';
        }
    });

    sourceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!testPassed) return alert('Du måste testa källan först!');

        const formData = {
            name: document.getElementById('sourceName').value,
            code: document.getElementById('sourceCode').value,
            rssUrl: document.getElementById('sourceRssUrl').value,
            category: document.getElementById('sourceCategory').value,
            region: document.getElementById('sourceRegion').value,
            website: document.getElementById('sourceWebsite').value,
            isActive: true
        };

        try {
            await apiFetch('/api/admin/sources', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            hideModal();
            fetchSources(); // Refresh list
        } catch (err) {
            alert('Misslyckades att spara: ' + err.message);
        }
    });

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
                await switchView('dashboard');
            } else if (data.requirePasswordChange || data.require2FA) {
                alert('Säkerhetsautentisering krävs (TOTP/Lösenordsbyte). Implementera i modal.');
            }
        } catch (err) {
            authError.textContent = err.message;
            authError.classList.remove('hidden');
        }
    });

    logoutBtn.addEventListener('click', handleLogout);

    sidebarItems.forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.view));
    });

    // Start
    init();
});
