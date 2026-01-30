# 🚀 Deployment Guide

This guide covers different deployment options for the Global News API.

## Table of Contents

1. [Railway Deployment](#railway-deployment)
2. [Render Deployment](#render-deployment)
3. [Vercel Deployment](#vercel-deployment)
4. [Docker Deployment](#docker-deployment)
5. [VPS Deployment](#vps-deployment)
6. [Environment Variables](#environment-variables)

---

## Railway Deployment

Railway offers a free tier and automatic deployments from GitHub.

### Steps:

1. **Sign up at [Railway.app](https://railway.app/)**

2. **Create a new project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your GitHub account
   - Select the `global-news-api` repository

3. **Configure environment variables:**
   - Go to your project settings
   - Add variables:
     ```
     PORT=3000
     NODE_ENV=production
     CACHE_TTL=900
     ```

4. **Deploy:**
   - Railway will automatically detect Node.js and deploy
   - Your API will be available at `https://your-project.railway.app`

5. **Custom domain (optional):**
   - Go to Settings → Domains
   - Add your custom domain

**Pros:** Free tier, automatic deployments, easy setup
**Cons:** Limited free tier hours

---

## Render Deployment

Render provides free hosting for web services.

### Steps:

1. **Sign up at [Render.com](https://render.com/)**

2. **Create a new Web Service:**
   - Click "New +"
   - Select "Web Service"
   - Connect your GitHub repository

3. **Configure the service:**
   - **Name:** global-news-api
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free

4. **Add environment variables:**
   ```
   PORT=3000
   NODE_ENV=production
   CACHE_TTL=900
   ```

5. **Deploy:**
   - Click "Create Web Service"
   - Wait for deployment to complete
   - Your API will be at `https://global-news-api.onrender.com`

**Pros:** Free tier, automatic SSL, easy to use
**Cons:** Spins down after inactivity (free tier)

---

## Vercel Deployment

Vercel is optimized for serverless deployments.

### Steps:

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Create `vercel.json` in project root:**
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "server.js",
         "use": "@vercel/node"
       }
     ],
     "routes": [
       {
         "src": "/(.*)",
         "dest": "server.js"
       }
     ]
   }
   ```

3. **Deploy:**
   ```bash
   vercel
   ```

4. **Set environment variables:**
   ```bash
   vercel env add PORT
   vercel env add NODE_ENV
   vercel env add CACHE_TTL
   ```

5. **Production deployment:**
   ```bash
   vercel --prod
   ```

**Pros:** Fast, global CDN, automatic HTTPS
**Cons:** Serverless limitations (10s timeout on free tier)

---

## Docker Deployment

Deploy using Docker for full control.

### 1. Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "server.js"]
```

### 2. Create `.dockerignore`:

```
node_modules
npm-debug.log
.env
.git
.gitignore
README.md
```

### 3. Build and run:

```bash
# Build image
docker build -t global-news-api .

# Run container
docker run -d \
  --name global-news-api \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e CACHE_TTL=900 \
  --restart unless-stopped \
  global-news-api

# Check logs
docker logs -f global-news-api
```

### 4. Docker Compose (optional):

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  api:
    build: .
    container_name: global-news-api
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - CACHE_TTL=900
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 3s
      retries: 3
```

Run with:
```bash
docker-compose up -d
```

**Pros:** Full control, portable, consistent environment
**Cons:** Requires Docker knowledge, more setup

---

## VPS Deployment

Deploy on a Virtual Private Server (DigitalOcean, Linode, AWS EC2, etc.)

### Prerequisites:
- Ubuntu 20.04+ server
- SSH access
- Domain name (optional)

### Steps:

#### 1. Connect to your server:
```bash
ssh root@your-server-ip
```

#### 2. Install Node.js:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### 3. Install Git:
```bash
sudo apt-get install git -y
```

#### 4. Clone repository:
```bash
cd /opt
git clone https://github.com/yourusername/global-news-api.git
cd global-news-api
```

#### 5. Install dependencies:
```bash
npm install --production
```

#### 6. Create `.env` file:
```bash
nano .env
```

Add:
```env
PORT=3000
NODE_ENV=production
CACHE_TTL=900
```

#### 7. Install PM2 (Process Manager):
```bash
sudo npm install -g pm2
```

#### 8. Start the application:
```bash
pm2 start server.js --name global-news-api
pm2 startup
pm2 save
```

#### 9. Setup Nginx as reverse proxy:
```bash
sudo apt-get install nginx -y
sudo nano /etc/nginx/sites-available/global-news-api
```

Add:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/global-news-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 10. Setup SSL with Let's Encrypt:
```bash
sudo apt-get install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

#### 11. Setup firewall:
```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

### Useful PM2 Commands:

```bash
# View logs
pm2 logs global-news-api

# Restart
pm2 restart global-news-api

# Stop
pm2 stop global-news-api

# Monitor
pm2 monit

# Update after code changes
cd /opt/global-news-api
git pull
npm install --production
pm2 restart global-news-api
```

**Pros:** Full control, no vendor lock-in, cost-effective for high traffic
**Cons:** Requires server management, security updates

---

## Environment Variables

### Required Variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Port the server listens on |
| `NODE_ENV` | development | Environment (development/production) |

### Optional Variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_TTL` | 900 | Cache time-to-live in seconds (15 min) |
| `MAX_ARTICLES_PER_REQUEST` | 100 | Maximum articles per API request |
| `DEFAULT_ARTICLES_LIMIT` | 20 | Default number of articles returned |

---

## Performance Optimization

### 1. Enable Compression:

```bash
npm install compression
```

In `server.js`:
```javascript
const compression = require('compression');
app.use(compression());
```

### 2. Add Rate Limiting:

```bash
npm install express-rate-limit
```

In `server.js`:
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### 3. Increase Cache TTL for production:

In `.env`:
```env
CACHE_TTL=1800  # 30 minutes
```

---

## Monitoring

### Health Check Endpoint:

```bash
curl https://your-api-url.com/api/health
```

### Uptime Monitoring Services:

- [UptimeRobot](https://uptimerobot.com/) (Free)
- [Pingdom](https://www.pingdom.com/)
- [StatusCake](https://www.statuscake.com/)

### Application Monitoring:

- [PM2 Plus](https://pm2.io/) (for VPS deployments)
- [New Relic](https://newrelic.com/)
- [Datadog](https://www.datadoghq.com/)

---

## Troubleshooting

### API not responding:

1. Check if server is running:
   ```bash
   pm2 status  # VPS
   docker ps   # Docker
   ```

2. Check logs:
   ```bash
   pm2 logs global-news-api  # VPS
   docker logs global-news-api  # Docker
   ```

3. Test locally:
   ```bash
   curl http://localhost:3000/api/health
   ```

### RSS feeds failing:

1. Check individual source:
   ```bash
   curl "http://localhost:3000/api/news/source/EU-BBC"
   ```

2. View stats:
   ```bash
   curl http://localhost:3000/api/stats
   ```

3. Check server logs for specific errors

### High memory usage:

1. Reduce cache TTL
2. Limit concurrent RSS fetches
3. Increase server resources

---

## Security Checklist

- [ ] Use HTTPS (SSL certificate)
- [ ] Set up rate limiting
- [ ] Configure CORS properly
- [ ] Use environment variables for sensitive data
- [ ] Keep dependencies updated (`npm audit`)
- [ ] Set up firewall rules
- [ ] Use strong passwords for server access
- [ ] Regular backups
- [ ] Monitor logs for suspicious activity

---

## Support

For deployment issues, please open an issue on GitHub or consult the main README.md file.
