/**
 * Geography Configuration
 * Continents and countries with ISO codes, names in Swedish/English, and flag emojis
 */

const CONTINENTS = [
  { code: 'europe', nameSv: 'Europa', nameEn: 'Europe', sortOrder: 1 },
  { code: 'asia', nameSv: 'Asien', nameEn: 'Asia', sortOrder: 2 },
  { code: 'north-america', nameSv: 'Nordamerika', nameEn: 'North America', sortOrder: 3 },
  { code: 'south-america', nameSv: 'Sydamerika', nameEn: 'South America', sortOrder: 4 },
  { code: 'africa', nameSv: 'Afrika', nameEn: 'Africa', sortOrder: 5 },
  { code: 'oceania', nameSv: 'Oceanien', nameEn: 'Oceania', sortOrder: 6 },
  { code: 'middle-east', nameSv: 'Mellanöstern', nameEn: 'Middle East', sortOrder: 7 }
];

const COUNTRIES = [
  // EUROPE
  { iso: 'SE', nameSv: 'Sverige', nameEn: 'Sweden', continent: 'europe', flag: '🇸🇪' },
  { iso: 'NO', nameSv: 'Norge', nameEn: 'Norway', continent: 'europe', flag: '🇳🇴' },
  { iso: 'DK', nameSv: 'Danmark', nameEn: 'Denmark', continent: 'europe', flag: '🇩🇰' },
  { iso: 'FI', nameSv: 'Finland', nameEn: 'Finland', continent: 'europe', flag: '🇫🇮' },
  { iso: 'IS', nameSv: 'Island', nameEn: 'Iceland', continent: 'europe', flag: '🇮🇸' },
  { iso: 'DE', nameSv: 'Tyskland', nameEn: 'Germany', continent: 'europe', flag: '🇩🇪' },
  { iso: 'GB', nameSv: 'Storbritannien', nameEn: 'United Kingdom', continent: 'europe', flag: '🇬🇧' },
  { iso: 'FR', nameSv: 'Frankrike', nameEn: 'France', continent: 'europe', flag: '🇫🇷' },
  { iso: 'ES', nameSv: 'Spanien', nameEn: 'Spain', continent: 'europe', flag: '🇪🇸' },
  { iso: 'IT', nameSv: 'Italien', nameEn: 'Italy', continent: 'europe', flag: '🇮🇹' },
  { iso: 'PT', nameSv: 'Portugal', nameEn: 'Portugal', continent: 'europe', flag: '🇵🇹' },
  { iso: 'NL', nameSv: 'Nederländerna', nameEn: 'Netherlands', continent: 'europe', flag: '🇳🇱' },
  { iso: 'BE', nameSv: 'Belgien', nameEn: 'Belgium', continent: 'europe', flag: '🇧🇪' },
  { iso: 'AT', nameSv: 'Österrike', nameEn: 'Austria', continent: 'europe', flag: '🇦🇹' },
  { iso: 'CH', nameSv: 'Schweiz', nameEn: 'Switzerland', continent: 'europe', flag: '🇨🇭' },
  { iso: 'PL', nameSv: 'Polen', nameEn: 'Poland', continent: 'europe', flag: '🇵🇱' },
  { iso: 'CZ', nameSv: 'Tjeckien', nameEn: 'Czech Republic', continent: 'europe', flag: '🇨🇿' },
  { iso: 'HU', nameSv: 'Ungern', nameEn: 'Hungary', continent: 'europe', flag: '🇭🇺' },
  { iso: 'RO', nameSv: 'Rumänien', nameEn: 'Romania', continent: 'europe', flag: '🇷🇴' },
  { iso: 'BG', nameSv: 'Bulgarien', nameEn: 'Bulgaria', continent: 'europe', flag: '🇧🇬' },
  { iso: 'GR', nameSv: 'Grekland', nameEn: 'Greece', continent: 'europe', flag: '🇬🇷' },
  { iso: 'HR', nameSv: 'Kroatien', nameEn: 'Croatia', continent: 'europe', flag: '🇭🇷' },
  { iso: 'RS', nameSv: 'Serbien', nameEn: 'Serbia', continent: 'europe', flag: '🇷🇸' },
  { iso: 'UA', nameSv: 'Ukraina', nameEn: 'Ukraine', continent: 'europe', flag: '🇺🇦' },
  { iso: 'RU', nameSv: 'Ryssland', nameEn: 'Russia', continent: 'europe', flag: '🇷🇺' },
  { iso: 'BY', nameSv: 'Belarus', nameEn: 'Belarus', continent: 'europe', flag: '🇧🇾' },
  { iso: 'LT', nameSv: 'Litauen', nameEn: 'Lithuania', continent: 'europe', flag: '🇱🇹' },
  { iso: 'LV', nameSv: 'Lettland', nameEn: 'Latvia', continent: 'europe', flag: '🇱🇻' },
  { iso: 'EE', nameSv: 'Estland', nameEn: 'Estonia', continent: 'europe', flag: '🇪🇪' },
  { iso: 'IE', nameSv: 'Irland', nameEn: 'Ireland', continent: 'europe', flag: '🇮🇪' },
  { iso: 'SK', nameSv: 'Slovakien', nameEn: 'Slovakia', continent: 'europe', flag: '🇸🇰' },
  { iso: 'SI', nameSv: 'Slovenien', nameEn: 'Slovenia', continent: 'europe', flag: '🇸🇮' },
  { iso: 'LU', nameSv: 'Luxemburg', nameEn: 'Luxembourg', continent: 'europe', flag: '🇱🇺' },
  { iso: 'MT', nameSv: 'Malta', nameEn: 'Malta', continent: 'europe', flag: '🇲🇹' },
  { iso: 'CY', nameSv: 'Cypern', nameEn: 'Cyprus', continent: 'europe', flag: '🇨🇾' },
  { iso: 'AL', nameSv: 'Albanien', nameEn: 'Albania', continent: 'europe', flag: '🇦🇱' },
  { iso: 'MK', nameSv: 'Nordmakedonien', nameEn: 'North Macedonia', continent: 'europe', flag: '🇲🇰' },
  { iso: 'BA', nameSv: 'Bosnien och Hercegovina', nameEn: 'Bosnia and Herzegovina', continent: 'europe', flag: '🇧🇦' },
  { iso: 'ME', nameSv: 'Montenegro', nameEn: 'Montenegro', continent: 'europe', flag: '🇲🇪' },
  { iso: 'XK', nameSv: 'Kosovo', nameEn: 'Kosovo', continent: 'europe', flag: '🇽🇰' },
  { iso: 'MD', nameSv: 'Moldavien', nameEn: 'Moldova', continent: 'europe', flag: '🇲🇩' },

  // ASIA
  { iso: 'JP', nameSv: 'Japan', nameEn: 'Japan', continent: 'asia', flag: '🇯🇵' },
  { iso: 'CN', nameSv: 'Kina', nameEn: 'China', continent: 'asia', flag: '🇨🇳' },
  { iso: 'KR', nameSv: 'Sydkorea', nameEn: 'South Korea', continent: 'asia', flag: '🇰🇷' },
  { iso: 'KP', nameSv: 'Nordkorea', nameEn: 'North Korea', continent: 'asia', flag: '🇰🇵' },
  { iso: 'IN', nameSv: 'Indien', nameEn: 'India', continent: 'asia', flag: '🇮🇳' },
  { iso: 'PK', nameSv: 'Pakistan', nameEn: 'Pakistan', continent: 'asia', flag: '🇵🇰' },
  { iso: 'BD', nameSv: 'Bangladesh', nameEn: 'Bangladesh', continent: 'asia', flag: '🇧🇩' },
  { iso: 'TH', nameSv: 'Thailand', nameEn: 'Thailand', continent: 'asia', flag: '🇹🇭' },
  { iso: 'VN', nameSv: 'Vietnam', nameEn: 'Vietnam', continent: 'asia', flag: '🇻🇳' },
  { iso: 'ID', nameSv: 'Indonesien', nameEn: 'Indonesia', continent: 'asia', flag: '🇮🇩' },
  { iso: 'MY', nameSv: 'Malaysia', nameEn: 'Malaysia', continent: 'asia', flag: '🇲🇾' },
  { iso: 'SG', nameSv: 'Singapore', nameEn: 'Singapore', continent: 'asia', flag: '🇸🇬' },
  { iso: 'PH', nameSv: 'Filippinerna', nameEn: 'Philippines', continent: 'asia', flag: '🇵🇭' },
  { iso: 'MM', nameSv: 'Myanmar', nameEn: 'Myanmar', continent: 'asia', flag: '🇲🇲' },
  { iso: 'KH', nameSv: 'Kambodja', nameEn: 'Cambodia', continent: 'asia', flag: '🇰🇭' },
  { iso: 'LA', nameSv: 'Laos', nameEn: 'Laos', continent: 'asia', flag: '🇱🇦' },
  { iso: 'NP', nameSv: 'Nepal', nameEn: 'Nepal', continent: 'asia', flag: '🇳🇵' },
  { iso: 'LK', nameSv: 'Sri Lanka', nameEn: 'Sri Lanka', continent: 'asia', flag: '🇱🇰' },
  { iso: 'TW', nameSv: 'Taiwan', nameEn: 'Taiwan', continent: 'asia', flag: '🇹🇼' },
  { iso: 'HK', nameSv: 'Hongkong', nameEn: 'Hong Kong', continent: 'asia', flag: '🇭🇰' },
  { iso: 'MN', nameSv: 'Mongoliet', nameEn: 'Mongolia', continent: 'asia', flag: '🇲🇳' },
  { iso: 'KZ', nameSv: 'Kazakstan', nameEn: 'Kazakhstan', continent: 'asia', flag: '🇰🇿' },
  { iso: 'UZ', nameSv: 'Uzbekistan', nameEn: 'Uzbekistan', continent: 'asia', flag: '🇺🇿' },
  { iso: 'AF', nameSv: 'Afghanistan', nameEn: 'Afghanistan', continent: 'asia', flag: '🇦🇫' },

  // NORTH AMERICA
  { iso: 'US', nameSv: 'USA', nameEn: 'United States', continent: 'north-america', flag: '🇺🇸' },
  { iso: 'CA', nameSv: 'Kanada', nameEn: 'Canada', continent: 'north-america', flag: '🇨🇦' },
  { iso: 'MX', nameSv: 'Mexiko', nameEn: 'Mexico', continent: 'north-america', flag: '🇲🇽' },
  { iso: 'GT', nameSv: 'Guatemala', nameEn: 'Guatemala', continent: 'north-america', flag: '🇬🇹' },
  { iso: 'HN', nameSv: 'Honduras', nameEn: 'Honduras', continent: 'north-america', flag: '🇭🇳' },
  { iso: 'SV', nameSv: 'El Salvador', nameEn: 'El Salvador', continent: 'north-america', flag: '🇸🇻' },
  { iso: 'NI', nameSv: 'Nicaragua', nameEn: 'Nicaragua', continent: 'north-america', flag: '🇳🇮' },
  { iso: 'CR', nameSv: 'Costa Rica', nameEn: 'Costa Rica', continent: 'north-america', flag: '🇨🇷' },
  { iso: 'PA', nameSv: 'Panama', nameEn: 'Panama', continent: 'north-america', flag: '🇵🇦' },
  { iso: 'CU', nameSv: 'Kuba', nameEn: 'Cuba', continent: 'north-america', flag: '🇨🇺' },
  { iso: 'JM', nameSv: 'Jamaica', nameEn: 'Jamaica', continent: 'north-america', flag: '🇯🇲' },
  { iso: 'HT', nameSv: 'Haiti', nameEn: 'Haiti', continent: 'north-america', flag: '🇭🇹' },
  { iso: 'DO', nameSv: 'Dominikanska republiken', nameEn: 'Dominican Republic', continent: 'north-america', flag: '🇩🇴' },
  { iso: 'PR', nameSv: 'Puerto Rico', nameEn: 'Puerto Rico', continent: 'north-america', flag: '🇵🇷' },

  // SOUTH AMERICA
  { iso: 'BR', nameSv: 'Brasilien', nameEn: 'Brazil', continent: 'south-america', flag: '🇧🇷' },
  { iso: 'AR', nameSv: 'Argentina', nameEn: 'Argentina', continent: 'south-america', flag: '🇦🇷' },
  { iso: 'CL', nameSv: 'Chile', nameEn: 'Chile', continent: 'south-america', flag: '🇨🇱' },
  { iso: 'CO', nameSv: 'Colombia', nameEn: 'Colombia', continent: 'south-america', flag: '🇨🇴' },
  { iso: 'PE', nameSv: 'Peru', nameEn: 'Peru', continent: 'south-america', flag: '🇵🇪' },
  { iso: 'VE', nameSv: 'Venezuela', nameEn: 'Venezuela', continent: 'south-america', flag: '🇻🇪' },
  { iso: 'EC', nameSv: 'Ecuador', nameEn: 'Ecuador', continent: 'south-america', flag: '🇪🇨' },
  { iso: 'BO', nameSv: 'Bolivia', nameEn: 'Bolivia', continent: 'south-america', flag: '🇧🇴' },
  { iso: 'PY', nameSv: 'Paraguay', nameEn: 'Paraguay', continent: 'south-america', flag: '🇵🇾' },
  { iso: 'UY', nameSv: 'Uruguay', nameEn: 'Uruguay', continent: 'south-america', flag: '🇺🇾' },
  { iso: 'GY', nameSv: 'Guyana', nameEn: 'Guyana', continent: 'south-america', flag: '🇬🇾' },
  { iso: 'SR', nameSv: 'Surinam', nameEn: 'Suriname', continent: 'south-america', flag: '🇸🇷' },

  // AFRICA
  { iso: 'ZA', nameSv: 'Sydafrika', nameEn: 'South Africa', continent: 'africa', flag: '🇿🇦' },
  { iso: 'EG', nameSv: 'Egypten', nameEn: 'Egypt', continent: 'africa', flag: '🇪🇬' },
  { iso: 'NG', nameSv: 'Nigeria', nameEn: 'Nigeria', continent: 'africa', flag: '🇳🇬' },
  { iso: 'KE', nameSv: 'Kenya', nameEn: 'Kenya', continent: 'africa', flag: '🇰🇪' },
  { iso: 'ET', nameSv: 'Etiopien', nameEn: 'Ethiopia', continent: 'africa', flag: '🇪🇹' },
  { iso: 'GH', nameSv: 'Ghana', nameEn: 'Ghana', continent: 'africa', flag: '🇬🇭' },
  { iso: 'TZ', nameSv: 'Tanzania', nameEn: 'Tanzania', continent: 'africa', flag: '🇹🇿' },
  { iso: 'MA', nameSv: 'Marocko', nameEn: 'Morocco', continent: 'africa', flag: '🇲🇦' },
  { iso: 'DZ', nameSv: 'Algeriet', nameEn: 'Algeria', continent: 'africa', flag: '🇩🇿' },
  { iso: 'TN', nameSv: 'Tunisien', nameEn: 'Tunisia', continent: 'africa', flag: '🇹🇳' },
  { iso: 'LY', nameSv: 'Libyen', nameEn: 'Libya', continent: 'africa', flag: '🇱🇾' },
  { iso: 'SD', nameSv: 'Sudan', nameEn: 'Sudan', continent: 'africa', flag: '🇸🇩' },
  { iso: 'UG', nameSv: 'Uganda', nameEn: 'Uganda', continent: 'africa', flag: '🇺🇬' },
  { iso: 'RW', nameSv: 'Rwanda', nameEn: 'Rwanda', continent: 'africa', flag: '🇷🇼' },
  { iso: 'SN', nameSv: 'Senegal', nameEn: 'Senegal', continent: 'africa', flag: '🇸🇳' },
  { iso: 'CI', nameSv: 'Elfenbenskusten', nameEn: 'Ivory Coast', continent: 'africa', flag: '🇨🇮' },
  { iso: 'CM', nameSv: 'Kamerun', nameEn: 'Cameroon', continent: 'africa', flag: '🇨🇲' },
  { iso: 'CD', nameSv: 'Demokratiska republiken Kongo', nameEn: 'DR Congo', continent: 'africa', flag: '🇨🇩' },
  { iso: 'AO', nameSv: 'Angola', nameEn: 'Angola', continent: 'africa', flag: '🇦🇴' },
  { iso: 'MZ', nameSv: 'Moçambique', nameEn: 'Mozambique', continent: 'africa', flag: '🇲🇿' },
  { iso: 'ZW', nameSv: 'Zimbabwe', nameEn: 'Zimbabwe', continent: 'africa', flag: '🇿🇼' },
  { iso: 'ZM', nameSv: 'Zambia', nameEn: 'Zambia', continent: 'africa', flag: '🇿🇲' },
  { iso: 'BW', nameSv: 'Botswana', nameEn: 'Botswana', continent: 'africa', flag: '🇧🇼' },
  { iso: 'NA', nameSv: 'Namibia', nameEn: 'Namibia', continent: 'africa', flag: '🇳🇦' },

  // OCEANIA
  { iso: 'AU', nameSv: 'Australien', nameEn: 'Australia', continent: 'oceania', flag: '🇦🇺' },
  { iso: 'NZ', nameSv: 'Nya Zeeland', nameEn: 'New Zealand', continent: 'oceania', flag: '🇳🇿' },
  { iso: 'FJ', nameSv: 'Fiji', nameEn: 'Fiji', continent: 'oceania', flag: '🇫🇯' },
  { iso: 'PG', nameSv: 'Papua Nya Guinea', nameEn: 'Papua New Guinea', continent: 'oceania', flag: '🇵🇬' },
  { iso: 'WS', nameSv: 'Samoa', nameEn: 'Samoa', continent: 'oceania', flag: '🇼🇸' },
  { iso: 'TO', nameSv: 'Tonga', nameEn: 'Tonga', continent: 'oceania', flag: '🇹🇴' },
  { iso: 'VU', nameSv: 'Vanuatu', nameEn: 'Vanuatu', continent: 'oceania', flag: '🇻🇺' },

  // MIDDLE EAST
  { iso: 'IL', nameSv: 'Israel', nameEn: 'Israel', continent: 'middle-east', flag: '🇮🇱' },
  { iso: 'PS', nameSv: 'Palestina', nameEn: 'Palestine', continent: 'middle-east', flag: '🇵🇸' },
  { iso: 'LB', nameSv: 'Libanon', nameEn: 'Lebanon', continent: 'middle-east', flag: '🇱🇧' },
  { iso: 'SY', nameSv: 'Syrien', nameEn: 'Syria', continent: 'middle-east', flag: '🇸🇾' },
  { iso: 'JO', nameSv: 'Jordanien', nameEn: 'Jordan', continent: 'middle-east', flag: '🇯🇴' },
  { iso: 'IQ', nameSv: 'Irak', nameEn: 'Iraq', continent: 'middle-east', flag: '🇮🇶' },
  { iso: 'IR', nameSv: 'Iran', nameEn: 'Iran', continent: 'middle-east', flag: '🇮🇷' },
  { iso: 'SA', nameSv: 'Saudiarabien', nameEn: 'Saudi Arabia', continent: 'middle-east', flag: '🇸🇦' },
  { iso: 'AE', nameSv: 'Förenade Arabemiraten', nameEn: 'United Arab Emirates', continent: 'middle-east', flag: '🇦🇪' },
  { iso: 'QA', nameSv: 'Qatar', nameEn: 'Qatar', continent: 'middle-east', flag: '🇶🇦' },
  { iso: 'KW', nameSv: 'Kuwait', nameEn: 'Kuwait', continent: 'middle-east', flag: '🇰🇼' },
  { iso: 'BH', nameSv: 'Bahrain', nameEn: 'Bahrain', continent: 'middle-east', flag: '🇧🇭' },
  { iso: 'OM', nameSv: 'Oman', nameEn: 'Oman', continent: 'middle-east', flag: '🇴🇲' },
  { iso: 'YE', nameSv: 'Jemen', nameEn: 'Yemen', continent: 'middle-east', flag: '🇾🇪' },
  { iso: 'TR', nameSv: 'Turkiet', nameEn: 'Turkey', continent: 'middle-east', flag: '🇹🇷' }
];

