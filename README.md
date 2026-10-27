# Data Dashboard PoC v2.0

Ứng dụng dashboard trực quan hóa dữ liệu với React + FastAPI + PostgreSQL.

## 🚀 Tính năng

- **Authentication:** JWT-based với 3 roles (Admin, Analyst, Viewer)
- **Database Connectivity:** Kết nối PostgreSQL với URI mã hóa Fernet
- **SQL Lab:** Monaco Editor với autocomplete, chạy SQL read-only
- **Dataset:** Tạo từ table/SQL query, đặt friendly names cho cột
- **Chart Builder:** Bar/Line/Pie charts với aggregation (sum/avg/count/min/max)
- **Dashboard:** Drag-drop layout với react-grid-layout, filters, share/embed
- **Audit Logs:** Tracking user actions

## 📦 Tech Stack

### Backend
- FastAPI + SQLAlchemy 2.0
- PostgreSQL + Alembic migrations
- JWT (HS256) + Argon2 password hashing
- Fernet encryption cho connection URIs
- SQLGlot để validate SQL read-only

### Frontend
- React 19 + TypeScript + Vite
- React Router v7
- Monaco Editor (SQL autocomplete)
- Apache ECharts (charts)
- react-grid-layout (dashboard drag-drop)

## 🛠️ Cài đặt

### Prerequisites
- Docker Desktop
- Git

### Clone repository

```bash
git clone https://github.com/trananhtu2005/data-dashboard-poc.git
cd data-dashboard-poc
```

### Tạo file .env

```bash
# Copy .env.example và điền secrets
cp .env.example .env
```

Nội dung `.env`:

```env
# PostgreSQL metadata database
POSTGRES_DB=dashboard
POSTGRES_USER=dashboard
POSTGRES_PASSWORD=<your-secure-password>

# JWT secret (generate với: openssl rand -hex 32)
JWT_SECRET=<your-jwt-secret>

# Connection encryption key (generate với: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
CONNECTION_ENCRYPTION_KEY=<your-fernet-key>

# Admin account
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<your-admin-password>
```

### Start services

```bash
docker compose up -d
```

### Run migrations

```bash
docker compose exec backend alembic upgrade head
```

### Access application

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Default credentials

- Username: `admin`
- Password: giá trị `ADMIN_PASSWORD` trong `.env`

## 📁 Cấu trúc project

```
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI routes
│   │   ├── models.py         # SQLAlchemy models
│   │   ├── auth.py           # JWT authentication
│   │   ├── database.py       # Database connection
│   │   └── config.py         # Settings
│   ├── migrations/           # Alembic migrations
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/            # React pages
│   │   ├── App.tsx           # Main app + routing
│   │   ├── main.tsx          # Entry point
│   │   └── style.css         # Global styles
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env                      # Environment variables (gitignored)
├── .env.example              # Template
└── README.md
```

## 🔐 Roles & Permissions

| Feature | Viewer | Analyst | Admin |
|---------|--------|---------|-------|
| View dashboards/charts | ✅ | ✅ | ✅ |
| Create datasets/charts/dashboards | ❌ | ✅ | ✅ |
| Share dashboards | ❌ | ✅ | ✅ |
| Manage connections | ❌ | ✅ | ✅ |
| Manage users | ❌ | ❌ | ✅ |
| View audit logs | ❌ | ❌ | ✅ |

## 📊 Kết nối PostgreSQL nguồn

### Từ Docker container

**Host:** `host.docker.internal` (Windows/Mac) hoặc IP máy host

**Port:** `5432`

**Database:** tên database

**Username:** username

**Password:** password

### Security

- Connection URI được mã hóa Fernet trong database
- Source connections chạy với `default_transaction_read_only=on`
- SQL queries được validate chỉ cho phép SELECT
- Statement timeout để tránh queries chạy lâu

## 🎨 Features chi tiết

### SQL Lab
- Monaco Editor với syntax highlighting
- Autocomplete tables/columns từ schema
- Save queries
- "Save as Dataset" để tạo virtual dataset

### Dataset
- Tạo từ table hoặc SQL query
- Friendly names cho columns (không sửa source)
- Preview data
- Autocomplete gợi ý tables

### Chart Builder
- Aggregation: sum/avg/count/min/max
- Friendly names hiển thị trên axes/legend
- Preview real-time

### Dashboard
- Drag-drop resize layout (react-grid-layout)
- Layout persistence
- Dashboard-level filters theo dimension
- Share với optional password protection
- Embed URL với iframe code

## 🔧 Development

### Rebuild sau khi sửa code

```bash
# Backend
docker compose restart backend

# Frontend
docker compose restart frontend

# Hoặc rebuild toàn bộ
docker compose up -d --build
```

### View logs

```bash
docker compose logs backend -f
docker compose logs frontend -f
```

### Reset database

```bash
docker compose down -v
docker compose up -d
docker compose exec backend alembic upgrade head
```

## 📝 License

MIT

## 👤 Author

Tran Anh Tu
