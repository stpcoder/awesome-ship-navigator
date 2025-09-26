#!/bin/bash

echo "🚢 Ship Navigator - Complete Startup Script"
echo "=========================================="

# Navigate to project directory
cd "$(dirname "$0")"

# Function to kill process on port
kill_port() {
    local port=$1
    lsof -ti:$port | xargs kill -9 2>/dev/null && echo "✅ Cleared port $port" || echo "✅ Port $port is available"
}

# Clean up ports
echo "🧹 Cleaning up ports..."
kill_port 3000
kill_port 3001
kill_port 8000

echo ""
echo "📦 Setting up Backend..."
echo "------------------------"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install backend dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt --quiet

# Check if database exists
if [ ! -f "ship_routes.db" ]; then
    echo "Initializing database..."
    python init_all_data.py
fi

echo ""
echo "📦 Setting up Frontend..."
echo "-------------------------"

# Install frontend dependencies if needed
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi
cd ..

echo ""
echo "🚀 Starting Services..."
echo "----------------------"

# Start backend in background
echo "Starting Backend on http://localhost:8000"
(source venv/bin/activate && python app.py) &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Start frontend
echo "Starting Frontend on http://localhost:3000"
cd frontend
npm start &
FRONTEND_PID=$!

echo ""
echo "✨ Ship Navigator is running!"
echo "============================="
echo "📱 Frontend: http://localhost:3000"
echo "🔧 Backend:  http://localhost:8000"
echo "📖 API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services"

# Function to handle shutdown
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    kill_port 3000
    kill_port 8000
    echo "✅ All services stopped"
    exit 0
}

# Set up trap for Ctrl+C
trap cleanup SIGINT

# Keep script running
wait