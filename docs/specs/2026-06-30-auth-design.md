# Auth & User System — Design Spec

**Ngày:** 2026-06-30
**Phạm vi:** Login, đăng ký, sync progress across devices
**Mục tiêu tương lai (chưa implement):** Content gating — giới hạn chương/mission theo gói đăng ký (xem mục cuối)

---

## 1. Kiến trúc tổng thể

### Hai repo độc lập

| Repo | Vai trò | Stack |
|------|---------|-------|
| `game/` (repo hiện tại, migrate sang Next.js) | Frontend | Next.js + TypeScript + Tailwind + shadcn/ui |
| `game-api/` (repo mới) | REST API backend | NestJS + TypeScript + PostgreSQL + Prisma |

> **Note:** Codebase hiện tại (React + Vite) sẽ được migrate sang Next.js App Router. Auth system được thiết kế cho Next.js ngay từ đầu — không cần refactor sau. **Toàn bộ codebase dùng TypeScript** — không có file `.js` mới nào được tạo.

### Frontend stack chi tiết

| Layer | Thư viện | Lý do chọn |
|-------|----------|------------|
| Framework | Next.js 15 App Router | SSR, middleware auth, Server Components |
| Language | TypeScript (strict) | Type-safe end-to-end |
| Styling | Tailwind CSS | Giữ nguyên từ codebase hiện tại |
| UI Components | **shadcn/ui** | Copy-paste, own the code, Radix UI primitives, Tailwind-native, dark mode built-in — không bị lock-in vào versioned package |
| Client state | **Zustand** | ~3KB, simple API, stable với Next.js App Router — dùng cho auth state, UI state (modal open/close) |
| Server state | **TanStack Query v6** | Caching, background sync, auto-refetch — dùng cho mọi API call tới NestJS (progress, user data) |
| Forms | **React Hook Form + Zod** | Validation type-safe, ít re-render, chuẩn Next.js |
| URL state | **nuqs** | Sync state với URL params khi cần (filter, pagination) |

**Phân chia state rõ ràng:**
- **Zustand**: `authStore` (user, isAuthenticated), `uiStore` (modal states, sidebar)
- **TanStack Query**: mọi thứ fetch từ API — progress, user profile
- **localStorage**: guest mode progress (giữ nguyên behavior hiện tại)
- **URL (nuqs)**: chapter/mission hiện tại (deep-link được)

### Stack backend chi tiết

| Layer | Thư viện | Lý do chọn |
|-------|----------|------------|
| Framework | NestJS + TypeScript (strict) | Module system, DI, decorator-based — scale tốt khi thêm feature |
| Database | PostgreSQL | Robust, SQL chuẩn, phù hợp khi thêm content gating/payment sau |
| ORM | **Prisma** | Type-safe, migration rõ ràng, DX tốt hơn TypeORM cho team nhỏ. Prisma v7 — chú ý ESM config với NestJS |
| Auth strategy | `@nestjs/passport` + `passport-jwt` | NestJS native, dễ thêm OAuth sau |
| JWT | `@nestjs/jwt` | Sign/verify access & refresh token |
| Password | `bcrypt` (rounds = 12) | Standard, không dùng argon2 vì không cần level đó |
| Validation | `class-validator` + `class-transformer` | NestJS built-in, ValidationPipe global |
| Config | `@nestjs/config` + Zod | Env vars type-safe, validate lúc startup (fail fast nếu thiếu biến) |
| Logging | **nestjs-pino** + `pino-pretty` | Nhanh hơn Winston, structured JSON logs, redact sensitive fields. `pino-pretty` chỉ dùng ở dev — prod dùng raw JSON cho log aggregator |
| Security headers | `helmet` | CSP, X-Frame-Options, HSTS — bật global |
| Rate limiting | `@nestjs/throttler` | Chống brute force `/auth/login`, `/auth/register` |
| Cookie | `cookie-parser` | Parse httpOnly cookie chứa refresh token |
| API Docs | `@nestjs/swagger` | Auto-gen OpenAPI spec từ decorator — tiện khi frontend integrate |
| Testing | Jest (built-in NestJS) | Unit test service, e2e test endpoint |

**Auth:**
- Access token: httpOnly cookie, 15 phút
- Refresh token: httpOnly cookie, 30 ngày, lưu hash trong DB (không lưu plain token)

### Flow auth

```
[Register / Login]
  → server trả access_token (httpOnly cookie, 15 phút)
               + refresh_token (httpOnly cookie, 30 ngày)
  → Next.js middleware tự đọc cookie ở mọi request — không cần lưu JS memory

[Mỗi request tới NestJS API]
  → cookie tự động gửi kèm nhờ credentials: 'include' (httpOnly — JS không đọc được)
  → NestJS đọc access_token từ cookie header, không cần Authorization: Bearer

[Khi access_token hết hạn]
  → Next.js middleware intercept 401, tự gọi POST /auth/refresh
  → nhận access_token mới, set lại cookie, retry request gốc

[Bảo vệ route]
  → middleware.ts kiểm tra cookie access_token
  → redirect về /login nếu không có hoặc hết hạn

[Logout]
  → server xóa refresh_token khỏi DB + clear cả hai cookie
```

