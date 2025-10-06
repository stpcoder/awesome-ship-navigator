"""FastAPI application for ship route optimization"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import numpy as np
from shapely.geometry import Polygon
from datetime import datetime, timedelta
import subprocess
import os
import sys
import sqlite3

from database import (
    get_db, ShipRoute as DBShipRoute, Ship as DBShip,
    ShipRealtimeLocation as DBShipRealtimeLocation,
    CCTVDevice as DBCCTVDevice, LiDARDevice as DBLiDARDevice,
    WeatherData as DBWeatherData, SOSAlert as DBSOSAlert,
    Message as DBMessage
)
from models import (
    RouteRequest, RouteResponse, RouteAcceptance, RouteStatus, RouteSegment,
    ShipInfo, CCTVDevice, LiDARDevice, ShipRealtimeLocation, WeatherData,
    ShipDensityGrid, ShipRoute as ShipRouteModel, ShipRealtimeWithRoute,
    ShipPositionUpdate, DepartureRouteRequest, ArrivalRouteRequest,
    SOSRequest, SOSResponse, SOSUpdateStatus,
    MessageRequest, MessageResponse, MessageMarkRead
)
from eum_api_client import EUMAPIClient
from core_optimizer_latlng import (
    ShipRoute, RouteOptimizer
)
from chatbot_service import ChatbotService
from weather_service import WeatherService
from ship001_routes import SHIP001_ROUTES


app = FastAPI(title="Ship Navigation Optimizer", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for optimization components
route_optimizer = None
obstacles_latlng = []  # Obstacles in lat/lng coordinates
eum_client = None
chatbot_service = None
weather_service = None


def load_obstacles_from_json(json_file='guryongpo_obstacles_drawn.json'):
    """Load obstacles from JSON file and convert to lat/lng"""
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    obstacles = []
    for item in data:
        # Original coordinates are in pixels, convert to lat/lng
        pixel_coords = item['polygon']
        latlng_coords = []
        for x, y in pixel_coords:
            # Convert from pixel to lat/lng using MAP_ORIGIN as reference
            # Assuming 1 pixel = ~0.00001 degrees (adjust as needed)
            lat = MAP_ORIGIN['lat'] - (y * 0.00001)  # Y increases downward
            lng = MAP_ORIGIN['lng'] + (x * 0.00001)  # X increases rightward
            latlng_coords.append((lat, lng))

        # Create ObstaclePolygon object instead of plain Polygon
        from core_optimizer_latlng import ObstaclePolygon
        obstacle = ObstaclePolygon(vertices=latlng_coords)
        obstacles.append(obstacle)

    return obstacles


@app.on_event("startup")
async def startup_event():
    """Initialize optimization components on startup"""
    global route_optimizer, obstacles_latlng, eum_client, chatbot_service, weather_service

    print("🚀 Starting Ship Navigation System...")

    # Check if database needs initialization
    db = next(get_db())
    try:
        ship_count = db.query(DBShip).count()
        cctv_count = db.query(DBCCTVDevice).count()
        lidar_count = db.query(DBLiDARDevice).count()

        # If any table is empty, initialize all data
        if ship_count == 0 or cctv_count == 0 or lidar_count == 0:
            print("📊 Database is empty. Initializing with hardcoded data...")
            # Run initialization script
            result = subprocess.run([sys.executable, "init_all_data.py"], capture_output=True, text=True)
            if result.returncode == 0:
                print("✅ Database initialized successfully")
                print(result.stdout)
            else:
                print(f"❌ Failed to initialize database: {result.stderr}")
        else:
            print(f"✅ Database already contains data:")
            print(f"   - Ships: {ship_count}")
            print(f"   - CCTV devices: {cctv_count}")
            print(f"   - LiDAR devices: {lidar_count}")
    except Exception as e:
        print(f"❌ Error checking database: {e}")
    finally:
        db.close()

    # Load obstacles in lat/lng format
    obstacles_latlng = load_obstacles_from_json()

    # Initialize lat/lng-based route optimizer
    route_optimizer = RouteOptimizer(
        obstacles=obstacles_latlng
    )

    # Initialize EUM API client
    eum_client = EUMAPIClient()

    # Initialize chatbot service
    chatbot_service = ChatbotService()

    # Initialize Weather service
    weather_service = WeatherService()

    # Skip sync_ship_list since we're using hardcoded data now
    # await sync_ship_list()

    print("✅ Ship Navigation Optimizer initialized")


async def sync_ship_list():
    """Sync ship list from EUM API to database (disabled - using hardcoded data)"""
    # This function is now disabled since we're using hardcoded data
    # Keep it for future use if we want to sync with real API
    return

    global eum_client
    db = next(get_db())

    try:
        ships = eum_client.get_ship_list()
        for ship_data in ships:
            # Check if ship exists
            existing = db.query(DBShip).filter(
                DBShip.ship_id == ship_data['shipId']
            ).first()

            if not existing:
                db_ship = DBShip(
                    ship_id=ship_data['shipId'],
                    name=ship_data['name'],
                    type=ship_data['type'],
                    pol=ship_data['pol'],
                    pol_addr=ship_data['polAddr'],
                    length=ship_data['length'],
                    breath=ship_data['breath'],
                    depth=ship_data['depth'],
                    gt=ship_data['gt']
                )
                db.add(db_ship)
            else:
                # Update existing ship
                existing.name = ship_data['name']
                existing.type = ship_data['type']
                existing.updated_at = datetime.utcnow()

        db.commit()
        print(f"Synced {len(ships)} ships from EUM API")
    except Exception as e:
        print(f"Failed to sync ship list: {e}")
    finally:
        db.close()


def get_existing_ships(db: Session, exclude_ship_id: str = None) -> List[ShipRoute]:
    """Get all active ships from database"""
    query = db.query(DBShipRoute).filter(
        DBShipRoute.status.in_(['accepted', 'active'])
    )

    if exclude_ship_id:
        query = query.filter(DBShipRoute.ship_id != exclude_ship_id)

    db_ships = query.all()
    ships = []

    for db_ship in db_ships:
        # Get path - if it's in pixel format, convert to lat/lng
        path_data = db_ship.get_path()
        path_latlng = []
        for point in path_data:
            if isinstance(point, (list, tuple)) and len(point) == 2:
                # Check if it's already lat/lng (values in typical range)
                if 35 <= point[0] <= 37 and 129 <= point[1] <= 131:
                    path_latlng.append(point)
                else:
                    # Convert from pixel to lat/lng
                    lat = MAP_ORIGIN['lat'] - (point[1] * 0.00001)
                    lng = MAP_ORIGIN['lng'] + (point[0] * 0.00001)
                    path_latlng.append((lat, lng))

        # Get start and goal in lat/lng
        start_lat = db_ship.start_lat if hasattr(db_ship, 'start_lat') and db_ship.start_lat else \
                   MAP_ORIGIN['lat'] - (db_ship.start_y * 0.00001)
        start_lng = db_ship.start_lng if hasattr(db_ship, 'start_lng') and db_ship.start_lng else \
                   MAP_ORIGIN['lng'] + (db_ship.start_x * 0.00001)
        goal_lat = db_ship.goal_lat if hasattr(db_ship, 'goal_lat') and db_ship.goal_lat else \
                  MAP_ORIGIN['lat'] - (db_ship.goal_y * 0.00001)
        goal_lng = db_ship.goal_lng if hasattr(db_ship, 'goal_lng') and db_ship.goal_lng else \
                  MAP_ORIGIN['lng'] + (db_ship.goal_x * 0.00001)

        ship = ShipRoute(
            name=db_ship.name or db_ship.ship_id,
            ship_id=db_ship.ship_id,
            start=(start_lat, start_lng),
            goal=(goal_lat, goal_lng),
            path=path_latlng,
            departure_time=db_ship.actual_departure,
            speed_knots=db_ship.speed_knots
        )
        ship.calculate_timestamps()
        ships.append(ship)

    return ships


def calculate_segments(path: List[tuple], speed_knots: float) -> List[RouteSegment]:
    """Calculate route segments with speeds using lat/lng coordinates"""
    from core_optimizer_latlng import haversine_distance

    segments = []
    speed_nm_per_minute = speed_knots / 60.0

    for i in range(len(path) - 1):
        start = path[i]
        end = path[i + 1]

        # Calculate distance using haversine formula
        distance_nm = haversine_distance(start[0], start[1], end[0], end[1])
        duration_minutes = distance_nm / speed_nm_per_minute if speed_nm_per_minute > 0 else 0

        segment = RouteSegment(
            start_point=start,
            end_point=end,
            speed_knots=speed_knots,
            duration_minutes=duration_minutes,
            distance_nm=distance_nm
        )
        segments.append(segment)

    return segments


@app.post("/api/route/plan", response_model=RouteResponse)
async def plan_route(request: RouteRequest, db: Session = Depends(get_db)):
    """Plan optimal route for a ship using lat/lng coordinates"""

    # Work directly with lat/lng coordinates
    start_pos = request.start_position
    goal_pos = request.goal_position

    print(f"DEBUG: Received start_position: {start_pos}, type: {type(start_pos)}")
    print(f"DEBUG: Received goal_position: {goal_pos}, type: {type(goal_pos)}")

    # Convert from old pixel format to lat/lng if needed
    if isinstance(start_pos, (list, tuple)) and len(start_pos) == 2:
        # Check if it's already lat/lng (typical Pohang area values)
        if not (35 <= start_pos[0] <= 37 and 129 <= start_pos[1] <= 131):
            # Convert from pixel to lat/lng
            start_lat = MAP_ORIGIN['lat'] - (start_pos[1] * 0.00001)
            start_lng = MAP_ORIGIN['lng'] + (start_pos[0] * 0.00001)
            start_pos = (start_lat, start_lng)
            print(f"Converted start from pixels to lat/lng: {start_pos}")

    if isinstance(goal_pos, (list, tuple)) and len(goal_pos) == 2:
        # Check if it's already lat/lng (typical Pohang area values)
        if not (35 <= goal_pos[0] <= 37 and 129 <= goal_pos[1] <= 131):
            # Convert from pixel to lat/lng
            goal_lat = MAP_ORIGIN['lat'] - (goal_pos[1] * 0.00001)
            goal_lng = MAP_ORIGIN['lng'] + (goal_pos[0] * 0.00001)
            goal_pos = (goal_lat, goal_lng)
            print(f"Converted goal from pixels to lat/lng: {goal_pos}")

    # Get existing ships
    existing_ships = get_existing_ships(db, exclude_ship_id=request.ship_id)

    print(f"Processing route from {start_pos} to {goal_pos}")

    # Find optimal path using lat/lng-based A* algorithm
    optimal_path = route_optimizer.find_path_astar(
        start_pos[0], start_pos[1],
        goal_pos[0], goal_pos[1],
        departure_time=datetime.fromtimestamp(request.departure_time * 60) if request.departure_time else None
    )

    if not optimal_path:
        raise HTTPException(status_code=400, detail="No valid path found")

    # Create ship route with lat/lng coordinates
    new_ship = ShipRoute(
        name=request.ship_id,
        ship_id=request.ship_id,
        start=start_pos,
        goal=goal_pos,
        path=optimal_path,
        departure_time=request.departure_time,
        speed_knots=request.speed_knots
    )
    new_ship.calculate_timestamps()

    # Check for time conflicts with existing ships and optimize
    if existing_ships:
        # Try to find a better departure time if there are conflicts
        optimal_time = route_optimizer.optimize_departure_time(
            new_ship, existing_ships,
            time_window_minutes=120  # Allow +/- 2 hours flexibility
        )
        if optimal_time != request.departure_time:
            # Recalculate path with new departure time
            optimal_path = route_optimizer.find_path_astar(
                start_pos[0], start_pos[1],
                goal_pos[0], goal_pos[1],
                departure_time=datetime.fromtimestamp(optimal_time * 60)
            )
            new_ship.departure_time = optimal_time
            new_ship.path = optimal_path
            new_ship.calculate_timestamps()
    else:
        optimal_time = request.departure_time

    # Calculate metrics
    segments = calculate_segments(optimal_path, request.speed_knots)
    path_length_nm = sum(seg.distance_nm for seg in segments)
    total_duration = sum(seg.duration_minutes for seg in segments)
    arrival_time = optimal_time + total_duration

    # Determine optimization type
    time_adjusted = abs(optimal_time - request.departure_time) > 0.1
    optimization_type = "time_adjusted" if time_adjusted else "none"

    # Save to database (as pending)
    db_ship = DBShipRoute(
        ship_id=request.ship_id,
        ship_name=request.ship_id,
        start_lat=start_pos[0],
        start_lng=start_pos[1],
        goal_lat=goal_pos[0],
        goal_lng=goal_pos[1],
        requested_departure=request.departure_time,
        actual_departure=optimal_time,
        arrival_time=arrival_time,
        speed_knots=request.speed_knots,
        path_length_nm=path_length_nm,
        status='pending',
        optimization_mode='flexible'
    )
    db_ship.set_path(optimal_path)
    db_ship.set_speeds([request.speed_knots] * len(segments))

    # Check if ship already exists and properly delete it
    existing = db.query(DBShipRoute).filter(DBShipRoute.ship_id == request.ship_id).first()
    if existing:
        db.delete(existing)
        db.commit()  # Commit the deletion first

    db.add(db_ship)
    db.commit()

    # Path is already in lat/lng format
    path_points_latlng = [[point[0], point[1]] for point in optimal_path]

    # Segments are already in lat/lng format
    segments_latlng = []
    for seg in segments:
        seg_dict = seg.dict()
        seg_dict['start_point'] = [seg.start_point[0], seg.start_point[1]]
        seg_dict['end_point'] = [seg.end_point[0], seg.end_point[1]]
        segments_latlng.append(RouteSegment(**seg_dict))

    return RouteResponse(
        ship_id=request.ship_id,
        recommended_departure=optimal_time,
        arrival_time=arrival_time,
        path_points=path_points_latlng,  # Return path in lat/lng format
        segments=segments_latlng,
        total_distance_nm=path_length_nm,
        total_duration_minutes=total_duration,
        optimization_type=optimization_type,
        time_saved_minutes=optimal_time - request.departure_time if optimal_time < request.departure_time else None,
        detour_distance_nm=None  # Not applicable in new system
    )


@app.post("/api/route/accept")
async def accept_route(acceptance: RouteAcceptance, db: Session = Depends(get_db)):
    """Accept or reject recommended route"""

    # Get ship from database
    db_ship = db.query(DBShipRoute).filter(
        DBShipRoute.ship_id == acceptance.ship_id
    ).first()

    if not db_ship:
        raise HTTPException(status_code=404, detail="Ship route not found")

    if acceptance.accept:
        # Accept recommended time
        db_ship.status = 'accepted'
        db_ship.optimization_mode = 'flexible'
        db.commit()

        return {"message": f"Route accepted for ship {acceptance.ship_id}"}

    else:
        # Reject recommended time - use fixed time mode
        existing_ships = get_existing_ships(db, exclude_ship_id=acceptance.ship_id)

        # Create ship route with original requested time
        ship = ShipRoute(
            name=db_ship.name,
            ship_id=db_ship.ship_id,
            start=(db_ship.start_x, db_ship.start_y),
            goal=(db_ship.goal_x, db_ship.goal_y),
            path=db_ship.get_path(),
            departure_time=db_ship.requested_departure,  # Use original requested time
            speed_knots=db_ship.speed_knots
        )
        ship.calculate_timestamps()

        # Optimize with fixed time
        optimal_path = route_optimizer.optimize_fixed_time(ship, existing_ships)

        # Update database
        db_ship.actual_departure = db_ship.requested_departure
        db_ship.set_path(optimal_path)

        # Recalculate arrival time
        path_length_nm = route_optimizer.calculate_path_length(optimal_path) * PIXEL_TO_NM
        segments = calculate_segments(optimal_path, db_ship.speed_knots)
        total_duration = sum(seg.duration_minutes for seg in segments)

        db_ship.arrival_time = db_ship.requested_departure + total_duration
        db_ship.path_length_nm = path_length_nm
        db_ship.status = 'accepted'
        db_ship.optimization_mode = 'fixed'
        db_ship.set_speeds([db_ship.speed_knots] * len(segments))

        db.commit()

        # Return new route details
        return RouteResponse(
            ship_id=db_ship.ship_id,
            recommended_departure=db_ship.actual_departure,
            arrival_time=db_ship.arrival_time,
            path_points=optimal_path,
            segments=segments,
            total_distance_nm=path_length_nm,
            total_duration_minutes=total_duration,
            optimization_type="path_only",
            detour_distance_nm=path_length_nm - (len(db_ship.get_path()) * PIXEL_TO_NM)
        )


@app.get("/api/ships", response_model=List[RouteStatus])
async def get_all_ships(db: Session = Depends(get_db)):
    """Get all ships and their current status"""

    db_ships = db.query(DBShipRoute).all()
    results = []

    for db_ship in db_ships:
        # Calculate current position if active
        current_position = None
        if db_ship.status in ['active', 'accepted']:
            ship = ShipRoute(
                name=db_ship.name,
                ship_id=db_ship.ship_id,
                start=(db_ship.start_x, db_ship.start_y),
                goal=(db_ship.goal_x, db_ship.goal_y),
                path=db_ship.get_path(),
                departure_time=db_ship.actual_departure,
                speed_knots=db_ship.speed_knots
            )
            ship.calculate_timestamps()

            # Get current time (simplified - would use real time in production)
            import time
            current_time = time.time() / 60  # Convert to minutes
            current_position = ship.get_position_at_time(current_time)

        status = RouteStatus(
            ship_id=db_ship.ship_id,
            status=db_ship.status,
            current_position=current_position,
            departure_time=db_ship.actual_departure,
            arrival_time=db_ship.arrival_time,
            path_points=db_ship.get_path(),
            optimization_mode=db_ship.optimization_mode or 'flexible'
        )
        results.append(status)

    return results


@app.get("/api/ship/{ship_id}", response_model=RouteStatus)
async def get_ship_status(ship_id: str, db: Session = Depends(get_db)):
    """Get specific ship status"""

    db_ship = db.query(DBShipRoute).filter(
        DBShipRoute.ship_id == ship_id
    ).first()

    if not db_ship:
        raise HTTPException(status_code=404, detail="Ship not found")

    # Calculate current position if active
    current_position = None
    if db_ship.status in ['active', 'accepted']:
        ship = ShipRoute(
            name=db_ship.name,
            ship_id=db_ship.ship_id,
            start=(db_ship.start_x, db_ship.start_y),
            goal=(db_ship.goal_x, db_ship.goal_y),
            path=db_ship.get_path(),
            departure_time=db_ship.actual_departure,
            speed_knots=db_ship.speed_knots
        )
        ship.calculate_timestamps()

        import time
        current_time = time.time() / 60
        current_position = ship.get_position_at_time(current_time)

    return RouteStatus(
        ship_id=db_ship.ship_id,
        status=db_ship.status,
        current_position=current_position,
        departure_time=db_ship.actual_departure,
        arrival_time=db_ship.arrival_time,
        path_points=db_ship.get_path(),
        optimization_mode=db_ship.optimization_mode or 'flexible'
    )


@app.delete("/api/ship/{ship_id}")
async def delete_ship(ship_id: str, db: Session = Depends(get_db)):
    """Delete a ship route"""

    db_ship = db.query(DBShipRoute).filter(
        DBShipRoute.ship_id == ship_id
    ).first()

    if not db_ship:
        raise HTTPException(status_code=404, detail="Ship not found")

    db.delete(db_ship)
    db.commit()

    return {"message": f"Ship {ship_id} deleted successfully"}


# EUM API Integration Endpoints

@app.get("/api/eum/ships", response_model=List[ShipInfo])
async def get_eum_ships(db: Session = Depends(get_db)):
    """Get all ships from database (synced from EUM API)"""
    ships = db.query(DBShip).all()
    return [
        ShipInfo(
            id=ship.id,
            shipId=ship.ship_id,
            type=ship.type or "",
            name=ship.name or "",
            pol=ship.pol or "",
            polAddr=ship.pol_addr or "",
            hm="",
            pe="",
            ps=0.0,
            kw=0.0,
            engineCnt=0,
            propeller="",
            propellerCnt=0,
            length=ship.length or 0.0,
            breath=ship.breath or 0.0,
            depth=ship.depth or 0.0,
            gt=ship.gt or 0.0,
            sign="",
            rgDtm="",
            dcDate="",
            fishingAreaLat=ship.fishing_area_lat,
            fishingAreaLng=ship.fishing_area_lng,
            dockingLat=ship.docking_lat,
            dockingLng=ship.docking_lng
        ) for ship in ships
    ]


@app.post("/api/eum/ships/sync")
async def sync_ships_from_eum():
    """Manually trigger ship list sync from EUM API"""
    await sync_ship_list()
    return {"message": "Ship list synchronized successfully"}


@app.put("/api/eum/ships/{ship_id}/positions")
async def update_ship_positions(
    ship_id: str,
    positions: ShipPositionUpdate,
    db: Session = Depends(get_db)
):
    """Update fishing area and docking positions for a ship"""
    ship = db.query(DBShip).filter(DBShip.ship_id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")

    # Update fishing area if provided
    if positions.fishingAreaLat is not None and positions.fishingAreaLng is not None:
        ship.fishing_area_lat = positions.fishingAreaLat
        ship.fishing_area_lng = positions.fishingAreaLng

    # Update docking position if provided
    if positions.dockingLat is not None and positions.dockingLng is not None:
        ship.docking_lat = positions.dockingLat
        ship.docking_lng = positions.dockingLng

    db.commit()
    return {"message": f"Positions updated for ship {ship_id}"}


@app.get("/api/eum/cctv", response_model=List[CCTVDevice])
async def get_cctv_devices(db: Session = Depends(get_db)):
    """Get CCTV devices (hardcoded from actual EUM API data)"""
    # Hardcoded CCTV data from cctv.md with correct coordinates
    cctv_data = [
        {"id": 1, "name": "구룡포 북방파제 AI-01-001", "latitude": "35.985667", "longitude": "129.557917", "address": "포항시 남구 구룡포읍 구룡포리 954-3", "url": "https://hls-cctv.pohang-eum.co.kr/cam1/index.m3u8", "poleId": 6},
        {"id": 2, "name": "구룡포 북방파제 ROTT-01-001", "latitude": "35.985667", "longitude": "129.557917", "address": "포항시 남구 구룡포읍 구룡포리 954-3", "url": "https://hls-cctv.pohang-eum.co.kr/cam2/index.m3u8", "poleId": 6},
        {"id": 3, "name": "구룡포 북방파제 AI-02-002", "latitude": "35.989056", "longitude": "129.560639", "address": "포항시 남구 구룡포읍 구룡포리 954-3", "url": "https://hls-cctv.pohang-eum.co.kr/cam3/index.m3u8", "poleId": 9},
        {"id": 4, "name": "구룡포 북방파제 AI-02-001", "latitude": "35.989056", "longitude": "129.560639", "address": "포항시 남구 구룡포읍 구룡포리 954-3", "url": "https://hls-cctv.pohang-eum.co.kr/cam4/index.m3u8", "poleId": 9},
        {"id": 5, "name": "구룡포 북방파제 ROTT-02-001", "latitude": "35.989056", "longitude": "129.560639", "address": "포항시 남구 구룡포읍 구룡포리 954-3", "url": "https://hls-cctv.pohang-eum.co.kr/cam5/index.m3u8", "poleId": 9},
        {"id": 6, "name": "구룡포 북방파제 AI-03-001", "latitude": "35.988194", "longitude": "129.559556", "address": "포항시 남구 구룡포읍 구룡포리 954-3", "url": "https://hls-cctv.pohang-eum.co.kr/cam6/index.m3u8", "poleId": 8},
        {"id": 7, "name": "구룡포 북방파제 AI-03-002", "latitude": "35.988194", "longitude": "129.559556", "address": "포항시 남구 구룡포읍 구룡포리 954-3", "url": "https://hls-cctv.pohang-eum.co.kr/cam7/index.m3u8", "poleId": 8},
        {"id": 8, "name": "구룡포 북방파제 ROTT-03-001", "latitude": "35.988194", "longitude": "129.559556", "address": "포항시 남구 구룡포읍 구룡포리 954-3", "url": "https://hls-cctv.pohang-eum.co.kr/cam8/index.m3u8", "poleId": 8},
        {"id": 9, "name": "구룡포 북방파제 AI-04-002", "latitude": "35.987417", "longitude": "129.558556", "address": "포항시 남구 구룡포읍 구룡포리 954-3", "url": "https://hls-cctv.pohang-eum.co.kr/cam9/index.m3u8", "poleId": 7},
        {"id": 10, "name": "구룡포 북방파제 AI-04-001", "latitude": "35.987417", "longitude": "129.558556", "address": "포항시 남구 구룡포읍 구룡포리 954-3", "url": "https://hls-cctv.pohang-eum.co.kr/cam10/index.m3u8", "poleId": 7},
        {"id": 11, "name": "구룡포 북방파제 ROTT-04-001", "latitude": "35.987417", "longitude": "129.558556", "address": "포항시 남구 구룡포읍 구룡포리 954-3", "url": "https://hls-cctv.pohang-eum.co.kr/cam11/index.m3u8", "poleId": 7},
        {"id": 12, "name": "구룡포수협맞은편 ROTT-01-001", "latitude": "35.991111", "longitude": "129.557444", "address": "포항시 남구 구룡포읍 구룡포리 954-30", "url": "https://hls-cctv.pohang-eum.co.kr/cam12/index.m3u8", "poleId": 10},
        {"id": 13, "name": "구룡포항구어시장맞은편 ROTT-01-001", "latitude": "35.990694", "longitude": "129.555917", "address": "포항시 남구 구룡포읍 구룡포리 954-34", "url": "https://hls-cctv.pohang-eum.co.kr/cam13/index.m3u8", "poleId": 11},
        {"id": 14, "name": "구룡포 공영주차장(신축) ROTT-01-001", "latitude": "35.987417", "longitude": "129.552333", "address": "포항시 남구 구룡포읍 구룡포리 954-11", "url": "https://hls-cctv.pohang-eum.co.kr/cam14/index.m3u8", "poleId": 12},
        {"id": 15, "name": "구룡포수협냉동공장맞은편 ROTT-01-001", "latitude": "35.985500", "longitude": "129.551833", "address": "포항시 남구 구룡포읍 구룡포리 954-12", "url": "https://hls-cctv.pohang-eum.co.kr/cam15/index.m3u8", "poleId": 13},
        {"id": 16, "name": "구룡포 남방파제 AI-01-001", "latitude": "35.982750", "longitude": "129.557889", "address": "포항시 남구 구룡포읍 병포리 1-5", "url": "https://hls-cctv.pohang-eum.co.kr/cam16/index.m3u8", "poleId": 14},
        {"id": 17, "name": "구룡포 남방파제 AI-01-002", "latitude": "35.982750", "longitude": "129.557889", "address": "포항시 남구 구룡포읍 병포리 1-5", "url": "https://hls-cctv.pohang-eum.co.kr/cam17/index.m3u8", "poleId": 14},
        {"id": 18, "name": "구룡포 남방파제 ROTT-01-001", "latitude": "35.982750", "longitude": "129.557889", "address": "포항시 남구 구룡포읍 병포리 1-5", "url": "https://hls-cctv.pohang-eum.co.kr/cam18/index.m3u8", "poleId": 14},
        {"id": 19, "name": "구룡포 남방파제 AI-02-001", "latitude": "35.984056", "longitude": "129.558250", "address": "포항시 남구 구룡포읍 병포리 1-5", "url": "https://hls-cctv.pohang-eum.co.kr/cam19/index.m3u8", "poleId": 15},
        {"id": 20, "name": "구룡포 남방파제 ROTT-02-001", "latitude": "35.984056", "longitude": "129.558250", "address": "포항시 남구 구룡포읍 병포리 1-5", "url": "https://hls-cctv.pohang-eum.co.kr/cam20/index.m3u8", "poleId": 15},
        {"id": 21, "name": "구룡포 남방파제 AI-03-001", "latitude": "35.984917", "longitude": "129.559167", "address": "포항시 남구 구룡포읍 병포리 1-5", "url": "https://hls-cctv.pohang-eum.co.kr/cam21/index.m3u8", "poleId": 16},
        {"id": 22, "name": "구룡포 남방파제 AI-04-001", "latitude": "35.985583", "longitude": "129.560139", "address": "포항시 남구 구룡포읍 병포리 1-5", "url": "https://hls-cctv.pohang-eum.co.kr/cam22/index.m3u8", "poleId": 17},
        {"id": 23, "name": "구룡포 남방파제 ROTT-04-001", "latitude": "35.985583", "longitude": "129.560139", "address": "포항시 남구 구룡포읍 병포리 1-5", "url": "https://hls-cctv.pohang-eum.co.kr/cam23/index.m3u8", "poleId": 17}
    ]

    return [
        CCTVDevice(
            id=device['id'],
            name=device['name'],
            latitude=device['latitude'],
            longitude=device['longitude'],
            address=device['address'],
            url=device.get('url'),
            poleId=device.get('poleId')
        ) for device in cctv_data
    ]


@app.get("/api/eum/lidar", response_model=List[LiDARDevice])
async def get_lidar_devices(db: Session = Depends(get_db)):
    """Get LiDAR devices (hardcoded data)"""

    # Hardcoded LiDAR data from EUM API
    lidar_data = [
        {
            "id": 1,
            "name": "구룡포 북방파제",
            "latitude": "35.985667",
            "longitude": "129.557917",
            "address": "포항시 남구 구룡포읍 구룡포리 954-3"
        },
        {
            "id": 2,
            "name": "구룡포 남방파제",
            "latitude": "35.984917",
            "longitude": "129.559167",
            "address": "포항시 남구 구룡포읍 병포리 1-5"
        }
    ]

    return [
        LiDARDevice(
            id=device['id'],
            name=device['name'],
            latitude=device['latitude'],
            longitude=device['longitude'],
            address=device['address']
        ) for device in lidar_data
    ]


@app.get("/api/eum/lidar/statistics")
async def get_lidar_statistics():
    """Get real LiDAR entry/exit statistics from EUM API"""
    import requests
    import logging
    logger = logging.getLogger(__name__)

    try:
        # Fetch real-time statistics from EUM API
        response = requests.get('https://apis.pohang-eum.co.kr/lidar/realtime/recent/statics', verify=False)

        if response.status_code == 200:
            api_data = response.json()

            if api_data.get('status') == 'success' and 'data' in api_data:
                stats_data = api_data['data']

                # Format data for frontend consumption
                formatted_data = {
                    "last24h": {
                        "entry": stats_data['last24hStats']['inCnt'],
                        "exit": stats_data['last24hStats']['outCnt']
                    },
                    "by3hours": []
                }

                # Add 3-hour interval data
                for item in stats_data['last24hBy3h']:
                    formatted_data['by3hours'].append({
                        "timestamp": item['timeStamp'],
                        "entry": item['inCnt'],
                        "exit": item['outCnt']
                    })

                # Calculate the most recent 3 hour period for "today" stats
                if stats_data['last24hBy3h']:
                    recent = stats_data['last24hBy3h'][-1]  # Most recent 3-hour period
                    formatted_data['recent3h'] = {
                        "entry": recent['inCnt'],
                        "exit": recent['outCnt']
                    }

                return JSONResponse(content=formatted_data)
            else:
                logger.error(f"Invalid API response format: {api_data}")
                return JSONResponse(content={"error": "Invalid API response format"}, status_code=500)

        else:
            logger.error(f"LiDAR statistics API call failed: {response.status_code}")
            return JSONResponse(content={"error": f"API call failed with status {response.status_code}"}, status_code=500)

    except requests.RequestException as e:
        logger.error(f"LiDAR statistics API error: {e}")
        return JSONResponse(content={"error": f"Failed to fetch LiDAR statistics: {str(e)}"}, status_code=500)
    except Exception as e:
        logger.error(f"Unexpected error in LiDAR statistics: {e}")
        return JSONResponse(content={"error": f"Unexpected error: {str(e)}"}, status_code=500)


@app.get("/api/eum/weather")
async def get_weather(date: Optional[str] = None, db: Session = Depends(get_db)):
    """Get weather data from OpenWeatherMap API"""
    global weather_service

    # Get current weather from OpenWeatherMap
    weather_data = await weather_service.get_current_weather()

    if "error" not in weather_data:
        # Successfully got weather data
        return WeatherData(
            temperature=weather_data.get('temperature', 0.0),
            windSpeed=weather_data.get('wind_speed', 0.0),
            windDirection=weather_data.get('wind_direction', 0.0),
            humidity=weather_data.get('humidity', 0.0)
        )
    else:
        # Try to get cached data from database if API fails
        cached = db.query(DBWeatherData).order_by(DBWeatherData.id.desc()).first()
        if cached:
            return WeatherData(
                temperature=cached.temperature,
                windSpeed=cached.wind_speed,
                windDirection=cached.wind_direction,
                humidity=cached.humidity
            )

        # Return default values if no data available
        return WeatherData(
            temperature=18.0,
            windSpeed=3.0,
            windDirection=90.0,
            humidity=65.0
        )


@app.get("/api/eum/ships/realtime", response_model=List[ShipRealtimeLocation])
async def get_realtime_locations(db: Session = Depends(get_db)):
    """Get real-time ship locations from database (Demo mode)"""
    global eum_client

    # Fetch real-time data from API
    locations = eum_client.get_ship_realtime_location()

    # Store in database for historical tracking
    for loc_data in locations:
        # Find ship_id from dev_id
        ship = db.query(DBShip).filter(DBShip.id == loc_data['devId']).first()
        if ship:
            db_location = DBShipRealtimeLocation(
                dev_id=loc_data['devId'],
                ship_id=ship.ship_id,
                log_datetime=loc_data['logDateTime'],
                latitude=loc_data['lati'],
                longitude=loc_data['longi'],
                azimuth=loc_data['azimuth'],
                course=loc_data['course'],
                speed=loc_data['speed']
            )
            db.add(db_location)

    db.commit()

    return [
        ShipRealtimeLocation(
            logDateTime=loc['logDateTime'],
            devId=loc['devId'],
            rcvDateTime=loc.get('rcvDateTime', loc['logDateTime']),
            lati=loc['lati'],
            longi=loc['longi'],
            azimuth=loc['azimuth'],
            course=loc['course'],
            speed=loc['speed']
        ) for loc in locations
    ]


# Live API endpoints - Directly fetch from EUM API without caching
def convert_eum_ship_to_shipinfo(ship_data: dict, index: int) -> ShipInfo:
    """Convert EUM ship data to ShipInfo format"""
    return ShipInfo(
        id=index,
        shipId=str(ship_data.get('devId', f'ship_{index}')),
        type=ship_data.get('type', 'cargo'),
        name=ship_data.get('name', f'Ship {index}'),
        polAddr=ship_data.get('polAddr', 'Pohang'),
        pol=ship_data.get('pol', 'PH'),
        pod=ship_data.get('pod', 'Unknown'),
        hm=ship_data.get('hm', ''),
        pe=ship_data.get('pe', ''),
        ps=ship_data.get('ps', ''),
        kw=ship_data.get('kw', 0),
        engineCnt=ship_data.get('engineCnt', 1),
        propeller=ship_data.get('propeller', ''),
        propellerCnt=ship_data.get('propellerCnt', 1),
        length=float(ship_data.get('length', 100)),
        breath=float(ship_data.get('breath', 20)),
        depth=float(ship_data.get('depth', 10)),
        gt=float(ship_data.get('gt', 5000)),
        sign=ship_data.get('sign', ''),
        rgDtm=ship_data.get('rgDtm', ''),
        dcDate=ship_data.get('dcDate', ''),
        lat=float(ship_data.get('lat', 36.0)) if ship_data.get('lat') else 36.0,
        lng=float(ship_data.get('lng', 129.4)) if ship_data.get('lng') else 129.4,
        status=ship_data.get('status', 'active'),
        speed_knots=float(ship_data.get('speed', 12.0)),
        cargo_weight=float(ship_data.get('cargo', 1000.0))
    )

@app.get("/api/eum/ships/live", response_model=List[ShipInfo])
async def get_live_ships():
    """Get ships directly from EUM API (Live mode)"""
    global eum_client

    # Fetch fresh data from EUM API
    ships_data = eum_client.get_ship_list()

    # Convert to ShipInfo format
    return [convert_eum_ship_to_shipinfo(ship, i) for i, ship in enumerate(ships_data)]

@app.get("/api/eum/ships/realtime/live", response_model=List[ShipRealtimeLocation])
async def get_live_realtime_locations():
    """Get real-time ship locations directly from EUM API (Live mode)"""
    global eum_client
    from datetime import datetime

    # Fetch fresh real-time data from API
    locations = eum_client.get_ship_realtime_location()

    # Convert to response format
    result = []
    for loc in locations:
        try:
            result.append(ShipRealtimeLocation(
                logDateTime=loc.get('logDateTime', datetime.now().isoformat()),
                devId=int(loc.get('devId', 0)),
                rcvDateTime=loc.get('rcvDateTime', datetime.now().isoformat()),
                lati=float(loc.get('lati', 36.0)),
                longi=float(loc.get('longi', 129.4)),
                azimuth=float(loc.get('azimuth', 0)),
                course=float(loc.get('course', 0)),
                speed=float(loc.get('speed', 0))
            ))
        except (ValueError, TypeError) as e:
            print(f"Error converting location data: {e}")
            continue

    return result

@app.get("/api/eum/ships/realtime/demo", response_model=List[ShipRealtimeLocation])
async def get_demo_realtime_locations(db: Session = Depends(get_db)):
    """Get demo ship locations at their fixed positions"""
    from datetime import datetime

    # Get first 10 ships from DB (aligned with init data)
    ships = db.query(DBShip).limit(10).all()

    # Map EUM IDs to SHIP IDs for frontend compatibility
    id_mapping = {
        'EUM001': 'SHIP001', 'EUM002': 'SHIP002', 'EUM003': 'SHIP003',
        'EUM004': 'SHIP004', 'EUM005': 'SHIP005', 'EUM006': 'SHIP006',
        'EUM007': 'SHIP007', 'EUM008': 'SHIP008', 'EUM009': 'SHIP009',
        'EUM010': 'SHIP010'
    }

    result = []
    for i, ship in enumerate(ships, start=1):
        # Use index as devId for compatibility with ShipRealtimeLocation model
        # Frontend will map this to SHIP IDs

        # Use actual latitude and longitude from database (current position)
        # This ensures ships stay at their designated positions
        result.append(ShipRealtimeLocation(
            logDateTime=datetime.now().isoformat(),
            devId=i,  # Use numeric ID
            rcvDateTime=datetime.now().isoformat(),
            lati=float(ship.latitude),  # Use actual position from DB
            longi=float(ship.longitude),  # Use actual position from DB
            azimuth=0.0,  # No rotation
            course=0.0,  # No movement
            speed=0.0  # Stationary
        ))

    return result

@app.get("/api/eum/ships/routes", response_model=List[ShipRouteModel])
async def get_ship_routes(db: Session = Depends(get_db)):
    """Get ship routes from generated routes with obstacle avoidance"""
    import sqlite3
    import json
    from datetime import datetime

    # Connect to the database and get actual routes
    conn = sqlite3.connect('ship_routes.db')
    cursor = conn.cursor()

    # Get routes from ship_routes_simulation table
    cursor.execute("""
        SELECT ship_id, ship_name, departure_time, arrival_time,
               path, speed_knots, direction
        FROM ship_routes_simulation
        ORDER BY ship_id
    """)

    db_routes = cursor.fetchall()
    routes = []

    # Get ship info from main ships table for mapping
    ships = db.query(DBShip).all()
    ship_map = {ship.ship_id: ship for ship in ships}

    # Hardcoded route for EUM001 (reverse of EUM010's path)
    if 'EUM001' in ship_map:
        ship = ship_map['EUM001']
        # This is the reversed path of EUM010 (from docking to fishing area)
        eum001_path = [
            (35.985810, 129.553259),  # Start at docking
            (35.985210, 129.557459),
            (35.985010, 129.558059),
            (35.985610, 129.558659),
            (35.986210, 129.560259),
            (35.982610, 129.570659)   # End at fishing area
        ]

        route = ShipRouteModel(
            ship_id='EUM001',
            devId=ship.id,
            departure_time=0,  # Departure at midnight
            arrival_time=6,    # 6 minutes journey
            path_points=eum001_path,
            current_position=eum001_path[0],
            speed_knots=10.0,
            status='active'
        )
        routes.append(route)

    for db_route in db_routes:
        ship_id = db_route[0]
        path_json = db_route[4]

        if ship_id in ship_map:
            ship = ship_map[ship_id]

            # Parse the path
            path_points = json.loads(path_json) if path_json else []

            # Convert path points to tuples
            path_tuples = [(point[0], point[1]) for point in path_points]

            # Parse departure time and convert to minutes from midnight
            departure_str = db_route[2]
            try:
                departure_dt = datetime.fromisoformat(departure_str)
                departure_minutes = departure_dt.hour * 60 + departure_dt.minute
            except:
                departure_minutes = 0

            # Parse arrival time
            arrival_str = db_route[3]
            try:
                arrival_dt = datetime.fromisoformat(arrival_str)
                arrival_minutes = arrival_dt.hour * 60 + arrival_dt.minute
            except:
                arrival_minutes = departure_minutes + 45

            route = ShipRouteModel(
                ship_id=ship_id,
                devId=ship.id,
                departure_time=departure_minutes,
                arrival_time=arrival_minutes,
                path_points=path_tuples,
                current_position=path_tuples[0] if path_tuples else (ship.latitude, ship.longitude),
                speed_knots=db_route[5] or 10.0,
                status='active' if db_route[6] else 'planning'
            )
            routes.append(route)

    conn.close()
    return routes


@app.get("/api/eum/traffic/density")
async def get_ship_density(
    start_date: Optional[str] = None,
    start_time: Optional[str] = None
):
    """Get ship density grid (dummy data for demonstration)"""

    # Use current date/time if not specified
    if not start_date:
        start_date = datetime.now().strftime("%Y%m%d")
    if not start_time:
        start_time = datetime.now().strftime("%H%M")

    # Generate dummy density grid data
    # In production, this would call the actual API
    grid_data = [
        ShipDensityGrid(
            gridId="G001",
            latitude=35.98,
            longitude=129.56,
            shipCount=3,
            densityLevel="low"
        ),
        ShipDensityGrid(
            gridId="G002",
            latitude=35.985,
            longitude=129.558,
            shipCount=5,
            densityLevel="medium"
        ),
        ShipDensityGrid(
            gridId="G003",
            latitude=35.983,
            longitude=129.560,
            shipCount=2,
            densityLevel="low"
        )
    ]

    return {
        "date": start_date,
        "time": start_time,
        "gridDensity": [grid.dict() for grid in grid_data]
    }


@app.get("/api/ships/realtime-with-routes", response_model=List[ShipRealtimeWithRoute])
async def get_realtime_with_routes(db: Session = Depends(get_db)):
    """Get real-time ship locations combined with their planned routes"""
    global eum_client

    # Get real-time locations from EUM API
    realtime_locations = eum_client.get_ship_realtime_location()

    # Get all active routes from our database
    active_routes = db.query(DBShipRoute).filter(
        DBShipRoute.status.in_(['accepted', 'active'])
    ).all()

    # Create a mapping of ship_id to routes for quick lookup
    route_map = {route.ship_id: route for route in active_routes}

    # Combine real-time locations with routes
    combined_data = []

    for location in realtime_locations:
        # Find the corresponding ship from EUM device ID
        ship = db.query(DBShip).filter(DBShip.id == location['devId']).first()

        if ship:
            # Prepare real-time location data
            current_location = {
                "latitude": location['lati'],
                "longitude": location['longi'],
                "speed": location['speed'],
                "course": location['course'],
                "azimuth": location['azimuth'],
                "timestamp": location['logDateTime']
            }

            # Check if this ship has an active route
            planned_route = None
            deviation = None

            if ship.ship_id in route_map:
                route = route_map[ship.ship_id]

                # Convert route to dictionary format
                planned_route = {
                    "path_points": route.get_path(),
                    "departure_time": route.actual_departure,
                    "arrival_time": route.arrival_time,
                    "optimization_mode": route.optimization_mode,
                    "status": route.status,
                    "total_distance_nm": route.path_length_nm,
                    "speed_knots": route.speed_knots
                }

                # Calculate deviation (simplified version)
                # In production, this would calculate actual distance from planned path
                import time
                current_time = time.time() / 60  # Current time in minutes

                # Calculate where the ship should be based on the plan
                ship_route = ShipRoute(
                    name=ship.name if ship else route.ship_id,
                    ship_id=route.ship_id,
                    start=(route.start_x, route.start_y),
                    goal=(route.goal_x, route.goal_y),
                    path=route.get_path(),
                    departure_time=route.actual_departure,
                    speed_knots=route.speed_knots
                )
                ship_route.calculate_timestamps()

                expected_position = ship_route.get_position_at_time(current_time)

                if expected_position:
                    # Simple deviation calculation (would need proper coordinate conversion)
                    # This is a placeholder - actual implementation would convert coordinates properly
                    deviation = {
                        "off_course_distance": 0.0,  # Would calculate actual distance
                        "time_difference": current_time - route.actual_departure,
                        "expected_position": expected_position
                    }

            # Create combined data entry
            combined_entry = ShipRealtimeWithRoute(
                ship_id=ship.ship_id,
                dev_id=location['devId'],
                current_location=current_location,
                planned_route=planned_route,
                deviation=deviation
            )
            combined_data.append(combined_entry)

    return combined_data


# Chatbot endpoints
@app.post("/api/chatbot/voice")
async def process_voice(db: Session = Depends(get_db)):
    """Process voice input and return response"""
    from fastapi import File, UploadFile
    import base64
    import random

    # For now, return mock response
    # In production, you would use speech recognition here
    responses = [
        {
            "transcript": "현재 선박 상태를 확인해줘",
            "response": "포항 구룡포항에 현재 3척의 선박이 운항 중입니다. 모든 선박이 정상 운항 중이며, 기상 상태는 맑고 파도는 0.5m입니다.",
            "tools": []
        },
        {
            "transcript": "날씨 정보 알려줘",
            "response": "현재 구룡포항 날씨는 맑음, 기온 18도, 풍속 3m/s, 파고 0.5m입니다. 선박 운항에 적합한 날씨입니다.",
            "tools": []
        },
        {
            "transcript": "경로 계획이 필요해",
            "response": "경로 계획을 시작합니다. 출발지와 목적지를 지정해주세요.",
            "tools": [
                {"id": "route_plan", "name": "경로 계획", "icon": "🗺️", "action": "plan_route"}
            ]
        }
    ]

    selected = random.choice(responses)
    return selected


@app.post("/api/chatbot/text")
async def process_text(request: dict, db: Session = Depends(get_db)):
    """Process text input with GPT integration"""
    global chatbot_service

    message = request.get("message", "")
    session_data = request.get("session", {})

    if not chatbot_service:
        # Fallback if service not initialized
        return {
            "response": "챗봇 서비스를 초기화하는 중입니다. 잠시 후 다시 시도해주세요.",
            "function": "unknown",
            "parameters": {}
        }

    # Process with ChatGPT
    result = chatbot_service.process_text(message)

    # Normalize function keys to match FE modal names
    legacy_to_fe = {
        "weather": "show_weather",
        "sos": "send_sos",
        "help": "list_features"
    }
    if result.get("function") in legacy_to_fe:
        result["function"] = legacy_to_fe[result["function"]]

    # Handle weather request
    if result["function"] == "show_weather":
        # Get weather from OpenWeather API
        weather_data = await weather_service.get_current_weather()
        weather_message = weather_service.format_weather_message(weather_data)

        return {
            "function": "show_weather",
            "response": weather_message,
            "message": weather_message,
            "weather_data": weather_data,
            "parameters": {}
        }

    # Handle send message request
    elif result["function"] == "send_message":
        params = result.get("parameters", {})
        content = params.get("message")
        recipient = params.get("recipient") or "control_center"
        sender_id = session_data.get("ship_id")

        # Two-step: always let FE modal handle final send; prefill only
        prefill = {}
        if isinstance(content, str) and content.strip():
            prefill["message"] = content.strip()
        if isinstance(recipient, str) and recipient.strip():
            prefill["recipient"] = recipient.strip()

        return {
            "response": "메시지 내용을 확인하고 전송하시겠습니까?",
            "function": "send_message",
            "parameters": prefill
        }

    # Handle departure/arrival route planning
    elif result["function"] == "recommend_departure":
        params = result.get("parameters", {})

        # Check if we need clarification for direction only
        if params.get("type") == "unknown":
            # Need to clarify departure vs arrival
            return {
                "function": "clarification",
                "message": "출항하실 건가요, 입항하실 건가요?\n\n🚢 출항: 정박지 → 어장\n⚓ 입항: 어장 → 정박지",
                "parameters": {"waiting_for": "direction"},
                "session": {"previous_message": message}
            }

        # We have direction, proceed with route planning
        route_type = params.get("type")
        preferred_time = params.get("preferred_time")

        print(f"DEBUG: params = {params}")
        print(f"DEBUG: preferred_time = {preferred_time}")

        # If this is a response to clarification, merge with session data
        if session_data.get("direction"):
            route_type = session_data.get("direction")

        # Parse time preference - default to now if not specified
        user_departure_time = 0  # Default to now
        if preferred_time:
            import re
            print(f"DEBUG: Parsing preferred_time: {preferred_time}")
            if preferred_time == "now" or "지금" in str(preferred_time):
                user_departure_time = 0
            elif "분" in str(preferred_time) or "m" in str(preferred_time).lower():
                # Extract minutes - handle both "3분" and "3m" formats
                minutes = re.findall(r'\d+', str(preferred_time))
                print(f"DEBUG: Found minutes: {minutes}")
                if minutes:
                    user_departure_time = float(minutes[0])  # Already in minutes
            elif "h" in str(preferred_time).lower() or "시간" in str(preferred_time):
                # Extract hours
                hours = re.findall(r'\d+', str(preferred_time))
                if hours:
                    user_departure_time = float(hours[0]) * 60  # Convert to minutes

        # Get ship 1 specifically (only Ship 1 can use chatbot departure recommendations)
        ship = db.query(DBShip).filter(DBShip.id == 1).first()  # Always get Ship 1

        if ship and route_type in ["departure", "arrival"]:
            # Don't call API directly, just return parameters for modal
            # SHIP001 always uses 4 minutes as optimal time
            direction = "출항" if route_type == "departure" else "입항"

            # For SHIP001, always use 4 minutes as optimal time
            optimal_time = 4

            user_time_str = "지금 바로" if user_departure_time == 0 else f"{int(user_departure_time)}분 후"
            optimal_time_str = f"{int(optimal_time)}분 후"

            # Check if times are different enough to suggest optimization
            time_difference = abs(optimal_time - user_departure_time)

            if time_difference > 2:  # If more than 2 minutes difference
                # Suggest optimal time
                message = f"""
{user_time_str} {direction}을 희망하셨네요.

