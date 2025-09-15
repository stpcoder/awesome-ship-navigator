"""
Test script for EUM API integration
"""
import requests
import json
from datetime import datetime
from eum_api_client import EUMAPIClient

# Configuration
BASE_URL = "http://localhost:8000"
API_ENDPOINTS = {
    "ships": "/api/eum/ships",
    "sync": "/api/eum/ships/sync",
    "realtime": "/api/eum/ships/realtime",
    "routes": "/api/eum/ships/routes",
    "cctv": "/api/eum/cctv",
    "lidar": "/api/eum/lidar",
    "weather": "/api/eum/weather",
    "density": "/api/eum/traffic/density"
}


def test_direct_eum_api():
    """Test direct connection to EUM API"""
    print("=" * 50)
    print("Testing Direct EUM API Connection")
    print("=" * 50)

    client = EUMAPIClient()

    # Test 1: Get ship list
    print("\n1. Testing Ship List API...")
    try:
        ships = client.get_ship_list()
        if ships:
            print(f"✅ Success: Found {len(ships)} ships")
            print(f"   Sample ship: {ships[0]['name']} ({ships[0]['shipId']})")
        else:
            print("⚠️  No ships returned from API")
    except Exception as e:
        print(f"❌ Failed: {e}")

    # Test 2: Get CCTV devices
    print("\n2. Testing CCTV API...")
    try:
        cctvs = client.get_cctv_devices()
        if cctvs:
            print(f"✅ Success: Found {len(cctvs)} CCTV devices")
            print(f"   Sample CCTV: {cctvs[0]['name']}")
        else:
            print("⚠️  No CCTV devices returned")
    except Exception as e:
        print(f"❌ Failed: {e}")

    # Test 3: Get LiDAR devices
    print("\n3. Testing LiDAR API...")
    try:
        lidars = client.get_lidar_devices()
        if lidars:
            print(f"✅ Success: Found {len(lidars)} LiDAR devices")
            print(f"   Sample LiDAR: {lidars[0]['name']}")
        else:
            print("⚠️  No LiDAR devices returned")
    except Exception as e:
        print(f"❌ Failed: {e}")

    # Test 4: Get real-time locations
    print("\n4. Testing Real-time Location API...")
    try:
        locations = client.get_ship_realtime_location()
        if locations:
            print(f"✅ Success: Found {len(locations)} real-time locations")
            sample = locations[0]
            print(f"   Ship {sample['devId']}: lat={sample['lati']:.4f}, lng={sample['longi']:.4f}, speed={sample['speed']} knots")
        else:
            print("⚠️  No real-time locations returned")
    except Exception as e:
        print(f"❌ Failed: {e}")

    # Test 5: Get weather data
    print("\n5. Testing Weather API...")
    try:
        today = datetime.now().strftime("%Y%m%d")
        weather = client.get_weather_data(today)
        if weather and 'top' in weather:
            top = weather['top']
            print(f"✅ Success: Weather data for {today}")
            print(f"   Temperature: {top.get('temperature', 'N/A')}°C")
            print(f"   Wind Speed: {top.get('windSpeed', 'N/A')} m/s")
            print(f"   Wind Direction: {top.get('windDirection', 'N/A')}°")
        else:
            print("⚠️  No weather data returned")
    except Exception as e:
        print(f"❌ Failed: {e}")

    print("\n" + "=" * 50)


def test_local_api():
    """Test local API endpoints"""
    print("\nTesting Local API Integration")
    print("=" * 50)

    # Test sync endpoint first
    print("\n1. Syncing ship data from EUM API...")
    try:
        response = requests.post(f"{BASE_URL}{API_ENDPOINTS['sync']}")
        if response.status_code == 200:
            print("✅ Ship data synchronized successfully")
        else:
            print(f"❌ Sync failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Connection error: {e}")
        print("   Make sure the API server is running (python app.py)")
        return

    # Test each endpoint
    for name, endpoint in API_ENDPOINTS.items():
        if name == "sync":
            continue  # Already tested

        print(f"\n2. Testing {name.upper()} endpoint...")
        try:
            # Add parameters for specific endpoints
            params = {}
            if name == "weather":
                params = {"date": datetime.now().strftime("%Y%m%d")}
            elif name == "density":
                params = {
                    "start_date": datetime.now().strftime("%Y%m%d"),
                    "start_time": datetime.now().strftime("%H%M")
                }

            response = requests.get(f"{BASE_URL}{endpoint}", params=params)

            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    print(f"✅ Success: {len(data)} items returned")
                    if data:
                        print(f"   Sample: {json.dumps(data[0], indent=2)[:200]}...")
                else:
                    print(f"✅ Success: Data returned")
                    print(f"   {json.dumps(data, indent=2)[:200]}...")
            else:
                print(f"❌ Failed: Status {response.status_code}")
                print(f"   {response.text[:200]}")

        except Exception as e:
            print(f"❌ Error: {e}")

    print("\n" + "=" * 50)


