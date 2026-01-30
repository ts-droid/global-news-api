// Global News Sources Configuration
// 48 sources from all continents

const newsSources = [
  // Swedish Sources (5)
  {
    code: 'SE-SVT',
    name: 'SVT Nyheter',
    category: 'swedish',
    region: 'europe',
    country: 'SE',
    language: 'sv',
    rssUrl: 'https://www.svt.se/nyheter/rss.xml',
    website: 'https://www.svt.se'
  },
  {
    code: 'SE-DN',
    name: 'Dagens Nyheter',
    category: 'swedish',
    region: 'europe',
    country: 'SE',
    language: 'sv',
    rssUrl: 'https://www.dn.se/rss/',
    website: 'https://www.dn.se'
  },
  {
    code: 'SE-SVD',
    name: 'Svenska Dagbladet',
    category: 'swedish',
    region: 'europe',
    country: 'SE',
    language: 'sv',
    rssUrl: 'https://www.svd.se/feed/articles.rss',
    website: 'https://www.svd.se'
  },
  {
    code: 'SE-AB',
    name: 'Aftonbladet',
    category: 'swedish',
    region: 'europe',
    country: 'SE',
    language: 'sv',
    rssUrl: 'https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/',
    website: 'https://www.aftonbladet.se'
  },
  {
    code: 'SE-EXP',
    name: 'Expressen',
    category: 'swedish',
    region: 'europe',
    country: 'SE',
    language: 'sv',
    rssUrl: 'https://feeds.expressen.se/nyheter/',
    website: 'https://www.expressen.se'
  },

  // Africa (7)
  {
    code: 'AF-AA',
    name: 'AllAfrica',
    category: 'international',
    region: 'africa',
    country: 'MULTI',
    language: 'en',
    rssUrl: 'https://allafrica.com/tools/headlines/rss.html',
    website: 'https://allafrica.com'
  },
  {
    code: 'AF-AN',
    name: 'Africanews',
    category: 'international',
    region: 'africa',
    country: 'MULTI',
    language: 'en',
    rssUrl: 'https://www.africanews.com/feed/rss',
    website: 'https://www.africanews.com'
  },
  {
    code: 'AF-BBC',
    name: 'BBC News Africa',
    category: 'international',
    region: 'africa',
    country: 'GB',
    language: 'en',
    rssUrl: 'http://feeds.bbci.co.uk/news/world/africa/rss.xml',
    website: 'https://www.bbc.com/news/world/africa'
  },
  {
    code: 'AF-AJ',
    name: 'Al Jazeera Africa',
    category: 'international',
    region: 'africa',
    country: 'QA',
    language: 'en',
    rssUrl: 'https://www.aljazeera.com/xml/rss/all.xml',
    website: 'https://www.aljazeera.com/africa'
  },
  {
    code: 'AF-F24',
    name: 'France 24 Africa',
    category: 'international',
    region: 'africa',
    country: 'FR',
    language: 'en',
    rssUrl: 'https://www.france24.com/en/africa/rss',
    website: 'https://www.france24.com/en/africa'
  },
  {
    code: 'AF-DM',
    name: 'Daily Maverick',
    category: 'international',
    region: 'africa',
    country: 'ZA',
    language: 'en',
    rssUrl: 'https://www.dailymaverick.co.za/dmrss/',
    website: 'https://www.dailymaverick.co.za'
  },
  {
    code: 'AF-N24',
    name: 'News24 South Africa',
    category: 'international',
    region: 'africa',
    country: 'ZA',
    language: 'en',
    rssUrl: 'https://feeds.news24.com/articles/news24/TopStories/rss',
    website: 'https://www.news24.com'
  },

  // Asia (8)
  {
    code: 'AS-SCMP',
    name: 'South China Morning Post',
    category: 'international',
    region: 'asia',
    country: 'HK',
    language: 'en',
    rssUrl: 'https://www.scmp.com/rss/91/feed',
    website: 'https://www.scmp.com'
  },
  {
    code: 'AS-JT',
    name: 'The Japan Times',
    category: 'international',
    region: 'asia',
    country: 'JP',
    language: 'en',
    rssUrl: 'https://www.japantimes.co.jp/feed/',
    website: 'https://www.japantimes.co.jp'
  },
  {
    code: 'AS-NHK',
    name: 'NHK World-Japan',
    category: 'international',
    region: 'asia',
    country: 'JP',
    language: 'en',
    rssUrl: 'https://www3.nhk.or.jp/nhkworld/en/news/rss.xml',
    website: 'https://www3.nhk.or.jp/nhkworld/en/news/'
  },
  {
    code: 'AS-ST',
    name: 'The Straits Times',
    category: 'international',
    region: 'asia',
    country: 'SG',
    language: 'en',
    rssUrl: 'https://www.straitstimes.com/news/singapore/rss.xml',
    website: 'https://www.straitstimes.com'
  },
  {
    code: 'AS-TOI',
    name: 'The Times of India',
    category: 'international',
    region: 'asia',
    country: 'IN',
    language: 'en',
    rssUrl: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
    website: 'https://timesofindia.indiatimes.com'
  },
  {
    code: 'AS-TH',
    name: 'The Hindu',
    category: 'international',
    region: 'asia',
    country: 'IN',
    language: 'en',
    rssUrl: 'https://www.thehindu.com/news/national/feeder/default.rss',
    website: 'https://www.thehindu.com'
  },
  {
    code: 'AS-AJ',
    name: 'Al Jazeera Asia',
    category: 'international',
    region: 'asia',
    country: 'QA',
    language: 'en',
    rssUrl: 'https://www.aljazeera.com/xml/rss/all.xml',
    website: 'https://www.aljazeera.com/asia'
  },
  {
    code: 'AS-CNA',
    name: 'Channel NewsAsia',
    category: 'international',
    region: 'asia',
    country: 'SG',
    language: 'en',
    rssUrl: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml',
    website: 'https://www.channelnewsasia.com'
  },

  // North America (7)
  {
    code: 'NA-NYT',
    name: 'The New York Times',
    category: 'international',
    region: 'north-america',
    country: 'US',
    language: 'en',
    rssUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    website: 'https://www.nytimes.com'
  },
  {
    code: 'NA-CNN',
    name: 'CNN',
    category: 'international',
    region: 'north-america',
    country: 'US',
    language: 'en',
    rssUrl: 'http://rss.cnn.com/rss/edition.rss',
    website: 'https://www.cnn.com'
  },
  {
    code: 'NA-WP',
    name: 'The Washington Post',
    category: 'international',
    region: 'north-america',
    country: 'US',
    language: 'en',
    rssUrl: 'https://feeds.washingtonpost.com/rss/world',
    website: 'https://www.washingtonpost.com'
  },
  {
    code: 'NA-NPR',
    name: 'NPR News',
    category: 'international',
    region: 'north-america',
    country: 'US',
    language: 'en',
    rssUrl: 'https://feeds.npr.org/1001/rss.xml',
    website: 'https://www.npr.org'
  },
  {
    code: 'NA-CBC',
    name: 'CBC News',
    category: 'international',
    region: 'north-america',
    country: 'CA',
    language: 'en',
    rssUrl: 'https://www.cbc.ca/cmlink/rss-topstories',
    website: 'https://www.cbc.ca/news'
  },
  {
    code: 'NA-GM',
    name: 'The Globe and Mail',
    category: 'international',
    region: 'north-america',
    country: 'CA',
    language: 'en',
    rssUrl: 'https://www.theglobeandmail.com/arc/outboundfeeds/rss/',
    website: 'https://www.theglobeandmail.com'
  },
  {
    code: 'NA-AP',
    name: 'Associated Press',
    category: 'international',
    region: 'north-america',
    country: 'US',
    language: 'en',
    rssUrl: 'https://feeds.apnews.com/rss/apf-topnews',
    website: 'https://apnews.com'
  },

  // Latin America & South America (7)
  {
    code: 'SA-BAT',
    name: 'Buenos Aires Times',
    category: 'international',
    region: 'south-america',
    country: 'AR',
    language: 'en',
    rssUrl: 'https://www.batimes.com.ar/feed',
    website: 'https://www.batimes.com.ar'
  },
  {
    code: 'SA-BR',
    name: 'Brazil Reports',
    category: 'international',
    region: 'south-america',
    country: 'BR',
    language: 'en',
    rssUrl: 'https://brazilian.report/feed/',
    website: 'https://brazilian.report'
  },
  {
    code: 'SA-MND',
    name: 'Mexico News Daily',
    category: 'international',
    region: 'south-america',
    country: 'MX',
    language: 'en',
    rssUrl: 'https://mexiconewsdaily.com/feed/',
    website: 'https://mexiconewsdaily.com'
  },
  {
    code: 'SA-EP',
    name: 'El País English',
    category: 'international',
    region: 'south-america',
    country: 'ES',
    language: 'en',
    rssUrl: 'https://feeds.elpais.com/mrss-s/pages/ep/site/english.elpais.com/portada',
    website: 'https://english.elpais.com'
  },
  {
    code: 'SA-LAND',
    name: 'Latin America News Dispatch',
    category: 'international',
    region: 'south-america',
    country: 'MULTI',
    language: 'en',
    rssUrl: 'https://latindispatch.com/feed/',
    website: 'https://latindispatch.com'
  },
  {
    code: 'SA-IC',
    name: 'InSight Crime',
    category: 'international',
    region: 'south-america',
    country: 'MULTI',
    language: 'en',
    rssUrl: 'https://insightcrime.org/feed/',
    website: 'https://insightcrime.org'
  },
  {
    code: 'SA-DA',
    name: 'Diálogo Américas',
    category: 'international',
    region: 'south-america',
    country: 'MULTI',
    language: 'en',
    rssUrl: 'https://dialogo-americas.com/feed/',
    website: 'https://dialogo-americas.com'
  },

  // Europe (5)
  {
    code: 'EU-R',
    name: 'Reuters',
    category: 'international',
    region: 'europe',
    country: 'GB',
    language: 'en',
    rssUrl: 'https://www.reutersagency.com/feed/',
    website: 'https://www.reuters.com'
  },
  {
    code: 'EU-BBC',
    name: 'BBC News',
    category: 'international',
    region: 'europe',
    country: 'GB',
    language: 'en',
    rssUrl: 'http://feeds.bbci.co.uk/news/rss.xml',
    website: 'https://www.bbc.com/news'
  },
  {
    code: 'EU-TG',
    name: 'The Guardian',
    category: 'international',
    region: 'europe',
    country: 'GB',
    language: 'en',
    rssUrl: 'https://www.theguardian.com/world/rss',
    website: 'https://www.theguardian.com'
  },
  {
    code: 'EU-DW',
    name: 'Deutsche Welle',
    category: 'international',
    region: 'europe',
    country: 'DE',
    language: 'en',
    rssUrl: 'https://rss.dw.com/rdf/rss-en-all',
    website: 'https://www.dw.com'
  },
  {
    code: 'EU-F24',
    name: 'France 24',
    category: 'international',
    region: 'europe',
    country: 'FR',
    language: 'en',
    rssUrl: 'https://www.france24.com/en/rss',
    website: 'https://www.france24.com'
  },

  // Middle East (3)
  {
    code: 'ME-AJ',
    name: 'Al Jazeera English',
    category: 'international',
    region: 'middle-east',
    country: 'QA',
    language: 'en',
    rssUrl: 'https://www.aljazeera.com/xml/rss/all.xml',
    website: 'https://www.aljazeera.com'
  },
  {
    code: 'ME-HA',
    name: 'Haaretz',
    category: 'international',
    region: 'middle-east',
    country: 'IL',
    language: 'en',
    rssUrl: 'https://www.haaretz.com/cmlink/1.628752',
    website: 'https://www.haaretz.com'
  },
  {
    code: 'ME-TOI',
    name: 'The Times of Israel',
    category: 'international',
    region: 'middle-east',
    country: 'IL',
    language: 'en',
    rssUrl: 'https://www.timesofisrael.com/feed/',
    website: 'https://www.timesofisrael.com'
  },

  // Oceania (3)
  {
    code: 'OC-ABC',
    name: 'ABC News Australia',
    category: 'international',
    region: 'oceania',
    country: 'AU',
    language: 'en',
    rssUrl: 'https://www.abc.net.au/news/feed/51120/rss.xml',
    website: 'https://www.abc.net.au/news'
  },
  {
    code: 'OC-SMH',
    name: 'Sydney Morning Herald',
    category: 'international',
    region: 'oceania',
    country: 'AU',
    language: 'en',
    rssUrl: 'https://www.smh.com.au/rss/feed.xml',
    website: 'https://www.smh.com.au'
  },
  {
    code: 'OC-NZH',
    name: 'New Zealand Herald',
    category: 'international',
    region: 'oceania',
    country: 'NZ',
    language: 'en',
    rssUrl: 'https://www.nzherald.co.nz/arc/outboundfeeds/rss/',
    website: 'https://www.nzherald.co.nz'
  },

  // Tech & Business (3)
  {
    code: 'TECH-TC',
    name: 'TechCrunch',
    category: 'tech',
    region: 'global',
    country: 'US',
    language: 'en',
    rssUrl: 'https://techcrunch.com/feed/',
    website: 'https://techcrunch.com'
  },
  {
    code: 'TECH-W',
    name: 'Wired',
    category: 'tech',
    region: 'global',
    country: 'US',
    language: 'en',
    rssUrl: 'https://www.wired.com/feed/rss',
    website: 'https://www.wired.com'
  },
  {
    code: 'TECH-TV',
    name: 'The Verge',
    category: 'tech',
    region: 'global',
    country: 'US',
    language: 'en',
    rssUrl: 'https://www.theverge.com/rss/index.xml',
    website: 'https://www.theverge.com'
  }
];

module.exports = {
  newsSources,
  getAllSources: () => newsSources
};