⏰ 최적 시간 분석 결과: {optimal_time_str}
📍 교통량이 적어 안전한 항해가 가능합니다.

{direction} 계획을 세우겠습니다."""

                return {
                    "function": "recommend_departure",
                    "message": message,
                    "parameters": {
                        "ship_id": ship.ship_id,
                        "route_type": route_type,
                        "departure_time": optimal_time,
                        "user_requested_time": user_departure_time
                    },
                    "ship_id": ship.ship_id
                }
            else:
                # User time is already close to optimal
                message = f"""
{optimal_time_str} {direction} 계획을 세우겠습니다.

📍 최적 시간대입니다.
⛵ 안전한 항해가 가능합니다."""

                return {
                    "function": "recommend_departure",
                    "message": message,
                    "parameters": {
                        "ship_id": ship.ship_id,
                        "route_type": route_type,
                        "departure_time": optimal_time,
                        "user_requested_time": user_departure_time
                    },
                    "ship_id": ship.ship_id
                }

    # Handle user confirmation response (YES - use optimal time)
    elif any(word in message.lower() for word in ["네", "좋아", "할게", "예", "ok", "yes"]):
        # Conversational confirm branch removed: rely on JSON function flow only
        pass

    # This code block was removed as it was incorrectly placed at module level
    # The logic should be inside a proper function/endpoint handler

    # Add database context for specific functions
    elif result["function"] == "show_weather":
        weather = db.query(DBWeatherData).first()
        if weather:
            result["parameters"]["weather_data"] = {
                "temperature": weather.temperature,
                "wind_speed": weather.wind_speed,
                "humidity": weather.humidity
            }
    elif result["function"] == "recommend_departure":
        # Get current ship routes for context
        active_routes = db.query(DBShipRoute).filter(
            DBShipRoute.status.in_(['accepted', 'active'])
        ).count()
        result["parameters"]["active_ships"] = active_routes

    return {
        "response": result.get("message") or result.get("response") or "",
        "function": result.get("function", "unknown"),
        "parameters": result.get("parameters", {})
    }


@app.get("/")
async def root():
    """API root endpoint"""
    return {
        "name": "Ship Navigation Optimizer API",
        "version": "1.0.0",
        "endpoints": [
            "/api/route/plan",
            "/api/route/accept",
            "/api/ships",
            "/api/ship/{ship_id}",
            "/api/eum/ships",
            "/api/eum/ships/sync",
            "/api/eum/ships/realtime",
            "/api/eum/ships/routes",
            "/api/eum/cctv",
            "/api/eum/lidar",
            "/api/eum/weather",
            "/api/eum/traffic/density",
            "/api/ships/realtime-with-routes",
            "/api/chatbot/voice",
            "/api/chatbot/text",
            "/docs"
        ]
    }


# Coordinate system base point (top-left corner of map)
MAP_ORIGIN = {
    "lat": 35.993654,  # Top-left latitude
    "lng": 129.549146  # Top-left longitude
}

# Map range (we use a large area to cover all possible coordinates)
# Everything is relative to the top-left origin
# We assume no coordinates will be north or west of the origin

# Note: We no longer use pixel coordinates - everything is in lat/lng
# The coordinate conversion functions are removed as we work directly with lat/lng


@app.post("/api/route/departure")
async def plan_departure_route(
    request: DepartureRouteRequest,
    db: Session = Depends(get_db)
):
    """Plan route from docking to fishing area (출항)"""
    ship_id = request.ship_id
    departure_time = request.departure_time
    # Force flexible optimization per UX requirement
    flexible_time = True

    # Get ship information
    ship = db.query(DBShip).filter(DBShip.ship_id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail=f"Ship {ship_id} not found")

    if not ship.docking_lat or not ship.fishing_area_lat:
        raise HTTPException(status_code=400, detail="Ship doesn't have docking or fishing area defined")

    # Use lat/lng coordinates directly
    start_lat, start_lng = ship.docking_lat, ship.docking_lng
    goal_lat, goal_lng = ship.fishing_area_lat, ship.fishing_area_lng

    # For EUM001, use hardcoded routes (reversed EUM010 path)
    if ship_id == "EUM001":
        # Use hardcoded departure route
        optimal_path = [
            [35.985810, 129.553259],  # Start at docking
            [35.985210, 129.557459],
            [35.985010, 129.558059],
            [35.985610, 129.558659],
            [35.986210, 129.560259],
            [35.982610, 129.570659]   # End at fishing area
        ]
        # Set optimal time to 3 minutes as requested
        optimal_time = 3
        # Calculate distance
        hardcoded_distance_nm = 0.92  # Based on EUM010 route
    else:
        # Get existing ships from simulation table for collision avoidance
        # Load Ships 2-10 routes from ship_routes_simulation table
        existing_ships = []
        import sqlite3
        import json as json_module
        conn = sqlite3.connect('ship_routes.db')
        cursor = conn.cursor()

        cursor.execute("""
            SELECT ship_id, ship_name, departure_time, path_points, speed_knots
            FROM ship_routes_simulation
            WHERE ship_id != 'SHIP001'
            ORDER BY departure_time
        """)

        for row in cursor.fetchall():
            ship_id_db, ship_name, departure_str, path_json, speed = row
            path = json_module.loads(path_json)
            departure_dt = datetime.fromisoformat(departure_str)

            # Create ShipRoute object for collision checking
            existing_route = ShipRoute(
                name=ship_name,
                ship_id=ship_id_db,
                start=tuple(path[0]) if path else (0, 0),
                goal=tuple(path[-1]) if path else (0, 0),
                path=[tuple(p) for p in path],
                departure_time=departure_dt,
                speed_knots=speed
            )
            existing_route.calculate_timestamps()
            existing_ships.append(existing_route)

        conn.close()

        # Find optimal path using lat/lng A* algorithm
        optimal_path = route_optimizer.find_path_astar(
            start_lat, start_lng,
            goal_lat, goal_lng,
            departure_time=datetime.fromtimestamp(departure_time * 60) if departure_time else None
        )

        if not optimal_path:
            raise HTTPException(status_code=400, detail="No valid path found")

    # Create ship route with lat/lng coordinates
    # Convert departure_time (minutes) to datetime object
    from datetime import datetime, timedelta, date
    # Use base time (00:00:00) for simulation consistency
    today = date.today()
    base_time = datetime.combine(today, datetime.min.time())  # Today at 00:00:00
    departure_dt = base_time + timedelta(minutes=departure_time if departure_time else 0)

    new_ship = ShipRoute(
        name=f"{ship.name}_departure",
        ship_id=ship_id,
        start=(start_lat, start_lng),
        goal=(goal_lat, goal_lng),
        path=optimal_path,
        departure_time=departure_dt,
        speed_knots=ship.speed if hasattr(ship, 'speed') else 10.0
    )
    new_ship.calculate_timestamps()

    # For EUM001, use requested time or default to 3 minutes and adjust speed
    if ship_id == "EUM001":
        # Use 3 minutes for chatbot recommendations as requested
        optimal_time = 3
        # Set slightly slower speed for EUM001 (8 knots instead of 10)
        new_ship.speed_knots = 8.0
        # Set departure time based on simulation base time, not current time
        if departure_time is not None:
            new_ship.departure_time = base_time + timedelta(minutes=departure_time)
        else:
            new_ship.departure_time = base_time + timedelta(minutes=3)
        new_ship.calculate_timestamps()
    # Optimize departure time if flexible
    elif flexible_time and 'existing_ships' in locals() and existing_ships:
        optimal_time = route_optimizer.optimize_departure_time(
            new_ship, existing_ships,
            time_window_minutes=10  # restrict search window; core limits +3~+10
        )
        if optimal_time != departure_time:
            # Recalculate path with new departure time
            optimal_path = route_optimizer.find_path_astar(
                start_lat, start_lng,
                goal_lat, goal_lng,
                departure_time=datetime.fromtimestamp(optimal_time * 60)
            )
            new_ship.departure_time = optimal_time
            new_ship.path = optimal_path
            new_ship.calculate_timestamps()
    else:
        optimal_time = departure_time or 0

    # Path is already in lat/lng format
    path_lat_lng = []
    for point in optimal_path:
        path_lat_lng.append({
            "lat": point[0],
            "lng": point[1]
        })

    # Save to database
    save_to_db = True  # Always save to DB for playback
    if save_to_db:
        # For EUM001, save to simulation table
        if ship_id == "EUM001":
            # Save to ship_routes_simulation table for Ship 1
            import sqlite3
            import json as json_module
            from datetime import timedelta

            conn = sqlite3.connect('ship_routes.db')
            cursor = conn.cursor()

            # Remove existing route for EUM001
            cursor.execute("DELETE FROM ship_routes_simulation WHERE ship_id = ?", (ship_id,))

            # Calculate arrival time
            # Calculate actual distance from the path for EUM001
            if ship_id == "EUM001":
                # Calculate distance from path points
                total_distance_nm = 0
                from core_optimizer_latlng import haversine_distance
                for i in range(len(optimal_path) - 1):
                    dist = haversine_distance(
                        optimal_path[i][0], optimal_path[i][1],
                        optimal_path[i+1][0], optimal_path[i+1][1]
                    )
                    total_distance_nm += dist
                distance_nm = total_distance_nm
                print(f"[DEBUG] EUM001 route - Path points: {len(optimal_path)}, Distance: {distance_nm:.2f} nm")
            else:
                distance_nm = new_ship.path_length_nm if hasattr(new_ship, 'path_length_nm') else 0

            travel_time_hours = distance_nm / new_ship.speed_knots if new_ship.speed_knots > 0 else 0

            # Use same base time as other ships (00:00:00) for simulation
            from datetime import date
            today = date.today()
            base_time = datetime.combine(today, datetime.min.time())  # Today at 00:00:00
            departure_datetime = base_time + timedelta(minutes=optimal_time)
            arrival_datetime = departure_datetime + timedelta(hours=travel_time_hours)

            # Insert new route for EUM001
            cursor.execute("""
                INSERT INTO ship_routes_simulation
                (ship_id, ship_name, departure_time, arrival_time, path,
                 speed_knots, direction, total_distance_nm)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                ship_id,
                ship.name,
                departure_datetime.isoformat(),
                arrival_datetime.isoformat(),
                json_module.dumps(optimal_path),
                new_ship.speed_knots,
                'to_fishing',  # departure = docking to fishing
                distance_nm
            ))
            print(f"[DEBUG] EUM001 route saved - Distance: {distance_nm:.2f} nm, Travel time: {travel_time_hours:.2f} hours ({travel_time_hours*60:.1f} minutes)")

            conn.commit()
            conn.close()
        else:
            # For other ships, save to regular table
            existing = db.query(DBShipRoute).filter(DBShipRoute.ship_id == ship_id).first()
            if existing:
                db.delete(existing)

            # Create new route in DB
            db_route = DBShipRoute(
                ship_id=ship_id,
                start_lat=ship.docking_lat,
                start_lng=ship.docking_lng,
                goal_lat=ship.fishing_area_lat,
                goal_lng=ship.fishing_area_lng,
                path=json.dumps(new_ship.path),
                actual_departure=new_ship.departure_time,
                recommended_departure=new_ship.departure_time,
                speed_knots=new_ship.speed_knots,
                path_length_pixels=new_ship.path_length_pixels if hasattr(new_ship, 'path_length_pixels') else 0,
                path_length_nm=new_ship.path_length_nm if hasattr(new_ship, 'path_length_nm') else 0,
                speeds=json.dumps([new_ship.speed_knots] * len(new_ship.path)),
                status='planned',
                optimization_mode='flexible' if flexible_time else 'fixed'
            )
            db.add(db_route)
            db.commit()

    return {
        "success": True,
        "ship_id": ship_id,
        "ship_name": ship.name,
        "route_type": "departure",
        "from": {"lat": ship.docking_lat, "lng": ship.docking_lng, "type": "docking"},
        "to": {"lat": ship.fishing_area_lat, "lng": ship.fishing_area_lng, "type": "fishing"},
        "path": path_lat_lng,
        "path_points": new_ship.path,  # For frontend display
        "departure_time": new_ship.departure_time,
        "recommended_departure": new_ship.departure_time,
        "arrival_time": new_ship.timestamps[-1] if new_ship.timestamps else None,
        "speed_knots": new_ship.speed_knots,
        "distance_nm": new_ship.path_length_nm if hasattr(new_ship, 'path_length_nm') else 0,
        "total_distance_nm": new_ship.path_length_nm if hasattr(new_ship, 'path_length_nm') else 0,
        "flexible_time": flexible_time,
        "optimization_type": "flexible" if flexible_time else "fixed",
        "saved_to_db": save_to_db
    }


