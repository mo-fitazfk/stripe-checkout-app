#!/bin/bash

# Stripe Shopify Checkout Setup Script
echo "🚀 Setting up Stripe Checkout with Shopify Integration..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Install server dependencies
echo "📦 Installing server dependencies..."
cd server && npm install && cd ..

# Install client dependencies
echo "📦 Installing client dependencies..."
cd client && npm install && cd ..

# Create environment files
echo "⚙️  Setting up environment files..."

# Server environment
if [ ! -f "server/.env" ]; then
    cp server/env.example server/.env
    echo "✅ Created server/.env from template"
    echo "⚠️  Please edit server/.env with your actual credentials"
else
    echo "✅ server/.env already exists"
fi

# Client environment
if [ ! -f "client/.env" ]; then
    cp client/env.example client/.env
    echo "✅ Created client/.env from template"
    echo "⚠️  Please edit client/.env with your Stripe publishable key"
else
    echo "✅ client/.env already exists"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit server/.env with your Stripe and Shopify credentials"
echo "2. Edit client/.env with your Stripe publishable key"
echo "3. Run 'npm run dev' to start the application"
echo ""
echo "🔗 Useful links:"
echo "- Stripe Dashboard: https://dashboard.stripe.com"
echo "- Shopify Admin: https://your-shop.myshopify.com/admin"
echo "- Documentation: See README.md"
echo ""
echo "Happy coding! 🚀"
