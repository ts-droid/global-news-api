# 📱 Mobile App Integration Guide

This guide shows how to integrate the Global News API with your mobile application.

## Quick Start

### Base URL

```
http://your-api-url.com/api
```

Replace `your-api-url.com` with your deployed API URL.

---

## React Native Integration

### 1. Install Dependencies

```bash
npm install axios
# or
npm install @react-native-async-storage/async-storage
```

### 2. Create API Service

Create `services/newsApi.js`:

```javascript
import axios from 'axios';

const API_BASE_URL = 'https://your-api-url.com/api';

class NewsAPI {
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // Get latest news
  async getNews(params = {}) {
    try {
      const response = await this.client.get('/news', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching news:', error);
      throw error;
    }
  }

  // Get news by category
  async getNewsByCategory(category, params = {}) {
    try {
      const response = await this.client.get(`/news/category/${category}`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching category news:', error);
      throw error;
    }
  }

  // Get news from specific source
  async getNewsBySource(sourceCode, params = {}) {
    try {
      const response = await this.client.get(`/news/source/${sourceCode}`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching source news:', error);
      throw error;
    }
  }

  // Search news
  async searchNews(query, params = {}) {
    try {
      const response = await this.client.get('/news/search', {
        params: { q: query, ...params },
      });
      return response.data;
    } catch (error) {
      console.error('Error searching news:', error);
      throw error;
    }
  }

  // Get all sources
  async getSources() {
    try {
      const response = await this.client.get('/sources');
      return response.data;
    } catch (error) {
      console.error('Error fetching sources:', error);
      throw error;
    }
  }
}

export default new NewsAPI();
```

### 3. Create News List Component

```javascript
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import NewsAPI from './services/newsApi';

const NewsListScreen = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    loadNews();
  }, []);

  const loadNews = async () => {
    try {
      setLoading(true);
      const response = await NewsAPI.getNews({ limit: 20, offset: 0 });
      
      if (response.status === 'success') {
        setArticles(response.data.articles);
        setHasMore(response.data.pagination.hasMore);
        setOffset(20);
      }
    } catch (error) {
      console.error('Error loading news:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!hasMore || loading) return;

    try {
      const response = await NewsAPI.getNews({ limit: 20, offset });
      
      if (response.status === 'success') {
        setArticles([...articles, ...response.data.articles]);
        setHasMore(response.data.pagination.hasMore);
        setOffset(offset + 20);
      }
    } catch (error) {
      console.error('Error loading more news:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNews();
    setRefreshing(false);
  };

  const renderArticle = ({ item }) => (
    <TouchableOpacity
      style={styles.articleCard}
      onPress={() => {
        // Open article link in browser
        Linking.openURL(item.link);
      }}
    >
      {item.imageUrl && (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.articleImage}
          resizeMode="cover"
        />
      )}
      <View style={styles.articleContent}>
        <Text style={styles.articleSource}>{item.source}</Text>
        <Text style={styles.articleTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.articleDescription} numberOfLines={3}>
          {item.description}
        </Text>
        <Text style={styles.articleDate}>
          {new Date(item.pubDate).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading && articles.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0066cc" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={articles}
        renderItem={renderArticle}
        keyExtractor={(item) => item.id}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListFooterComponent={
          hasMore ? (
            <ActivityIndicator style={styles.loader} color="#0066cc" />
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  articleCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  articleImage: {
    width: '100%',
    height: 200,
  },
  articleContent: {
    padding: 16,
  },
  articleSource: {
    fontSize: 12,
    color: '#0066cc',
    fontWeight: '600',
    marginBottom: 4,
  },
  articleTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  articleDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
  articleDate: {
    fontSize: 12,
    color: '#999',
  },
  loader: {
    marginVertical: 20,
  },
});

export default NewsListScreen;
```

---

## Flutter Integration

### 1. Add Dependencies

In `pubspec.yaml`:

```yaml
dependencies:
  http: ^1.1.0
  cached_network_image: ^3.3.0
  url_launcher: ^6.2.1
```

