# Ship Navigation Optimizer - Project Implementation Plan

## 프로젝트 개요
선박의 입출항 경로 최적화 시스템. 다른 선박들의 계획을 고려하여 충돌을 회피하면서 최적의 경로와 시간을 계산하는 시스템.

## 핵심 기능
1. **경로 계획 시스템**
   - 장애물 회피 경로 계산 (pyvisgraph)
   - 시간 기반 충돌 회피 스케줄링 (libMultiRobotPlanning)
   - 속도 조절을 통한 충돌 회피 (Python-RVO2)

2. **두 가지 운영 모드**
   - **수용 O (Flexible Mode)**: 시스템이 최적 출발 시간 추천
     - 고정: 출발지, 도착지
     - 변동: 경로, 속도, 출발시간
     - 목표: (대기시간 + 이동시간) 최소화

   - **수용 X (Fixed Mode)**: 입력된 시간에 출발
     - 고정: 출발지, 도착지, 출발시간
     - 변동: 경로, 속도
     - 목표: 속도 조절로 충돌 회피

3. **시각화 시스템**
   - 좌표 평면상 경로 표시
   - 실시간 선박 위치 애니메이션
   - 충돌 위험 구간 하이라이트

## 기술 스택
- **Backend**: Python, FastAPI
- **Path Planning**: pyvisgraph, libMultiRobotPlanning, Python-RVO2
- **Frontend**: React/Vue + Mapbox/Leaflet
- **Data Format**: GeoJSON, YAML

## 구현 단계

### Phase 1: 환경 설정 (Day 1)
1. **의존성 설치**
   ```bash
   # C++ 라이브러리 빌드
   - libMultiRobotPlanning 클론 및 빌드
   - cmake, make 도구 설치

   # Python 환경
   - 가상환경 생성
   - pyvisgraph, shapely, pyyaml, geojson 설치
   - Python-RVO2 빌드 및 설치 (선택사항)
   ```

2. **프로젝트 구조 생성**
   ```
   harbor-planner/
   ├── libMultiRobotPlanning/
   ├── Python-RVO2/
   ├── core/
   │   ├── geometry.py
   │   ├── roadmap_bridge.py
   │   └── rvo_refine.py
   ├── scenarios/
   │   ├── plan_flex.py
   │   └── plan_fixed.py
   ├── api/
   │   └── main.py
   └── frontend/
       └── (React/Vue app)
   ```

### Phase 2: 핵심 모듈 구현 (Day 2-3)
1. **geometry.py**
   - pyvisgraph를 이용한 가시 그래프 생성
   - 최단 경로 계산 (shortest_polyline)
   - 경로를 노드-엣지 그래프로 변환

2. **roadmap_bridge.py**
   - YAML 입출력 처리
   - libMultiRobotPlanning 실행 인터페이스
   - 스케줄 결과 파싱

3. **rvo_refine.py** (선택사항)
   - ORCA 알고리즘으로 속도 미세조정
   - 충돌 회피 시뮬레이션

### Phase 3: 시나리오 구현 (Day 4-5)
1. **plan_flex.py (수용 O)**
   - 출발 시간 유연성 있는 경로 계획
   - 대기시간 + 이동시간 최적화
   - 추천 출발 시간 계산

2. **plan_fixed.py (수용 X)**
   - 고정된 출발 시간 경로 계획
   - SIPP/CBS로 1차 시도
   - 실패시 RVO2로 속도 조정

### Phase 4: API 서버 구축 (Day 6)
1. **FastAPI 엔드포인트**
   ```python
   POST /api/plan/flexible
   POST /api/plan/fixed
   GET /api/obstacles
   GET /api/ships/current
   ```

2. **WebSocket 실시간 업데이트**
   - 선박 위치 실시간 전송
   - 충돌 경고 알림

### Phase 5: 프론트엔드 구현 (Day 7-8)
1. **지도 인터페이스**
   - Mapbox/Leaflet 통합
   - 시작점/종료점 선택 UI
   - 장애물 영역 표시

2. **경로 시각화**
   - GeoJSON LineString 렌더링
   - 시간별 애니메이션
   - 충돌 위험 구간 표시

3. **사용자 인터페이스**
   - 출발 시간 입력/선택
   - 모드 선택 (수용 O/X)
   - 결과 표시 패널

### Phase 6: 통합 및 테스트 (Day 9-10)
1. **통합 테스트**
   - 다중 선박 시나리오
   - 엣지 케이스 처리
   - 성능 최적화

2. **배포 준비**
   - Docker 컨테이너화
   - 환경 변수 설정
   - 문서화

## 주요 고려사항

### 성능 최적화
- 가시 그래프 캐싱
- 병렬 경로 계산
- 경로 단순화 알고리즘

### 안전성
- 충돌 버퍼 거리 (safety.radius)
- 시간 버퍼 (timeBuffer)
- 속도 제한 (speed_min/max)

### 확장성
- 다중 선박 동시 처리
- 실시간 재계획
- 동적 장애물 처리

## 예상 결과물
1. **백엔드 API 서버**
   - 경로 계획 엔드포인트
   - 실시간 업데이트 지원
   - 다중 선박 관리

2. **프론트엔드 애플리케이션**
   - 직관적인 지도 인터페이스
   - 실시간 시각화
   - 결과 분석 대시보드

3. **문서화**
   - API 문서
   - 사용자 가이드
   - 시스템 아키텍처 문서

## 다음 단계
1. 환경 설정 시작
2. 핵심 모듈 구현
3. 테스트 데이터 준비
4. 점진적 기능 구현 및 테스트