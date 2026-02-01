document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentUser = null;
    let currentToken = localStorage.getItem('admin_token');
    let currentView = 'dashboard';
    let testPassed = false;
    let allPrompts = [];

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

    // Prompts elements
    const promptCategoryList = document.getElementById('promptCategoryList');
    const promptEditorForm = document.getElementById('promptEditorForm');
    const editorPlaceholder = document.getElementById('editorPlaceholder');
    const editorHeader = document.getElementById('editorHeader');
    const promptTextarea = document.getElementById('promptTextarea');
    const editPromptCategory = document.getElementById('editPromptCategory');
    const promptSaveStatus = document.getElementById('promptSaveStatus');

    // Initialize
    async function init() {
        if (!currentToken) {
            showLogin();
        } else {
            try {
                // Initial load
                await switchView('dashboard');
                hideLogin();
                // Fetch version without auth requirement (public endpoint) - or just use auth fetch
                fetch('/api/health').then(r => r.json()).then(d => {
                    if(d.version) document.getElementById('appVersion').textContent = `v${d.version}`;
                }).catch(e => console.error(e));
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
        } else if (viewName === 'prompts') {
            await fetchPrompts();
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
            throw new Error('Sessionen har gått ut. Vänligen logga in igen.');
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

            // Render Recent Activity
            const recentLog = document.getElementById('recentActivityLog');
            if (data.data.recentArticles && data.data.recentArticles.length > 0) {
                recentLog.innerHTML = data.data.recentArticles.map(a => {
                    // Parse the ISO date string correctly
                    const date = new Date(a.pubDate || a.time);
                    const now = new Date();
                    const diffMs = now - date;
                    const diffMins = Math.floor(diffMs / 60000);
                    
                    const time = date.toLocaleTimeString('sv-SE', {hour: '2-digit', minute:'2-digit'});
                    let timeDisplay = time;
                    
                    // Only show relative time if it's positive and recent
                    if (diffMins >= 0 && diffMins < 60) {
                        timeDisplay += ` (${diffMins} min sedan)`;
                    } else if (diffMins >= 60 && diffMins < 1440) {
                        const hours = Math.floor(diffMins / 60);
                        timeDisplay += ` (${hours} tim sedan)`;
                    }
                    
                    return `
                    <div class="activity-item">
                        <div class="activity-time">${timeDisplay}</div>
                        <div class="activity-content">
                            <span class="activity-source">${a.source}</span>
                            <span class="activity-title">${a.title}</span>
                        </div>
                    </div>
                `}).join('');
            } else {
                recentLog.innerHTML = '<p class="empty-msg">Inga händelser loggade än.</p>';
            }
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
                    <button class="btn-icon" onclick="alert('Redigera id: ${s.id}')"><i class="fas fa-edit"></i></button>
                </td>
            </tr>
        `).join('');
    }

    // Prompts Management - Using Style Overlays API
    const categoryNames = {
        world: 'Världsnyheter',
        politics: 'Politik',
        sports: 'Sport',
        tech: 'Teknik & Innovation',
        business: 'Ekonomi & Företag',
        science: 'Vetenskap',
        local: 'Lokalt',
        culture: 'Kultur & Nöje'
    };

    let styleOverlays = [];
    let selectedCategory = null;
    const selectedLanguage = 'sv'; // Default to Swedish

    async function fetchPrompts() {
        const categories = Object.entries(categoryNames).map(([id, label]) => ({ id, label }));

        try {
            const result = await apiFetch('/api/admin/style-overlays');
            styleOverlays = result.data || [];
            renderPromptCategories(categories);
        } catch (err) {
            console.error('Failed to fetch style overlays:', err);
            // Fallback to rendering categories without overlay data
            renderPromptCategories(categories);
        }
    }

    function getOverlay(categoryCode) {
        return styleOverlays.find(o => o.categoryCode === categoryCode && o.language === selectedLanguage);
    }

    function renderPromptCategories(categories) {
        promptCategoryList.innerHTML = categories.map(cat => {
            const overlay = getOverlay(cat.id);
            const hasPrompt = !!overlay;
            return `
                <li data-cat="${cat.id}" class="${selectedCategory === cat.id ? 'active' : ''} ${hasPrompt ? 'has-prompt' : ''}">
                    ${cat.label}
                    ${hasPrompt ? '<span style="color: var(--success); margin-left: auto;">✓</span>' : ''}
                </li>
            `;
        }).join('');

        promptCategoryList.querySelectorAll('li').forEach(li => {
            li.addEventListener('click', () => selectPromptCategory(li.dataset.cat, categoryNames[li.dataset.cat]));
        });
    }

    function selectPromptCategory(category, label) {
        selectedCategory = category;
        editPromptCategory.value = category;

        // Update UI
        promptCategoryList.querySelectorAll('li').forEach(li => {
            li.classList.toggle('active', li.dataset.cat === category);
        });

        editorHeader.innerHTML = `<h3>Inställningar för ${label}</h3><p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 8px;">Tillägg till basen för översättning till Svenska</p>`;
        editorPlaceholder.classList.add('hidden');
        promptEditorForm.classList.remove('hidden');

        // Find existing style overlay
        const existing = getOverlay(category);
        promptTextarea.value = existing ? existing.stylePrompt : '';
        promptSaveStatus.classList.add('hidden');
    }

    promptEditorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const category = editPromptCategory.value;
        const stylePrompt = promptTextarea.value.trim();

        if (!stylePrompt) {
            alert('Prompten kan inte vara tom');
            return;
        }

        try {
            const btn = promptEditorForm.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Sparar...';

            const existing = getOverlay(category);

            if (existing) {
                // Update existing
                await apiFetch(`/api/admin/style-overlays/${existing.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ stylePrompt, isActive: true })
                });
                existing.stylePrompt = stylePrompt;
            } else {
                // Create new
                const result = await apiFetch('/api/admin/style-overlays', {
                    method: 'POST',
                    body: JSON.stringify({
                        categoryCode: category,
                        language: selectedLanguage,
                        name: `${categoryNames[category]} - Svenska`,
                        stylePrompt
                    })
                });
                styleOverlays.push(result.data);
            }

            // Refresh category list to show checkmarks
            renderPromptCategories(Object.entries(categoryNames).map(([id, label]) => ({ id, label })));
            // Re-select to keep active state
            promptCategoryList.querySelectorAll('li').forEach(li => {
                li.classList.toggle('active', li.dataset.cat === category);
            });

            promptSaveStatus.classList.remove('hidden');
            setTimeout(() => promptSaveStatus.classList.add('hidden'), 3000);
        } catch (err) {
            alert('Misslyckades att spara prompt: ' + err.message);
        } finally {
            const btn = promptEditorForm.querySelector('button[type="submit"]');
            btn.disabled = false;
            btn.textContent = 'Spara instruktioner';
        }
    });

    // Modal Handling (Add Source)
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
