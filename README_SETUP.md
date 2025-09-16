# 선박 항로 최적화 시스템 - 설치 및 실행 가이드

## 시스템 요구사항
- Python 3.9+
- Node.js 16+
- npm 또는 yarn

## 1. Backend 설정

### 1.1 Python 가상환경 생성 및 활성화
```bash
# 가상환경 생성
python3 -m venv venv

# 가상환경 활성화 (Mac/Linux)
source venv/bin/activate

# 가상환경 활성화 (Windows)
venv\Scripts\activate
```

### 1.2 필수 Python 라이브러리 설치
```bash
# requirements.txt 설치
pip install -r requirements.txt

# 또는 개별 설치
pip install fastapi uvicorn sqlalchemy
pip install httpx pydantic python-dotenv
pip install numpy shapely geojson pyyaml
pip install aiofiles python-multipart
```

### 1.3 데이터베이스 초기화
```bash
# SQLite 데이터베이스 자동 생성됨
# ship_routes.db 파일이 자동으로 생성됩니다
```

### 1.4 Backend 서버 실행
```bash
# FastAPI 서버 실행
python app.py

# 또는
uvicorn app:app --reload --port 8000

# 서버가 http://localhost:8000 에서 실행됩니다
# API 문서: http://localhost:8000/docs
```

## 2. Frontend 설정

### 2.1 Node.js 패키지 설치
```bash
# frontend 디렉토리로 이동
cd frontend

# 패키지 설치
npm install

# 또는 yarn 사용
yarn install
```

### 2.2 Frontend 개발 서버 실행
```bash
# React 개발 서버 실행
npm start

# 또는 yarn 사용
yarn start

# 브라우저가 자동으로 http://localhost:3000 열립니다
```

## 3. 전체 시스템 실행 순서

### 3.1 터미널 1 - Backend
```bash
# 프로젝트 루트 디렉토리에서
source venv/bin/activate  # 가상환경 활성화
python app.py              # 백엔드 서버 실행
```

### 3.2 터미널 2 - Frontend
```bash
# 프로젝트 루트 디렉토리에서
cd frontend
npm start                  # 프론트엔드 서버 실행
```

## 4. 주요 기능

### 4.1 선박 경로 계획
- **수용 O (Flexible Mode)**: 시스템이 최적 출발 시간 추천
- **수용 X (Fixed Mode)**: 사용자가 지정한 시간에 출발

### 4.2 실시간 모니터링
- EUM API 연동으로 실시간 선박 위치 확인
- CCTV 및 LiDAR 센서 정보 표시
- 날씨 정보 실시간 업데이트

### 4.3 음성 챗봇
- Web Speech API 기반 한국어 음성 인식
- 선박 상태, 날씨, 경로 계획 문의 가능
- 음성 입력 → 텍스트 변환 → AI 응답

## 5. 환경 변수 설정 (선택사항)

`.env` 파일 생성:
```env
# EUM API 설정
EUM_API_KEY=+kNoxE5m1WHdEzXn5s+BVVEziOunPu/juZUZccdB6bs=
EUM_API_BASE_URL=https://dpg-apis.pohang-eum.co.kr

# 데이터베이스 설정
DATABASE_URL=sqlite:///./ship_routes.db
```

## 6. 문제 해결

### 6.1 포트 충돌
```bash
# 8000번 포트 사용 중인 프로세스 확인
lsof -i :8000

# 프로세스 종료
kill -9 [PID]
```

### 6.2 음성 인식 안됨
- Chrome 브라우저 사용 권장
- 마이크 권한 허용 필요
- HTTPS 환경에서만 작동 (localhost는 예외)

### 6.3 CORS 에러
- Backend의 CORS 설정 확인
- `app.py`에서 `allow_origins=["*"]` 설정됨

## 7. 디렉토리 구조
```
awesome-ship-navigator/
├── app.py                  # FastAPI 메인 서버
├── requirements.txt        # Python 의존성
├── ship_routes.db         # SQLite 데이터베이스
├── models.py              # SQLAlchemy 모델
├── database.py            # DB 연결 설정
├── eum_api_client.py      # EUM API 클라이언트
├── collision_avoidance_v4_fixed_mode.py  # 충돌 회피 알고리즘
├── frontend/
│   ├── package.json       # Node.js 의존성
│   ├── src/
│   │   ├── App.js        # React 메인 컴포넌트
│   │   ├── components/
│   │   │   ├── MapView.js       # 지도 시각화
│   │   │   ├── ChatBot.js       # 음성 챗봇
│   │   │   ├── RoutePlanner.js  # 경로 계획
│   │   │   └── ...
│   │   └── data/
│   │       └── obstacles.json   # 장애물 데이터
│   └── public/
│       └── nn.png         # 배경 지도 이미지
└── README.md              # 프로젝트 설명
```

## 8. 개발 도구

### API 문서
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 디버깅
```bash
# FastAPI 로그 확인
uvicorn app:app --reload --log-level debug

# React 개발자 도구
Chrome DevTools (F12)
```

## 9. 배포 준비

### Production 빌드
```bash
# Frontend 빌드
cd frontend
npm run build

# Backend 프로덕션 실행
uvicorn app:app --host 0.0.0.0 --port 8000 --workers 4
```

## 10. 라이선스 및 문의
- 포항 구룡포항 스마트 항만 시스템
- EUM API 제공: 포항시