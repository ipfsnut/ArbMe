#!/bin/bash

# Deploy ArbMe Frontend to Railway
# This script builds the Vite frontend and copies it to the Express server's public directory

set -e  # Exit on error

echo "🏗️  Building frontend..."
cd frontend
npm run build

echo "📦 Copying build to server public directory..."
cd ..
rm -rf bot/public/app/*
cp -r frontend/dist/* bot/public/app/

echo "✅ Frontend build copied to bot/public/app/"
echo ""
echo "📋 Files in bot/public/app/:"
ls -lh bot/public/app/

echo ""
echo "🚀 Next steps:"
echo "   1. git add ."
echo "   2. git commit -m 'Deploy new frontend build'"
echo "   3. git push"
echo "   4. Railway will automatically deploy"
echo ""
echo "   Or run: npm run deploy (if you have this script configured)"
