# Ship Navigation Optimizer API

## Overview
FastAPI backend for ship route optimization with collision avoidance.

## Features
- **Optimal departure time recommendation** (수용 O mode)
- **Fixed departure time with path adjustment** (수용 X mode)
- **Database persistence** for all ship routes
- **Real-time collision detection**
- **Static obstacle avoidance**

## Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
python app.py
```

Server will start at `http://localhost:8000`

## API Endpoints

### 1. Plan Route
**POST** `/api/route/plan`

Request optimal route for a ship.

**Request Body:**
```json
{
  "ship_id": "SHIP_001",
  "start_position": [594, 593],
  "goal_position": [1726, 976],
  "departure_time": 0,
  "speed_knots": 15.0
}
```

**Response:**
```json
{
  "ship_id": "SHIP_001",
  "recommended_departure": 15.0,
  "arrival_time": 89.2,
  "path_points": [[594, 593], [620, 600], ...],
  "segments": [...],
  "total_distance_nm": 7.1,
  "total_duration_minutes": 74.2,
  "optimization_type": "time_adjusted",
  "time_saved_minutes": 15.0,
  "detour_distance_nm": null
}
```

### 2. Accept/Reject Route
**POST** `/api/route/accept`

Accept or reject the recommended departure time.

**Request Body:**
```json
{
  "ship_id": "SHIP_001",
  "accept": false
}
```

- `accept: true` → Use recommended departure time (수용 O)
- `accept: false` → Keep original time, adjust path only (수용 X)

### 3. Get All Ships
**GET** `/api/ships`

Get status of all ships in the system.

**Response:**
```json
[
  {
    "ship_id": "SHIP_001",
    "status": "accepted",
    "current_position": [750, 650],
    "departure_time": 15.0,
    "arrival_time": 89.2,
    "path_points": [...],
    "optimization_mode": "flexible"
  }
]
```

### 4. Get Ship Status
**GET** `/api/ship/{ship_id}`

Get specific ship's current status.

### 5. Delete Ship
**DELETE** `/api/ship/{ship_id}`

Remove a ship from the system.

## Usage Example

```python
import requests

# 1. Plan route for new ship
route_request = {
    "ship_id": "CARGO_001",
    "start_position": [594, 593],
    "goal_position": [1726, 976],
    "departure_time": 0,  # Requested departure
    "speed_knots": 12.0
}

response = requests.post(
    "http://localhost:8000/api/route/plan",
    json=route_request
)
route = response.json()

print(f"Recommended departure: {route['recommended_departure']} min")

# 2. Accept or reject
if route['recommended_departure'] != route_request['departure_time']:
    # Ship captain decides
    accept = input("Accept recommended time? (y/n): ") == 'y'

    acceptance = {
        "ship_id": "CARGO_001",
        "accept": accept
    }

    response = requests.post(
        "http://localhost:8000/api/route/accept",
        json=acceptance
    )

    if not accept:
        # Fixed time mode - path adjusted
        new_route = response.json()
        print(f"Detour distance: {new_route['detour_distance_nm']} nm")
```

## Database Schema

Ships are stored in SQLite database (`ship_routes.db`) with:
- Ship ID, positions, timing
- Optimized path and speeds
- Status (pending/accepted/active/completed)
- Optimization mode (flexible/fixed)

## Testing

Run the test client:
```bash
python test_api.py
```

## API Documentation

Interactive API docs available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`