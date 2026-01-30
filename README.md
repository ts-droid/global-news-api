# 🌍 Global News API

**Open-source backend service for global news aggregation from 48+ RSS feeds across all continents.**

A self-hosted, free, and open-source news API that aggregates news from 48 trusted sources worldwide, including Swedish, African, Asian, American, European, Middle Eastern, and Oceanian news outlets. Built with Node.js and Express, designed for easy integration with mobile apps and web applications.

## ✨ Features

- **48 Global News Sources** from all continents
- **RESTful API** with clean JSON responses
- **RSS Aggregation** with automatic parsing
- **Smart Caching** (15-minute TTL) for optimal performance
- **Deduplication** to avoid duplicate articles
- **Search Functionality** across all articles
- **Category & Region Filtering** (Swedish, International, Tech, etc.)
- **Pagination Support** for efficient data loading
- **CORS Enabled** for cross-origin requests
- **MIT Licensed** - completely free to use and modify

## 📰 News Sources

### Regional Coverage

| Region | Sources | Examples |
|--------|---------|----------|
| 🇸🇪 **Sweden** | 5 | SVT, DN, SvD, Aftonbladet, Expressen |
| 🌍 **Africa** | 7 | AllAfrica, BBC Africa, Daily Maverick, News24 |
| 🌏 **Asia** | 8 | SCMP, Japan Times, Times of India, NHK |
| 🌎 **North America** | 7 | NYT, CNN, CBC, AP, Washington Post |
| 🌎 **Latin America** | 7 | Buenos Aires Times, Brazil Reports, El País |
| 🌍 **Europe** | 5 | Reuters, BBC, Guardian, Deutsche Welle |
| 🌍 **Middle East** | 3 | Al Jazeera, Haaretz, Times of Israel |
| 🌏 **Oceania** | 3 | ABC Australia, Sydney Morning Herald, NZ Herald |
| 💻 **Tech** | 3 | TechCrunch, Wired, The Verge |

**Total: 48 sources** covering news in English, Swedish, and other languages.

## 🚀 Quick Start

### Prerequisites

- Node.js 14+ installed
- npm or pnpm package manager

### Installation

1. **Clone the repository:**

```bash
git clone https://github.com/yourusername/global-news-api.git
cd global-news-api
```

2. **Install dependencies:**

```bash
npm install
```

3. **Create environment file (optional):**

```bash
cp .env.example .env
```

Edit `.env` to customize settings:

```env
PORT=3000
NODE_ENV=development
CACHE_TTL=900
```

4. **Start the server:**

```bash
# Development
npm start

# Production
NODE_ENV=production npm start
```

The API will be available at `http://localhost:3000`

## 📡 API Endpoints

### 1. Health Check

```http
GET /api/health
```

**Response:**
```json
{
  "status": "success",
  "message": "Global News API is running",
  "timestamp": "2026-01-29T19:47:32.590Z",
  "version": "1.0.0",
  "sources": 48
}
```

### 2. Get All Sources

```http
GET /api/sources
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "sources": [
      {
        "code": "SE-SVT",
        "name": "SVT Nyheter",
        "category": "swedish",
        "region": "europe",
        "country": "SE",
        "language": "sv",
        "website": "https://www.svt.se"
      }
    ],
    "total": 48
  }
}
```

### 3. Get Latest News

```http
GET /api/news?limit=20&offset=0&category=international&region=asia
```

**Query Parameters:**
- `limit` (optional, default: 20, max: 100) - Number of articles per page
- `offset` (optional, default: 0) - Pagination offset
- `category` (optional) - Filter by category: `swedish`, `international`, `tech`
- `region` (optional) - Filter by region: `europe`, `asia`, `africa`, `north-america`, `south-america`, `middle-east`, `oceania`, `global`