/**
 * Get all continents as an array (sorted)
 */
function getContinentsArray(lang = 'sv') {
  return CONTINENTS
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(cont => ({
      code: cont.code,
      name: lang === 'sv' ? cont.nameSv : cont.nameEn
    }));
}

/**
 * Get all countries, optionally filtered by continent or search query
 */
function getCountriesArray(options = {}) {
  const { lang = 'sv', continent = null, search = null, limit = 200 } = options;

  let filtered = COUNTRIES;

  // Filter by continent
  if (continent) {
    filtered = filtered.filter(c => c.continent === continent);
  }

  // Filter by search query (searches both Swedish and English names)
  if (search && search.trim().length > 0) {
    const query = search.toLowerCase().trim();
    filtered = filtered.filter(c =>
      c.nameSv.toLowerCase().includes(query) ||
      c.nameEn.toLowerCase().includes(query) ||
      c.iso.toLowerCase() === query
    );
  }

  // Sort alphabetically by the selected language
  filtered.sort((a, b) => {
    const nameA = lang === 'sv' ? a.nameSv : a.nameEn;
    const nameB = lang === 'sv' ? b.nameSv : b.nameEn;
    return nameA.localeCompare(nameB, lang);
  });

  // Apply limit
  filtered = filtered.slice(0, limit);

  return filtered.map(c => ({
    iso: c.iso,
    name: lang === 'sv' ? c.nameSv : c.nameEn,
    continent: c.continent,
    flag: c.flag
  }));
}

