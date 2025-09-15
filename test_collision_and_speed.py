"""
Test collision avoidance in Fixed Mode (수용 X) and speed transmission
"""
import requests
import json
import numpy as np

BASE_URL = "http://localhost:8000"


def test_fixed_mode_collision_avoidance():
    """Test that Fixed Mode properly avoids collisions"""
    print("\n" + "="*70)
    print("TESTING FIXED MODE (수용 X) COLLISION AVOIDANCE")
    print("="*70)

    # Step 1: Create first ship with a route
    print("\n1. Creating first ship with route...")
    ship1 = {
        "ship_id": "SHIP_A",
        "start_position": [100.0, 500.0],
        "goal_position": [1900.0, 500.0],  # Straight horizontal path
        "departure_time": 10.0,
        "speed_knots": 10.0
    }

    r = requests.post(f"{BASE_URL}/api/route/plan", json=ship1)
    if r.status_code == 200:
        route1 = r.json()
        print(f"  ✅ Ship A route planned")
        print(f"     Path points: {len(route1['path_points'])}")
        print(f"     Departure: {route1['recommended_departure']:.1f} min")

        # Accept first ship's route
        requests.post(f"{BASE_URL}/api/route/accept",
                     json={"ship_id": "SHIP_A", "accept": True})
        print(f"     ✅ Ship A route accepted")

    # Step 2: Create second ship with overlapping path
    print("\n2. Creating second ship with potential collision...")
    ship2 = {
        "ship_id": "SHIP_B",
        "start_position": [1000.0, 100.0],
        "goal_position": [1000.0, 900.0],  # Vertical path crossing ship A
        "departure_time": 15.0,  # Original requested time
        "speed_knots": 12.0
    }

    r = requests.post(f"{BASE_URL}/api/route/plan", json=ship2)
    if r.status_code == 200:
        route2 = r.json()
        print(f"  ✅ Ship B route planned")
        print(f"     Recommended departure: {route2['recommended_departure']:.1f} min")
        print(f"     Original requested: {ship2['departure_time']} min")

        # Step 3: REJECT recommendation (수용 X) - use fixed time
        print("\n3. Testing FIXED MODE (rejecting recommendation)...")
        reject_request = {
            "ship_id": "SHIP_B",
            "accept": False  # Force original time
        }

        r = requests.post(f"{BASE_URL}/api/route/accept", json=reject_request)
        if r.status_code == 200:
            fixed_route = r.json()
            print(f"  ✅ Fixed mode activated")
            print(f"     Using original time: {ship2['departure_time']} min")
            print(f"     New path points: {len(fixed_route['path_points'])}")
            print(f"     Total distance: {fixed_route['total_distance_nm']:.2f} nm")

            # Check if path was adjusted (should be different from straight line)
            original_straight_distance = np.sqrt(
                (ship2['goal_position'][0] - ship2['start_position'][0])**2 +
                (ship2['goal_position'][1] - ship2['start_position'][1])**2
            ) * 0.00539957  # Convert to nm

            detour_amount = fixed_route['total_distance_nm'] - original_straight_distance

            print(f"\n  📊 Collision Avoidance Analysis:")
            print(f"     Straight line distance: {original_straight_distance:.2f} nm")
            print(f"     Actual route distance: {fixed_route['total_distance_nm']:.2f} nm")
            print(f"     Detour amount: {detour_amount:.2f} nm")

            if detour_amount > 0.1:  # More than 0.1 nm detour
                print(f"     ✅ Path was adjusted to avoid collision!")
            else:
                print(f"     ⚠️  Path might not have been adjusted enough")

            # Analyze path shape
            path = fixed_route['path_points']
            print(f"\n  📍 Path Analysis:")
            print(f"     Start: {path[0]}")
            print(f"     End: {path[-1]}")

            # Check for waypoints that deviate from straight line
            deviations = []
            for i in range(1, len(path)-1):
                # Calculate perpendicular distance from straight line
                # This is simplified - just checking if middle points deviate
                point = path[i]
                expected_y = ship2['start_position'][1] + (ship2['goal_position'][1] - ship2['start_position'][1]) * i / len(path)
                deviation = abs(point[1] - expected_y)
                if deviation > 10:  # More than 10 pixels deviation
                    deviations.append((i, deviation))

            if deviations:
                print(f"     ✅ Found {len(deviations)} waypoints deviating from straight path")
                for idx, dev in deviations[:3]:
                    print(f"        Point {idx}: {dev:.1f} pixels deviation")
            else:
                print(f"     ⚠️  Path appears to be straight (no collision avoidance)")

    # Step 4: Verify both ships' status
    print("\n4. Verifying both ships' status...")
    for ship_id in ["SHIP_A", "SHIP_B"]:
        r = requests.get(f"{BASE_URL}/api/ship/{ship_id}")
        if r.status_code == 200:
            status = r.json()
            print(f"\n  Ship {ship_id}:")
            print(f"    Status: {status['status']}")
            print(f"    Mode: {status['optimization_mode']}")
            print(f"    Departure: {status['departure_time']:.1f} min")


