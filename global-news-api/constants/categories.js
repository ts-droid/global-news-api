/**
 * News Categories Configuration
 * Hierarchical category system with main categories and subcategories
 */

const CATEGORIES = {
  world: {
    code: 'world',
    nameSv: 'Världen',
    nameEn: 'World',
    descriptionSv: 'Internationella nyheter, geopolitik, diplomati',
    descriptionEn: 'International news, geopolitics, diplomacy',
    icon: 'globe',
    color: '#3B82F6', // Blue
    sortOrder: 1,
    subcategories: [
      { code: 'geopolitics', nameSv: 'Geopolitik', nameEn: 'Geopolitics' },
      { code: 'diplomacy', nameSv: 'Diplomati', nameEn: 'Diplomacy' },
      { code: 'conflicts', nameSv: 'Konflikter', nameEn: 'Conflicts' },
      { code: 'humanitarian', nameSv: 'Humanitärt', nameEn: 'Humanitarian' },
      { code: 'un-organizations', nameSv: 'FN & organisationer', nameEn: 'UN & Organizations' }
    ]
  },
  politics: {
    code: 'politics',
    nameSv: 'Politik',
    nameEn: 'Politics',
    descriptionSv: 'Politik, val, regering, lagar',
    descriptionEn: 'Politics, elections, government, laws',
    icon: 'landmark',
    color: '#8B5CF6', // Purple
    sortOrder: 2,
    subcategories: [
      { code: 'elections', nameSv: 'Val', nameEn: 'Elections' },
      { code: 'government', nameSv: 'Regering', nameEn: 'Government' },
      { code: 'legislation', nameSv: 'Lagstiftning', nameEn: 'Legislation' },
      { code: 'parties', nameSv: 'Partier', nameEn: 'Parties' },
      { code: 'policy', nameSv: 'Policy', nameEn: 'Policy' }
    ]
  },
  sports: {
    code: 'sports',
    nameSv: 'Sport',
    nameEn: 'Sports',
    descriptionSv: 'Sport, tävlingar, matcher',
    descriptionEn: 'Sports, competitions, matches',
    icon: 'trophy',
    color: '#10B981', // Green
    sortOrder: 3,
    subcategories: [
      { code: 'football', nameSv: 'Fotboll', nameEn: 'Football' },
      { code: 'hockey', nameSv: 'Ishockey', nameEn: 'Hockey' },
      { code: 'tennis', nameSv: 'Tennis', nameEn: 'Tennis' },
      { code: 'basketball', nameSv: 'Basket', nameEn: 'Basketball' },
      { code: 'olympics', nameSv: 'OS', nameEn: 'Olympics' },
      { code: 'motorsport', nameSv: 'Motorsport', nameEn: 'Motorsport' },
      { code: 'esports', nameSv: 'E-sport', nameEn: 'Esports' },
      { code: 'golf', nameSv: 'Golf', nameEn: 'Golf' }
    ]
  },
  tech: {
    code: 'tech',
    nameSv: 'Teknik',
    nameEn: 'Tech',
    descriptionSv: 'Teknik, IT, AI, internet, prylar',
    descriptionEn: 'Technology, IT, AI, internet, gadgets',
    icon: 'cpu',
    color: '#F59E0B', // Amber
    sortOrder: 4,
    subcategories: [
      { code: 'ai', nameSv: 'AI & maskininlärning', nameEn: 'AI & Machine Learning' },
      { code: 'gadgets', nameSv: 'Prylar', nameEn: 'Gadgets' },
      { code: 'software', nameSv: 'Mjukvara', nameEn: 'Software' },
      { code: 'apps', nameSv: 'Appar', nameEn: 'Apps' },
      { code: 'cybersecurity', nameSv: 'Cybersäkerhet', nameEn: 'Cybersecurity' },
      { code: 'gaming', nameSv: 'Spel', nameEn: 'Gaming' },
      { code: 'social-media', nameSv: 'Sociala medier', nameEn: 'Social Media' }
    ]
  },
  business: {
    code: 'business',
    nameSv: 'Ekonomi',
    nameEn: 'Business',
    descriptionSv: 'Ekonomi, finans, företag, börs',
    descriptionEn: 'Economy, finance, companies, stock market',
    icon: 'chart-line',
    color: '#EF4444', // Red
    sortOrder: 5,
    subcategories: [
      { code: 'markets', nameSv: 'Börsen', nameEn: 'Markets' },
      { code: 'companies', nameSv: 'Företag', nameEn: 'Companies' },
      { code: 'startups', nameSv: 'Startups', nameEn: 'Startups' },
      { code: 'crypto', nameSv: 'Krypto', nameEn: 'Crypto' },
      { code: 'real-estate', nameSv: 'Fastigheter', nameEn: 'Real Estate' },
      { code: 'banking', nameSv: 'Bank & finans', nameEn: 'Banking & Finance' }
    ]
  },
  science: {
    code: 'science',
    nameSv: 'Vetenskap',
    nameEn: 'Science',
    descriptionSv: 'Forskning, medicin, rymd, akademi',
    descriptionEn: 'Research, medicine, space, academia',
    icon: 'flask',
    color: '#06B6D4', // Cyan
    sortOrder: 6,
    subcategories: [
      { code: 'medicine', nameSv: 'Medicin & hälsa', nameEn: 'Medicine & Health' },
      { code: 'space', nameSv: 'Rymd', nameEn: 'Space' },
      { code: 'climate', nameSv: 'Klimat & miljö', nameEn: 'Climate & Environment' },
      { code: 'research', nameSv: 'Forskning', nameEn: 'Research' },
      { code: 'nature', nameSv: 'Natur', nameEn: 'Nature' },
      { code: 'archaeology', nameSv: 'Arkeologi', nameEn: 'Archaeology' }
    ]
  },
  local: {
    code: 'local',
    nameSv: 'Lokalt',
    nameEn: 'Local',
    descriptionSv: 'Lokala nyheter baserat på din plats',
    descriptionEn: 'Local news based on your location',
    icon: 'map-pin',
    color: '#EC4899', // Pink
    sortOrder: 7,
    subcategories: [
      // Dynamiskt baserat på användarens land
      { code: 'local-news', nameSv: 'Lokala nyheter', nameEn: 'Local News' },
      { code: 'community', nameSv: 'Samhälle', nameEn: 'Community' },
      { code: 'traffic', nameSv: 'Trafik', nameEn: 'Traffic' },
      { code: 'weather', nameSv: 'Väder', nameEn: 'Weather' }
    ]
  },
  culture: {
    code: 'culture',
    nameSv: 'Kultur',
    nameEn: 'Culture',
    descriptionSv: 'Kultur, musik, film, konst, underhållning',
    descriptionEn: 'Culture, music, film, art, entertainment',
    icon: 'theater-masks',
    color: '#F97316', // Orange
    sortOrder: 8,
    subcategories: [
      { code: 'music', nameSv: 'Musik', nameEn: 'Music' },
      { code: 'film-tv', nameSv: 'Film & TV', nameEn: 'Film & TV' },
      { code: 'art', nameSv: 'Konst', nameEn: 'Art' },
      { code: 'books', nameSv: 'Böcker', nameEn: 'Books' },
      { code: 'theater', nameSv: 'Teater', nameEn: 'Theater' },
      { code: 'celebrities', nameSv: 'Kändisar', nameEn: 'Celebrities' },
      { code: 'food', nameSv: 'Mat & dryck', nameEn: 'Food & Drink' }
    ]
  }
};

