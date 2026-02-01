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

    // Forgot password elements
    const forgotPasswordOverlay = document.getElementById('forgotPasswordOverlay');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const backToLoginLink = document.getElementById('backToLoginLink');

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
        } else if (view === 'prompts') {
            await fetchStyleOverlays();
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

    // AI Prompter - Style Overlays per kategori och språk
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

    const languageNames = {
        sv: 'Svenska',
        en: 'English'
    };

    let currentOverlays = [];
    let selectedCategory = 'world';
    let selectedLanguage = 'sv';

    async function fetchStyleOverlays() {
        try {
            const data = await apiFetch('/api/admin/style-overlays');
            currentOverlays = data.data;
            renderPromptsView();
        } catch (err) {
            console.error('Failed to fetch style overlays:', err);
            viewContainer.innerHTML = `<div class="panel glass"><p class="error">Kunde inte ladda AI prompter: ${err.message}</p></div>`;
        }
    }

    function getOverlay(categoryCode, language) {
        return currentOverlays.find(o => o.categoryCode === categoryCode && o.language === language);
    }

    function renderPromptsView() {
        const allCategories = Object.keys(categoryNames);

        viewContainer.innerHTML = `
            <div class="prompts-layout">
                <div class="panel glass prompts-sidebar">
                    <h3>KATEGORIER</h3>
                    <div class="language-selector">
                        ${Object.entries(languageNames).map(([code, name]) => `
                            <button class="lang-btn ${code === selectedLanguage ? 'active' : ''}" data-lang="${code}">
                                ${name}
                            </button>
                        `).join('')}
                    </div>
                    <ul class="category-list">
                        ${allCategories.map(cat => {
                            const overlay = getOverlay(cat, selectedLanguage);
                            return `
                                <li class="${cat === selectedCategory ? 'active' : ''} ${overlay ? 'has-prompt' : ''}" data-category="${cat}">
                                    ${categoryNames[cat]}
                                    ${overlay ? '<span class="check-icon">✓</span>' : ''}
                                </li>
                            `;
                        }).join('')}
                    </ul>
                </div>
                <div class="panel glass prompts-editor">
                    ${renderPromptEditor()}
                </div>
            </div>
        `;

        attachPromptsEventListeners();
    }

    function renderPromptEditor() {
        const overlay = getOverlay(selectedCategory, selectedLanguage);
        const langName = languageNames[selectedLanguage];

        return `
            <h2>Inställningar för ${categoryNames[selectedCategory]}</h2>
            <p class="editor-subtitle">Tillägg till basen för översättning till ${langName}</p>

            <form id="promptForm">
                <div class="input-group">
                    <label>Style Prompt (${langName})</label>
                    <textarea id="stylePromptInput" rows="10"
                        placeholder="Skriv instruktioner för hur AI:n ska skriva nyheter inom ${categoryNames[selectedCategory]}...">${overlay?.stylePrompt || ''}</textarea>
                    <p class="input-help">
                        Detta tillägg läggs till basens instruktioner och styr skrivstilen för ${categoryNames[selectedCategory].toLowerCase()}-artiklar.
                        ${selectedLanguage !== 'sv' ? `<br><strong>Tips:</strong> Skriv på ${langName.toLowerCase()} för bästa resultat.` : ''}
                    </p>
                </div>

                <div class="input-group">
                    <label>Intern beskrivning (valfritt)</label>
                    <input type="text" id="promptDescription"
                        placeholder="Admin-anteckning om denna prompt..."
                        value="${overlay?.description || ''}">
                </div>

                <div class="prompt-actions">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-save"></i> Spara instruktioner
                    </button>
                    ${overlay ? `
                        <button type="button" class="btn btn-danger" id="deletePromptBtn">
                            <i class="fas fa-trash"></i> Ta bort
                        </button>
                    ` : ''}
                </div>
            </form>
        `;
    }

    function attachPromptsEventListeners() {
        // Language selector
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedLanguage = btn.dataset.lang;
                renderPromptsView();
            });
        });

        // Category list
        document.querySelectorAll('.category-list li').forEach(li => {
            li.addEventListener('click', () => {
                selectedCategory = li.dataset.category;
                renderPromptsView();
            });
        });

        // Form submit
        const form = document.getElementById('promptForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await savePrompt();
            });
        }

        // Delete button
        const deleteBtn = document.getElementById('deletePromptBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                if (confirm(`Är du säker på att du vill ta bort prompten för ${categoryNames[selectedCategory]} (${languageNames[selectedLanguage]})?`)) {
                    await deletePrompt();
                }
            });
        }
    }

    async function savePrompt() {
        const stylePrompt = document.getElementById('stylePromptInput').value.trim();
        const description = document.getElementById('promptDescription').value.trim();

        if (!stylePrompt) {
            alert('Style prompt kan inte vara tom');
            return;
        }

        const overlay = getOverlay(selectedCategory, selectedLanguage);

        try {
            if (overlay) {
                // Update existing
                await apiFetch(`/api/admin/style-overlays/${overlay.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        stylePrompt,
                        description,
                        isActive: true
                    })
                });
            } else {
                // Create new
                await apiFetch('/api/admin/style-overlays', {
                    method: 'POST',
                    body: JSON.stringify({
                        categoryCode: selectedCategory,
                        language: selectedLanguage,
                        name: `${categoryNames[selectedCategory]} - ${languageNames[selectedLanguage]}`,
                        stylePrompt,
                        description
                    })
                });
            }

            // Refresh data
            await fetchStyleOverlays();
            alert('Sparad!');
        } catch (err) {
            alert('Fel vid sparning: ' + err.message);
        }
    }

    async function deletePrompt() {
        const overlay = getOverlay(selectedCategory, selectedLanguage);
        if (!overlay) return;

        try {
            await apiFetch(`/api/admin/style-overlays/${overlay.id}`, {
                method: 'DELETE'
            });

            await fetchStyleOverlays();
        } catch (err) {
            alert('Fel vid borttagning: ' + err.message);
        }
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

    // Forgot password flow
    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginOverlay.classList.add('hidden');
        forgotPasswordOverlay.classList.remove('hidden');
        // Clear any previous messages
        document.getElementById('forgotPasswordSuccess').classList.add('hidden');
        document.getElementById('forgotPasswordError').classList.add('hidden');
    });

    backToLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        forgotPasswordOverlay.classList.add('hidden');
        loginOverlay.classList.remove('hidden');
    });

    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgotEmail').value;
        const successEl = document.getElementById('forgotPasswordSuccess');
        const errorEl = document.getElementById('forgotPasswordError');

        // Hide previous messages
        successEl.classList.add('hidden');
        errorEl.classList.add('hidden');

        try {
            const response = await fetch('/api/admin/password-reset/request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (data.status === 'success') {
                successEl.textContent = data.message;
                successEl.classList.remove('hidden');
                forgotPasswordForm.reset();
            } else {
                errorEl.textContent = data.message || 'Ett fel uppstod';
                errorEl.classList.remove('hidden');
            }
        } catch (err) {
            errorEl.textContent = 'Kunde inte ansluta till servern';
            errorEl.classList.remove('hidden');
        }
    });

    // Start
    init();
});
