"""Chatbot service with GPT integration"""

import os
import json
from typing import Dict, Any, Optional
from openai import OpenAI
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class ChatbotService:
    def __init__(self):
        # Initialize OpenAI client with environment variable
        self.api_key = os.getenv('OPENAI_API_KEY')
        if not self.api_key:
            print("WARNING: OPENAI_API_KEY not found in environment variables")
            print("Please set OPENAI_API_KEY in .env file")
        self.client = OpenAI(api_key=self.api_key) if self.api_key else None

        # Define system prompt
        self.system_prompt = """
        당신은 선박 항로 관제 시스템의 AI 어시스턴트입니다.
        사용자의 요청을 분석하여 아래 기능 중 하나를 JSON 형식으로 반환하세요.

        기능 목록:
        1. "recommend_departure" - 권장 입출항 시간 안내 (입항/출항 시간 관련 질문)
        2. "send_plan" - 입출항 계획 전송 (계획 전송/제출 관련)
        3. "show_route" - 최적 경로 표시 (경로/항로 표시 요청)
        4. "show_weather" - 날씨 및 경보 표시 (날씨/기상/경보 관련)
        5. "send_sos" - SOS 메시지 전송 (긴급/위험/도움 요청)
        6. "set_fishing_area" - 어장 위치 지정 (어장/투망 위치 설정)
        7. "list_features" - 기능 목록 안내 (기능 설명/도움말)
        8. "unknown" - 이해하지 못한 요청

        응답 형식:
        {
            "function": "기능명",
            "message": "사용자에게 보여줄 안내 메시지",
            "parameters": {
                // 필요한 추가 파라미터 (옵션)
            }
        }

        예시:
        - "언제 입항하는게 좋아?" → {"function": "recommend_departure", "message": "현재 항로 상황을 분석하여 최적의 입항 시간을 확인하겠습니다.", "parameters": {"type": "arrival"}}
        - "날씨 보여줘" → {"function": "show_weather", "message": "현재 구룡포항의 날씨 정보를 보여드리겠습니다.", "parameters": {}}
        - "긴급상황이야!" → {"function": "send_sos", "message": "긴급 신호를 전송합니다. 관제센터에 연결하겠습니다.", "parameters": {"priority": "high"}}

        중요: 반드시 유효한 JSON 형식으로만 응답하세요.
        """

    def process_text(self, message: str) -> Dict[str, Any]:
        """Process text input with GPT"""
        if not self.client:
            print("OpenAI client not initialized - using fallback")
            return self._fallback_detection(message)

        try:
            # Call GPT API (GPT-5-mini - latest model)
            response = self.client.chat.completions.create(
                model="gpt-5-mini",
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": message}
                ],
                # GPT-5-mini only supports default temperature (1)
                max_completion_tokens=200,  # GPT-5-mini uses max_completion_tokens instead of max_tokens
                response_format={"type": "json_object"}
            )

            # Parse response
            result = json.loads(response.choices[0].message.content)

            # Validate response structure
            if "function" not in result:
                result["function"] = "unknown"
            if "message" not in result:
                result["message"] = self._get_default_message(result.get("function", "unknown"))
            if "parameters" not in result:
                result["parameters"] = {}

            return result

        except Exception as e:
            print(f"GPT API Error: {e}")
            # Fallback to keyword-based detection
            return self._fallback_detection(message)

    def _fallback_detection(self, message: str) -> Dict[str, Any]:
        """Fallback keyword-based detection"""
        message_lower = message.lower()

        # Keyword mapping
        if any(word in message_lower for word in ["입항", "출항", "언제", "시간"]):
            return {
                "function": "recommend_departure",
                "message": "권장 입출항 시간을 확인하겠습니다.",
                "parameters": {"type": "auto"}
            }
        elif any(word in message_lower for word in ["계획", "전송", "보내", "제출"]):
            return {
                "function": "send_plan",
                "message": "입출항 계획을 전송하겠습니다.",
                "parameters": {}
            }
        elif any(word in message_lower for word in ["경로", "항로", "길", "코스"]):
            return {
                "function": "show_route",
                "message": "최적 경로를 지도에 표시하겠습니다.",
                "parameters": {}
            }
        elif any(word in message_lower for word in ["날씨", "기상", "바람", "파도", "경보"]):
            return {
                "function": "show_weather",
                "message": "현재 날씨 정보를 보여드리겠습니다.",
                "parameters": {}
            }
        elif any(word in message_lower for word in ["sos", "긴급", "위험", "도움", "구조", "큰일"]):
            return {
                "function": "send_sos",
                "message": "긴급 신호를 전송합니다! 관제센터에 연결하겠습니다.",
                "parameters": {"priority": "high"}
            }
        elif any(word in message_lower for word in ["어장", "그물", "투망", "낚시"]):
            return {
                "function": "set_fishing_area",
                "message": "어장 위치를 지정하시겠습니까? 지도에서 위치를 선택해주세요.",
                "parameters": {}
            }
        elif any(word in message_lower for word in ["기능", "도움", "설명", "뭐", "무엇"]):
            return {
                "function": "list_features",
                "message": self._get_features_list(),
                "parameters": {}
            }
        else:
            return {
                "function": "unknown",
                "message": "죄송합니다. 이해하지 못했습니다. 다시 말씀해 주시겠어요?",
                "parameters": {}
            }

    def _get_default_message(self, function: str) -> str:
        """Get default message for function"""
        messages = {
            "recommend_departure": "권장 입출항 시간을 확인하겠습니다.",
            "send_plan": "입출항 계획을 전송하겠습니다.",
            "show_route": "최적 경로를 표시하겠습니다.",
            "show_weather": "날씨 정보를 확인하겠습니다.",
            "send_sos": "긴급 신호를 전송합니다!",
            "set_fishing_area": "어장 위치를 지정해주세요.",
            "list_features": self._get_features_list(),
            "unknown": "죄송합니다. 다시 말씀해 주시겠어요?"
        }
        return messages.get(function, "처리하겠습니다.")

    def _get_features_list(self) -> str:
        """Get features list message"""
        return """
        사용 가능한 기능:

        📅 권장 입출항 시간 안내
        📤 입출항 계획 전송
        🗺️ 최적 경로 표시
        🌤️ 날씨 및 경보 확인
        🆘 긴급 메시지 전송
        🎣 어장 위치 지정

        원하시는 기능을 말씀해주세요!
        """