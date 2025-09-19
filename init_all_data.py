"""Initialize all hardcoded data for the ship navigation system"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, Ship, CCTVDevice, LiDARDevice, WeatherData, ShipRealtimeLocation
from datetime import datetime
import random

def init_ships():
    """Generate EUM-style ships with fishing/docking positions"""
    ships = []

    # Define base coordinates for Pohang area matching the map
    # Top-left: 35.99382530549273, 129.54695161914708
    # Bottom-right: ~35.924, ~129.634
    base_lat = 35.959  # Center latitude
    base_lng = 129.590  # Center longitude

    # Generate 30 EUM ships (similar to EUM001-EUM030 from real API)
    ship_names = [
        "해성호", "동양호", "태평호", "대한호", "금성호",
        "바다호", "해운호", "포항호", "영일호", "구룡호",
        "신라호", "동해호", "태백호", "한성호", "대양호",
        "해동호", "신성호", "영광호", "동진호", "해양호",
        "백두호", "청룡호", "금강호", "한라호", "지리호",
        "설악호", "오대호", "덕유호", "가야호", "속리호"
    ]

    ship_types = ["어선", "화물선", "여객선", "예인선", "기타"]

    for i in range(30):
        ship_id = f"EUM{i+1:03d}"  # EUM001, EUM002, etc.
        ship_type = random.choice(ship_types) if i % 5 != 0 else "어선"  # Every 5th is fishing vessel

        # Generate random positions within the map bounds
        # Map bounds: lat 35.924 to 35.9938, lng 129.547 to 129.634
        # Fishing areas - slightly offshore (only for fishing vessels)
        if ship_type == "어선":
            fishing_lat = random.uniform(35.930, 35.980)  # Within map bounds
            fishing_lng = random.uniform(129.570, 129.620)  # Offshore area
        else:
            fishing_lat = None
            fishing_lng = None

        # Docking positions - closer to shore, near port area
        docking_lat = random.uniform(35.935, 35.970)  # Port area latitude range
        docking_lng = random.uniform(129.550, 129.590)  # Near shore longitude

        ship = {
            "ship_id": ship_id,
            "name": ship_names[i] if i < len(ship_names) else f"선박{i+1}호",
            "type": ship_type,
            "pol": "포항",
            "pol_addr": "경북 포항시 북구 항구동" if i % 2 == 0 else "경북 포항시 남구 구룡포읍",
            "length": random.uniform(20.0, 90.0) if ship_type != "어선" else random.uniform(15.0, 30.0),
            "breath": random.uniform(4.0, 15.0) if ship_type != "어선" else random.uniform(3.0, 7.0),
            "depth": random.uniform(2.0, 8.0) if ship_type != "어선" else random.uniform(1.5, 3.5),
            "gt": random.uniform(50.0, 3000.0) if ship_type != "어선" else random.uniform(10.0, 100.0),
            "fishing_area_lat": fishing_lat,
            "fishing_area_lng": fishing_lng,
            "docking_lat": docking_lat,
            "docking_lng": docking_lng
        }
        ships.append(ship)

    return ships

def init_cctv_devices():
    """Initialize hardcoded CCTV device data"""
    cctv_devices = [
        {
            "id": 1,
            "name": "포항 구룡포항 입구 CCTV",
            "latitude": "36.0012",
            "longitude": "129.5575",
            "address": "경북 포항시 남구 구룡포읍 구룡포리"
        },
        {
            "id": 2,
            "name": "포항 신항 제1부두 CCTV",
            "latitude": "36.0145",
            "longitude": "129.5615",
            "address": "경북 포항시 북구 흥해읍"
        },
        {
            "id": 3,
            "name": "포항 영일만항 CCTV",
            "latitude": "36.0089",
            "longitude": "129.5548",
            "address": "경북 포항시 북구 환여동"
        },
        {
            "id": 4,
            "name": "포항 구항 CCTV",
            "latitude": "36.0356",
            "longitude": "129.3655",
            "address": "경북 포항시 북구 중앙동"
        },
        {
            "id": 5,
            "name": "구룡포 어시장 CCTV",
            "latitude": "36.0018",
            "longitude": "129.5585",
            "address": "경북 포항시 남구 구룡포읍 구룡포리"
        },
        {
            "id": 6,
            "name": "포항 해경 전용부두 CCTV",
            "latitude": "36.0125",
            "longitude": "129.5595",
            "address": "경북 포항시 북구 항구동"
        },
        {
            "id": 7,
            "name": "영일대 해수욕장 CCTV",
            "latitude": "36.0612",
            "longitude": "129.3825",
            "address": "경북 포항시 북구 두호동"
        },
        {
            "id": 8,
            "name": "호미곶 전망대 CCTV",
            "latitude": "36.0765",
            "longitude": "129.5668",
            "address": "경북 포항시 남구 호미곶면"
        }
    ]

    return cctv_devices

def init_lidar_devices():
    """Initialize hardcoded LiDAR device data"""
    lidar_devices = [
        {
            "id": 1,
            "name": "포항 신항 LiDAR",
            "latitude": "36.0142",
            "longitude": "129.5608",
            "address": "경북 포항시 북구 흥해읍 영일만항로"
        },
        {
            "id": 2,
            "name": "구룡포항 LiDAR",
            "latitude": "36.0015",
            "longitude": "129.5578",
            "address": "경북 포항시 남구 구룡포읍"
        },
        {
            "id": 3,
            "name": "영일만 북방파제 LiDAR",
            "latitude": "36.0198",
            "longitude": "129.5682",
            "address": "경북 포항시 북구 영일만항"
        },
        {
            "id": 4,
            "name": "포항 구항 LiDAR",
            "latitude": "36.0358",
            "longitude": "129.3658",
            "address": "경북 포항시 북구 중앙동"
        },
        {
            "id": 5,
            "name": "호미곶 LiDAR",
            "latitude": "36.0768",
            "longitude": "129.5672",
            "address": "경북 포항시 남구 호미곶면 대보리"
        }
    ]

    return lidar_devices

def init_weather_data():
    """Initialize weather data"""
    weather = {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "temperature": 18.5,
        "wind_speed": 3.2,
        "wind_direction": 45.0,
        "humidity": 65.0
    }

    return weather

def init_realtime_locations(ships):
    """Initialize real-time locations for the ships"""
    locations = []

    # Create locations for first 10 ships
    for i, ship in enumerate(ships[:10]):
        # Use docking position as current location for most ships
        # Some ships can be at fishing areas
        if ship.get('fishing_area_lat') and i % 3 == 0:
            # Every third fishing vessel is at fishing area
            lat = ship['fishing_area_lat']
            lng = ship['fishing_area_lng']
            speed = random.uniform(5.0, 12.0)  # Moving at fishing area
        else:
            # At docking position
            lat = ship['docking_lat']
            lng = ship['docking_lng']
            speed = 0.0  # Docked

        location = {
            "dev_id": 100 + i,
            "ship_id": ship['ship_id'],
            "log_datetime": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "latitude": lat,
            "longitude": lng,
            "azimuth": random.uniform(0, 360),
            "course": random.uniform(0, 360),
            "speed": speed
        }
        locations.append(location)

    return locations

def initialize_database():
    """Initialize all database tables with hardcoded data"""
    db = SessionLocal()

    try:
        # Clear existing data
        print("Clearing existing data...")
        db.query(ShipRealtimeLocation).delete()
        db.query(Ship).delete()
        db.query(CCTVDevice).delete()
        db.query(LiDARDevice).delete()
        db.query(WeatherData).delete()
        db.commit()

        # Initialize ships
        print("Initializing ships...")
        ships = init_ships()
        for ship_data in ships:
            ship = Ship(**ship_data)
            db.add(ship)
        db.commit()
        print(f"✅ Added {len(ships)} ships")

        # Initialize CCTV devices
        print("Initializing CCTV devices...")
        cctv_devices = init_cctv_devices()
        for cctv_data in cctv_devices:
            cctv = CCTVDevice(**cctv_data)
            db.add(cctv)
        db.commit()
        print(f"✅ Added {len(cctv_devices)} CCTV devices")

        # Initialize LiDAR devices
        print("Initializing LiDAR devices...")
        lidar_devices = init_lidar_devices()
        for lidar_data in lidar_devices:
            lidar = LiDARDevice(**lidar_data)
            db.add(lidar)
        db.commit()
        print(f"✅ Added {len(lidar_devices)} LiDAR devices")

        # Initialize weather data
        print("Initializing weather data...")
        weather = init_weather_data()
        weather_obj = WeatherData(**weather)
        db.add(weather_obj)
        db.commit()
        print(f"✅ Added weather data for {weather['date']}")

        # Initialize real-time locations (pass ships data)
        print("Initializing real-time ship locations...")
        locations = init_realtime_locations(ships)
        for location_data in locations:
            location = ShipRealtimeLocation(**location_data)
            db.add(location)
        db.commit()
        print(f"✅ Added {len(locations)} real-time ship locations")

        print("\n✅ Database initialization complete!")
        print("All data has been successfully loaded.")

        # Display summary
        print("\n📊 Database Summary:")
        print(f"  - Ships: {db.query(Ship).count()}")
        print(f"  - CCTV Devices: {db.query(CCTVDevice).count()}")
        print(f"  - LiDAR Devices: {db.query(LiDARDevice).count()}")
        print(f"  - Weather Records: {db.query(WeatherData).count()}")
        print(f"  - Real-time Locations: {db.query(ShipRealtimeLocation).count()}")

    except Exception as e:
        print(f"❌ Error initializing database: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("🚢 Ship Navigation System - Database Initialization")
    print("=" * 50)
    initialize_database()