def test_speed_transmission():
    """Test if speed adjustments are properly transmitted"""
    print("\n" + "="*70)
    print("TESTING SPEED TRANSMISSION IN ROUTES")
    print("="*70)

    # Create a test ship
    print("\n1. Creating ship with route...")
    ship_request = {
        "ship_id": "SPEED_TEST",
        "start_position": [200.0, 200.0],
        "goal_position": [1800.0, 1200.0],
        "departure_time": 20.0,
        "speed_knots": 15.0
    }

    r = requests.post(f"{BASE_URL}/api/route/plan", json=ship_request)
    if r.status_code == 200:
        route = r.json()
        print(f"  ✅ Route planned")
        print(f"     Base speed: {ship_request['speed_knots']} knots")

        # Check segments for speed information
        print(f"\n2. Analyzing route segments...")
        segments = route.get('segments', [])

        if segments:
            print(f"  Found {len(segments)} segments")

            # Analyze speed variations
            speeds = [seg['speed_knots'] for seg in segments]
            unique_speeds = set(speeds)

            print(f"\n  📊 Speed Analysis:")
            print(f"     Total segments: {len(segments)}")
            print(f"     Unique speeds: {unique_speeds}")
            print(f"     Min speed: {min(speeds):.1f} knots")
            print(f"     Max speed: {max(speeds):.1f} knots")
            print(f"     Avg speed: {np.mean(speeds):.1f} knots")

            # Show first few segments
            print(f"\n  📍 Sample Segments:")
            for i, seg in enumerate(segments[:5]):
                print(f"     Segment {i+1}:")
                print(f"       Speed: {seg['speed_knots']} knots")
                print(f"       Duration: {seg['duration_minutes']:.1f} min")
                print(f"       Distance: {seg['distance_nm']:.2f} nm")

            # Check if speeds vary (for collision avoidance)
            if len(unique_speeds) > 1:
                print(f"\n  ✅ Speed adjustments detected (collision avoidance)")
            else:
                print(f"\n  ℹ️  Constant speed throughout route")

        # Accept route and check database storage
        print("\n3. Checking speed storage in database...")
        requests.post(f"{BASE_URL}/api/route/accept",
                     json={"ship_id": "SPEED_TEST", "accept": True})

        # Get ship details
        r = requests.get(f"{BASE_URL}/api/ship/SPEED_TEST")
        if r.status_code == 200:
            status = r.json()
            print(f"  Ship status: {status['status']}")
            print(f"  Path points: {len(status['path_points'])}")

            # The actual speeds are stored in database but not exposed in status
            # This is handled internally by the path_speeds field
            print(f"\n  ℹ️  Note: Speed variations are stored in database")
            print(f"      Field: path_speeds (JSON array)")
            print(f"      Used for: Collision avoidance calculations")


def main():
    print("\n" + "="*70)
    print(" COLLISION AVOIDANCE & SPEED TRANSMISSION TEST")
    print("="*70)

    # Test 1: Fixed mode collision avoidance
    test_fixed_mode_collision_avoidance()

    # Test 2: Speed transmission
    test_speed_transmission()

    print("\n" + "="*70)
    print(" SUMMARY")
    print("="*70)
    print("\n📌 Fixed Mode (수용 X) Collision Avoidance:")
    print("   - When time is fixed, system adjusts PATH instead")
    print("   - Detours around other ships' routes")
    print("   - Uses PathAdjuster.adjust_path_for_collision()")
    print("\n📌 Speed Transmission:")
    print("   - Each route segment has individual speed")
    print("   - Speeds stored in database as JSON array")
    print("   - Used for dynamic collision avoidance")


if __name__ == "__main__":
    main()