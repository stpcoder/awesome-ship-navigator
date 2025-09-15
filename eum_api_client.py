"""
EUM API Client for Pohang Port Integration
"""
import requests
import json
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging
from urllib.parse import quote, unquote

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EUMAPIClient:
    """Client for interacting with Pohang EUM API"""

    def __init__(self):
        # API Key (decoded form)
        self.api_key = "+kNoxE5m1WHdEzXn5s+BVVEziOunPu/juZUZccdB6bs="
        self.base_url = "https://dpg-apis.pohang-eum.co.kr"
        self.headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }

    def _make_request(self, endpoint: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        """Make HTTP request to EUM API"""
        if params is None:
            params = {}
        params['serviceKey'] = self.api_key

        url = f"{self.base_url}{endpoint}"

        try:
            logger.info(f"Making request to: {url}")
            response = requests.get(url, params=params, headers=self.headers)
            response.raise_for_status()

            data = response.json()
            if data.get('status') != 'success':
                raise Exception(f"API returned error status: {data.get('status')}")

            return data
        except requests.exceptions.RequestException as e:
            logger.error(f"Request failed: {e}")
            raise
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode JSON response: {e}")
            raise

    def get_ship_list(self) -> List[Dict[str, Any]]:
        """
        Get list of registered ships
        API #1: 선박 등록 리스트
        """
        try:
            response = self._make_request("/ship/devices")
            return response.get('data', [])
        except Exception as e:
            logger.error(f"Failed to get ship list: {e}")
            return []

    def get_cctv_devices(self) -> List[Dict[str, Any]]:
        """
        Get list of CCTV devices
        API #2: CCTV 정보
        """
        try:
            response = self._make_request("/cctv/devices")
            return response.get('data', [])
        except Exception as e:
            logger.error(f"Failed to get CCTV devices: {e}")
            return []

    def get_lidar_devices(self) -> List[Dict[str, Any]]:
        """
        Get list of LiDAR devices
        API #3: LiDAR 정보
        """
        try:
            response = self._make_request("/lidar/devices")
            return response.get('data', [])
        except Exception as e:
            logger.error(f"Failed to get LiDAR devices: {e}")
            return []

    def get_ship_realtime_location(self) -> List[Dict[str, Any]]:
        """
        Get real-time ship locations
        API #4: 선박 실시간 위치
        """
        try:
            response = self._make_request("/ship/devices/realtime")
            return response.get('data', [])
        except Exception as e:
            logger.error(f"Failed to get real-time ship locations: {e}")
            return []

    def get_weather_data(self, date: str) -> Dict[str, Any]:
        """
        Get weather data for specific date
        API #5: 주요 기상 데이터

        Args:
            date: Date in YYYYMMDD format (e.g., '20250102')
        """
        try:
            response = self._make_request("/ship-safe/stats/history", params={'date': date})
            return response.get('data', {})
        except Exception as e:
            logger.error(f"Failed to get weather data: {e}")
            return {}

    def get_ship_density(self, start_date: str, start_time: str) -> Dict[str, Any]:
        """
        Get ship density data
        API #6: 선박 밀집도

        Args:
            start_date: Date in YYYYMMDD format (e.g., '20250427')
            start_time: Time in HHMM format (e.g., '1407')
        """
        try:
            response = self._make_request("/ship-safe/traffic", params={
                'startDate': start_date,
                'startTime': start_time
            })
            return response.get('data', {})
        except Exception as e:
            logger.error(f"Failed to get ship density: {e}")
            return {}

# Test functions for verification
if __name__ == "__main__":
    client = EUMAPIClient()

    # Test getting ship list
    print("Testing Ship List API...")
    ships = client.get_ship_list()
    if ships:
        print(f"Found {len(ships)} ships")
        print(f"Sample ship: {ships[0] if ships else 'No ships'}")

    # Test getting CCTV devices
    print("\nTesting CCTV API...")
    cctvs = client.get_cctv_devices()
    if cctvs:
        print(f"Found {len(cctvs)} CCTV devices")

    # Test getting real-time locations
    print("\nTesting Real-time Location API...")
    locations = client.get_ship_realtime_location()
    if locations:
        print(f"Found {len(locations)} real-time locations")