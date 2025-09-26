"""Weather service using OpenWeather API"""

import os
import httpx
from typing import Dict, Any, Optional
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class WeatherService:
    def __init__(self):
        self.api_key = os.getenv('OPENWEATHER_API_KEY')
        self.base_url = "https://api.openweathermap.org/data/2.5"

        # 구룡포항 좌표 (Guryongpo Port)
        self.guryongpo_lat = 35.99
        self.guryongpo_lon = 129.57

    async def get_current_weather(self) -> Dict[str, Any]:
        """Get current weather for Guryongpo Port"""
        if not self.api_key:
            return {
                "error": "Weather API key not configured",
                "message": "날씨 정보를 가져올 수 없습니다."
            }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/weather",
                    params={
                        "lat": self.guryongpo_lat,
                        "lon": self.guryongpo_lon,
                        "appid": self.api_key,
                        "units": "metric",  # Celsius
                        "lang": "kr"  # Korean language
                    }
                )

                if response.status_code == 200:
                    data = response.json()

                    # Parse weather data
                    weather_info = {
                        "location": "구룡포항",
                        "temperature": data["main"]["temp"],
                        "feels_like": data["main"]["feels_like"],
                        "humidity": data["main"]["humidity"],
                        "pressure": data["main"]["pressure"],
                        "description": data["weather"][0]["description"],
                        "wind_speed": data["wind"]["speed"],
                        "wind_direction": data["wind"].get("deg", 0),
                        "clouds": data["clouds"]["all"],
                        "visibility": data.get("visibility", 10000) / 1000,  # Convert to km
                        "timestamp": datetime.now().isoformat()
                    }

                    # Add rain data if available
                    if "rain" in data:
                        weather_info["rain_1h"] = data["rain"].get("1h", 0)

                    # Add sea level pressure if available
                    if "sea_level" in data["main"]:
                        weather_info["sea_level"] = data["main"]["sea_level"]

                    return weather_info

                elif response.status_code == 401:
                    return {
                        "error": "Invalid API key",
                        "message": "날씨 API 키가 유효하지 않습니다."
                    }
                else:
                    return {
                        "error": f"API error: {response.status_code}",
                        "message": "날씨 정보를 가져오는데 실패했습니다."
                    }

        except Exception as e:
            return {
                "error": str(e),
                "message": "날씨 정보 조회 중 오류가 발생했습니다."
            }

    async def get_weather_forecast(self, hours: int = 24) -> Dict[str, Any]:
        """Get weather forecast for next N hours"""
        if not self.api_key:
            return {
                "error": "Weather API key not configured",
                "message": "날씨 예보를 가져올 수 없습니다."
            }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/forecast",
                    params={
                        "lat": self.guryongpo_lat,
                        "lon": self.guryongpo_lon,
                        "appid": self.api_key,
                        "units": "metric",
                        "lang": "kr",
                        "cnt": hours // 3  # API returns 3-hour intervals
                    }
                )

                if response.status_code == 200:
                    data = response.json()

                    forecast_list = []
                    for item in data["list"]:
                        forecast_list.append({
                            "time": item["dt_txt"],
                            "temperature": item["main"]["temp"],
                            "description": item["weather"][0]["description"],
                            "wind_speed": item["wind"]["speed"],
                            "rain_prob": item.get("pop", 0) * 100,  # Probability of precipitation
                            "rain_3h": item.get("rain", {}).get("3h", 0)
                        })

                    return {
                        "location": "구룡포항",
                        "forecast": forecast_list
                    }
                else:
                    return {
                        "error": f"API error: {response.status_code}",
                        "message": "날씨 예보를 가져오는데 실패했습니다."
                    }

        except Exception as e:
            return {
                "error": str(e),
                "message": "날씨 예보 조회 중 오류가 발생했습니다."
            }

    def format_weather_message(self, weather_data: Dict[str, Any]) -> str:
        """Format weather data into a readable message"""
        if "error" in weather_data:
            return weather_data["message"]

        message = f"""
        🌤️ 구룡포항 현재 날씨

        🌡️ 온도: {weather_data['temperature']:.1f}°C (체감: {weather_data['feels_like']:.1f}°C)
        💨 바람: {weather_data['wind_speed']:.1f} m/s
        💧 습도: {weather_data['humidity']}%
        ☁️ 구름: {weather_data['clouds']}%
        👁️ 가시거리: {weather_data['visibility']:.1f} km
        📝 상태: {weather_data['description']}
        """

        if "rain_1h" in weather_data:
            message += f"\n🌧️ 강수량(1시간): {weather_data['rain_1h']}mm"

        if weather_data['wind_speed'] > 10:
            message += "\n⚠️ 강풍 주의: 출항 시 주의하세요!"

        if weather_data['visibility'] < 1:
            message += "\n⚠️ 시야 불량: 안전 운항에 주의하세요!"

        return message