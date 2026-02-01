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
            'styleOverlays': 'Style Overlays',
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
        } else if (view === 'styleOverlays') {
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

    // Style Overlays
    const categoryNames = {
        world: 'Världen',
        politics: 'Politik',
        sports: 'Sport',
        tech: 'Teknik',
        business: 'Ekonomi',
        science: 'Vetenskap',
        local: 'Lokalt',
        culture: 'Kultur'
    };

    const languageNames = {
        sv: 'Svenska',
        en: 'Engelska'
    };

    async function fetchStyleOverlays() {
        try {
            const data = await apiFetch('/api/admin/style-overlays');
            renderStyleOverlaysView(data.data);
        } catch (err) {
            console.error('Failed to fetch style overlays:', err);
            viewContainer.innerHTML = `<div class="panel glass"><p class="error">Kunde inte ladda style overlays: ${err.message}</p></div>`;
        }
    }

    function renderStyleOverlaysView(overlays) {
        // Group by language
        const byLanguage = {};
        overlays.forEach(o => {
            if (!byLanguage[o.language]) byLanguage[o.language] = [];
            byLanguage[o.language].push(o);
        });

        viewContainer.innerHTML = `
            <div class="style-overlays-container">
                <div class="panel glass" style="margin-bottom: 20px;">
                    <p style="color: var(--text-secondary); margin-bottom: 16px;">
                        Style overlays definierar skrivstilen för AI-översättningar per kategori och språk.
                        Varje kategori kan ha unika instruktioner för hur nyheter ska formuleras.
                    </p>
                    <div class="language-tabs">
                        ${Object.keys(languageNames).map(lang => `
                            <button class="tab-btn ${lang === 'sv' ? 'active' : ''}" data-lang="${lang}">
                                ${languageNames[lang]}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div id="overlaysContent">
                    ${renderOverlayCards(byLanguage['sv'] || [], 'sv')}
                </div>
            </div>
        `;

        // Tab switching
        document.querySelectorAll('.language-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.language-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const lang = btn.dataset.lang;
                document.getElementById('overlaysContent').innerHTML = renderOverlayCards(byLanguage[lang] || [], lang);
                attachOverlayEventListeners();
            });
        });

        attachOverlayEventListeners();
    }

    function renderOverlayCards(overlays, language) {
        // Show all categories, even if no overlay exists yet
        const allCategories = Object.keys(categoryNames);
        const overlayMap = {};
        overlays.forEach(o => overlayMap[o.categoryCode] = o);

        return `
            <div class="overlay-cards-grid">
                ${allCategories.map(cat => {
                    const overlay = overlayMap[cat];
                    const hasOverlay = !!overlay;
                    return `
                        <div class="panel glass overlay-card ${hasOverlay ? 'has-overlay' : 'no-overlay'}" data-category="${cat}" data-language="${language}" data-id="${overlay?.id || ''}">
                            <div class="overlay-card-header">
                                <h3>${categoryNames[cat]}</h3>
                                <span class="status-pill ${hasOverlay ? 'active' : 'inactive'}">
                                    ${hasOverlay ? (overlay.isActive ? 'Aktiv' : 'Inaktiv') : 'Saknas'}
                                </span>
                            </div>
                            <div class="overlay-card-body">
                                ${hasOverlay ? `
                                    <p class="overlay-name">${overlay.name}</p>
                                    <p class="overlay-preview">${overlay.stylePrompt.substring(0, 150)}${overlay.stylePrompt.length > 150 ? '...' : ''}</p>
                                ` : `
                                    <p class="no-overlay-msg">Ingen style overlay definierad för ${categoryNames[cat]} (${languageNames[language]})</p>
                                `}
                            </div>
                            <div class="overlay-card-actions">
                                <button class="btn btn-small btn-edit-overlay" data-category="${cat}" data-language="${language}">
                                    <i class="fas fa-edit"></i> ${hasOverlay ? 'Redigera' : 'Skapa'}
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function attachOverlayEventListeners() {
        document.querySelectorAll('.btn-edit-overlay').forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.dataset.category;
                const language = btn.dataset.language;
                openOverlayEditor(category, language);
            });
        });
    }

    async function openOverlayEditor(categoryCode, language) {
        // Try to fetch existing overlay
        let overlay = null;
        try {
            const data = await apiFetch(`/api/admin/style-overlays/${categoryCode}/${language}`);
            overlay = data.data;
        } catch (err) {
            // No overlay exists yet
        }

        const isNew = !overlay;

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal glass">
                <div class="modal-header">
                    <h2>${isNew ? 'Skapa' : 'Redigera'} Style Overlay: ${categoryNames[categoryCode]} (${languageNames[language]})</h2>
                    <button class="btn-close" id="closeOverlayModal">&times;</button>
                </div>
                <form id="overlayForm" class="modal-body">
                    <div class="input-group">
                        <label>Namn</label>
                        <input type="text" id="overlayName" required placeholder="t.ex. Sportsreporter - Svenska"
                            value="${overlay?.name || `${categoryNames[categoryCode]}reporter - ${languageNames[language]}`}">
                    </div>
                    <div class="input-group">
                        <label>Style Prompt</label>
                        <textarea id="overlayStylePrompt" rows="8" required
                            placeholder="Beskriv skrivstilen för denna kategori...">${overlay?.stylePrompt || ''}</textarea>
                        <p class="input-help">Instruktioner för hur AI:n ska formulera nyheter inom denna kategori.</p>
                    </div>
                    <div class="input-group">
                        <label>Beskrivning (admin-anteckning)</label>
                        <textarea id="overlayDescription" rows="2"
                            placeholder="Valfri beskrivning för admin...">${overlay?.description || ''}</textarea>
                    </div>
                    ${!isNew ? `
                    <div class="input-group checkbox-group">
                        <label>
                            <input type="checkbox" id="overlayIsActive" ${overlay?.isActive ? 'checked' : ''}>
                            Aktiv
                        </label>
                    </div>
                    ` : ''}
                    <div class="modal-actions">
                        ${!isNew ? `<button type="button" class="btn btn-danger" id="deleteOverlayBtn">Ta bort</button>` : ''}
                        <button type="button" class="btn btn-secondary" id="cancelOverlayBtn">Avbryt</button>
                        <button type="submit" class="btn btn-primary">${isNew ? 'Skapa' : 'Spara'}</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        document.getElementById('closeOverlayModal').addEventListener('click', () => modal.remove());
        document.getElementById('cancelOverlayBtn').addEventListener('click', () => modal.remove());

        document.getElementById('overlayForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = {
                categoryCode,
                language,
                name: document.getElementById('overlayName').value,
                stylePrompt: document.getElementById('overlayStylePrompt').value,
                description: document.getElementById('overlayDescription').value
            };

            if (!isNew) {
                formData.isActive = document.getElementById('overlayIsActive').checked;
            }

            try {
                if (isNew) {
                    await apiFetch('/api/admin/style-overlays', {
                        method: 'POST',
                        body: JSON.stringify(formData)
                    });
                } else {
                    await apiFetch(`/api/admin/style-overlays/${overlay.id}`, {
                        method: 'PUT',
                        body: JSON.stringify(formData)
                    });
                }
                modal.remove();
                await fetchStyleOverlays();
            } catch (err) {
                alert('Fel: ' + err.message);
            }
        });

        if (!isNew) {
            document.getElementById('deleteOverlayBtn').addEventListener('click', async () => {
                if (confirm('Är du säker på att du vill ta bort denna style overlay?')) {
                    try {
                        await apiFetch(`/api/admin/style-overlays/${overlay.id}`, { method: 'DELETE' });
                        modal.remove();
                        await fetchStyleOverlays();
                    } catch (err) {
                        alert('Fel: ' + err.message);
                    }
                }
            });
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