/**
 * Get all categories as an array (sorted by sortOrder)
 */
function getCategoriesArray(lang = 'sv') {
  return Object.values(CATEGORIES)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(cat => ({
      code: cat.code,
      name: lang === 'sv' ? cat.nameSv : cat.nameEn,
      description: lang === 'sv' ? cat.descriptionSv : cat.descriptionEn,
      icon: cat.icon,
      color: cat.color,
      subcategories: cat.subcategories.map(sub => ({
        code: sub.code,
        name: lang === 'sv' ? sub.nameSv : sub.nameEn
      }))
    }));
}

/**
 * Get a single category by code
 */
function getCategory(code, lang = 'sv') {
  const cat = CATEGORIES[code];
  if (!cat) return null;

  return {
    code: cat.code,
    name: lang === 'sv' ? cat.nameSv : cat.nameEn,
    description: lang === 'sv' ? cat.descriptionSv : cat.descriptionEn,
    icon: cat.icon,
    color: cat.color,
    subcategories: cat.subcategories.map(sub => ({
      code: sub.code,
      name: lang === 'sv' ? sub.nameSv : sub.nameEn
    }))
  };
}

/**
 * Get all subcategories for a category
 */
function getSubcategories(categoryCode, lang = 'sv') {
  const cat = CATEGORIES[categoryCode];
  if (!cat) return [];

  return cat.subcategories.map(sub => ({
    code: sub.code,
    name: lang === 'sv' ? sub.nameSv : sub.nameEn,
    categoryCode: categoryCode
  }));
}

/**
 * Validate if a category code exists
 */
function isValidCategory(code) {
  return code in CATEGORIES;
}

/**
 * Validate if a subcategory code exists within a category
 */
function isValidSubcategory(categoryCode, subcategoryCode) {
  const cat = CATEGORIES[categoryCode];
  if (!cat) return false;
  return cat.subcategories.some(sub => sub.code === subcategoryCode);
}

/**
 * Map old category codes to new ones (for migration)
 */
const CATEGORY_MIGRATION_MAP = {
  'swedish': 'local',
  'international': 'world',
  'tech': 'tech'
};

module.exports = {
  CATEGORIES,
  CATEGORY_MIGRATION_MAP,
  getCategoriesArray,
  getCategory,
  getSubcategories,
  isValidCategory,
  isValidSubcategory
};
