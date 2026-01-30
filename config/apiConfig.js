require('dotenv').config();

const apiConfig = {
    // DeepSeek API (AI Translations & Explanations)
    deepseek: {
        apiKey: process.env.AI_INTEGRATIONS_DEEPSEEK_API_KEY || process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat"
    },
    
    // External News APIs (Future Integrations)
    newsdata: {
        apiKey: process.env.NEWSDATA_API_KEY,
        baseUrl: "https://newsdata.io/api/1"
    },
    gnews: {
        apiKey: process.env.GNEWS_API_KEY,
        baseUrl: "https://gnews.io/api/v4"
    },
    mediastack: {
        apiKey: process.env.MEDIASTACK_API_KEY,
        baseUrl: "http://api.mediastack.com/v1"
    }
};

const validateConfig = () => {
    const missing = [];
    if (!apiConfig.deepseek.apiKey) missing.push("DeepSeek API Key");
    // Warn about others but don't fail, as they are optional extensions for now
    if (!apiConfig.newsdata.apiKey) console.warn("Optional: NewsData API Key missing");
    if (!apiConfig.gnews.apiKey) console.warn("Optional: GNews API Key missing");
    if (!apiConfig.mediastack.apiKey) console.warn("Optional: Mediastack API Key missing");
    
    return missing;
};

module.exports = {
    apiConfig,
    validateConfig
};
