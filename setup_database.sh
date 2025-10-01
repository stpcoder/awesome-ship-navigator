#!/bin/bash

# Ship Navigation System - Database Setup Script
echo "🚢 Ship Navigation System - Database Setup"
echo "=========================================="

# Check if database exists
if [ -f "ship_routes.db" ]; then
    echo "⚠️  Database file already exists: ship_routes.db"
    read -p "Do you want to reset it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Setup cancelled. Using existing database."
        exit 0
    fi
    echo "🗑️  Removing existing database..."
    rm ship_routes.db
fi

# Check if SQL dump exists
if [ ! -f "ship_routes_init.sql" ]; then
    echo "❌ Error: ship_routes_init.sql not found!"
    echo "Please ensure the SQL dump file is in the project directory."
    exit 1
fi

# Import SQL dump
echo "📥 Importing database from SQL dump..."
sqlite3 ship_routes.db < ship_routes_init.sql

if [ $? -eq 0 ]; then
    echo "✅ Database setup complete!"
    echo ""
    echo "📊 Database Summary:"
    echo "  - Ships: $(sqlite3 ship_routes.db 'SELECT COUNT(*) FROM ships;')"
    echo "  - CCTV Devices: $(sqlite3 ship_routes.db 'SELECT COUNT(*) FROM cctv_devices;')"
    echo "  - LiDAR Devices: $(sqlite3 ship_routes.db 'SELECT COUNT(*) FROM lidar_devices;')"
    echo "  - Simulation Routes: $(sqlite3 ship_routes.db 'SELECT COUNT(*) FROM ship_routes_simulation;')"
    echo ""
    echo "✨ Ready to start the application!"
else
    echo "❌ Error: Database import failed!"
    exit 1
fi
