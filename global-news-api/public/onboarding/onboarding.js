/**
 * Global News Onboarding Flow
 * Handles user registration, category selection, and country preferences
 */

class OnboardingFlow {
  constructor() {
    this.currentStep = 1;
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;

    this.selectedCategories = [];
    this.selectedCountries = [];
    this.homeCountry = null;

    this.categories = [];
    this.continents = [];
    this.countries = [];
    this.currentContinent = 'europe';

    // Category icons (using emoji as fallback)
    this.categoryIcons = {
      world: '🌍',
      politics: '🏛️',
      sports: '⚽',
      tech: '💻',
      business: '📈',
      science: '🔬',
      local: '📍',
      culture: '🎭'
    };

    this.init();
  }

  async init() {
    // Check if user is already logged in
    const savedToken = localStorage.getItem('accessToken');
    if (savedToken) {
      try {
        const response = await this.apiCall('/api/auth/me', 'GET');
        if (response.data) {
          this.user = response.data;
          this.accessToken = savedToken;
          if (this.user.onboardingCompleted) {
            window.location.href = '/';
            return;
          }
          this.goToStep(2);
        }
      } catch (e) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      }
    }

    await this.loadCategories();
    await this.loadGeography();
    this.bindEvents();
    this.renderCategories();
    this.renderContinentTabs();
    this.renderCountries();
  }

  // ============================================
  // API CALLS
  // ============================================

  async apiCall(endpoint, method = 'GET', body = null) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(endpoint, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Request failed');
    }

    return data;
  }

  async loadCategories() {
    try {
      const response = await this.apiCall('/api/categories?lang=sv');
      this.categories = response.data.categories;
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }

  async loadGeography() {
    try {
      const [continentsRes, countriesRes] = await Promise.all([
        this.apiCall('/api/geography/continents?lang=sv'),
        this.apiCall('/api/geography/countries?lang=sv&limit=200')
      ]);
      this.continents = continentsRes.data.continents;
      this.countries = countriesRes.data.countries;
    } catch (error) {
      console.error('Failed to load geography:', error);
    }
  }

  // ============================================
  // EVENT BINDING
  // ============================================

  bindEvents() {
    // Auth buttons
    document.getElementById('appleSignIn').addEventListener('click', () => this.handleAppleSignIn());
    document.getElementById('googleSignIn').addEventListener('click', () => this.handleGoogleSignIn());
    document.getElementById('emailForm').addEventListener('submit', (e) => this.handleEmailAuth(e));

    // Navigation
    document.getElementById('backToAuth').addEventListener('click', () => this.goToStep(1));
    document.getElementById('toCountries').addEventListener('click', () => this.goToStep(3));
    document.getElementById('backToCategories').addEventListener('click', () => this.goToStep(2));
    document.getElementById('toConfirm').addEventListener('click', () => this.handleSavePreferences());
    document.getElementById('startReading').addEventListener('click', () => this.handleComplete());

    // Home country search
    const homeSearch = document.getElementById('homeCountrySearch');
    homeSearch.addEventListener('input', (e) => this.handleHomeCountrySearch(e.target.value));
    homeSearch.addEventListener('focus', () => this.showHomeCountryResults());
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.home-country-section')) {
        document.getElementById('homeCountryResults').classList.add('hidden');
      }
    });

    // Country search
    document.getElementById('countrySearch').addEventListener('input', (e) => this.filterCountries(e.target.value));
  }

  // ============================================
  // AUTHENTICATION
  // ============================================

  async handleAppleSignIn() {
    // In production, use Apple Sign-In JS SDK
    // For demo, show a message
    alert('Apple Sign-In kräver konfiguration i produktion. Använd e-post för att testa.');
  }

  async handleGoogleSignIn() {
    // In production, use Google Sign-In JS SDK
    // For demo, show a message
    alert('Google Sign-In kräver konfiguration i produktion. Använd e-post för att testa.');
  }

  async handleEmailAuth(e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('authError');

    errorEl.classList.add('hidden');

    try {
      // Try login first
      let response;
      try {
        response = await this.apiCall('/api/auth/login', 'POST', { email, password });
      } catch (loginError) {
        // If login fails, try register
        response = await this.apiCall('/api/auth/register', 'POST', { email, password });
      }

      this.accessToken = response.data.accessToken;
      this.refreshToken = response.data.refreshToken;
      this.user = response.data.user;

      localStorage.setItem('accessToken', this.accessToken);
      localStorage.setItem('refreshToken', this.refreshToken);

      if (this.user.onboardingCompleted) {
        window.location.href = '/';
      } else {
        this.goToStep(2);
      }
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove('hidden');
    }
  }

  // ============================================
  // STEP NAVIGATION
  // ============================================

  goToStep(step) {
    this.currentStep = step;

    // Update progress bar
    document.querySelectorAll('.progress-step').forEach((el, index) => {
      el.classList.remove('active', 'completed');
      if (index + 1 < step) {
        el.classList.add('completed');
      } else if (index + 1 === step) {
        el.classList.add('active');
      }
    });

    // Show correct step
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    document.getElementById(`step-${['auth', 'categories', 'countries', 'confirm'][step - 1]}`).classList.add('active');

    // Update summary if on confirm step
    if (step === 4) {
      this.renderSummary();
    }
  }

  // ============================================
  // CATEGORY SELECTION
  // ============================================

  renderCategories() {
    const grid = document.getElementById('categoryGrid');
    grid.innerHTML = this.categories.map(cat => `
      <div class="category-card" data-code="${cat.code}">
        <div class="category-icon" style="background: ${cat.color}20; color: ${cat.color}">
          ${this.categoryIcons[cat.code] || '📰'}
        </div>
        <h3>${cat.name}</h3>
        <p>${cat.description}</p>
      </div>
    `).join('');

    // Bind click events
    grid.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', () => this.toggleCategory(card.dataset.code));
    });
  }

  toggleCategory(code) {
    const index = this.selectedCategories.indexOf(code);
    if (index > -1) {
      this.selectedCategories.splice(index, 1);
    } else {
      this.selectedCategories.push(code);
    }

    // Update UI
    document.querySelectorAll('.category-card').forEach(card => {
      card.classList.toggle('selected', this.selectedCategories.includes(card.dataset.code));
    });

    document.getElementById('categoryCount').textContent = this.selectedCategories.length;
    document.getElementById('toCountries').disabled = this.selectedCategories.length < 3;
  }

  // ============================================
  // COUNTRY SELECTION
  // ============================================

  renderContinentTabs() {
    const tabs = document.getElementById('continentTabs');
    tabs.innerHTML = this.continents.map(cont => `
      <button class="continent-tab ${cont.code === this.currentContinent ? 'active' : ''}" data-code="${cont.code}">
        ${cont.name}
      </button>
    `).join('');

    tabs.querySelectorAll('.continent-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.currentContinent = tab.dataset.code;
        document.querySelectorAll('.continent-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.renderCountries();
      });
    });
  }

  renderCountries(filter = '') {
    const list = document.getElementById('countryList');
    const filtered = this.countries
      .filter(c => c.continent === this.currentContinent)
      .filter(c => filter === '' || c.name.toLowerCase().includes(filter.toLowerCase()));

    list.innerHTML = filtered.map(country => `
      <div class="country-item ${this.selectedCountries.includes(country.iso) ? 'selected' : ''}" data-iso="${country.iso}">
        <span class="flag">${country.flag}</span>
        <span>${country.name}</span>
      </div>
    `).join('');

    list.querySelectorAll('.country-item').forEach(item => {
      item.addEventListener('click', () => this.toggleCountry(item.dataset.iso));
    });
  }

  filterCountries(query) {
    this.renderCountries(query);
  }

  toggleCountry(iso) {
    const index = this.selectedCountries.indexOf(iso);
    if (index > -1) {
      this.selectedCountries.splice(index, 1);
    } else {
      this.selectedCountries.push(iso);
    }

    this.renderCountries(document.getElementById('countrySearch').value);
    this.renderSelectedCountries();
  }

  renderSelectedCountries() {
    const container = document.getElementById('selectedCountries');
    container.innerHTML = this.selectedCountries
      .filter(iso => iso !== this.homeCountry)
      .map(iso => {
        const country = this.countries.find(c => c.iso === iso);
        return `
          <div class="selected-tag" data-iso="${iso}">
            <span class="flag">${country?.flag || ''}</span>
            <span>${country?.name || iso}</span>
            <span class="remove" onclick="onboarding.removeCountry('${iso}')">✕</span>
          </div>
        `;
      }).join('');
  }

  removeCountry(iso) {
    this.selectedCountries = this.selectedCountries.filter(c => c !== iso);
    this.renderCountries(document.getElementById('countrySearch').value);
    this.renderSelectedCountries();
  }

  // Home country
  handleHomeCountrySearch(query) {
    const results = document.getElementById('homeCountryResults');
    if (query.length < 1) {
      results.classList.add('hidden');
      return;
    }

    const filtered = this.countries
      .filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 5);

    results.innerHTML = filtered.map(country => `
      <div class="search-result-item" data-iso="${country.iso}">
        <span class="flag">${country.flag}</span>
        <span>${country.name}</span>
      </div>
    `).join('');

    results.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => this.selectHomeCountry(item.dataset.iso));
    });

    results.classList.remove('hidden');
  }

  showHomeCountryResults() {
    const query = document.getElementById('homeCountrySearch').value;
    if (query.length > 0) {
      this.handleHomeCountrySearch(query);
    }
  }

  selectHomeCountry(iso) {
    this.homeCountry = iso;
    const country = this.countries.find(c => c.iso === iso);

    document.getElementById('homeCountrySearch').value = '';
    document.getElementById('homeCountryResults').classList.add('hidden');

    const container = document.getElementById('selectedHomeCountry');
    container.innerHTML = `
      <div class="selected-tag">
        <span class="flag">${country?.flag || ''}</span>
        <span>${country?.name || iso}</span>
        <span class="remove" onclick="onboarding.clearHomeCountry()">✕</span>
      </div>
    `;

    // Also add to selected countries
    if (!this.selectedCountries.includes(iso)) {
      this.selectedCountries.push(iso);
      this.renderSelectedCountries();
    }
  }

  clearHomeCountry() {
    if (this.homeCountry) {
      this.selectedCountries = this.selectedCountries.filter(c => c !== this.homeCountry);
      this.homeCountry = null;
      document.getElementById('selectedHomeCountry').innerHTML = '';
      this.renderCountries(document.getElementById('countrySearch').value);
      this.renderSelectedCountries();
    }
  }

  // ============================================
  // SAVE PREFERENCES
  // ============================================

  async handleSavePreferences() {
    try {
      await this.apiCall('/api/user/preferences', 'PUT', {
        categories: this.selectedCategories,
        countries: this.selectedCountries,
        homeCountry: this.homeCountry
      });

      this.goToStep(4);
    } catch (error) {
      alert('Kunde inte spara preferenser: ' + error.message);
    }
  }

  renderSummary() {
    // Categories
    const catContainer = document.getElementById('summaryCategories');
    catContainer.innerHTML = this.selectedCategories.map(code => {
      const cat = this.categories.find(c => c.code === code);
      return `
        <span class="summary-tag">
          ${this.categoryIcons[code] || '📰'} ${cat?.name || code}
        </span>
      `;
    }).join('');

    // Countries
    const countryContainer = document.getElementById('summaryCountries');
    countryContainer.innerHTML = this.selectedCountries.map(iso => {
      const country = this.countries.find(c => c.iso === iso);
      const isHome = iso === this.homeCountry;
      return `
        <span class="summary-tag">
          ${country?.flag || ''} ${country?.name || iso}${isHome ? ' (Hemland)' : ''}
        </span>
      `;
    }).join('');
  }

  async handleComplete() {
    try {
      await this.apiCall('/api/user/onboarding/complete', 'POST');
      window.location.href = '/';
    } catch (error) {
      alert('Kunde inte slutföra: ' + error.message);
    }
  }
}

// Initialize
const onboarding = new OnboardingFlow();
