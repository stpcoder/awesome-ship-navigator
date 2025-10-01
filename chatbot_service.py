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

        # Define system prompt (aligned to FE function keys)
        self.system_prompt = """
        당신은 선박 항로 관제 시스템의 AI 어시스턴트입니다.
        사용자의 요청을 분석하여 적절한 기능을 JSON 형식으로 반환하세요.

        특별히 출항/입항 관련 요청에 주의하세요:
        - "출항": 정박지 → 어장 (departure)
        - "입항": 어장 → 정박지 (arrival)

        출항/입항 요청 분석시:
        1. 방향 파악: 출항(departure) 또는 입항(arrival)
        2. 시간 파악: 구체적 시간이 언급되었는지 (예: "30분 후", "2시간 뒤", "지금")
        3. 시간 형식 변환:
           - "지금" → "now"
           - "30분 후" → "30m"
           - "1시간 후" → "1h"
           - "2시간 30분 후" → "2h30m"

        반드시 유효한 JSON 형식으로만 응답하세요. 다음 키를 포함해야 합니다:
        - function: 아래 기능 목록 중 하나
        - message: 사용자에게 보여줄 간단한 안내 메시지
        - parameters: 기능 실행에 필요한 매개변수 객체

        기능 목록 (FE와 일치하는 9개):
        1. "recommend_departure" - 출항/입항 경로 계획
        2. "show_weather" - 날씨 정보 확인
        3. "send_sos" - 긴급 상황 신고
        4. "set_fishing_area" - 어장 위치 설정
        5. "set_docking_position" - 정박 위치 설정
        6. "receive_messages" - 수신 메시지 확인
        7. "send_message" - 메시지 전송
        8. "list_features" - 사용 안내(기능 목록)
        9. "show_route" - 저장된 경로 표시
        10. "unknown" - 이해하지 못한 요청

        SOS 요청 인식 지침:
        - "도와줘", "큰일났어", "긴급", "위험", "구조", "살려줘", "전복", "침몰", "넘어질 것 같아", "capsize" 등은 SOS로 인식
        - parameters 요구사항:
          - emergency_type: collision | fire | engine | medical | other
          - message: 사용자의 원문을 요약한 1문장
          - priority: high (기본값)
        - 예시: {"function": "send_sos", "message": "긴급 신호를 전송하겠습니다.", "parameters": {"emergency_type": "engine", "message": "엔진 이상이 의심됩니다.", "priority": "high"}}

        출항/입항 응답 형식 예시:
        {
            "function": "recommend_departure",
            "message": "30분 후 출항 경로를 계획하겠습니다.",
            "parameters": {
                "type": "departure|arrival",
                "preferred_time": "now|30m|1h|2h30m",
                "need_clarification": false
            }
        }

        예시:
        - "30분 후에 출항하려고 해" → {"function": "recommend_departure", "message": "30분 후 출항 경로를 계획하겠습니다.", "parameters": {"type": "departure", "preferred_time": "30m", "need_clarification": false}}
        - "지금 입항할래" → {"function": "recommend_departure", "message": "지금 바로 입항 경로를 계획하겠습니다.", "parameters": {"type": "arrival", "preferred_time": "now", "need_clarification": false}}
        - "날씨 어때?" → {"function": "show_weather", "message": "현재 날씨 정보를 확인하겠습니다.", "parameters": {}}
        - "도와줘! 선박이 넘어질 것 같아" → {"function": "send_sos", "message": "긴급 신호를 전송하겠습니다.", "parameters": {"priority": "high"}}
        - "메시지 전송해줘 '지금 입항합니다'" → {"function": "send_message", "message": "메시지를 전송합니다.", "parameters": {"recipient": "control_center", "message": "지금 입항합니다"}}
        - "기능 보여줘" → {"function": "list_features", "message": "사용 가능한 기능 목록입니다.", "parameters": {}}
        - "경로 표시" → {"function": "show_route", "message": "경로를 표시합니다.", "parameters": {}}
        """

    def process_text(self, message: str) -> Dict[str, Any]:
        """Process text input with GPT"""
        if not self.client:
            print("OpenAI client not initialized - using fallback")
            return self._fallback_detection(message)

        try:
            # Call GPT API
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",  # Using available model
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": message}
                ],
                temperature=0.3,
                max_tokens=200,
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

        # Parse time from message
        def extract_time(msg: str) -> str:
            if "지금" in msg or "바로" in msg:
                return "now"
            elif "30분" in msg:
                return "30m"
            elif "1시간" in msg or "한시간" in msg:
                if "30분" in msg:
                    return "1h30m"
                return "1h"
            elif "2시간" in msg or "두시간" in msg:
                if "30분" in msg:
                    return "2h30m"
                return "2h"
            elif "분" in msg:
                # Extract number before 분
                import re
                match = re.search(r'(\d+)\s*분', msg)
                if match:
                    return f"{match.group(1)}m"
            return "30m"  # Default

        # Main function mapping
        if any(word in message_lower for word in ["출항", "출발"]):
            time = extract_time(message_lower)
            return {
                "function": "recommend_departure",
                "message": f"{time.replace('h', '시간 ').replace('m', '분')} 후 출항 경로를 계획하겠습니다." if time != "now" else "지금 바로 출항 경로를 계획하겠습니다.",
                "parameters": {
                    "type": "departure",
                    "preferred_time": time,
                    "need_clarification": False
                }
            }
        elif any(word in message_lower for word in ["입항", "들어", "귀항"]):
            time = extract_time(message_lower)
            return {
                "function": "recommend_departure",
                "message": f"{time.replace('h', '시간 ').replace('m', '분')} 후 입항 경로를 계획하겠습니다." if time != "now" else "지금 바로 입항 경로를 계획하겠습니다.",
                "parameters": {
                    "type": "arrival",
                    "preferred_time": time,
                    "need_clarification": False
                }
            }
        elif any(word in message_lower for word in ["날씨", "기상", "바람", "파도", "비"]):
            return {
                "function": "show_weather",
                "message": "현재 날씨 정보를 확인하겠습니다.",
                "parameters": {}
            }
        elif any(word in message_lower for word in ["어장", "조업", "어획"]):
            return {
                "function": "set_fishing_area",
                "message": "어장 위치를 지도에서 선택해주세요.",
                "parameters": {}
            }
        elif any(word in message_lower for word in [
            "sos", "긴급", "위급", "위험", "도움", "도와줘", "살려줘",
            "구조", "큰일", "전복", "침몰", "넘어지", "capsize", "capsizing"
        ]):
            # Infer emergency type and a concise message
            emergency_type = "other"
            if any(k in message_lower for k in ["엔진", "engine"]):
                emergency_type = "engine"
            elif any(k in message_lower for k in ["화재", "불", "fire"]):
                emergency_type = "fire"
            elif any(k in message_lower for k in ["충돌", "collis"]):
                emergency_type = "collision"
            elif any(k in message_lower for k in ["의료", "다친", "응급", "medical"]):
                emergency_type = "medical"

            concise = message.strip()
            if len(concise) > 80:
                concise = concise[:77] + "..."

            return {
                "function": "send_sos",
                "message": "긴급 신호를 전송합니다! 관제센터에 연결하겠습니다.",
                "parameters": {"priority": "high", "emergency_type": emergency_type, "message": concise}
            }
        elif any(word in message_lower for word in ["수신 메시지", "받은 메시지", "메시지 확인", "메시지 읽기"]):
            return {
                "function": "receive_messages",
                "message": "수신된 메시지를 확인합니다.",
                "parameters": {}
            }
        elif any(word in message_lower for word in ["메시지 전송", "메시지 보내", "관제센터에 전달", "관제센터한테", "메세지 전송", "메세지 보내"]):
            # Extract message if provided inline
            import re
            match = re.search(r'["\'"](.+)["\'"]', message)
            msg_content = match.group(1) if match else None

            return {
                "function": "send_message",
                "message": "메시지를 전송합니다.",
                "parameters": {"recipient": "control_center", "message": msg_content} if msg_content else {"recipient": "control_center"}
            }
        elif any(word in message_lower for word in ["기능", "도움", "help", "명령", "사용법", "목록"]):
            return {
                "function": "list_features",
                "message": self._get_features_list(),
                "parameters": {}
            }
        elif any(word in message_lower for word in ["경로 표시", "경로 보여", "route", "show route"]):
            return {
                "function": "show_route",
                "message": "경로를 표시합니다.",
                "parameters": {}
            }
        else:
            return {
                "function": "unknown",
                "message": "죄송합니다. 이해하지 못했습니다. 출항/입항 시간, 날씨, 도움말 등을 요청해주세요.",
                "parameters": {}
            }

    def _get_default_message(self, function: str) -> str:
        """Get default message for function"""
        messages = {
            "recommend_departure": "입출항 경로를 계획하겠습니다.",
            "show_weather": "날씨 정보를 확인하겠습니다.",
            "send_sos": "긴급 신호를 전송합니다!",
            "set_fishing_area": "어장 위치를 지도에서 선택해주세요.",
            "receive_messages": "수신된 메시지를 확인합니다.",
            "send_message": "메시지를 전송합니다.",
            "list_features": self._get_features_list(),
            "show_route": "경로를 표시합니다.",
            "unknown": "죄송합니다. 다시 말씀해 주시겠어요?"
        }
        return messages.get(function, "처리하겠습니다.")

    def _get_features_list(self) -> str:
        """Get features list message"""
        return """
        🚢 선박 항로 관제 시스템 사용 안내

        사용 가능한 명령어:

        ⚓ 출항/입항 계획
           - "30분 후에 출항하려고 해"
           - "지금 입항할래"
           - "1시간 후에 출항 예정이야"

        🌤️ 날씨 정보
           - "날씨 어때?"
           - "바람 상태 알려줘"

        🆘 긴급 상황
           - "SOS"
           - "도와줘", "큰일났어"

        💬 메시지
           - "수신 메시지 확인해줘"
           - "관제센터에 메시지 보내줘"

        📍 위치 설정
           - "어장 위치 지정"
           - "정박 위치 지정"

        🗺️ 경로 표시
           - "경로 표시해 줘"

        💡 사용법:
        - 말씀만 하시면 필요한 정보를 자동으로 채워 실행합니다.
        - 경로는 최적시간으로 자동 계산되어 저장되고 지도에 표시됩니다.
        """