# 📸 스크린샷 가이드

이 폴더는 프로젝트 스크린샷을 저장하는 곳입니다.

## 📂 폴더 구조

```
screenshots/
├── desktop/          # 데스크톱 화면 캡처
│   ├── dashboard-main.png
│   ├── simulation-running.png
│   ├── chatbot-interface.png
│   ├── route-planning.png
│   └── sensor-data.png
│
└── mobile/           # 모바일 화면 캡처
    ├── dashboard-mobile.png
    ├── chatbot-mobile.png
    └── map-mobile.png
```

## 📋 캡처 순서 및 방법

### 1️⃣ 데스크톱 스크린샷 (5개)

#### 1. `dashboard-main.png`
- **화면**: 메인 대시보드 전체 화면
- **내용**:
  - 실시간 지도에 선박 마커 표시
  - 좌측 선박 정보 패널
  - 우측 센서 정보
- **해상도**: 1920x1080 권장
- **캡처 방법**:
  1. 브라우저에서 `http://localhost:3000` 접속
  2. Live/Demo 모드 선택
  3. 전체 화면 캡처

#### 2. `simulation-running.png`
- **화면**: 시뮬레이션 실행 중
- **내용**:
  - 선박이 경로를 따라 움직이는 모습
  - 시뮬레이션 컨트롤 패널 (재생 중 상태)
  - 시간 표시
- **캡처 방법**:
  1. 시뮬레이션 "재생" 버튼 클릭
  2. 선박이 움직이는 순간 캡처

#### 3. `chatbot-interface.png`
- **화면**: AI 챗봇 인터페이스
- **내용**:
  - 채팅 대화 내역
  - 음성 인식 버튼
  - 기능 모달 중 하나 열린 상태
- **캡처 방법**:
  1. 상단 "AI Assistant" 클릭
  2. 음성 명령 또는 텍스트 입력
  3. 대화 내역이 있는 상태로 캡처

#### 4. `route-planning.png`
- **화면**: 경로 계획 화면
- **내용**:
  - 출발지/목적지 선택된 상태
  - 계산된 경로 라인 표시
  - 경로 계획 패널
- **캡처 방법**:
  1. 경로 계획 패널에서 시작/도착 지점 설정
  2. 경로 생성 후 화면 캡처

#### 5. `sensor-data.png`
- **화면**: 센서 데이터 모니터링
- **내용**:
  - CCTV 영상 표시
  - LiDAR 통계
  - 밀도 히트맵
- **캡처 방법**:
  1. CCTV 마커 클릭하여 영상 표시
  2. 히트맵 활성화
  3. 센서 데이터 표시 중인 화면 캡처

---

### 2️⃣ 모바일 스크린샷 (3개)

#### 6. `dashboard-mobile.png`
- **화면**: 모바일 대시보드
- **내용**: 반응형 레이아웃으로 최적화된 화면
- **해상도**: 375x812 (iPhone X) 또는 360x800 (Android)
- **캡처 방법**:
  1. 브라우저 개발자 도구 (F12)
  2. 모바일 뷰 전환 (Device Toolbar)
  3. iPhone X 또는 Galaxy S20 선택
  4. 화면 캡처

#### 7. `chatbot-mobile.png`
- **화면**: 모바일 챗봇 화면
- **내용**: 터치 최적화된 채팅 인터페이스
- **캡처 방법**:
  1. 모바일 뷰에서 AI Assistant 페이지
  2. 대화 내역 표시
  3. 화면 캡처

#### 8. `map-mobile.png`
- **화면**: 모바일 지도 화면
- **내용**: 터치 제스처로 조작 가능한 지도
- **캡처 방법**:
  1. 모바일 뷰에서 지도 화면
  2. 선박 마커 표시
  3. 화면 캡처

---

## 🖼️ 이미지 최적화

캡처 후 이미지를 최적화하면 로딩 속도가 빠릅니다:

```bash
# PNG 최적화 (옵션)
# macOS: brew install pngquant
# Ubuntu: sudo apt install pngquant

pngquant --quality=65-80 screenshots/desktop/*.png
pngquant --quality=65-80 screenshots/mobile/*.png
```

## 📤 Git에 추가하기

```bash
# 스크린샷 추가
git add screenshots/

# 커밋
git commit -m "docs: add project screenshots"

# 푸시
git push
```

---

## ✅ 체크리스트

- [ ] 데스크톱 - 메인 대시보드
- [ ] 데스크톱 - 시뮬레이션 실행
- [ ] 데스크톱 - AI 챗봇
- [ ] 데스크톱 - 경로 계획
- [ ] 데스크톱 - 센서 데이터
- [ ] 모바일 - 대시보드
- [ ] 모바일 - 챗봇
- [ ] 모바일 - 지도

모든 스크린샷을 캡처했으면 README.md에서 제대로 표시되는지 확인하세요!
