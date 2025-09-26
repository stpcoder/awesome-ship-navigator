#!/bin/bash

echo "🚢 Starting Ship Navigator Frontend..."

# Navigate to frontend directory
cd "$(dirname "$0")/frontend"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

# Kill any process using port 3000
echo "🔧 Checking port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null && echo "✅ Cleared port 3000" || echo "✅ Port 3000 is available"

# Start the frontend server
echo "🚀 Starting React server on http://localhost:3000"
npm start