@app.post("/api/route/arrival")
async def plan_arrival_route(
    request: ArrivalRouteRequest,
    db: Session = Depends(get_db)
):
    """Plan route from fishing area to docking (입항)"""
    ship_id = request.ship_id
    departure_time = request.departure_time
    # Force flexible optimization per UX requirement
    flexible_time = True

    # Get ship information
    ship = db.query(DBShip).filter(DBShip.ship_id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail=f"Ship {ship_id} not found")

    if not ship.docking_lat or not ship.fishing_area_lat:
        raise HTTPException(status_code=400, detail="Ship doesn't have docking or fishing area defined")

    # Use lat/lng coordinates directly (reverse of departure)
    start_lat, start_lng = ship.fishing_area_lat, ship.fishing_area_lng
    goal_lat, goal_lng = ship.docking_lat, ship.docking_lng

    # For EUM001, use hardcoded routes (reversed EUM010 path)
    if ship_id == "EUM001":
        # Use hardcoded arrival route (reverse of departure)
        optimal_path = [
            [35.982610, 129.570659],  # Start at fishing area
            [35.986210, 129.560259],
            [35.985610, 129.558659],
            [35.985010, 129.558059],
            [35.985210, 129.557459],
            [35.985810, 129.553259]   # End at docking
        ]
        # Set optimal time to 3 minutes as requested
        optimal_time = 3
        # Calculate distance
        hardcoded_distance_nm = 0.92  # Based on EUM010 route
    else:
        # Get existing ships from simulation table for collision avoidance
        # Load Ships 2-10 routes from ship_routes_simulation table
        existing_ships = []
        import sqlite3
        import json as json_module
        conn = sqlite3.connect('ship_routes.db')
        cursor = conn.cursor()

        cursor.execute("""
            SELECT ship_id, ship_name, departure_time, path_points, speed_knots
            FROM ship_routes_simulation
            WHERE ship_id != 'SHIP001'
            ORDER BY departure_time
        """)

        for row in cursor.fetchall():
            ship_id_db, ship_name, departure_str, path_json, speed = row
            path = json_module.loads(path_json)
            departure_dt = datetime.fromisoformat(departure_str)

            # Create ShipRoute object for collision checking
            existing_route = ShipRoute(
                name=ship_name,
                ship_id=ship_id_db,
                start=tuple(path[0]) if path else (0, 0),
                goal=tuple(path[-1]) if path else (0, 0),
                path=[tuple(p) for p in path],
                departure_time=departure_dt,
                speed_knots=speed
            )
            existing_route.calculate_timestamps()
            existing_ships.append(existing_route)

        conn.close()

        # Find optimal path using lat/lng A* algorithm
        optimal_path = route_optimizer.find_path_astar(
            start_lat, start_lng,
            goal_lat, goal_lng,
            departure_time=datetime.fromtimestamp(departure_time * 60) if departure_time else None
        )

        if not optimal_path:
            raise HTTPException(status_code=400, detail="No valid path found")

    # Create ship route with lat/lng coordinates
    new_ship = ShipRoute(
        name=f"{ship.name}_arrival",
        ship_id=ship_id,
        start=(start_lat, start_lng),
        goal=(goal_lat, goal_lng),
        path=optimal_path,
        departure_time=departure_time or 0,
        speed_knots=ship.speed if hasattr(ship, 'speed') else 10.0
    )
    new_ship.calculate_timestamps()

    # For EUM001, use requested time or default to 3 minutes and adjust speed
    if ship_id == "EUM001":
        # Use 3 minutes for chatbot recommendations as requested
        optimal_time = 3
        # Set slightly slower speed for EUM001 (8 knots instead of 10)
        new_ship.speed_knots = 8.0
        # But use actual departure_time for setting the route
        if departure_time is not None:
            new_ship.departure_time = datetime.now() + timedelta(minutes=departure_time)
        else:
            new_ship.departure_time = datetime.now() + timedelta(minutes=3)
        new_ship.calculate_timestamps()
    # Optimize departure time if flexible
    elif flexible_time and 'existing_ships' in locals() and existing_ships:
        optimal_time = route_optimizer.optimize_departure_time(
            new_ship, existing_ships,
            time_window_minutes=10  # restrict search window; core limits +3~+10
        )
        if optimal_time != departure_time:
            # Recalculate path with new departure time
            optimal_path = route_optimizer.find_path_astar(
                start_lat, start_lng,
                goal_lat, goal_lng,
                departure_time=datetime.fromtimestamp(optimal_time * 60)
            )
            new_ship.departure_time = optimal_time
            new_ship.path = optimal_path
            new_ship.calculate_timestamps()
    else:
        optimal_time = departure_time or 0

    # Path is already in lat/lng format
    path_lat_lng = []
    for point in optimal_path:
        path_lat_lng.append({
            "lat": point[0],
            "lng": point[1]
        })

    # Save to database
    save_to_db = True  # Always save to DB for playback
    if save_to_db:
        # For EUM001, save to simulation table
        if ship_id == "EUM001":
            # Save to ship_routes_simulation table for Ship 1
            import sqlite3
            import json as json_module
            from datetime import timedelta

            conn = sqlite3.connect('ship_routes.db')
            cursor = conn.cursor()

            # Remove existing route for EUM001
            cursor.execute("DELETE FROM ship_routes_simulation WHERE ship_id = ?", (ship_id,))

            # Calculate arrival time
            # Calculate actual distance from the path for EUM001
            if ship_id == "EUM001":
                # Calculate distance from path points
                total_distance_nm = 0
                from core_optimizer_latlng import haversine_distance
                for i in range(len(optimal_path) - 1):
                    dist = haversine_distance(
                        optimal_path[i][0], optimal_path[i][1],
                        optimal_path[i+1][0], optimal_path[i+1][1]
                    )
                    total_distance_nm += dist
                distance_nm = total_distance_nm
                print(f"[DEBUG] EUM001 route - Path points: {len(optimal_path)}, Distance: {distance_nm:.2f} nm")
            else:
                distance_nm = new_ship.path_length_nm if hasattr(new_ship, 'path_length_nm') else 0

            travel_time_hours = distance_nm / new_ship.speed_knots if new_ship.speed_knots > 0 else 0

            # Use same base time as other ships (00:00:00) for simulation
            from datetime import date
            today = date.today()
            base_time = datetime.combine(today, datetime.min.time())  # Today at 00:00:00
            departure_datetime = base_time + timedelta(minutes=optimal_time)
            arrival_datetime = departure_datetime + timedelta(hours=travel_time_hours)

            # Insert new route for EUM001
            cursor.execute("""
                INSERT INTO ship_routes_simulation
                (ship_id, ship_name, departure_time, arrival_time, path,
                 speed_knots, direction, total_distance_nm)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                ship_id,
                ship.name,
                departure_datetime.isoformat(),
                arrival_datetime.isoformat(),
                json_module.dumps(optimal_path),
                new_ship.speed_knots,
                'to_docking',  # arrival = fishing to docking
                distance_nm
            ))
            print(f"[DEBUG] EUM001 arrival route saved - Distance: {distance_nm:.2f} nm, Travel time: {travel_time_hours:.2f} hours ({travel_time_hours*60:.1f} minutes)")

            conn.commit()
            conn.close()
        else:
            # For other ships, save to regular table
            existing = db.query(DBShipRoute).filter(DBShipRoute.ship_id == ship_id).first()
            if existing:
                db.delete(existing)

            # Create new route in DB
            db_route = DBShipRoute(
                ship_id=ship_id,
                start_lat=ship.fishing_area_lat,
                start_lng=ship.fishing_area_lng,
                goal_lat=ship.docking_lat,
                goal_lng=ship.docking_lng,
                path=json.dumps(new_ship.path),
                actual_departure=new_ship.departure_time,
                recommended_departure=new_ship.departure_time,
                speed_knots=new_ship.speed_knots,
                path_length_pixels=new_ship.path_length_pixels if hasattr(new_ship, 'path_length_pixels') else 0,
                path_length_nm=new_ship.path_length_nm if hasattr(new_ship, 'path_length_nm') else 0,
                speeds=json.dumps([new_ship.speed_knots] * len(new_ship.path)),
                status='planned',
                optimization_mode='flexible' if flexible_time else 'fixed'
            )
            db.add(db_route)
            db.commit()

    return {
        "success": True,
        "ship_id": ship_id,
        "ship_name": ship.name,
        "route_type": "arrival",
        "from": {"lat": ship.fishing_area_lat, "lng": ship.fishing_area_lng, "type": "fishing"},
        "to": {"lat": ship.docking_lat, "lng": ship.docking_lng, "type": "docking"},
        "path": path_lat_lng,
        "path_points": new_ship.path,  # For frontend display
        "departure_time": new_ship.departure_time,
        "recommended_departure": new_ship.departure_time,
        "arrival_time": new_ship.timestamps[-1] if new_ship.timestamps else None,
        "speed_knots": new_ship.speed_knots,
        "distance_nm": new_ship.path_length_nm if hasattr(new_ship, 'path_length_nm') else 0,
        "total_distance_nm": new_ship.path_length_nm if hasattr(new_ship, 'path_length_nm') else 0,
        "flexible_time": flexible_time,
        "optimization_type": "flexible" if flexible_time else "fixed",
        "saved_to_db": save_to_db
    }


@app.get("/api/obstacles/locations")
async def get_obstacle_locations(db: Session = Depends(get_db)):
    """Get all fishing areas and docking positions as obstacles"""

    ships = db.query(DBShip).all()

    fishing_areas = []
    docking_areas = []

    for ship in ships:
        if ship.fishing_area_lat and ship.fishing_area_lng:
            pixel = lat_lng_to_pixel(ship.fishing_area_lat, ship.fishing_area_lng)
            fishing_areas.append({
                "ship_name": ship.name,
                "lat": ship.fishing_area_lat,
                "lng": ship.fishing_area_lng,
                "pixel": {"x": pixel[0], "y": pixel[1]}
            })

        if ship.docking_lat and ship.docking_lng:
            pixel = lat_lng_to_pixel(ship.docking_lat, ship.docking_lng)
            docking_areas.append({
                "ship_name": ship.name,
                "lat": ship.docking_lat,
                "lng": ship.docking_lng,
                "pixel": {"x": pixel[0], "y": pixel[1]}
            })

    return {
        "fishing_areas": fishing_areas,
        "docking_areas": docking_areas,
        "total_obstacles": len(fishing_areas) + len(docking_areas)
    }


# ================ SOS Emergency Endpoints ================

@app.post("/api/sos", response_model=SOSResponse)
async def create_sos_alert(
    request: SOSRequest,
    db: Session = Depends(get_db)
):
    """Create a new SOS emergency alert"""

    # Get ship information
    ship = db.query(DBShip).filter(DBShip.ship_id == request.ship_id).first()

    # Create new SOS alert
    sos_alert = DBSOSAlert(
        ship_id=request.ship_id,
        ship_name=ship.name if ship else request.ship_id,
        emergency_type=request.emergency_type,
        message=request.message,
        latitude=request.latitude,
        longitude=request.longitude,
        status='active'
    )

    db.add(sos_alert)
    db.commit()
    db.refresh(sos_alert)

    return SOSResponse(
        id=sos_alert.id,
        ship_id=sos_alert.ship_id,
        ship_name=sos_alert.ship_name,
        emergency_type=sos_alert.emergency_type,
        message=sos_alert.message,
        latitude=sos_alert.latitude,
        longitude=sos_alert.longitude,
        status=sos_alert.status,
        created_at=sos_alert.created_at,
        resolved_at=sos_alert.resolved_at
    )


@app.get("/api/sos", response_model=List[SOSResponse])
async def get_all_sos_alerts(
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all SOS alerts, optionally filtered by status"""

    query = db.query(DBSOSAlert)

    if status:
        query = query.filter(DBSOSAlert.status == status)

    alerts = query.order_by(DBSOSAlert.created_at.desc()).all()

    return [
        SOSResponse(
            id=alert.id,
            ship_id=alert.ship_id,
            ship_name=alert.ship_name,
            emergency_type=alert.emergency_type,
            message=alert.message,
            latitude=alert.latitude,
            longitude=alert.longitude,
            status=alert.status,
            created_at=alert.created_at,
            resolved_at=alert.resolved_at
        )
        for alert in alerts
    ]


@app.get("/api/sos/active", response_model=List[SOSResponse])
async def get_active_sos_alerts(db: Session = Depends(get_db)):
    """Get all active SOS alerts"""

    alerts = db.query(DBSOSAlert).filter(
        DBSOSAlert.status == 'active'
    ).order_by(DBSOSAlert.created_at.desc()).all()

    return [
        SOSResponse(
            id=alert.id,
            ship_id=alert.ship_id,
            ship_name=alert.ship_name,
            emergency_type=alert.emergency_type,
            message=alert.message,
            latitude=alert.latitude,
            longitude=alert.longitude,
            status=alert.status,
            created_at=alert.created_at,
            resolved_at=alert.resolved_at
        )
        for alert in alerts
    ]


@app.patch("/api/sos/{alert_id}", response_model=SOSResponse)
async def update_sos_status(
    alert_id: int,
    status_update: SOSUpdateStatus,
    db: Session = Depends(get_db)
):
    """Update the status of a SOS alert"""

    alert = db.query(DBSOSAlert).filter(DBSOSAlert.id == alert_id).first()

    if not alert:
        raise HTTPException(status_code=404, detail="SOS alert not found")

    alert.status = status_update.status

    if status_update.status == 'resolved':
        alert.resolved_at = datetime.utcnow()

    db.commit()
    db.refresh(alert)

    return SOSResponse(
        id=alert.id,
        ship_id=alert.ship_id,
        ship_name=alert.ship_name,
        emergency_type=alert.emergency_type,
        message=alert.message,
        latitude=alert.latitude,
        longitude=alert.longitude,
        status=alert.status,
        created_at=alert.created_at,
        resolved_at=alert.resolved_at
    )


@app.delete("/api/sos/{alert_id}")
async def delete_sos_alert(
    alert_id: int,
    db: Session = Depends(get_db)
):
    """Delete a SOS alert"""

    alert = db.query(DBSOSAlert).filter(DBSOSAlert.id == alert_id).first()

    if not alert:
        raise HTTPException(status_code=404, detail="SOS alert not found")

    db.delete(alert)
    db.commit()

    return {"message": "SOS alert deleted successfully"}


# ================ Chat Message Endpoints ================

@app.post("/api/messages", response_model=MessageResponse)
async def send_message(
    request: MessageRequest,
    db: Session = Depends(get_db)
):
    """Send a chat message"""

    # Get sender name
    sender_name = "관제센터" if request.sender_id == "control_center" else request.sender_id
    if request.sender_id != "control_center":
        ship = db.query(DBShip).filter(DBShip.ship_id == request.sender_id).first()
        if ship:
            sender_name = ship.name or ship.ship_id

    # Get recipient name
    recipient_name = "전체" if request.recipient_id == "all" else "관제센터" if request.recipient_id == "control_center" else request.recipient_id
    if request.recipient_id not in ["all", "control_center"]:
        ship = db.query(DBShip).filter(DBShip.ship_id == request.recipient_id).first()
        if ship:
            recipient_name = ship.name or ship.ship_id

    # Create message
    message = DBMessage(
        sender_id=request.sender_id,
        sender_name=sender_name,
        recipient_id=request.recipient_id,
        recipient_name=recipient_name,
        message=request.message,
        message_type=request.message_type or 'text'
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    return MessageResponse(
        id=message.id,
        sender_id=message.sender_id,
        sender_name=message.sender_name,
        recipient_id=message.recipient_id,
        recipient_name=message.recipient_name,
        message=message.message,
        message_type=message.message_type,
        is_read=message.is_read,
        created_at=message.created_at,
        read_at=message.read_at
    )


@app.get("/api/messages", response_model=List[MessageResponse])
async def get_messages(
    ship_id: Optional[str] = None,
    unread_only: bool = False,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get messages for a specific ship or control center"""

    from sqlalchemy import or_, and_

    query = db.query(DBMessage)

    if ship_id:
        # Get messages where ship is sender or recipient
        query = query.filter(
            or_(
                DBMessage.sender_id == ship_id,
                DBMessage.recipient_id == ship_id,
                DBMessage.recipient_id == 'all'
            )
        )
    else:
        # Get messages for control center
        query = query.filter(
            or_(
                DBMessage.recipient_id == 'control_center',
                DBMessage.sender_id == 'control_center',
                DBMessage.recipient_id == 'all'
            )
        )

    if unread_only:
        query = query.filter(DBMessage.is_read == False)

    messages = query.order_by(DBMessage.created_at.desc()).limit(limit).all()

    return [
        MessageResponse(
            id=msg.id,
            sender_id=msg.sender_id,
            sender_name=msg.sender_name,
            recipient_id=msg.recipient_id,
            recipient_name=msg.recipient_name,
            message=msg.message,
            message_type=msg.message_type,
            is_read=msg.is_read,
            created_at=msg.created_at,
            read_at=msg.read_at
        )
        for msg in messages
    ]


@app.get("/api/messages/unread-count")
async def get_unread_count(
    ship_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get count of unread messages"""

    from sqlalchemy import or_

    query = db.query(DBMessage).filter(DBMessage.is_read == False)

    if ship_id:
        query = query.filter(
            or_(
                DBMessage.recipient_id == ship_id,
                DBMessage.recipient_id == 'all'
            )
        )
    else:
        query = query.filter(DBMessage.recipient_id == 'control_center')

    count = query.count()

    return {"unread_count": count}


@app.patch("/api/messages/mark-read")
async def mark_messages_read(
    request: MessageMarkRead,
    db: Session = Depends(get_db)
):
    """Mark messages as read"""

    messages = db.query(DBMessage).filter(DBMessage.id.in_(request.message_ids)).all()

    for msg in messages:
        msg.is_read = True
        msg.read_at = datetime.utcnow()

    db.commit()

    return {"message": f"{len(messages)} messages marked as read"}


@app.delete("/api/messages/{message_id}")
async def delete_message(
    message_id: int,
    db: Session = Depends(get_db)
):
    """Delete a message"""

    message = db.query(DBMessage).filter(DBMessage.id == message_id).first()

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    db.delete(message)
    db.commit()

    return {"message": "Message deleted successfully"}


# =======================
# Simulation APIs
# =======================

# Global simulation state
simulation_state = {
    "is_running": False,
    "start_time": None,
    "simulation_time": None,
    "speed_multiplier": 1.0,  # 1x, 2x, 4x speed
    "elapsed_minutes": 0  # Track elapsed simulation minutes
}

@app.post("/api/simulation/start")
async def start_simulation(request: dict = {}):
    """Start the simulation"""
    global simulation_state

    speed = request.get("speed_multiplier", 1.0)

    # If already running, just update speed
    if simulation_state["is_running"]:
        simulation_state["speed_multiplier"] = speed
        return {"status": "speed_updated", "speed_multiplier": speed}

    # Start fresh simulation with FIXED date (2000-01-01) to match DB routes
    # This ensures date-independent operation
    base_time = datetime(2000, 1, 1, 0, 0, 0)  # Start at 2000-01-01 00:00:00
    simulation_state["is_running"] = True
    simulation_state["start_time"] = datetime.now()  # Real world start time
    simulation_state["simulation_time"] = base_time  # Simulation world time (fixed date)
    simulation_state["speed_multiplier"] = speed
    simulation_state["elapsed_minutes"] = 0

    return {"status": "started", "start_time": simulation_state["start_time"].isoformat()}

@app.post("/api/simulation/stop")
async def stop_simulation():
    """Stop/Pause the simulation"""
    global simulation_state

    simulation_state["is_running"] = False

    return {"status": "stopped"}

@app.post("/api/simulation/reset")
async def reset_simulation():
    """Reset simulation to initial state"""
    global simulation_state

    simulation_state["is_running"] = False
    simulation_state["start_time"] = None
    simulation_state["simulation_time"] = None
    simulation_state["speed_multiplier"] = 1.0
    simulation_state["elapsed_minutes"] = 0

    # Also clear EUM001 route from database when reset is clicked
    import sqlite3
    try:
        conn = sqlite3.connect('ship_routes.db')
        cursor = conn.cursor()
        cursor.execute("DELETE FROM ship_routes_simulation WHERE ship_id = 'EUM001'")
        conn.commit()
        conn.close()
        return {"status": "reset", "eum001_cleared": True}
    except Exception as e:
        print(f"Error clearing EUM001 route: {e}")
        return {"status": "reset", "eum001_cleared": False}

# Removed set-time endpoint - no longer needed without drag bar

@app.get("/api/simulation/status")
async def get_simulation_status():
    """Get current simulation status"""
    global simulation_state
    from datetime import timedelta

    # Update simulation time if running
    if simulation_state["is_running"] and simulation_state["start_time"]:
        # Calculate elapsed real time in seconds
        elapsed_real_seconds = (datetime.now() - simulation_state["start_time"]).total_seconds()
        # Convert to simulation minutes based on speed multiplier
        elapsed_sim_minutes = (elapsed_real_seconds / 60.0) * simulation_state["speed_multiplier"]
        simulation_state["elapsed_minutes"] = elapsed_sim_minutes

        # Update simulation time with FIXED date (2000-01-01) to match DB routes
        base_time = datetime(2000, 1, 1, 0, 0, 0)
        simulation_state["simulation_time"] = base_time + timedelta(minutes=elapsed_sim_minutes)

    return {
        "is_running": simulation_state["is_running"],
        "simulation_time": simulation_state["simulation_time"].isoformat() if simulation_state["simulation_time"] else None,
        "start_time": simulation_state["start_time"].isoformat() if simulation_state["start_time"] else None,
        "speed_multiplier": simulation_state["speed_multiplier"],
        "elapsed_minutes": simulation_state["elapsed_minutes"]
    }

@app.get("/api/simulation/ship-positions")
async def get_simulation_ship_positions(db: Session = Depends(get_db)):
    """Get ship positions based on simulation time and routes"""
    global simulation_state
    from datetime import timedelta

    # Update simulation time if running
    if simulation_state["is_running"] and simulation_state["start_time"]:
        elapsed_real_seconds = (datetime.now() - simulation_state["start_time"]).total_seconds()
        elapsed_sim_minutes = (elapsed_real_seconds / 60.0) * simulation_state["speed_multiplier"]
        simulation_state["elapsed_minutes"] = elapsed_sim_minutes

        # Use FIXED base_time (2000-01-01) to match DB routes
        # This ensures date-independent operation
        base_time = datetime(2000, 1, 1, 0, 0, 0)
        simulation_state["simulation_time"] = base_time + timedelta(minutes=elapsed_sim_minutes)

    if not simulation_state["simulation_time"]:
        # Return current positions if simulation not started
        return await get_demo_realtime_locations(db)

    current_time = simulation_state["simulation_time"]

    # Get all ship routes from simulation table
    conn = sqlite3.connect('ship_routes.db')
    cursor = conn.cursor()

    cursor.execute("""
        SELECT ship_id, ship_name, departure_time, arrival_time,
               path, speed_knots, direction
        FROM ship_routes_simulation
        ORDER BY departure_time
    """)

    routes = cursor.fetchall()
    positions = []

    for route in routes:
        ship_id, ship_name, departure_str, arrival_str, path_json, speed, direction = route
        departure_time = datetime.fromisoformat(departure_str)
        arrival_time = datetime.fromisoformat(arrival_str) if arrival_str else None
        path = json.loads(path_json)

        # Extract ONLY time components (HH:MM:SS) - completely ignore dates
        current_time_only = current_time.time()
        departure_time_only = departure_time.time()
        arrival_time_only = arrival_time.time() if arrival_time else None

        # Convert time-only values to total seconds from midnight for comparison
        def time_to_seconds(t):
            return t.hour * 3600 + t.minute * 60 + t.second

        current_seconds = time_to_seconds(current_time_only)
        departure_seconds = time_to_seconds(departure_time_only)
        arrival_seconds = time_to_seconds(arrival_time_only) if arrival_time_only else None

        # Debug logging for EUM001
        if ship_id == 'EUM001':
            print(f"[DEBUG] EUM001 - Departure: {departure_time_only}, Current: {current_time_only}")
            print(f"[DEBUG] EUM001 - Seconds - Current: {current_seconds}, Departure: {departure_seconds}")

        # Calculate current position based on time-only (completely date-independent)
        if current_seconds < departure_seconds:
            # Ship hasn't departed yet - use start position
            lat, lng = path[0]
            is_moving = False
        elif arrival_seconds and current_seconds >= arrival_seconds:
            # Ship has arrived - use end position
            lat, lng = path[-1]
            is_moving = False
        else:
            # Ship is in transit - interpolate position
            elapsed_seconds = current_seconds - departure_seconds
            elapsed_hours = elapsed_seconds / 3600.0
            distance_traveled = speed * elapsed_hours  # nautical miles

            # Find position along path
            total_distance = 0
            lat, lng = path[0]
            is_moving = True

            for i in range(len(path) - 1):
                from core_optimizer_latlng import haversine_distance
                segment_distance = haversine_distance(
                    path[i][0], path[i][1],
                    path[i+1][0], path[i+1][1]
                )

                if total_distance + segment_distance >= distance_traveled:
                    # Ship is on this segment
                    fraction = (distance_traveled - total_distance) / segment_distance
                    lat = path[i][0] + (path[i+1][0] - path[i][0]) * fraction
                    lng = path[i][1] + (path[i+1][1] - path[i][1]) * fraction
                    break

                total_distance += segment_distance
            else:
                # Ship has reached the end
                lat, lng = path[-1]
                is_moving = False

        # Get ship ID number for devId
        # Handle both EUM and SHIP prefixes
        if 'EUM' in ship_id:
            ship_num = int(ship_id.replace('EUM', ''))
        else:
            ship_num = int(ship_id.replace('SHIP', ''))

        positions.append(ShipRealtimeLocation(
            logDateTime=current_time.isoformat(),
            devId=ship_num,
            rcvDateTime=current_time.isoformat(),
            lati=lat,
            longi=lng,
            azimuth=0.0,
            course=0.0,
            speed=speed if is_moving else 0.0
        ))

    # If Ship 1 doesn't have a route in simulation table, add it as stationary
    # Otherwise, Ship 1's position was already calculated in the loop above
    if not any(p.devId == 1 for p in positions):
        ship1 = db.query(DBShip).filter(DBShip.id == 1).first()
        if ship1:
            positions.insert(0, ShipRealtimeLocation(
                logDateTime=current_time.isoformat(),
                devId=1,
                rcvDateTime=current_time.isoformat(),
                lati=ship1.latitude,
                longi=ship1.longitude,
                azimuth=0.0,
                course=0.0,
                speed=0.0
            ))

    conn.close()
    return positions

@app.get("/api/simulation/routes")
async def get_simulation_routes():
    """Get all simulation routes"""
    conn = sqlite3.connect('ship_routes.db')
    cursor = conn.cursor()

    cursor.execute("""
        SELECT ship_id, ship_name, departure_time, arrival_time,
               path, speed_knots, direction, total_distance_nm
        FROM ship_routes_simulation
        ORDER BY departure_time
    """)

    routes = cursor.fetchall()
    result = []

    for route in routes:
        ship_id, ship_name, departure, arrival, path_json, speed, direction, distance = route
        result.append({
            "ship_id": ship_id,
            "ship_name": ship_name,
            "departure_time": departure,
            "arrival_time": arrival,
            "path": json.loads(path_json),
            "speed_knots": speed,
            "direction": direction,
            "total_distance_nm": distance
        })

    conn.close()
    return result

@app.get("/api/simulation/schedules")
async def get_ship_schedules():
    """Get all ship schedules from database"""
    conn = sqlite3.connect('ship_routes.db')
    cursor = conn.cursor()

    cursor.execute("""
        SELECT ship_id, ship_name, departure_time, arrival_time,
               path, speed_knots, direction, total_distance_nm
        FROM ship_routes_simulation
        ORDER BY departure_time
    """)

    schedules = []
    for row in cursor.fetchall():
        ship_id, ship_name, departure_time, arrival_time, path_json, speed, direction, distance = row
        path = json.loads(path_json)

        # Determine trip type based on direction
        # to_fishing = departure (dock -> fishing area)
        # to_docking = arrival (fishing area -> dock)
        trip_type = 'departure' if direction == 'to_fishing' else 'arrival'

        # Extract times
        dep_time = datetime.fromisoformat(departure_time).strftime("%H:%M")
        arr_time = datetime.fromisoformat(arrival_time).strftime("%H:%M")

        # Get locations from path
        start_location = path[0] if path else [35.98, 129.56]
        end_location = path[-1] if path else [35.99, 129.57]

        schedules.append({
            "shipId": ship_id,
            "name": ship_name,
            "type": "어선" if "어선" in ship_name else "화물선",
            "departureTime": dep_time,
            "arrivalTime": arr_time,
            "tripType": trip_type,
            "dockingLocation": {
                "lat": start_location[0] if trip_type == 'departure' else end_location[0],
                "lng": start_location[1] if trip_type == 'departure' else end_location[1]
            },
            "fishingLocation": {
                "lat": end_location[0] if trip_type == 'departure' else start_location[0],
                "lng": end_location[1] if trip_type == 'departure' else start_location[1]
            } if "어선" in ship_name else None,
            "speed": speed,  # Add speed in knots
            "status": "scheduled"  # We can enhance this based on current simulation time
        })

    conn.close()
    return schedules

@app.get("/api/simulation/ship-route/{ship_id}")
async def get_ship_simulation_route(ship_id: str):
    """Get simulation route for a specific ship"""
    conn = sqlite3.connect('ship_routes.db')
    cursor = conn.cursor()

    # Map SHIP ID to EUM ID
    id_mapping = {
        'SHIP001': 'EUM001', 'SHIP002': 'EUM002', 'SHIP003': 'EUM003',
        'SHIP004': 'EUM004', 'SHIP005': 'EUM005', 'SHIP006': 'EUM006',
        'SHIP007': 'EUM007', 'SHIP008': 'EUM008', 'SHIP009': 'EUM009',
        'SHIP010': 'EUM010'
    }

    # Convert SHIP ID to EUM ID if needed
    query_id = id_mapping.get(ship_id, ship_id)

    # Try to find route for this ship
    cursor.execute("""
        SELECT ship_id, ship_name, departure_time, arrival_time,
               path, speed_knots, direction, total_distance_nm
        FROM ship_routes_simulation
        WHERE ship_id = ?
        ORDER BY departure_time DESC
        LIMIT 1
    """, (query_id,))

    route = cursor.fetchone()
    conn.close()

    if not route:
        return None

    ship_id_db, ship_name, departure, arrival, path_json, speed, direction, distance = route
    return {
        "ship_id": ship_id,
        "ship_name": ship_name,
        "departure_time": departure,
        "arrival_time": arrival,
        "path": json.loads(path_json),
        "speed_knots": speed,
        "direction": direction,
        "total_distance_nm": distance
    }

@app.post("/api/simulation/generate-routes")
async def generate_simulation_routes():
    """Generate new routes for simulation"""
    import subprocess
    result = subprocess.run(['python', 'generate_ship_routes.py'], capture_output=True, text=True)

    if result.returncode == 0:
        return {"status": "success", "message": "Routes generated successfully"}
    else:
        return {"status": "error", "message": result.stderr}


@app.get("/api/daily-report")
async def get_daily_report(
    date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Generate daily operational report"""
    from datetime import datetime, timedelta
    from sqlalchemy import and_, func

    # Parse date or use today
    if date:
        report_date = datetime.strptime(date, "%Y-%m-%d").date()
    else:
        report_date = datetime.now().date()

    start_datetime = datetime.combine(report_date, datetime.min.time())
    end_datetime = datetime.combine(report_date, datetime.max.time())

    # Get ship statistics
    total_ships = db.query(DBShip).count()
    active_ships = db.query(DBShip).filter(DBShip.status.in_(['active', 'sailing'])).count()
    docked_ships = db.query(DBShip).filter(DBShip.status == 'docked').count()

    # Get SOS alerts for the day
    sos_alerts = db.query(DBSOSAlert).filter(
        and_(
            DBSOSAlert.created_at >= start_datetime,
            DBSOSAlert.created_at <= end_datetime
        )
    ).all()

    total_sos = len(sos_alerts)
    active_sos = len([s for s in sos_alerts if s.status == 'active'])
    resolved_sos = len([s for s in sos_alerts if s.status == 'resolved'])

    # Get messages for the day
    messages = db.query(DBMessage).filter(
        and_(
            DBMessage.created_at >= start_datetime,
            DBMessage.created_at <= end_datetime
        )
    ).all()

    total_messages = len(messages)
    sent_messages = len([m for m in messages if m.sender_id == 'control_center'])
    received_messages = len([m for m in messages if m.recipient_id == 'control_center'])

    # Get scheduled departures from simulation routes
    conn = sqlite3.connect('ship_routes.db')
    cursor = conn.cursor()
    cursor.execute("""
        SELECT ship_id, ship_name, departure_time, arrival_time, direction
        FROM ship_routes_simulation
        ORDER BY departure_time
    """)
    departures = []
    for row in cursor.fetchall():
        departures.append({
            "ship_id": row[0],
            "ship_name": row[1],
            "departure_time": row[2],
            "arrival_time": row[3],
            "direction": row[4]
        })
    conn.close()

    # Get any incidents (SOS alerts with descriptions)
    incidents = []
    for alert in sos_alerts:
        incidents.append({
            "time": alert.created_at.strftime("%H:%M"),
            "ship_name": alert.ship_name,
            "description": alert.description or "SOS Alert",
            "status": alert.status
        })

    report = {
        "date": report_date.isoformat(),
        "time": datetime.now().strftime("%H:%M:%S"),
        "ship_status": {
            "total_ships": total_ships,
            "active_ships": active_ships,
            "docked_ships": docked_ships
        },
        "emergency_summary": {
            "total_sos_alerts": total_sos,
            "active_alerts": active_sos,
            "resolved_alerts": resolved_sos
        },
        "communication_summary": {
            "total_messages": total_messages,
            "sent_messages": sent_messages,
            "received_messages": received_messages
        },
        "departures": departures[:10],  # Limit to 10 for display
        "incidents": incidents
    }

    return report


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)