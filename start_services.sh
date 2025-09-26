#!/bin/bash

# Kill any existing processes on ports 3000 and 8000
echo "Cleaning up existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:8000 | xargs kill -9 2>/dev/null

# Wait a moment for ports to be freed
sleep 2

# Start backend server
echo "Starting backend server on port 8000..."
cd /Users/taehoje/awesome-ship-naivgator
python app.py &
BACKEND_PID=$!
echo "Backend started with PID: $BACKEND_PID"

# Wait for backend to start
sleep 3

# Start frontend server
echo "Starting frontend server on port 3000..."
cd /Users/taehoje/awesome-ship-naivgator/frontend
npm start &
FRONTEND_PID=$!
echo "Frontend started with PID: $FRONTEND_PID"

echo ""
echo "Services started successfully!"
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both services"

# Wait for interrupt
trap "echo 'Stopping services...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

# Keep script running
wait