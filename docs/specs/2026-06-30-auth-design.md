# Auth & User System — Backend Spec

**Ngày:** 2026-06-30
**Repo:** `game-api/` — NestJS REST API
**Spec frontend:** xem repo `game/` → `docs/superpowers/specs/2026-06-30-auth-design.md`

---

## 1. Kiến trúc tổng thể

| Repo | Vai trò | Stack |
|------|---------|-------|
| `game/` | Frontend | Next.js + TypeScript + Tailwind + shadcn/ui |
| `game-api/` **(repo này)** | REST API backend | NestJS + TypeScript + PostgreSQL + Prisma |

### Stack chi tiết

| Layer | Thư viện | Lý do chọn |
|-------|----------|------------|
| Framework | NestJS + TypeScript (strict) | Module system, DI, decorator-based — scale tốt khi thêm feature |
| Database | PostgreSQL | Robust, SQL chuẩn, phù hợp khi thêm content gating/payment sau |
| ORM | **Prisma** | Type-safe, migration rõ ràng, DX tốt hơn TypeORM cho team nhỏ |
| Auth strategy | `@nestjs/passport` + `passport-jwt` | NestJS native, dễ thêm OAuth sau |
| JWT | `@nestjs/jwt` | Sign/verify access & refresh token |
| Password | `bcrypt` (rounds = 12) | Standard |
| Validation | `class-validator` + `class-transformer` | NestJS built-in, ValidationPipe global |
| Config | `@nestjs/config` + Zod | Env vars type-safe, validate lúc startup (fail fast nếu thiếu biến) |
| Logging | **nestjs-pino** + `pino-pretty` | Nhanh hơn Winston, structured JSON. `pino-pretty` chỉ dev — prod raw JSON |
| Security headers | `helmet` | CSP, X-Frame-Options, HSTS — bật global |
| Rate limiting | `@nestjs/throttler` | Chống brute force `/auth/login`, `/auth/register` |
| Cookie | `cookie-parser` | Parse httpOnly cookie chứa token |
| API Docs | `@nestjs/swagger` | Auto-gen OpenAPI từ decorator — chỉ bật non-production |
| Testing | Jest (built-in NestJS) | Unit test service, e2e test endpoint |

### Flow auth

```
[Register / Login]
  → server set access_token (httpOnly cookie, 15 phút)
             + refresh_token (httpOnly cookie, 30 ngày)

[Mỗi request từ frontend]
  → cookie tự động gửi kèm (credentials: 'include')
  → NestJS đọc access_token từ cookie, không cần Authorization: Bearer

[Khi access_token hết hạn]
  → frontend gọi POST /auth/refresh
  → server verify refresh_token, rotate (xóa cũ, tạo mới), set cookie mới

[Logout]
  → server xóa refresh_token hash khỏi DB + clearCookie cả hai
```

### Cookie cross-origin

`game/` và `game-api/` khác domain ở production — **bắt buộc**:

- Set cookie: `sameSite: 'none'` + `secure: true` (HTTPS only)
- CORS: `enableCors({ credentials: true, origin: FRONTEND_URL })`
- Dev local: `sameSite: 'lax'` là đủ khi cả hai chạy trên `localhost`

---

## 2. Database Schema (Prisma)

```prisma
model User {
  id            String         @id @default(uuid())
  email         String         @unique
  passwordHash  String
  createdAt     DateTime       @default(now())
  progress      Progress?
  refreshTokens RefreshToken[]
}

model Progress {
  id                String   @id @default(uuid())
  userId            String   @unique
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  completedMissions Json     @default("{}")
  stats             Json     @default("{\"commandsRun\":0,\"hintsUsed\":0}")
  updatedAt         DateTime @updatedAt
}

model RefreshToken {
  id        String   @id @default(uuid())
  tokenHash String   @unique  // bcrypt hash — không lưu plain token
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

**Ghi chú:**
- `Json` type cho `completedMissions` / `stats` — khớp format localStorage của frontend, không cần transform.
- `RefreshToken` lưu hash → DB bị leak thì token vô dụng.
- Thêm content gating sau: thêm `plan String @default("free")` vào `User`, không cần refactor auth.

---

## 3. API Endpoints

### Auth

| Method | Path | Body | Mô tả |
|--------|------|------|-------|
| `POST` | `/auth/register` | `{ email, password }` | Tạo tài khoản, set cookie |
| `POST` | `/auth/login` | `{ email, password }` | Đăng nhập, set cookie |
| `POST` | `/auth/refresh` | _(cookie)_ | Rotate refresh token, set cookie mới |
| `POST` | `/auth/logout` | _(cookie)_ | Revoke refresh token, clear cookie |

### User & Progress

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| `GET` | `/users/me` | ✅ | Profile + progress |
| `PATCH` | `/users/me/progress` | ✅ | Sync progress (merge logic) |

**Merge logic (`PATCH /users/me/progress`):**
- `completedMissions`: server thắng — không overwrite mission đã có trên server về trạng thái cũ hơn
- `stats.commandsRun` / `stats.hintsUsed`: lấy `Math.max(server, client)`

---

## 4. Module Structure

```
src/
├── auth/
│   ├── dto/
│   │   ├── register.dto.ts         — @IsEmail, @MinLength(8), @MaxLength(72)
│   │   └── login.dto.ts
│   ├── strategies/
│   │   ├── jwt.strategy.ts         — đọc access_token từ cookie
│   │   └── jwt-refresh.strategy.ts — đọc refresh_token từ cookie
│   ├── guards/
│   │   └── jwt-auth.guard.ts       — JwtAuthGuard + JwtRefreshGuard
│   ├── auth.controller.ts
│   ├── auth.service.ts             — register, login, refresh, logout, issueTokens
│   └── auth.module.ts
├── users/
│   ├── dto/
│   │   └── update-progress.dto.ts
│   ├── users.controller.ts
│   ├── users.service.ts            — getMe, syncProgress (merge logic)
│   └── users.module.ts
├── prisma/
│   ├── prisma.service.ts           — PrismaClient wrapper
│   └── prisma.module.ts            — @Global()
├── common/
│   ├── filters/
│   │   └── http-exception.filter.ts — ẩn stack trace prod, log pino, no enumeration
│   └── config/
│       └── env.schema.ts           — Zod: validate env lúc startup
├── app.module.ts
└── main.ts                         — helmet, CORS, cookieParser, ValidationPipe, Swagger
```

---

## 5. Security Checklist

- [x] bcrypt hash password (rounds = 12)
- [x] Refresh token lưu **hash** trong DB — plain token không bao giờ persist
- [x] Refresh token rotation — mỗi lần refresh: xóa cũ, tạo mới
- [x] Cả hai token đều httpOnly cookie — JS không đọc được
- [x] Access token TTL 15 phút — giới hạn thiệt hại nếu bị sniff
- [x] CORS chỉ cho phép `FRONTEND_URL`
- [x] `@nestjs/throttler` rate limit login/register
- [x] `helmet()` global security headers
- [x] `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` — strip & reject unknown fields
- [x] Global exception filter — message đồng nhất, không phân biệt "user not found" vs "wrong password"
- [x] Zod validate env lúc startup — fail fast nếu thiếu `JWT_SECRET`

---

## 6. Dự định tương lai — Content Gating

- Thêm `plan String @default("free")` vào model `User`
- NestJS guard kiểm tra `plan` trước khi trả data chapter
- Backend enforce — frontend chỉ hiện UI lock, không phải nguồn truth

---

## 7. Out of Scope (sprint này)

- OAuth (Google / GitHub)
- Email verification
- Forgot password / reset password
- Admin dashboard
- Payment / subscription