### 2. Create API Service

Create `lib/services/news_api.dart`:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class NewsAPI {
  static const String baseUrl = 'https://your-api-url.com/api';
  
  Future<Map<String, dynamic>> getNews({
    int limit = 20,
    int offset = 0,
    String? category,
    String? region,
  }) async {
    final queryParams = {
      'limit': limit.toString(),
      'offset': offset.toString(),
      if (category != null) 'category': category,
      if (region != null) 'region': region,
    };
    
    final uri = Uri.parse('$baseUrl/news').replace(queryParameters: queryParams);
    final response = await http.get(uri);
    
    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to load news');
    }
  }
  
  Future<Map<String, dynamic>> getNewsByCategory(
    String category, {
    int limit = 20,
    int offset = 0,
  }) async {
    final queryParams = {
      'limit': limit.toString(),
      'offset': offset.toString(),
    };
    
    final uri = Uri.parse('$baseUrl/news/category/$category')
        .replace(queryParameters: queryParams);
    final response = await http.get(uri);
    
    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to load category news');
    }
  }
  
  Future<Map<String, dynamic>> searchNews(
    String query, {
    int limit = 20,
    int offset = 0,
  }) async {
    final queryParams = {
      'q': query,
      'limit': limit.toString(),
      'offset': offset.toString(),
    };
    
    final uri = Uri.parse('$baseUrl/news/search')
        .replace(queryParameters: queryParams);
    final response = await http.get(uri);
    
    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to search news');
    }
  }
  
  Future<List<dynamic>> getSources() async {
    final response = await http.get(Uri.parse('$baseUrl/sources'));
    
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return data['data']['sources'];
    } else {
      throw Exception('Failed to load sources');
    }
  }
}
```

### 3. Create Article Model

Create `lib/models/article.dart`:

```dart
class Article {
  final String id;
  final String source;
  final String sourceCode;
  final String category;
  final String region;
  final String country;
  final String language;
  final String title;
  final String description;
  final String link;
  final DateTime pubDate;
  final String? imageUrl;
  final String author;

  Article({
    required this.id,
    required this.source,
    required this.sourceCode,
    required this.category,
    required this.region,
    required this.country,
    required this.language,
    required this.title,
    required this.description,
    required this.link,
    required this.pubDate,
    this.imageUrl,
    required this.author,
  });

  factory Article.fromJson(Map<String, dynamic> json) {
    return Article(
      id: json['id'],
      source: json['source'],
      sourceCode: json['sourceCode'],
      category: json['category'],
      region: json['region'],
      country: json['country'],
      language: json['language'],
      title: json['title'],
      description: json['description'],
      link: json['link'],
      pubDate: DateTime.parse(json['pubDate']),
      imageUrl: json['imageUrl'],
      author: json['author'],
    );
  }
}
```

### 4. Create News List Widget

Create `lib/widgets/news_list.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/news_api.dart';
import '../models/article.dart';

class NewsListWidget extends StatefulWidget {
  @override
  _NewsListWidgetState createState() => _NewsListWidgetState();
}