def test_path_format_compatibility():
    """Test if ship route format is compatible with our path planning system"""
    print("\nTesting Path Format Compatibility")
    print("=" * 50)

    try:
        # Get ship routes from our API
        response = requests.get(f"{BASE_URL}/api/eum/ships/routes")
        if response.status_code == 200:
            routes = response.json()
            if routes:
                route = routes[0]
                print(f"✅ Route format check:")
                print(f"   ship_id: {route['ship_id']}")
                print(f"   departure_time: {route['departure_time']} minutes")
                print(f"   arrival_time: {route['arrival_time']} minutes")
                print(f"   path_points: {len(route['path_points'])} points")
                print(f"   First point: {route['path_points'][0]}")
                print(f"   Last point: {route['path_points'][-1]}")
                print(f"   speed_knots: {route['speed_knots']}")
                print(f"   status: {route['status']}")

                # Check format compatibility
                if all(isinstance(p, list) and len(p) == 2 for p in route['path_points']):
                    print("\n✅ Path format is compatible with our system")
                else:
                    print("\n❌ Path format needs adjustment")
            else:
                print("⚠️  No routes returned")
        else:
            print(f"❌ Failed to get routes: {response.status_code}")
    except Exception as e:
        print(f"❌ Error: {e}")

    print("\n" + "=" * 50)


def test_realtime_to_path_mapping():
    """Test mapping real-time locations to our path format"""
    print("\nTesting Real-time Location to Path Mapping")
    print("=" * 50)

    try:
        # Get real-time locations
        response = requests.get(f"{BASE_URL}/api/eum/ships/realtime")
        if response.status_code == 200:
            locations = response.json()
            if locations:
                print(f"✅ Found {len(locations)} real-time locations")

                # Show how to convert to our coordinate system
                for loc in locations[:3]:  # Show first 3
                    # EUM API uses lat/lon, we need to convert to our pixel coordinates
                    # This is a simplified conversion - actual conversion would need proper projection
                    lat = loc['lati']
                    lon = loc['longi']

                    # Example conversion (would need actual projection logic)
                    # Assuming Guryongpo port area roughly:
                    # Lat: 35.98-35.99, Lon: 129.55-129.57
                    # Map to our 2000x1400 pixel grid
                    x = ((lon - 129.55) / 0.02) * 2000
                    y = ((35.99 - lat) / 0.01) * 1400

                    print(f"\n   Ship {loc['devId']}:")
                    print(f"     Original: ({lat:.6f}, {lon:.6f})")
                    print(f"     Converted: ({x:.1f}, {y:.1f}) pixels")
                    print(f"     Speed: {loc['speed']} knots")
                    print(f"     Course: {loc['course']}°")
            else:
                print("⚠️  No real-time locations available")
        else:
            print(f"❌ Failed to get real-time locations: {response.status_code}")
    except Exception as e:
        print(f"❌ Error: {e}")

    print("\n" + "=" * 50)


if __name__ == "__main__":
    print("\n" + "=" * 70)
    print(" EUM API Integration Test Suite")
    print("=" * 70)

    # Test direct API connection first
    test_direct_eum_api()

    # Test local API integration
    print("\n" + "=" * 70)
    print(" Testing Local API Server Integration")
    print("=" * 70)
    print("\nNote: Make sure the API server is running (python app.py)")
    input("Press Enter to continue with local API tests...")

    test_local_api()
    test_path_format_compatibility()
    test_realtime_to_path_mapping()

    print("\n" + "=" * 70)
    print(" Test Complete!")
    print("=" * 70)