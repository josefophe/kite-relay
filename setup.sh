#!/bin/bash
# setup.sh - Initialize KiteRelay project for first run

set -e  # Exit on error

echo "🚀 KiteRelay Setup Script"
echo "========================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not found. Please install Docker.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker found${NC}"

if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm not found. Please install Node.js.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm found${NC}"

# Create data directory
echo ""
echo "📁 Setting up data directory..."
if [ ! -d "./data" ]; then
    mkdir -p ./data
    echo -e "${GREEN}✓ Created ./data${NC}"
else
    echo -e "${YELLOW}~ ./data already exists${NC}"
fi

# Set permissions
chmod 777 ./data
echo -e "${GREEN}✓ Set permissions (chmod 777)${NC}"

# Install dependencies
echo ""
echo "📦 Installing npm dependencies..."
if [ ! -d "./node_modules" ]; then
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${YELLOW}~ node_modules already exists${NC}"
fi

# Build TypeScript
echo ""
echo "🔨 Building TypeScript..."
npm run build
echo -e "${GREEN}✓ Build successful${NC}"

# Check .env
echo ""
echo "⚙️  Checking configuration..."
if [ ! -f "./.env" ]; then
    if [ -f "./.env.example" ]; then
        cp ./.env.example ./.env
        echo -e "${YELLOW}~ Created .env from .env.example${NC}"
        echo -e "${YELLOW}  ⚠️  You MUST update TELEGRAM_BOT_TOKEN in .env${NC}"
    fi
else
    echo -e "${GREEN}✓ .env exists${NC}"
fi

# Verify environment
if grep -q "TELEGRAM_BOT_TOKEN=your_token_here\|TELEGRAM_BOT_TOKEN=$" .env 2>/dev/null; then
    echo -e "${RED}✗ TELEGRAM_BOT_TOKEN not configured in .env${NC}"
    echo "  Get a token from: https://t.me/BotFather"
    exit 1
fi

# Optional: Build Docker image
echo ""
read -p "Build Docker image now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🐳 Building Docker image..."
    docker compose build
    echo -e "${GREEN}✓ Docker image built${NC}"
fi

# Summary
echo ""
echo "✅ Setup Complete!"
echo ""
echo "📖 Next steps:"
echo "  1. Review .env configuration"
echo "  2. Ensure kpass and ksearch binaries are available"
echo "  3. Start the bot: docker compose up -d"
echo "  4. Check logs: docker compose logs -f"
echo "  5. Test the bot on Telegram"
echo ""
echo "📚 Documentation:"
echo "  - Quick Start: npm start"
echo "  - Architecture: Read ARCHITECTURE.md"
echo "  - Deployment: Read DEPLOYMENT.md"
echo "  - Troubleshooting: Read TROUBLESHOOTING.md"
echo ""
