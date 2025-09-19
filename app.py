"""FastAPI application for ship route optimization"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import numpy as np
from shapely.geometry import Polygon
from datetime import datetime
import subprocess
import os
import sys

from database import (
    get_db, ShipRoute as DBShipRoute, Ship as DBShip,
    ShipRealtimeLocation as DBShipRealtimeLocation,
    CCTVDevice as DBCCTVDevice, LiDARDevice as DBLiDARDevice,
    WeatherData as DBWeatherData
)
from models import (
    RouteRequest, RouteResponse, RouteAcceptance, RouteStatus, RouteSegment,
    ShipInfo, CCTVDevice, LiDARDevice, ShipRealtimeLocation, WeatherData,
    ShipDensityGrid, ShipRoute as ShipRouteModel, ShipRealtimeWithRoute,
    ShipPositionUpdate
)
from eum_api_client import EUMAPIClient
from core_optimizer import (
    ShipRoute, CollisionChecker, PathAdjuster, RouteOptimizer,
    PIXEL_TO_NM
)
from chatbot_service import ChatbotService


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
collision_checker = None
path_adjuster = None
route_optimizer = None
obstacles_polygons = []
eum_client = None
chatbot_service = None


def load_obstacles_from_json(json_file='guryongpo_obstacles_drawn.json'):
    """Load obstacles from JSON file"""
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    obstacles = []
    for item in data:
        coords = item['polygon']
        obstacles.append(Polygon(coords))

    return obstacles


@app.on_event("startup")
async def startup_event():
    """Initialize optimization components on startup"""
    global collision_checker, path_adjuster, route_optimizer, obstacles_polygons, eum_client, chatbot_service

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

    # Load obstacles
    obstacles_polygons = load_obstacles_from_json()

    # Initialize components
    collision_checker = CollisionChecker(safety_distance_nm=0.5)

    grid_width = 2000 // 20 + 1
    grid_height = 1400 // 20 + 1
    path_adjuster = PathAdjuster(grid_width, grid_height, 20, obstacles_polygons)

    route_optimizer = RouteOptimizer(collision_checker, path_adjuster)

    # Initialize EUM API client
    eum_client = EUMAPIClient()

    # Initialize chatbot service
    chatbot_service = ChatbotService()

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
        ship = ShipRoute(
            name=db_ship.ship_name or db_ship.ship_id,
            ship_id=db_ship.ship_id,
            start=(db_ship.start_x, db_ship.start_y),
            goal=(db_ship.goal_x, db_ship.goal_y),
            path=db_ship.get_path(),
            departure_time=db_ship.actual_departure,
            speed_knots=db_ship.speed_knots
        )
        ship.calculate_timestamps()
        ships.append(ship)

    return ships


def calculate_segments(path: List[tuple], speed_knots: float) -> List[RouteSegment]:
    """Calculate route segments with speeds"""
    segments = []
    speed_pixels_per_minute = (speed_knots / 60.0) / PIXEL_TO_NM

    for i in range(len(path) - 1):
        start = path[i]
        end = path[i + 1]

        distance_pixels = np.sqrt((end[0] - start[0])**2 + (end[1] - start[1])**2)
        distance_nm = distance_pixels * PIXEL_TO_NM
        duration_minutes = distance_pixels / speed_pixels_per_minute

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
    """Plan optimal route for a ship"""

    # Get existing ships
    existing_ships = get_existing_ships(db, exclude_ship_id=request.ship_id)

    # Find initial path avoiding obstacles
    initial_path = path_adjuster.find_initial_path(
        request.start_position,
        request.goal_position
    )

    if not initial_path:
        raise HTTPException(status_code=400, detail="No valid path found")

    # Create ship route
    new_ship = ShipRoute(
        name=request.ship_id,
        ship_id=request.ship_id,
        start=request.start_position,
        goal=request.goal_position,
        path=initial_path,
        departure_time=request.departure_time,
        speed_knots=request.speed_knots
    )
    new_ship.path_length_pixels = route_optimizer.calculate_path_length(initial_path)
    new_ship.calculate_timestamps()

    # Optimize route with flexible time
    optimal_time, optimal_path = route_optimizer.optimize_flexible_time(
        new_ship, existing_ships
    )

    # Calculate metrics
    path_length_nm = route_optimizer.calculate_path_length(optimal_path) * PIXEL_TO_NM
    segments = calculate_segments(optimal_path, request.speed_knots)
    total_duration = sum(seg.duration_minutes for seg in segments)
    arrival_time = optimal_time + total_duration

    # Determine optimization type
    time_adjusted = abs(optimal_time - request.departure_time) > 0.1
    path_changed = optimal_path != initial_path

    optimization_type = "time_adjusted" if time_adjusted else "path_only" if path_changed else "none"

    # Calculate savings
    time_saved = request.departure_time - optimal_time if optimal_time < request.departure_time else None
    detour_distance = (path_length_nm - new_ship.path_length_pixels * PIXEL_TO_NM) if path_changed else None

    # Save to database (as pending)
    db_ship = DBShipRoute(
        ship_id=request.ship_id,
        ship_name=request.ship_id,
        start_x=request.start_position[0],
        start_y=request.start_position[1],
        goal_x=request.goal_position[0],
        goal_y=request.goal_position[1],
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

    # Check if ship already exists
    existing = db.query(DBShipRoute).filter(DBShipRoute.ship_id == request.ship_id).first()
    if existing:
        db.delete(existing)

    db.add(db_ship)
    db.commit()

    return RouteResponse(
        ship_id=request.ship_id,
        recommended_departure=optimal_time,
        arrival_time=arrival_time,
        path_points=optimal_path,
        segments=segments,
        total_distance_nm=path_length_nm,
        total_duration_minutes=total_duration,
        optimization_type=optimization_type,
        time_saved_minutes=time_saved,
        detour_distance_nm=detour_distance
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
            name=db_ship.ship_name,
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
                name=db_ship.ship_name,
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
            name=db_ship.ship_name,
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
    """Get CCTV devices (fetch from EUM API and cache)"""
    global eum_client

    # Check if we have cached data
    devices = db.query(DBCCTVDevice).all()

    if not devices:
        # Fetch from API and cache
        api_devices = eum_client.get_cctv_devices()
        for device_data in api_devices:
            db_device = DBCCTVDevice(
                id=device_data['id'],
                name=device_data['name'],
                latitude=device_data['latitude'],
                longitude=device_data['longitude'],
                address=device_data['address']
            )
            db.add(db_device)
        db.commit()
        devices = db.query(DBCCTVDevice).all()

    return [
        CCTVDevice(
            id=device.id,
            name=device.name,
            latitude=device.latitude,
            longitude=device.longitude,
            address=device.address
        ) for device in devices
    ]


@app.get("/api/eum/lidar", response_model=List[LiDARDevice])
async def get_lidar_devices(db: Session = Depends(get_db)):
    """Get LiDAR devices (fetch from EUM API and cache)"""
    global eum_client

    # Check if we have cached data
    devices = db.query(DBLiDARDevice).all()

    if not devices:
        # Fetch from API and cache
        api_devices = eum_client.get_lidar_devices()
        for device_data in api_devices:
            db_device = DBLiDARDevice(
                id=device_data['id'],
                name=device_data['name'],
                latitude=device_data['latitude'],
                longitude=device_data['longitude'],
                address=device_data['address']
            )
            db.add(db_device)
        db.commit()
        devices = db.query(DBLiDARDevice).all()

    return [
        LiDARDevice(
            id=device.id,
            name=device.name,
            latitude=device.latitude,
            longitude=device.longitude,
            address=device.address
        ) for device in devices
    ]


@app.get("/api/eum/weather")
async def get_weather(date: Optional[str] = None, db: Session = Depends(get_db)):
    """Get weather data for specified date (YYYYMMDD format)"""
    global eum_client

    # Use today if no date specified
    if not date:
        date = datetime.now().strftime("%Y%m%d")

    # Check cache first
    cached = db.query(DBWeatherData).filter(
        DBWeatherData.date == date
    ).first()

    if cached:
        return WeatherData(
            temperature=cached.temperature,
            windSpeed=cached.wind_speed,
            windDirection=cached.wind_direction,
            humidity=cached.humidity
        )

    # Fetch from API
    weather_data = eum_client.get_weather_data(date)
    if weather_data and 'top' in weather_data:
        top = weather_data['top']
        db_weather = DBWeatherData(
            date=date,
            temperature=top.get('temperature', 0),
            wind_speed=top.get('windSpeed', 0),
            wind_direction=top.get('windDirection', 0),
            humidity=top.get('humidity', 0)
        )
        db.add(db_weather)
        db.commit()

        return WeatherData(
            temperature=db_weather.temperature,
            windSpeed=db_weather.wind_speed,
            windDirection=db_weather.wind_direction,
            humidity=db_weather.humidity
        )

    raise HTTPException(status_code=404, detail="Weather data not available")


@app.get("/api/eum/ships/realtime", response_model=List[ShipRealtimeLocation])
async def get_realtime_locations(db: Session = Depends(get_db)):
    """Get real-time ship locations from EUM API"""
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


@app.get("/api/eum/ships/routes", response_model=List[ShipRouteModel])
async def get_ship_routes(db: Session = Depends(get_db)):
    """Get ship routes (dummy data compatible with our path format)"""

    # Generate dummy routes based on our existing path planning system
    ships = db.query(DBShip).limit(5).all()  # Get first 5 ships for demo
    routes = []

    for i, ship in enumerate(ships):
        # Create dummy route that follows similar pattern to our optimized routes
        base_departure = i * 30  # Stagger departures by 30 minutes

        # Sample path points (these would come from actual route planning)
        if i % 2 == 0:
            # Route from port entrance to dock area
            path_points = [
                (35.9850, 129.5579),  # Port entrance
                (35.9845, 129.5585),
                (35.9840, 129.5590),
                (35.9835, 129.5595),
                (35.9830, 129.5600)   # Dock area
            ]
        else:
            # Alternative route
            path_points = [
                (35.9855, 129.5575),  # Alternative entrance
                (35.9850, 129.5580),
                (35.9845, 129.5587),
                (35.9838, 129.5593),
                (35.9832, 129.5598)   # Different dock
            ]

        route = ShipRouteModel(
            ship_id=ship.ship_id,
            devId=ship.id,
            departure_time=base_departure,
            arrival_time=base_departure + 45,  # 45 minutes journey
            path_points=path_points,
            current_position=path_points[0],
            speed_knots=12.0,
            status='planning'
        )
        routes.append(route)

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
                    name=route.ship_name,
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

    if not chatbot_service:
        # Fallback if service not initialized
        return {
            "response": "챗봇 서비스를 초기화하는 중입니다. 잠시 후 다시 시도해주세요.",
            "function": "unknown",
            "parameters": {}
        }

    # Process with ChatGPT
    result = chatbot_service.process_text(message)

    # Add database context for specific functions
    if result["function"] == "show_weather":
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
        "response": result["message"],
        "function": result["function"],
        "parameters": result["parameters"]
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)