# Ship Navigator 배포 정보

## 서버 정보

**Server IP**: 158.179.161.144
**SSH User**: ubuntu
**SSH Key**: `ssh-key.key` (프로젝트 루트)

## 배포된 사이트 URL

- **포트폴리오 허브**: http://158.179.161.144/
- **Ship Navigator**: http://158.179.161.144/ship-navigator
- **API**: http://158.179.161.144/api/eum/ships

## 서버 디렉토리 구조

```
/var/www/
├── html/
│   └── index.html              # 포트폴리오 허브
└── projects/
    └── ship-navigator/
        ├── app.py              # FastAPI 백엔드
        ├── ship_routes.db      # 데이터베이스
        ├── .env                # API 키들
        ├── requirements.txt
        └── frontend/
            └── build/          # React 프로덕션 빌드
```

## API 키 (서버 .env 파일)

⚠️ **보안상의 이유로 API 키는 서버의 `.env` 파일에만 저장됩니다.**

필요한 환경변수:
- `OPENAI_API_KEY`
- `OPENWEATHER_API_KEY`
- `ELEVENLABS_API_KEY`

서버에서 확인: `ssh -i ssh-key.key ubuntu@158.179.161.144 "cat /var/www/projects/ship-navigator/.env"`

## 서버 접속 방법

```bash
ssh -i ssh-key.key ubuntu@158.179.161.144
```

## 배포 프로세스

### 1. 로컬에서 빌드 및 푸시
```bash
cd frontend
npm run build
cd ..
git add .
git commit -m "update"
git push origin main
```

### 2. 서버에 배포
```bash
ssh -i ssh-key.key ubuntu@158.179.161.144
cd /var/www/projects/ship-navigator
git pull origin main
```

### 3. 백엔드 재시작 (필요시)
```bash
pkill -9 -f uvicorn
cd /var/www/projects/ship-navigator
nohup /home/ubuntu/.local/bin/uvicorn app:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
```

### 4. Nginx 재시작 (필요시)
```bash
sudo systemctl reload nginx
```

## 데이터베이스 업데이트

로컬 DB를 서버에 업로드:
```bash
scp -i ssh-key.key ship_routes.db ubuntu@158.179.161.144:/tmp/
ssh -i ssh-key.key ubuntu@158.179.161.144 "mv /tmp/ship_routes.db /var/www/projects/ship-navigator/ship_routes.db"
# 백엔드 재시작 필요
```

## Nginx 설정 파일 위치

`/etc/nginx/sites-available/default`

## 백엔드 로그 확인

```bash
ssh -i ssh-key.key ubuntu@158.179.161.144
cd /var/www/projects/ship-navigator
tail -f backend.log
```

## 백엔드 프로세스 확인

```bash
ssh -i ssh-key.key ubuntu@158.179.161.144 "ps aux | grep uvicorn"
```

## 중요 사항

⚠️ **GitHub에 포함되지 않은 파일들**:
- `ship_routes.db` - 데이터베이스 (수동 업로드 필요)
- `ssh-key.key` / `ssh-key.key.pub` - SSH 키 (보안)
- `.env` - API 키들 (보안)

이 파일들은 `.gitignore`에 추가되어야 합니다.

## 환경변수 설정 (프론트엔드)

- **Production**: `API_BASE = ''` (엔드포인트에 `/api` 포함)
- **Development**: `API_BASE = 'http://localhost:8000'`

자동 감지: `process.env.NODE_ENV`
