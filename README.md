# ⚡ GoalQuest – Goal Setting & Tracking Portal
**AtomQuest Hackathon 1.0 submission**

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────┐
│                     BROWSER                          │
│  React 18 + Vite  (port 5173)                        │
│  src/App.jsx  ←→  src/api.js  (fetch wrapper)        │
└─────────────────────┬────────────────────────────────┘
                      │ REST JSON  /api/*
┌─────────────────────▼────────────────────────────────┐
│              Node.js / Express  (port 4000)          │
│  routes/auth.js        – login, JWT                  │
│  routes/goals.js       – CRUD, approve, shared push  │
│  routes/achievements.js – quarterly check-in data    │
│  routes/checkins.js    – manager comments            │
│  routes/reports.js     – dashboard, CSV, audit       │
│  routes/users.js       – team listings               │
│  middleware/auth.js    – JWT verify + role guard     │
│  middleware/scoring.js – UoM score formulas          │
└─────────────────────┬────────────────────────────────┘
                      │ pg (node-postgres)
┌─────────────────────▼────────────────────────────────┐
│              PostgreSQL  (port 5432)                 │
│  users · cycles · goals · achievements               │
│  checkin_comments · audit_log                        │
└──────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start (Local)

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 1. Clone & install

```bash
git clone https://github.com/your-org/goalquest.git
cd goalquest

# Backend
cd backend
cp .env.example .env          # edit DATABASE_URL + JWT_SECRET
npm install

# Frontend
cd ../frontend
cp .env.example .env
npm install
```

### 2. Setup database

```bash
# Create the DB first
psql -U postgres -c "CREATE DATABASE goalquest;"

# Run migration (creates all tables)
cd backend
node db/migrate.js

# Seed demo data + users
node db/seed.js
```

### 3. Run

```bash
# Terminal 1 – Backend
cd backend
npm run dev        # nodemon, auto-restarts

# Terminal 2 – Frontend
cd frontend
npm run dev        # Vite HMR on http://localhost:5173
```

Open **http://localhost:5173**

---

## 🔑 Demo Credentials

| Role     | Email                | Password     |
|----------|----------------------|--------------|
| Employee | employee@demo.com    | emp123       |
| Manager  | manager@demo.com     | manager123   |
| Admin    | admin@demo.com       | admin123     |

---

## 📡 API Reference

### Auth
| Method | Endpoint         | Description        |
|--------|------------------|--------------------|
| POST   | /api/auth/login  | Login → JWT token  |
| GET    | /api/auth/me     | Get current user   |

### Goals
| Method | Endpoint                    | Role           | Description                     |
|--------|-----------------------------|----------------|---------------------------------|
| GET    | /api/goals?cycle_id=1       | All            | List goals (scoped by role)     |
| POST   | /api/goals                  | Employee       | Create goal                     |
| POST   | /api/goals/shared           | Manager/Admin  | Push shared KPI to team         |
| PATCH  | /api/goals/:id/status       | Manager/Admin  | Approve or reject               |
| PATCH  | /api/goals/:id/unlock       | Admin          | Unlock approved goal for edit   |
| DELETE | /api/goals/:id              | Employee       | Delete draft/pending goal       |

### Achievements
| Method | Endpoint                            | Role     | Description              |
|--------|-------------------------------------|----------|--------------------------|
| PUT    | /api/achievements/:goalId/:quarter  | Employee | Upsert quarterly actual  |
| GET    | /api/achievements/:goalId           | All      | All quarters for a goal  |

### Check-ins
| Method | Endpoint                          | Role          | Description           |
|--------|-----------------------------------|---------------|-----------------------|
| POST   | /api/checkins/:goalId/:quarter    | Manager/Admin | Add check-in comment  |
| GET    | /api/checkins/:goalId             | All           | List comments         |

### Reports
| Method | Endpoint                         | Role          | Description                  |
|--------|----------------------------------|---------------|------------------------------|
| GET    | /api/reports/dashboard           | Manager/Admin | Stats + completion rates     |
| GET    | /api/reports/export              | Manager/Admin | Download CSV                 |
| GET    | /api/reports/audit               | Admin         | Full audit trail             |
| GET    | /api/reports/team/:managerId     | Manager/Admin | Team summary per manager     |

---

## 🧮 Score Formulas (UoM)

| UoM           | Formula                                    |
|---------------|--------------------------------------------|
| Numeric (Min) | `min(150, round(actual/target × 100))`     |
| Numeric (Max) | `min(150, round(target/actual × 100))`     |
| % (Min)       | Same as Numeric (Min)                      |
| % (Max)       | Same as Numeric (Max)                      |
| Timeline      | `actual ≤ target → 100; else max(0, 100 - (actual-target)×10)` |
| Zero-based    | `actual === 0 → 100; else 0`               |

---

## 🗃 Database Schema

```sql
users              – id, name, email, password, role, department, manager_id
cycles             – id, label, active_quarter, goal_open, q1_open…q4_open
goals              – id, cycle_id, employee_id, title, thrust_area, uom,
                     target, weightage, status, is_shared, shared_from, locked_at
achievements       – id, goal_id, quarter, actual, status  [UNIQUE goal_id+quarter]
checkin_comments   – id, goal_id, quarter, manager_id, comment
audit_log          – id, user_id, action, entity_type, entity_id, details (JSONB)
```

---

## ☁️ Deployment (Render — free tier)

### Backend (Web Service)
1. Push `backend/` to GitHub
2. New Web Service → connect repo
3. Build command: `npm install`
4. Start command: `node index.js`
5. Add env vars from `.env.example` (use Render PostgreSQL connection string)
6. After deploy: run `node db/migrate.js` and `node db/seed.js` via Render Shell

### Frontend (Static Site)
1. Push `frontend/` to GitHub
2. New Static Site → connect repo
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Set `VITE_API_URL` = your Render backend URL + `/api`

### Alternative: Railway.app
Both services can be deployed on Railway with the same env vars — Railway auto-detects Node.js and provisions Postgres.

---

## 📁 Project Structure

```
goalquest/
├── backend/
│   ├── db/
│   │   ├── migrate.js        ← Create all tables
│   │   ├── seed.js           ← Demo data + credentials
│   │   └── pool.js           ← pg connection pool
│   ├── middleware/
│   │   ├── auth.js           ← JWT verify + requireRole()
│   │   └── scoring.js        ← UoM score formulas
│   ├── routes/
│   │   ├── auth.js
│   │   ├── goals.js
│   │   ├── achievements.js
│   │   ├── checkins.js
│   │   ├── reports.js
│   │   └── users.js
│   ├── index.js              ← Express server entry
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── main.jsx          ← React entry
    │   ├── App.jsx           ← All views (Employee/Manager/Admin)
    │   └── api.js            ← Centralised fetch client
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── .env.example
```

---

## ✅ Feature Checklist

### Phase 1 – Goal Setting & Approval
- [x] Goal sheet: Thrust Area, Title, UoM, Target, Weightage
- [x] Validation: total = 100%, min 10% per goal, max 8 goals
- [x] Manager approve / return-for-rework workflow
- [x] Goal locking post-approval
- [x] Admin unlock with audit trail
- [x] Shared Goals – manager pushes KPI to multiple employees

### Phase 2 – Quarterly Check-ins
- [x] Employee logs actual achievement per quarter
- [x] Manager structured check-in comments
- [x] Auto score computation (all 6 UoM types)
- [x] Weighted final score across all goals

### Reporting
- [x] Manager team dashboard
- [x] Admin analytics (completion rates, thrust area distribution)
- [x] CSV export
- [x] Audit trail (JSONB details)
