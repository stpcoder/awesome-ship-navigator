"""Database configuration and models"""

from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import json

# SQLite database
SQLALCHEMY_DATABASE_URL = "sqlite:///./ship_routes.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class ShipRoute(Base):
    """Ship route database model"""
    __tablename__ = "ship_routes"

    id = Column(Integer, primary_key=True, index=True)
    ship_id = Column(String, unique=True, index=True)
    ship_name = Column(String)

    # Start and goal positions
    start_x = Column(Float)
    start_y = Column(Float)
    goal_x = Column(Float)
    goal_y = Column(Float)

    # Timing
    requested_departure = Column(Float)  # Original requested departure time
    actual_departure = Column(Float)     # Actual/optimized departure time
    arrival_time = Column(Float)         # Expected arrival time

    # Speed
    speed_knots = Column(Float)

    # Path data (stored as JSON)
    path_points = Column(Text)  # JSON array of [x, y] points
    path_speeds = Column(Text)   # JSON array of speeds for each segment
    path_length_nm = Column(Float)

    # Status
    status = Column(String)  # 'pending', 'accepted', 'rejected', 'active', 'completed'
    optimization_mode = Column(String)  # 'flexible' or 'fixed'

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_path(self):
        """Get path as list of tuples"""
        if self.path_points:
            points = json.loads(self.path_points)
            return [(p[0], p[1]) for p in points]
        return []

    def set_path(self, path):
        """Set path from list of tuples"""
        self.path_points = json.dumps([[p[0], p[1]] for p in path])

    def get_speeds(self):
        """Get segment speeds as list"""
        if self.path_speeds:
            return json.loads(self.path_speeds)
        return []

    def set_speeds(self, speeds):
        """Set segment speeds"""
        self.path_speeds = json.dumps(speeds)


class Ship(Base):
    """Ship information from EUM API"""
    __tablename__ = "ships"

    id = Column(Integer, primary_key=True, index=True)
    ship_id = Column(String, unique=True, index=True)
    name = Column(String)
    type = Column(String)
    pol = Column(String)
    pol_addr = Column(String)
    length = Column(Float)
    breath = Column(Float)
    depth = Column(Float)
    gt = Column(Float)

    # Fishing area coordinates
    fishing_area_lat = Column(Float)
    fishing_area_lng = Column(Float)

    # Docking position coordinates
    docking_lat = Column(Float)
    docking_lng = Column(Float)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ShipRealtimeLocation(Base):
    """Real-time ship location data"""
    __tablename__ = "ship_realtime_locations"

    id = Column(Integer, primary_key=True, index=True)
    dev_id = Column(Integer)
    ship_id = Column(String, ForeignKey('ships.ship_id'))
    log_datetime = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    azimuth = Column(Float)
    course = Column(Float)
    speed = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

    ship = relationship("Ship")


class CCTVDevice(Base):
    """CCTV device information"""
    __tablename__ = "cctv_devices"

    id = Column(Integer, primary_key=True)
    name = Column(String)
    latitude = Column(String)
    longitude = Column(String)
    address = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class LiDARDevice(Base):
    """LiDAR device information"""
    __tablename__ = "lidar_devices"

    id = Column(Integer, primary_key=True)
    name = Column(String)
    latitude = Column(String)
    longitude = Column(String)
    address = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class WeatherData(Base):
    """Weather data"""
    __tablename__ = "weather_data"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String, unique=True)
    temperature = Column(Float)
    wind_speed = Column(Float)
    wind_direction = Column(Float)
    humidity = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)


class SOSAlert(Base):
    """SOS emergency alerts from ships"""
    __tablename__ = "sos_alerts"

    id = Column(Integer, primary_key=True, index=True)
    ship_id = Column(String, ForeignKey('ships.ship_id'), index=True)
    ship_name = Column(String)
    emergency_type = Column(String)  # collision, fire, engine, medical, other
    message = Column(Text)
    latitude = Column(Float)
    longitude = Column(Float)
    status = Column(String, default='active')  # active, responding, resolved
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime)

    ship = relationship("Ship")


class Message(Base):
    """Chat messages between ships and control center"""
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(String, index=True)  # ship_id or 'control_center'
    sender_name = Column(String)
    recipient_id = Column(String, index=True)  # ship_id, 'control_center', or 'all'
    recipient_name = Column(String)
    message = Column(Text)
    message_type = Column(String, default='text')  # text, broadcast, system
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime)


# Create tables
Base.metadata.create_all(bind=engine)


def get_db():
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()