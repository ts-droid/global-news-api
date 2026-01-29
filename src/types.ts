export interface NewsSource {
  code: string;
  name: string;
  category: string;
  region: string;
  country: string;
  language: string;
  rssUrl: string;
  website: string;
}

export interface Article {
  id: string;
  source: string;
  sourceCode: string;
  category: string;
  region: string;
  country: string;
  language: string;
  title: string;
  description: string;
  link: string;
  pubDate: string;
  imageUrl: string | null;
  author?: string;
}

export interface FetchResult {
  success: boolean;
  source: string;
  articles: Article[];
  count: number;
  error?: string;
}

export interface FetchStats {
  total: number;
  successful: number;
  failed: number;
  totalArticles: number;
}

export interface MultiFetchResult {
  articles: Article[];
  stats: FetchStats;
}

export interface PaginatedResponse<T> {
  status: string;
  data: {
    articles?: T[];
    sources?: T[];
    pagination?: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
    [key: string]: any;
  };
}
