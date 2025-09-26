"""Pydantic models for API"""

from pydantic import BaseModel
from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime


class RouteRequest(BaseModel):
    """Ship route planning request"""
    ship_id: str
    start_position: Tuple[float, float]  # (x, y)
    goal_position: Tuple[float, float]   # (x, y)
    departure_time: float  # minutes from now
    speed_knots: Optional[float] = 12.0  # default speed


class RouteSegment(BaseModel):
    """Individual route segment"""
    start_point: Tuple[float, float]
    end_point: Tuple[float, float]
    speed_knots: float
    duration_minutes: float
    distance_nm: float


class RouteResponse(BaseModel):
    """Optimized route response"""
    ship_id: str
    recommended_departure: float  # optimized departure time
    arrival_time: float
    path_points: List[Tuple[float, float]]
    segments: List[RouteSegment]
    total_distance_nm: float
    total_duration_minutes: float
    optimization_type: str  # "time_adjusted" or "path_only"
    time_saved_minutes: Optional[float] = None
    detour_distance_nm: Optional[float] = None


class DepartureRouteRequest(BaseModel):
    """Departure route planning request (정박지 → 어장)"""
    ship_id: str
    departure_time: Optional[float] = None  # minutes from now
    flexible_time: bool = True

class ArrivalRouteRequest(BaseModel):
    """Arrival route planning request (어장 → 정박지)"""
    ship_id: str
    departure_time: Optional[float] = None  # minutes from now
    flexible_time: bool = True

class RouteAcceptance(BaseModel):
    """Route acceptance/rejection"""
    ship_id: str
    accept: bool  # True = accept recommended time, False = keep original time


class RouteStatus(BaseModel):
    """Current route status"""
    ship_id: str
    status: str  # 'pending', 'accepted', 'rejected', 'active', 'completed'
    current_position: Optional[Tuple[float, float]] = None
    departure_time: float
    arrival_time: float
    path_points: List[Tuple[float, float]]
    optimization_mode: str  # 'flexible' or 'fixed'


class ShipPosition(BaseModel):
    """Ship position at specific time"""
    ship_id: str
    time: float
    position: Tuple[float, float]
    speed_knots: float
    heading_degrees: Optional[float] = None


# EUM API Integration Models
class ShipInfo(BaseModel):
    """Ship registration information from EUM API"""
    id: int
    shipId: str
    type: str
    name: str
    pol: str
    polAddr: str
    hm: str
    pe: str
    ps: float
    kw: float
    engineCnt: int
    propeller: str
    propellerCnt: int
    length: float
    breath: float
    depth: float
    gt: float
    sign: str
    rgDtm: str
    dcDate: str
    # New fields for fishing and docking positions
    fishingAreaLat: Optional[float] = None
    fishingAreaLng: Optional[float] = None
    dockingLat: Optional[float] = None
    dockingLng: Optional[float] = None


class CCTVDevice(BaseModel):
    """CCTV device information"""
    id: int
    name: str
    latitude: str
    longitude: str
    address: str


class LiDARDevice(BaseModel):
    """LiDAR device information"""
    id: int
    name: str
    latitude: str
    longitude: str
    address: str


class ShipRealtimeLocation(BaseModel):
    """Real-time ship location from EUM API"""
    logDateTime: str
    devId: int
    rcvDateTime: str
    lati: float
    longi: float
    azimuth: float
    course: float
    speed: float


class WeatherData(BaseModel):
    """Weather data from EUM API"""
    temperature: float
    windSpeed: float
    windDirection: float
    humidity: float


class ShipDensityGrid(BaseModel):
    """Ship density grid information"""
    gridId: str
    latitude: float
    longitude: float
    shipCount: int
    densityLevel: str


class ShipRoute(BaseModel):
    """Ship route compatible with our path planning system"""
    ship_id: str
    devId: int  # EUM API device ID
    departure_time: float
    arrival_time: float
    path_points: List[Tuple[float, float]]  # List of (latitude, longitude)
    current_position: Optional[Tuple[float, float]] = None
    speed_knots: float
    status: str  # 'planning', 'active', 'completed'


class ShipRealtimeWithRoute(BaseModel):
    """Combined real-time location with planned route"""
    ship_id: str
    dev_id: int
    current_location: Dict[str, Any]  # Real-time location from EUM
    planned_route: Optional[Dict[str, Any]] = None  # Planned route if exists
    deviation: Optional[Dict[str, float]] = None  # Deviation metrics


class ShipPositionUpdate(BaseModel):
    """Ship position update request"""
    fishingAreaLat: Optional[float] = None
    fishingAreaLng: Optional[float] = None
    dockingLat: Optional[float] = None
    dockingLng: Optional[float] = None


class SOSRequest(BaseModel):
    """SOS emergency request"""
    ship_id: str
    emergency_type: str  # collision, fire, engine, medical, other
    message: str
    latitude: float
    longitude: float


class SOSResponse(BaseModel):
    """SOS emergency response"""
    id: int
    ship_id: str
    ship_name: Optional[str] = None
    emergency_type: str
    message: str
    latitude: float
    longitude: float
    status: str  # active, responding, resolved
    created_at: datetime
    resolved_at: Optional[datetime] = None


class SOSUpdateStatus(BaseModel):
    """Update SOS alert status"""
    status: str  # active, responding, resolved


class MessageRequest(BaseModel):
    """Chat message request"""
    sender_id: str
    recipient_id: str  # ship_id, 'control_center', or 'all'
    message: str
    message_type: Optional[str] = 'text'  # text, broadcast, system


class MessageResponse(BaseModel):
    """Chat message response"""
    id: int
    sender_id: str
    sender_name: Optional[str] = None
    recipient_id: str
    recipient_name: Optional[str] = None
    message: str
    message_type: str
    is_read: bool
    created_at: datetime
    read_at: Optional[datetime] = None


class MessageMarkRead(BaseModel):
    """Mark message as read"""
    message_ids: List[int]