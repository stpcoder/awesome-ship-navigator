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
from core_optimizer import (
    ShipRoute, CollisionChecker, PathAdjuster, RouteOptimizer,
    PIXEL_TO_NM
)
from chatbot_service import ChatbotService
from weather_service import WeatherService


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
weather_service = None


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
    global collision_checker, path_adjuster, route_optimizer, obstacles_polygons, eum_client, chatbot_service, weather_service

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
        ship = ShipRoute(
            name=db_ship.name or db_ship.ship_id,
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

    # Handle weather request
    if result["function"] == "show_weather":
        # Get weather from OpenWeather API
        weather_data = await weather_service.get_current_weather()
        weather_message = weather_service.format_weather_message(weather_data)

        return {
            "function": "weather",
            "message": weather_message,
            "weather_data": weather_data,
            "parameters": {}
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

        # If this is a response to clarification, merge with session data
        if session_data.get("direction"):
            route_type = session_data.get("direction")

        # Parse time preference - default to now if not specified
        user_departure_time = 0  # Default to now
        if preferred_time:
            import re
            if preferred_time == "now" or "지금" in str(preferred_time):
                user_departure_time = 0
            elif "분" in str(preferred_time):
                # Extract minutes
                minutes = re.findall(r'\d+', str(preferred_time))
                if minutes:
                    user_departure_time = float(minutes[0])  # Already in minutes
            elif "h" in str(preferred_time) or "시간" in str(preferred_time):
                # Extract hours
                hours = re.findall(r'\d+', str(preferred_time))
                if hours:
                    user_departure_time = float(hours[0]) * 60  # Convert to minutes

        # Get ship
        ship = db.query(DBShip).first()  # Get first ship or specific ship based on context

        if ship and route_type in ["departure", "arrival"]:
            endpoint = f"/api/route/{route_type}"

            # Always calculate optimal time first
            import httpx
            async with httpx.AsyncClient() as client:
                # First, get optimal time
                optimal_response = await client.post(
                    f"http://localhost:8000{endpoint}",
                    json={
                        "ship_id": ship.ship_id,
                        "departure_time": user_departure_time,
                        "flexible_time": True  # Always get optimal time
                    }
                )

            if optimal_response.status_code == 200:
                optimal_route_data = optimal_response.json()
                direction = "출항" if route_type == "departure" else "입항"

                # Compare user time vs optimal time
                optimal_time = optimal_route_data['departure_time']
                user_time_str = "지금 바로" if user_departure_time == 0 else f"{user_departure_time:.0f}분 후"
                optimal_time_str = "지금 바로" if optimal_time == 0 else f"{optimal_time:.0f}분 후"

                # Check if times are different enough to suggest optimization
                time_difference = abs(optimal_time - user_departure_time)

                if time_difference > 5:  # If more than 5 minutes difference
                    # Suggest optimal time
                    message = f"""
                    {user_time_str} {direction}을 계획하셨습니다.

                    🔄 최적 시간 분석 결과:
                    ⏰ 권장 출발: {optimal_time_str}
                    ⚡ 이점: 교통량 감소, 대기시간 단축

                    📍 경로 정보:
                    출발: {optimal_route_data['from']['type']}
                    도착: {optimal_route_data['to']['type']}
                    거리: {optimal_route_data['distance_nm']:.1f} 해리

                    권장 시간으로 계획을 수정하시겠습니까?
                    """

                    return {
                        "function": "route_suggestion",
                        "message": message,
                        "optimal_route": optimal_route_data,
                        "user_time": user_departure_time,
                        "optimal_time": optimal_time,
                        "needs_confirmation": True,
                        "ship_id": ship.ship_id,
                        "session": {
                            "pending_route": optimal_route_data,
                            "user_departure_time": user_departure_time,
                            "ship_id": ship.ship_id,
                            "route_type": route_type
                        }
                    }
                else:
                    # Times are similar, just proceed with user's time
                    message = f"""
                    {user_time_str} {direction} 경로를 계획했습니다.

                    📍 출발: {optimal_route_data['from']['type']}
                    📍 도착: {optimal_route_data['to']['type']}
                    ⛵ 속도: {optimal_route_data['speed_knots']:.1f} knots
                    📏 거리: {optimal_route_data['distance_nm']:.1f} 해리

                    ✅ 경로가 DB에 저장되었습니다.
                    🗺️ 지도에서 경로를 확인하세요.
                    """

                    return {
                        "function": "route_confirmed",
                        "message": message,
                        "route_data": optimal_route_data,
                        "needs_confirmation": False,
                        "ship_id": ship.ship_id,
                        "show_map": True
                    }
            else:
                direction = "출항" if route_type == "departure" else "입항"
                result["message"] = f"{direction} 경로 계획에 실패했습니다."

    # Handle user confirmation response (YES - use optimal time)
    elif any(word in message.lower() for word in ["네", "좋아", "할게", "예", "ok", "yes"]):
        # Check if there's a pending route in session
        if session_data.get("pending_route"):
            ship_id = session_data.get("ship_id")
            route_data = session_data.get("pending_route")

            # Route is already saved in DB with optimal time
            db_route = db.query(DBShipRoute).filter(DBShipRoute.ship_id == ship_id).first()
            if db_route:
                db_route.status = 'confirmed'
                db.commit()

            result["message"] = "✅ 최적 시간으로 경로가 확정되었습니다.\n🗺️ 지도로 이동하여 경로를 확인하세요."
            result["function"] = "route_confirmed"
            result["route_data"] = route_data
            result["show_map"] = True  # Signal to show map
        else:
            result["message"] = "확인할 경로가 없습니다. 먼저 출항/입항 계획을 세워주세요."

    # Handle user rejection response (NO - use original time)
    elif any(word in message.lower() for word in ["아니", "안", "no", "원래"]):
        # Check if there's a pending route
        if session_data.get("pending_route") and session_data.get("user_departure_time") is not None:
            ship_id = session_data.get("ship_id")
            route_type = session_data.get("route_type")
            user_time = session_data.get("user_departure_time")
            endpoint = f"/api/route/{route_type}"

            # Re-plan with user's original time
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"http://localhost:8000{endpoint}",
                    json={
                        "ship_id": ship_id,
                        "departure_time": user_time,
                        "flexible_time": False  # Use exact time
                    }
                )

            if response.status_code == 200:
                route_data = response.json()
                direction = "출항" if route_type == "departure" else "입항"
                time_desc = "지금 바로" if user_time == 0 else f"{user_time:.0f}분 후"

                # Update route status to confirmed with user's time
                db_route = db.query(DBShipRoute).filter(DBShipRoute.ship_id == ship_id).first()
                if db_route:
                    db_route.status = 'confirmed'
                    db_route.optimization_mode = 'user_time'
                    db.commit()

                result["message"] = f"""
                ✅ 원래 시간대로 {direction} 경로를 계획했습니다.

                ⏰ 출발: {time_desc}
                📍 경로: {route_data['from']['type']} → {route_data['to']['type']}
                ⛵ 속도: {route_data['speed_knots']:.1f} knots
                📏 거리: {route_data['distance_nm']:.1f} 해리

                🗺️ 지도로 이동하여 경로를 확인하세요.
                """
                result["function"] = "route_confirmed"
                result["route_data"] = route_data
                result["show_map"] = True
            else:
                result["message"] = "경로 재계획에 실패했습니다."
        else:
            result["message"] = "거부할 경로가 없습니다. 먼저 출항/입항 계획을 세워주세요."

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


# Coordinate conversion functions (matching frontend MapViewReal.js)
MAP_BOUNDS = {
    "topLeft": {"lat": 35.97, "lng": 129.54},  # Top-left corner
    "bottomRight": {"lat": 35.88, "lng": 129.62}  # Bottom-right corner
}

def lat_lng_to_pixel(lat: float, lng: float) -> tuple:
    """Convert latitude/longitude to pixel coordinates (0-2000, 0-1400)"""
    lat_range = MAP_BOUNDS["topLeft"]["lat"] - MAP_BOUNDS["bottomRight"]["lat"]
    lng_range = MAP_BOUNDS["bottomRight"]["lng"] - MAP_BOUNDS["topLeft"]["lng"]

    x = ((lng - MAP_BOUNDS["topLeft"]["lng"]) / lng_range) * 2000
    y = ((MAP_BOUNDS["topLeft"]["lat"] - lat) / lat_range) * 1400

    return (x, y)

def pixel_to_lat_lng(x: float, y: float) -> dict:
    """Convert pixel coordinates to latitude/longitude"""
    lat_range = MAP_BOUNDS["topLeft"]["lat"] - MAP_BOUNDS["bottomRight"]["lat"]
    lng_range = MAP_BOUNDS["bottomRight"]["lng"] - MAP_BOUNDS["topLeft"]["lng"]

    lat = MAP_BOUNDS["topLeft"]["lat"] - (y / 1400) * lat_range
    lng = MAP_BOUNDS["topLeft"]["lng"] + (x / 2000) * lng_range

    return {"lat": lat, "lng": lng}


@app.post("/api/route/departure")
async def plan_departure_route(
    request: DepartureRouteRequest,
    db: Session = Depends(get_db)
):
    """Plan route from docking to fishing area (출항)"""
    ship_id = request.ship_id
    departure_time = request.departure_time
    flexible_time = request.flexible_time

    # Get ship information
    ship = db.query(DBShip).filter(DBShip.ship_id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail=f"Ship {ship_id} not found")

    if not ship.docking_lat or not ship.fishing_area_lat:
        raise HTTPException(status_code=400, detail="Ship doesn't have docking or fishing area defined")

    # Convert coordinates to pixels
    start_pixel = lat_lng_to_pixel(ship.docking_lat, ship.docking_lng)
    goal_pixel = lat_lng_to_pixel(ship.fishing_area_lat, ship.fishing_area_lng)

    # Get existing ships for collision avoidance
    existing_ships = get_existing_ships(db, exclude_ship_id=ship_id)

    # Find initial path avoiding static obstacles
    initial_path = path_adjuster.find_initial_path(start_pixel, goal_pixel)

    if not initial_path:
        raise HTTPException(status_code=400, detail="No valid path found")

    # Create ship route
    new_ship = ShipRoute(
        name=f"{ship.name}_departure",
        ship_id=ship_id,
        start=start_pixel,
        goal=goal_pixel,
        path=initial_path,
        departure_time=departure_time or 0,
        speed_knots=ship.speed if hasattr(ship, 'speed') else 10.0
    )
    new_ship.path_length_pixels = route_optimizer.calculate_path_length(initial_path)
    new_ship.calculate_timestamps()

    # Optimize with flexible time if allowed
    if flexible_time:
        optimized_route = route_optimizer.optimize_route_flexible_time(
            new_ship, existing_ships,
            time_window_start=0,
            time_window_end=1440  # 24 hours in minutes
        )
    else:
        optimized_route = route_optimizer.optimize_route_fixed_time(
            new_ship, existing_ships
        )

    # Convert path to lat/lng
    path_lat_lng = []
    for point in optimized_route.path:
        lat_lng = pixel_to_lat_lng(point[0], point[1])
        path_lat_lng.append({
            "lat": lat_lng["lat"],
            "lng": lat_lng["lng"],
            "pixel": {"x": point[0], "y": point[1]}
        })

    # Save to database if requested
    save_to_db = True  # Always save to DB for playback
    if save_to_db:
        # Remove existing route for this ship
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
            path=json.dumps(optimized_route.path),
            actual_departure=optimized_route.departure_time,
            recommended_departure=optimized_route.departure_time,
            speed_knots=optimized_route.speed_knots,
            path_length_pixels=optimized_route.path_length_pixels,
            path_length_nm=optimized_route.path_length_nm,
            speeds=json.dumps([optimized_route.speed_knots] * len(optimized_route.path)),
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
        "path_points": optimized_route.path,  # For frontend display
        "departure_time": optimized_route.departure_time,
        "recommended_departure": optimized_route.departure_time,
        "arrival_time": optimized_route.timestamps[-1] if optimized_route.timestamps else None,
        "speed_knots": optimized_route.speed_knots,
        "distance_nm": optimized_route.path_length_nm,
        "total_distance_nm": optimized_route.path_length_nm,
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
    flexible_time = request.flexible_time

    # Get ship information
    ship = db.query(DBShip).filter(DBShip.ship_id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail=f"Ship {ship_id} not found")

    if not ship.docking_lat or not ship.fishing_area_lat:
        raise HTTPException(status_code=400, detail="Ship doesn't have docking or fishing area defined")

    # Convert coordinates to pixels (reverse of departure)
    start_pixel = lat_lng_to_pixel(ship.fishing_area_lat, ship.fishing_area_lng)
    goal_pixel = lat_lng_to_pixel(ship.docking_lat, ship.docking_lng)

    # Get existing ships for collision avoidance
    existing_ships = get_existing_ships(db, exclude_ship_id=ship_id)

    # Find initial path avoiding static obstacles
    initial_path = path_adjuster.find_initial_path(start_pixel, goal_pixel)

    if not initial_path:
        raise HTTPException(status_code=400, detail="No valid path found")

    # Create ship route
    new_ship = ShipRoute(
        name=f"{ship.name}_arrival",
        ship_id=ship_id,
        start=start_pixel,
        goal=goal_pixel,
        path=initial_path,
        departure_time=departure_time or 0,
        speed_knots=ship.speed if hasattr(ship, 'speed') else 10.0
    )
    new_ship.path_length_pixels = route_optimizer.calculate_path_length(initial_path)
    new_ship.calculate_timestamps()

    # Optimize with flexible time if allowed
    if flexible_time:
        optimized_route = route_optimizer.optimize_route_flexible_time(
            new_ship, existing_ships,
            time_window_start=0,
            time_window_end=1440
        )
    else:
        optimized_route = route_optimizer.optimize_route_fixed_time(
            new_ship, existing_ships
        )

    # Convert path to lat/lng
    path_lat_lng = []
    for point in optimized_route.path:
        lat_lng = pixel_to_lat_lng(point[0], point[1])
        path_lat_lng.append({
            "lat": lat_lng["lat"],
            "lng": lat_lng["lng"],
            "pixel": {"x": point[0], "y": point[1]}
        })

    # Save to database if requested
    save_to_db = True  # Always save to DB for playback
    if save_to_db:
        # Remove existing route for this ship
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
            path=json.dumps(optimized_route.path),
            actual_departure=optimized_route.departure_time,
            recommended_departure=optimized_route.departure_time,
            speed_knots=optimized_route.speed_knots,
            path_length_pixels=optimized_route.path_length_pixels,
            path_length_nm=optimized_route.path_length_nm,
            speeds=json.dumps([optimized_route.speed_knots] * len(optimized_route.path)),
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
        "path_points": optimized_route.path,  # For frontend display
        "departure_time": optimized_route.departure_time,
        "recommended_departure": optimized_route.departure_time,
        "arrival_time": optimized_route.timestamps[-1] if optimized_route.timestamps else None,
        "speed_knots": optimized_route.speed_knots,
        "distance_nm": optimized_route.path_length_nm,
        "total_distance_nm": optimized_route.path_length_nm,
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)