### Cookie cross-origin (quan trọng)

`game/` và `game-api/` deploy trên 2 domain khác nhau → cookie mặc định bị chặn bởi browser. Bắt buộc:

- **NestJS** set cookie với `sameSite: 'none'` + `secure: true` (chỉ hoạt động trên HTTPS)
- **NestJS** `enableCors({ credentials: true, origin: FRONTEND_URL })`
- **Frontend** mọi fetch call dùng `credentials: 'include'`
- **Dev local**: dùng proxy trong Next.js config (`rewrites`) để tránh cross-origin, hoặc chạy cả hai trên cùng domain (e.g. `localhost` với port khác nhau — lúc này `sameSite: 'lax'` là đủ)

### Guest mode (không đăng nhập)

App vẫn hoạt động đầy đủ với localStorage như hiện tại. Auth là optional — người dùng chỉ cần đăng nhập khi muốn sync progress. Không ép buộc đăng ký để chơi.

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
  user              User     @relation(fields: [userId], references: [id])
  completedMissions Json     // { "1-1": { completedAt, usedHint }, ... }
  stats             Json     // { commandsRun, hintsUsed }
  updatedAt         DateTime @updatedAt
}

model RefreshToken {
  id        String   @id @default(uuid())
  tokenHash String   @unique  // lưu bcrypt hash, không phải plain token
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  expiresAt DateTime
}
```

**Ghi chú schema:**
- `completedMissions` và `stats` dùng `Json` để khớp với format localStorage hiện tại — không cần migration data phức tạp.
- `RefreshToken` lưu DB để có thể revoke từng session (logout một thiết bị, không logout hết).
- Khi thêm content gating sau: thêm field `plan` vào `User` (ví dụ `free | pro`) mà không cần đổi schema lớn.

---

## 3. API Endpoints

### Auth

| Method | Path | Body | Mô tả |
|--------|------|------|-------|
| `POST` | `/auth/register` | `{ email, password }` | Tạo tài khoản, trả access_token |
| `POST` | `/auth/login` | `{ email, password }` | Đăng nhập, trả access_token |
| `POST` | `/auth/refresh` | _(cookie)_ | Đổi refresh_token → access_token mới |
| `POST` | `/auth/logout` | _(cookie)_ | Revoke refresh_token, clear cookie |

### User & Progress

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| `GET` | `/users/me` | ✅ | Lấy email + progress |
| `PATCH` | `/users/me/progress` | ✅ | Sync progress lên server |

**PATCH /users/me/progress — merge logic:**
- Server nhận `{ completedMissions, stats }` từ frontend
- Merge với data hiện tại trên DB: mission nào đã có trên server thì giữ nguyên (không overwrite về trạng thái cũ hơn)
- `stats.commandsRun` và `stats.hintsUsed` lấy giá trị lớn hơn giữa client và server

---

## 4. NestJS Module Structure

```
game-api/
├── src/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts          — /auth/*
│   │   ├── auth.service.ts             — register, login, refresh, logout
│   │   ├── dto/
│   │   │   ├── register.dto.ts         — class-validator: email, password min 8
│   │   │   └── login.dto.ts
│   │   ├── strategies/
│   │   │   ├── jwt.strategy.ts         — validate access_token từ cookie
│   │   │   └── jwt-refresh.strategy.ts — validate refresh_token từ cookie
│   │   └── guards/
│   │       └── jwt-auth.guard.ts
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts         — /users/me
│   │   ├── users.service.ts            — get profile, sync/merge progress
│   │   └── dto/
│   │       └── update-progress.dto.ts
│   ├── prisma/
│   │   ├── prisma.module.ts            — global module
│   │   └── prisma.service.ts           — PrismaClient wrapper + onModuleInit
│   ├── common/
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts — global: ẩn stack trace ở prod, log với pino
│   │   └── config/
│   │       └── env.schema.ts           — Zod schema validate env lúc startup
│   └── main.ts                         — helmet, CORS, cookie-parser, ValidationPipe, Swagger
├── prisma/
│   └── schema.prisma
├── .env                                — DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, PORT, FRONTEND_URL
├── .env.example                        — template commit lên repo (không commit .env)
└── package.json
```

**Lưu ý `main.ts`:**
```ts
app.use(helmet())
app.enableCors({ origin: process.env.FRONTEND_URL, credentials: true })
app.use(cookieParser())
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
app.useGlobalFilters(new HttpExceptionFilter())
// Swagger chỉ bật khi NODE_ENV !== 'production'
```

---

## 5. Frontend Integration (Next.js)

### Cấu trúc Next.js liên quan đến auth

```
game/
├── middleware.ts                   — Edge Runtime: kiểm tra cookie, redirect nếu chưa login
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx          — trang đăng nhập (shadcn Card + Form)
│   │   └── register/page.tsx       — trang đăng ký
│   ├── (game)/
│   │   └── layout.tsx              — layout bọc trang cần login
│   └── layout.tsx                  — root layout: QueryClientProvider + Providers
├── stores/
│   ├── authStore.ts                — Zustand: { user, isAuthenticated, login, logout }
│   └── uiStore.ts                  — Zustand: { loginModalOpen, ... }
├── lib/
│   ├── api.ts                      — fetch wrapper: tự gắn cookie, handle 401 → refresh
│   └── queryClient.ts              — TanStack Query client config
├── hooks/
│   ├── useProgress.ts              — TanStack Query: fetch/mutate progress từ API
│   └── useAuth.ts                  — wrapper tiện lợi quanh authStore
└── components/ui/                  — shadcn/ui components (Button, Input, Card, Form...)
```

### middleware.ts

Chạy trên mọi request ở Edge Runtime — kiểm tra cookie `access_token`:
- Hợp lệ → cho qua
- Hết hạn → gọi `/auth/refresh`, set cookie mới, retry
- Không có / refresh thất bại → redirect về `/login`
- `/login`, `/register` luôn public

### Zustand authStore

```ts
interface AuthState {
  user: { id: string; email: string } | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}
```

Không lưu token trong store — cookie tự động gửi kèm mọi request.

### TanStack Query — progress sync

```ts
// fetch progress
useQuery({ queryKey: ['progress'], queryFn: () => api.get('/users/me') })

// sync sau khi complete mission
useMutation({ mutationFn: (data) => api.patch('/users/me/progress', data) })
```

- Guest mode: TanStack Query disabled, dùng localStorage như hiện tại
- Logged in: mỗi `completeMission()` trigger mutation lên server, cache tự invalidate

### Merge khi login

1. `authStore.login()` thành công → fetch progress từ server (TanStack Query)
2. Merge với localStorage: union `completedMissions`, `stats` lấy max
3. Lưu kết quả lên server + cập nhật localStorage

### UI cần thêm (shadcn/ui components)

- `app/(auth)/login/page.tsx` — `Card` + `Form` + `Input` + `Button` từ shadcn
- `app/(auth)/register/page.tsx` — tương tự, thêm confirm password
- Validation: Zod schema + React Hook Form
- Header: dropdown menu (shadcn `DropdownMenu`) hiện email + logout khi đã login

---

## 6. Security Checklist

- [x] Password hash với bcrypt (rounds = 12)
- [x] Refresh token lưu **hash** trong DB — nếu DB bị leak, token vô dụng
- [x] Cả access token lẫn refresh token đều httpOnly cookie — không accessible bằng JS
- [x] Access token ngắn hạn (15 phút) — hạn chế thiệt hại nếu bị leak
- [x] Refresh token lưu DB → có thể revoke từng session
- [x] Next.js middleware chặn route trước khi render — không có flash of unauthenticated content
- [x] CORS chỉ cho phép origin `FRONTEND_URL`
- [x] Rate limiting (`@nestjs/throttler`) trên `/auth/login` và `/auth/register`
- [x] `helmet()` global — CSP, HSTS, X-Frame-Options
- [x] `ValidationPipe({ whitelist: true })` — strip unknown fields, chặn mass assignment
- [x] Global exception filter — ẩn stack trace ở prod, không phân biệt "user không tồn tại" vs "sai password" (tránh account enumeration)
- [x] Env vars validate lúc startup bằng Zod — fail fast nếu thiếu secret

---

## 7. Dự định tương lai — Content Gating (chưa implement)

Khi có nhu cầu giới hạn nội dung theo gói:

- Thêm `plan: enum('free', 'pro')` vào model `User`
- Free: chơi được Ch1-5; Pro: mở toàn bộ 14 chương
- Backend thêm guard kiểm tra `plan` trước khi trả chapter data
- Frontend hiện lock icon + CTA upgrade trên các chương bị giới hạn
- Tích hợp payment (Stripe hoặc tương đương) trong sprint riêng

Field `plan` có thể thêm vào model `User` sau mà không cần refactor auth.

---

## 8. Out of Scope (sprint này)

- Migration React → Next.js — sprint riêng, **phải hoàn thành trước** khi implement auth
- OAuth (Google / GitHub) — thêm sau khi email/password stable
- Email verification
- Forgot password / reset password flow
- Admin dashboard
- Payment / subscription

---

## 9. Thứ tự sprint đề xuất

1. **Sprint 0** — Migration React + Vite → Next.js App Router (+ setup TypeScript strict, shadcn/ui, Zustand, TanStack Query)
2. **Sprint 1** — Backend: `game-api/` NestJS scaffold + auth endpoints + Prisma schema
3. **Sprint 2** — Frontend auth: login/register pages, middleware, authStore, progress sync
