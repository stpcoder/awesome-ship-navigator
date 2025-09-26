# 🚢 Ship Navigator - Quick Start Guide

## 🚀 빠른 시작 (한 번의 명령으로 실행)

```bash
# 프로젝트 전체 실행 (Backend + Frontend)
./start_all.sh
```

이 명령 하나로 모든 설정과 실행이 완료됩니다!
- Backend: http://localhost:8000
- Frontend: http://localhost:3000
- API Docs: http://localhost:8000/docs

## 📋 사전 요구사항

1. **Python 3.8+** 설치 확인
   ```bash
   python3 --version
   ```

2. **Node.js 14+** 설치 확인
   ```bash
   node --version
   npm --version
   ```

## 🛠️ 수동 설치 (문제 발생시)

### 1. Backend 설정
```bash
# 가상환경 생성 및 활성화
python3 -m venv venv
source venv/bin/activate  # Mac/Linux
# venv\Scripts\activate    # Windows

# 의존성 설치
pip install -r requirements.txt

# 데이터베이스 초기화
python init_all_data.py

# Backend 실행
python app.py
```

### 2. Frontend 설정
```bash
# Frontend 디렉토리로 이동
cd frontend

# 의존성 설치
npm install

# Frontend 실행
npm start
```

## 📁 실행 스크립트 설명

### `start_all.sh` - 전체 실행
- 포트 정리 (3000, 8000)
- Python 가상환경 자동 설정
- 의존성 자동 설치
- Backend와 Frontend 동시 실행
- Ctrl+C로 모든 서비스 종료

### `start_backend.sh` - Backend만 실행
- Python 가상환경 설정
- 의존성 설치
- 데이터베이스 초기화
- FastAPI 서버 실행 (포트 8000)

### `start_frontend.sh` - Frontend만 실행
- 포트 3000 정리
- npm 의존성 설치
- React 개발 서버 실행 (포트 3000)

## 🔧 문제 해결

### 포트 충돌 문제
```bash
# 포트 3000 사용 프로세스 확인
lsof -i :3000

# 포트 3000 프로세스 종료
lsof -ti:3000 | xargs kill -9
```

### Python 의존성 설치 실패
```bash
# scipy 설치 실패시 (M1 Mac 등)
# requirements.txt에서 scipy 라인을 주석 처리
# scipy==1.11.4  # 이렇게 주석 처리
```

### Frontend 실행 실패
```bash
# node_modules 삭제 후 재설치
cd frontend
rm -rf node_modules package-lock.json
npm install
npm start
```

## 📱 주요 기능

1. **선박 경로 최적화**: 최적의 입출항 경로 계산
2. **충돌 회피**: 다른 선박과의 충돌 자동 회피
3. **실시간 시각화**: 지도상에서 경로 실시간 확인
4. **GPT 챗봇**: 항해 관련 질문 답변

## 🎯 사용 방법

1. 브라우저에서 http://localhost:3000 접속
2. 지도에서 출발지와 도착지 선택
3. 출발 시간 설정 (선택사항)
4. "경로 계산" 버튼 클릭
5. 최적화된 경로 확인

## 📝 API 테스트

API 문서는 http://localhost:8000/docs 에서 확인 가능합니다.

## 🆘 지원

문제가 발생하면 다음을 확인하세요:
- Python 버전 (3.8 이상)
- Node.js 버전 (14 이상)
- 포트 3000, 8000이 비어있는지 확인
- 가상환경이 활성화되어 있는지 확인