class _NewsListWidgetState extends State<NewsListWidget> {
  final NewsAPI _newsAPI = NewsAPI();
  List<Article> _articles = [];
  bool _isLoading = true;
  bool _hasMore = true;
  int _offset = 0;
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _loadNews();
    _scrollController.addListener(_onScroll);
  }

  Future<void> _loadNews() async {
    try {
      final response = await _newsAPI.getNews(limit: 20, offset: _offset);
      
      if (response['status'] == 'success') {
        final articles = (response['data']['articles'] as List)
            .map((json) => Article.fromJson(json))
            .toList();
        
        setState(() {
          _articles.addAll(articles);
          _hasMore = response['data']['pagination']['hasMore'];
          _offset += 20;
          _isLoading = false;
        });
      }
    } catch (e) {
      print('Error loading news: $e');
      setState(() => _isLoading = false);
    }
  }

  void _onScroll() {
    if (_scrollController.position.pixels ==
        _scrollController.position.maxScrollExtent) {
      if (_hasMore && !_isLoading) {
        _loadNews();
      }
    }
  }

  Future<void> _openArticle(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading && _articles.isEmpty) {
      return Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: () async {
        setState(() {
          _articles.clear();
          _offset = 0;
          _hasMore = true;
        });
        await _loadNews();
      },
      child: ListView.builder(
        controller: _scrollController,
        itemCount: _articles.length + (_hasMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == _articles.length) {
            return Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(),
              ),
            );
          }

          final article = _articles[index];
          return Card(
            margin: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: InkWell(
              onTap: () => _openArticle(article.link),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (article.imageUrl != null)
                    CachedNetworkImage(
                      imageUrl: article.imageUrl!,
                      height: 200,
                      width: double.infinity,
                      fit: BoxFit.cover,
                      placeholder: (context, url) => Container(
                        height: 200,
                        color: Colors.grey[300],
                        child: Center(child: CircularProgressIndicator()),
                      ),
                      errorWidget: (context, url, error) => Container(
                        height: 200,
                        color: Colors.grey[300],
                        child: Icon(Icons.error),
                      ),
                    ),
                  Padding(
                    padding: EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          article.source,
                          style: TextStyle(
                            color: Colors.blue,
                            fontWeight: FontWeight.w600,
                            fontSize: 12,
                          ),
                        ),
                        SizedBox(height: 8),
                        Text(
                          article.title,
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        SizedBox(height: 8),
                        Text(
                          article.description,
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey[600],
                          ),
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                        ),
                        SizedBox(height: 8),
                        Text(
                          _formatDate(article.pubDate),
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }
}
```

---

## API Response Examples

### Success Response

```json
{
  "status": "success",
  "data": {
    "articles": [...],
    "pagination": {
      "total": 500,
      "limit": 20,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

### Error Response

```json
{
  "status": "error",
  "message": "Error description"
}
```

---

## Best Practices

### 1. Caching
Implement client-side caching to reduce API calls:

```javascript
// React Native with AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'news_cache';
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

async function getCachedNews() {
  const cached = await AsyncStorage.getItem(CACHE_KEY);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_DURATION) {
      return data;
    }
  }
  return null;
}

async function setCachedNews(data) {
  await AsyncStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ data, timestamp: Date.now() })
  );
}
```

### 2. Error Handling

```javascript
try {
  const response = await NewsAPI.getNews();
  // Handle success
} catch (error) {
  if (error.response) {
    // Server responded with error
    console.error('Server error:', error.response.status);
  } else if (error.request) {
    // No response received
    console.error('Network error');
  } else {
    // Other errors
    console.error('Error:', error.message);
  }
}
```

### 3. Pagination

Implement infinite scroll for better UX:

```javascript
const [loading, setLoading] = useState(false);
const [hasMore, setHasMore] = useState(true);
const [offset, setOffset] = useState(0);

const loadMore = async () => {
  if (loading || !hasMore) return;
  
  setLoading(true);
  const response = await NewsAPI.getNews({ offset });
  setArticles([...articles, ...response.data.articles]);
  setHasMore(response.data.pagination.hasMore);
  setOffset(offset + 20);
  setLoading(false);
};
```

### 4. Pull to Refresh

```javascript
const [refreshing, setRefreshing] = useState(false);

const onRefresh = async () => {
  setRefreshing(true);
  setOffset(0);
  const response = await NewsAPI.getNews({ offset: 0 });
  setArticles(response.data.articles);
  setRefreshing(false);
};
```

---

## Testing

### Test API Connection

```javascript
// Test health endpoint
async function testConnection() {
  try {
    const response = await fetch('https://your-api-url.com/api/health');
    const data = await response.json();
    console.log('API Status:', data.status);
    console.log('Sources:', data.sources);
  } catch (error) {
    console.error('Connection failed:', error);
  }
}
```

---

## Support

For integration issues, please refer to:
- [Main README](README.md)
- [API Documentation](README.md#-api-endpoints)
- [GitHub Issues](https://github.com/yourusername/global-news-api/issues)
