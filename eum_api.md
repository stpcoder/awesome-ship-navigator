# Pohang EUM API Documentation

## API Key
- Encoded: `%2BkNoxE5m1WHdEzXn5s%2BBVVEziOunPu%2FjuZUZccdB6bs%3D`
- Decoded: `+kNoxE5m1WHdEzXn5s+BVVEziOunPu/juZUZccdB6bs=`

---

## 1. 선박 등록 리스트

### 설명
구룡포항에 등록된 선박의 정보 목록을 조회할 수 있습니다.

### 엔드포인트
- **URL**: `https://dpg-apis.pohang-eum.co.kr/ship/devices`
- **Method**: `GET`
- **Parameters**:
  - `serviceKey`: API Key (decoded 형태 사용)

### Response Format
```json
{
  "id": "1",
  "status": "success",
  "data": [
    {
      "id": 1,
      "shipId": "0123456-1000001",
      "type": "근해자망어업",
      "name": "EUM001",
      "pol": "포항시 구룡포읍",
      "polAddr": "경상북도 포항시 남구 구룡포읍",
      "hm": "FRP",
      "pe": "선박용디젤",
      "ps": 720.0,
      "kw": 529.2,
      "engineCnt": 1,
      "propeller": "나선일체식",
      "propellerCnt": 1,
      "length": 25.05,
      "breath": 5.57,
      "depth": 2.0,
      "gt": 43.0,
      "sign": "0123456-1000001 근해자망어업(43톤)",
      "rgDtm": "2020-10-23T03:07:59.000+00:00",
      "dcDate": "2020-10-23T00:00:00.000+00:00"
    }
  ]
}
```

---

## 2. CCTV 정보

### 설명
구룡포 내 설치된 AI CCTV, 회전형 CCTV 장비 정보 목록을 조회할 수 있습니다.

### 엔드포인트
- **URL**: `https://dpg-apis.pohang-eum.co.kr/cctv/devices`
- **Method**: `GET`
- **Parameters**:
  - `serviceKey`: API Key (decoded 형태)

### Response Format
```json
{
  "id": "1",
  "status": "success",
  "data": [
    {
      "id": 1,
      "name": "구룡포 북방파제 AI-01-001",
      "latitude": "35.985667",
      "longitude": "129.557917",
      "address": "포항시 남구 구룡포읍 구룡포리 954-3"
    }
  ]
}
```

---

## 3. LiDAR 정보

### 설명
구룡포항에 설치된 LiDAR 장비 정보 목록을 조회할 수 있습니다.

### 엔드포인트
- **URL**: `https://dpg-apis.pohang-eum.co.kr/lidar/devices`
- **Method**: `GET`
- **Parameters**:
  - `serviceKey`: API Key (decoded 형태)

### Response Format
```json
{
  "id": "1",
  "status": "success",
  "data": [
    {
      "id": 1,
      "name": "구룡포 북방파제",
      "latitude": "35.985667",
      "longitude": "129.557917",
      "address": "포항시 남구 구룡포읍 구룡포리 954-3"
    }
  ]
}
```

---

## 4. 선박 실시간 위치

### 설명
구룡포항에 등록된 선박의 실시간 위치(위·경도), 방위, 침로, 속도 데이터를 조회할 수 있습니다.

### 엔드포인트
- **URL**: `https://dpg-apis.pohang-eum.co.kr/ship/devices/realtime`
- **Method**: `GET`
- **Parameters**:
  - `serviceKey`: API Key (decoded 형태)

### Response Format
```json
{
  "id": "1",
  "status": "success",
  "data": [
    {
      "logDateTime": "2025-04-27 14:07:38",
      "devId": 1,
      "rcvDateTime": "2025-04-27 14:07:38",
      "lati": 35.9663,
      "longi": 129.66937,
      "azimuth": 51.0,
      "course": 180.0,
      "speed": 9.01
    }
  ]
}
```

### Field Description
- `devId`: 선박 디바이스 ID
- `lati`: 위도
- `longi`: 경도
- `azimuth`: 방위각 (도)
- `course`: 침로 (도)
- `speed`: 속도 (knots)

---

## 5. 주요 기상 데이터

### 설명
사용자가 지정한 당일 기준으로 전일, 당일의 기온, 풍속, 풍향 등 주요 기상 요소에 대한 과거 데이터를 제공합니다.

### 엔드포인트
- **URL**: `https://dpg-apis.pohang-eum.co.kr/ship-safe/stats/history`
- **Method**: `GET`
- **Parameters**:
  - `serviceKey`: API Key (decoded 형태)
  - `date`: 조회 날짜 (형식: YYYYMMDD, 예: 20250102)

### Response Format
```json
{
  "id": "1",
  "status": "success",
  "data": {
    "top": {
      "temperature": 15.2,
      "windSpeed": 3.5,
      "windDirection": 270,
      "humidity": 65
    }
  }
}
```

---

## 6. 선박 밀집도

### 설명
사용자가 지정한 당일 기준으로 특정 해역 내 선박 밀집도를 분석하고, 격자 단위로 나누어 데이터를 제공합니다.

### 엔드포인트
- **URL**: `https://dpg-apis.pohang-eum.co.kr/ship-safe/traffic`
- **Method**: `GET`
- **Parameters**:
  - `serviceKey`: API Key (decoded 형태)
  - `startDate`: 시작 날짜 (형식: YYYYMMDD, 예: 20250427)
  - `startTime`: 시작 시간 (형식: HHMM, 예: 1407)

### Response Format
```json
{
  "id": "1",
  "status": "success",
  "data": {
    "gridDensity": [
      {
        "gridId": "G001",
        "latitude": 35.98,
        "longitude": 129.56,
        "shipCount": 5,
        "densityLevel": "medium"
      }
    ]
  }
}
```

### Notes
- 날짜 유효성 확인 필요 (과거 날짜는 오류 발생)
- 실시간 또는 최근 날짜 사용 권장
