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
            await fetchStyleOverlays();
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

    // ============================================
    // AI Prompter - Style Overlays per kategori och språk
    // ============================================
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
    let basePrompts = {}; // { category: prompt } - for base/category prompts
    let selectedCategory = 'world';
    let selectedLanguage = 'sv';
    let showBasePromptEditor = false; // Toggle to show base prompt editor

    async function fetchStyleOverlays() {
        try {
            // Fetch both style overlays AND base prompts
            const [overlaysData, promptsData] = await Promise.all([
                apiFetch('/api/admin/style-overlays'),
                apiFetch('/api/admin/prompts')
            ]);

            currentOverlays = overlaysData.data || [];

            // Convert prompts array to object keyed by category
            basePrompts = {};
            (promptsData.data || []).forEach(p => {
                basePrompts[p.category] = p.prompt;
            });

            renderPromptsView();
        } catch (err) {
            console.error('Failed to fetch style overlays:', err);
            const container = document.getElementById('promptsContainer');
            if (container) {
                container.innerHTML = `<div class="panel glass"><p class="error">Kunde inte ladda AI prompter: ${err.message}</p></div>`;
            }
        }
    }

    function getOverlay(categoryCode, language) {
        return currentOverlays.find(o => o.categoryCode === categoryCode && o.language === language);
    }

    function renderPromptsView() {
        const container = document.getElementById('promptsContainer');
        if (!container) return;

        const allCategories = Object.keys(categoryNames);

        container.innerHTML = `
            <div class="prompts-layout">
                <div class="panel glass prompts-sidebar">
                    <h3>GRUNDPROMPT</h3>
                    <ul class="category-list">
                        <li class="${showBasePromptEditor ? 'active' : ''} ${basePrompts['base'] ? 'has-prompt' : ''}" data-base="true">
                            <i class="fas fa-cog"></i> Grundinställningar
                            ${basePrompts['base'] ? '<span class="check-icon">✓</span>' : ''}
                        </li>
                    </ul>

                    <h3 style="margin-top: 20px;">KATEGORIER</h3>
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
                                <li class="${!showBasePromptEditor && cat === selectedCategory ? 'active' : ''} ${overlay ? 'has-prompt' : ''}" data-category="${cat}">
                                    ${categoryNames[cat]}
                                    ${overlay ? '<span class="check-icon">✓</span>' : ''}
                                </li>
                            `;
                        }).join('')}
                    </ul>
                </div>
                <div class="panel glass prompts-editor">
                    ${showBasePromptEditor ? renderBasePromptEditor() : renderPromptEditor()}
                </div>
            </div>
        `;

        attachPromptsEventListeners();
    }

    function renderBasePromptEditor() {
        const currentBasePrompt = basePrompts['base'] || '';

        return `
            <h2><i class="fas fa-cog"></i> Grundprompt</h2>
            <p class="editor-subtitle">Denna prompt används som bas för ALL AI-bearbetning av nyheter</p>

            <form id="basePromptForm">
                <div class="input-group">
                    <label>Grundprompt (gäller alla kategorier)</label>
                    <textarea id="basePromptInput" rows="20"
                        placeholder="Skriv grundinstruktioner för AI:n...">${escapeHtml(currentBasePrompt)}</textarea>
                    <p class="input-help">
                        <strong>Viktigt:</strong> Denna prompt körs för ALLA artiklar. Kategori-specifika tillägg läggs till efter denna.
                        <br>Här definierar du grundläggande regler för översättning, sammanfattning, ton och struktur.
                    </p>
                </div>

                <div class="prompt-actions">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-save"></i> Spara grundprompt
                    </button>
                </div>
            </form>

            <div class="base-prompt-info" style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                <h4 style="margin-bottom: 10px;"><i class="fas fa-info-circle"></i> Hur prompterna fungerar</h4>
                <p style="font-size: 0.9em; color: var(--text-secondary); line-height: 1.6;">
                    1. <strong>Grundprompt</strong> (denna) - Körs först för alla artiklar<br>
                    2. <strong>Kategori-tillägg</strong> - Läggs till baserat på artikelns kategori och språk
                </p>
            </div>
        `;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderPromptEditor() {
        const overlay = getOverlay(selectedCategory, selectedLanguage);
        const langName = languageNames[selectedLanguage];

        return `
            <h2>Översättning: ${categoryNames[selectedCategory]}</h2>
            <p class="editor-subtitle">Kategori-specifika instruktioner för översättning till ${langName}</p>

            <form id="promptForm">
                <div class="input-group">
                    <label>Översättningsinstruktioner (${langName})</label>
                    <textarea id="stylePromptInput" rows="10"
                        placeholder="T.ex: Använd formellt språk. Förklara facktermer. Inkludera geografisk kontext...">${overlay?.stylePrompt || ''}</textarea>
                    <p class="input-help">
                        <strong>OBS:</strong> Grunddata finns på engelska i databasen. Dessa instruktioner styr hur AI:n översätter
                        ${categoryNames[selectedCategory].toLowerCase()}-nyheter till ${langName.toLowerCase()}.
                        <br>Exempel: ton, terminologi, hur mycket kontext som ska läggas till.
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
                showBasePromptEditor = false;
                renderPromptsView();
            });
        });

        // Category list - handle both base prompt and category clicks
        document.querySelectorAll('.category-list li').forEach(li => {
            li.addEventListener('click', () => {
                if (li.dataset.base === 'true') {
                    // Clicked on "Grundinställningar"
                    showBasePromptEditor = true;
                } else if (li.dataset.category) {
                    // Clicked on a category
                    showBasePromptEditor = false;
                    selectedCategory = li.dataset.category;
                }
                renderPromptsView();
            });
        });

        // Style overlay form submit
        const form = document.getElementById('promptForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await savePrompt();
            });
        }

        // Base prompt form submit
        const baseForm = document.getElementById('basePromptForm');
        if (baseForm) {
            baseForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await saveBasePrompt();
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

    async function saveBasePrompt() {
        const prompt = document.getElementById('basePromptInput').value.trim();

        if (!prompt) {
            alert('Grundprompt kan inte vara tom');
            return;
        }

        try {
            const btn = document.querySelector('#basePromptForm button[type="submit"]');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...';
            }

            await apiFetch('/api/admin/prompts', {
                method: 'POST',
                body: JSON.stringify({
                    category: 'base',
                    prompt
                })
            });

            // Update local cache
            basePrompts['base'] = prompt;

            alert('Grundprompt sparad!');
            renderPromptsView();
        } catch (err) {
            alert('Fel vid sparning: ' + err.message);
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
            const btn = document.querySelector('#promptForm button[type="submit"]');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...';
            }

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