**Response:**
```json
{
  "status": "success",
  "data": {
    "articles": [
      {
        "id": "abc123...",
        "source": "BBC News",
        "sourceCode": "EU-BBC",
        "category": "international",
        "region": "europe",
        "country": "GB",
        "language": "en",
        "title": "Article Title",
        "description": "Article description...",
        "link": "https://...",
        "pubDate": "2026-01-29T18:36:06Z",
        "imageUrl": "https://...",
        "author": "Author Name"
      }
    ],
    "pagination": {
      "total": 500,
      "limit": 20,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

### 4. Get News from Specific Source

```http
GET /api/news/source/:sourceCode?limit=20
```

**Example:**
```bash
curl "http://localhost:3000/api/news/source/SE-SVT?limit=10"
```

### 5. Get News by Category

```http
GET /api/news/category/:category?limit=20&offset=0
```

**Available Categories:**
- `swedish` - Swedish news sources
- `international` - International news sources
- `tech` - Technology news sources

**Example:**
```bash
curl "http://localhost:3000/api/news/category/tech?limit=5"
```

### 6. Search News

```http
GET /api/news/search?q=keyword&limit=20&offset=0&sources=SE-SVT,EU-BBC
```

**Query Parameters:**
- `q` (required) - Search query
- `limit` (optional) - Number of results
- `offset` (optional) - Pagination offset
- `sources` (optional) - Comma-separated list of source codes to search in

**Example:**
```bash
curl "http://localhost:3000/api/news/search?q=climate&limit=10"
```

### 7. Get Statistics

```http
GET /api/stats
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "totalSources": 48,
    "byRegion": {
      "europe": 10,
      "africa": 7,
      "asia": 8,
      "north-america": 7,
      "south-america": 7,
      "middle-east": 3,
      "oceania": 3,
      "global": 3
    },
    "byCategory": {
      "swedish": 5,
      "international": 40,
      "tech": 3
    },
    "cacheStats": {
      "hits": 0,
      "misses": 0,
      "keys": 0
    }
  }
}
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Cache Configuration (in seconds)
CACHE_TTL=900

# API Configuration
MAX_ARTICLES_PER_REQUEST=100
DEFAULT_ARTICLES_LIMIT=20
```

### Adding New Sources

Edit `sources.js` to add new RSS feeds:

```javascript
{
  code: 'NEW-SOURCE',
  name: 'Source Name',
  category: 'international',
  region: 'europe',
  country: 'XX',
  language: 'en',
  rssUrl: 'https://example.com/rss',
  website: 'https://example.com'
}
```

## 📱 Mobile App Integration

### React Native Example

```javascript
const fetchNews = async () => {
  try {
    const response = await fetch('http://your-api-url.com/api/news?limit=20');
    const data = await response.json();
    
    if (data.status === 'success') {
      setArticles(data.data.articles);
    }
  } catch (error) {
    console.error('Error fetching news:', error);
  }
};
```

### Flutter Example

```dart
Future<List<Article>> fetchNews() async {
  final response = await http.get(
    Uri.parse('http://your-api-url.com/api/news?limit=20')
  );
  
  if (response.statusCode == 200) {
    final data = jsonDecode(response.body);
    return (data['data']['articles'] as List)
        .map((article) => Article.fromJson(article))
        .toList();
  }
  throw Exception('Failed to load news');
}
```

## 🚢 Deployment

### Option 1: Vercel (Recommended for serverless)

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

### Option 2: Railway/Render

1. Connect your GitHub repository
2. Set environment variables
3. Deploy automatically on push

### Option 3: Docker

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

Build and run:

```bash
docker build -t global-news-api .
docker run -p 3000:3000 global-news-api
```

### Option 4: VPS (DigitalOcean, Linode, etc.)

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and setup
git clone https://github.com/yourusername/global-news-api.git
cd global-news-api
npm install

# Use PM2 for process management
sudo npm install -g pm2
pm2 start server.js --name global-news-api
pm2 startup
pm2 save
```

## 🔒 Security & Rate Limiting

For production use, consider adding:

1. **Rate Limiting:**
```bash
npm install express-rate-limit
```

2. **API Key Authentication:**
```bash
npm install express-api-key
```

3. **Helmet for Security Headers:**
```bash
npm install helmet
```

## 🛠️ Development

### Project Structure

```
global-news-api/
├── server.js           # Main Express server
├── sources.js          # News source configuration
├── rssFetcher.js       # RSS parsing and fetching logic
├── package.json        # Dependencies and scripts
├── .env.example        # Environment variables template
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

### Running Tests

```bash
npm test
```

## 📊 Performance

- **Caching:** 15-minute TTL reduces RSS fetch requests
- **Deduplication:** Removes duplicate articles across sources
- **Pagination:** Efficient data loading for mobile apps
- **Concurrent Fetching:** Parallel RSS feed fetching

## 🤝 Contributing

Contributions are welcome! To add a new news source:

1. Fork the repository
2. Add the source to `sources.js`
3. Test the RSS feed
4. Submit a pull request

## 📄 License

This project is licensed under the **MIT License** - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with [Express.js](https://expressjs.com/)
- RSS parsing by [rss-parser](https://github.com/rbren/rss-parser)
- Inspired by [next-news-api](https://github.com/riad-azz/next-news-api)

## 📞 Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**Made with ❤️ for the open-source community**
