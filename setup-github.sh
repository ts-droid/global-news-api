#!/bin/bash

# Global News API - GitHub Setup Script
# Run this script after extracting the project locally

echo "=========================================="
echo "Global News API - GitHub Setup"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found!"
    echo "Please run this script from the global-news-api directory"
    exit 1
fi

echo "✓ Found package.json"
echo ""

# Initialize git if not already initialized
if [ ! -d ".git" ]; then
    echo "Initializing git repository..."
    git init
    git branch -m main
    echo "✓ Git initialized"
else
    echo "✓ Git already initialized"
fi

# Set git config
echo ""
echo "Setting git configuration..."
git config user.name "ts-droid"
git config user.email "ts-droid@users.noreply.github.com"
echo "✓ Git config set"

# Add all files
echo ""
echo "Adding files to git..."
git add .
echo "✓ Files added"

# Create commit
echo ""
echo "Creating initial commit..."
git commit -m "Initial commit: Global News API with 48 international sources

- 48 news sources from all continents
- RESTful API with 7 endpoints
- RSS aggregation with smart caching
- Deduplication and search functionality
- Complete documentation for deployment and mobile integration
- MIT licensed"
echo "✓ Commit created"

# Add remote
echo ""
echo "Adding GitHub remote..."
git remote add origin https://github.com/ts-droid/global-news-api.git 2>/dev/null || git remote set-url origin https://github.com/ts-droid/global-news-api.git
echo "✓ Remote added"

echo ""
echo "=========================================="
echo "Setup complete! ✓"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Create repository on GitHub:"
echo "   Go to: https://github.com/new"
echo "   Name: global-news-api"
echo "   Visibility: Public"
echo "   DO NOT initialize with README"
echo ""
echo "2. Push to GitHub:"
echo "   git push -u origin main"
echo ""
echo "3. Deploy to Railway:"
echo "   - Go to: https://railway.app"
echo "   - Click 'New Project'"
echo "   - Select 'Deploy from GitHub repo'"
echo "   - Choose 'ts-droid/global-news-api'"
echo "   - Railway will auto-detect Node.js and deploy!"
echo ""
echo "=========================================="
