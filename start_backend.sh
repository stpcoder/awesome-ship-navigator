#!/bin/bash

echo "🚢 Starting Ship Navigator Backend..."

# Navigate to project directory
cd "$(dirname "$0")"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install or update dependencies
echo "📚 Installing dependencies..."
pip install -r requirements.txt --quiet

# Check if database exists, if not initialize it
if [ ! -f "ship_routes.db" ]; then
    echo "🗄️ Initializing database..."
    python init_all_data.py
fi

# Start the backend server
echo "🚀 Starting FastAPI server on http://localhost:8000"
echo "📖 API Documentation available at http://localhost:8000/docs"
python app.py