/**
 * Get a single country by ISO code
 */
function getCountryByIso(iso, lang = 'sv') {
  const country = COUNTRIES.find(c => c.iso.toUpperCase() === iso.toUpperCase());
  if (!country) return null;

  return {
    iso: country.iso,
    name: lang === 'sv' ? country.nameSv : country.nameEn,
    continent: country.continent,
    flag: country.flag
  };
}

/**
 * Get countries by continent
 */
function getCountriesByContinent(continentCode, lang = 'sv') {
  return getCountriesArray({ lang, continent: continentCode });
}

/**
 * Search countries
 */
function searchCountries(query, lang = 'sv', limit = 20) {
  return getCountriesArray({ lang, search: query, limit });
}

/**
 * Validate if a country ISO code exists
 */
function isValidCountry(iso) {
  return COUNTRIES.some(c => c.iso.toUpperCase() === iso.toUpperCase());
}

/**
 * Validate if a continent code exists
 */
function isValidContinent(code) {
  return CONTINENTS.some(c => c.code === code);
}

/**
 * Get continent by code
 */
function getContinent(code, lang = 'sv') {
  const continent = CONTINENTS.find(c => c.code === code);
  if (!continent) return null;

  return {
    code: continent.code,
    name: lang === 'sv' ? continent.nameSv : continent.nameEn
  };
}

/**
 * Map old region codes to continent codes (for migration)
 */
const REGION_MIGRATION_MAP = {
  'europe': 'europe',
  'africa': 'africa',
  'asia': 'asia',
  'north-america': 'north-america',
  'south-america': 'south-america',
  'oceania': 'oceania',
  'middle-east': 'middle-east',
  'global': null // Global sources don't map to a specific continent
};

module.exports = {
  CONTINENTS,
  COUNTRIES,
  REGION_MIGRATION_MAP,
  getContinentsArray,
  getCountriesArray,
  getCountryByIso,
  getCountriesByContinent,
  searchCountries,
  isValidCountry,
  isValidContinent,
  getContinent
};
