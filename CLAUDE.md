# game-api — Hacker Path Backend

REST API cho Hacker Path learning platform. NestJS + TypeScript + PostgreSQL + Prisma.

**Spec đầy đủ:** `docs/specs/2026-06-30-auth-design.md`

---

## Tech Stack

- **Framework:** NestJS 11 + TypeScript strict
- **Database:** PostgreSQL + Prisma 6
- **Auth:** JWT (httpOnly cookie) + bcrypt + passport-jwt
- **Logging:** nestjs-pino (pino-pretty ở dev, raw JSON ở prod)
- **Security:** helmet, @nestjs/throttler, ValidationPipe whitelist
- **Docs:** @nestjs/swagger (chỉ bật ở non-production)

---

## Quy tắc bắt buộc

### TypeScript
- **Không có `any`** — dùng `unknown` rồi narrow, hoặc type rõ ràng
- **Không tắt strict** — `noImplicitAny`, `strictNullChecks` luôn bật
- Mọi DTO phải có decorator `class-validator` đầy đủ

### Security
- **Không bao giờ** trả khác nhau message giữa "user không tồn tại" vs "sai password" → account enumeration
- **Không lưu plain refresh token** — luôn lưu `bcrypt.hash(token)` vào DB
- Cookie phải `httpOnly: true`, `secure: true` ở prod, `sameSite: 'none'` ở prod (cross-origin)
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` — không bỏ

### Code style
- **Không file `.js` mới** — toàn bộ TypeScript
- Mỗi module có folder riêng: `auth/`, `users/`, `prisma/`, `common/`
- DTO nằm trong `<module>/dto/`, strategy trong `auth/strategies/`, guard trong `auth/guards/`
- Không viết business logic trong controller — controller chỉ nhận request, gọi service, trả response

### Prisma
- Mọi thay đổi schema → chạy `npm run db:migrate` để tạo migration file
- Không dùng `prisma db push` ở production — chỉ dùng `prisma migrate deploy`
- Sau khi đổi schema → chạy `npm run db:generate` để cập nhật Prisma Client

---

## Gates bắt buộc trước khi nói "xong"

```bash
# 1. Build phải xanh
npm run build

# 2. Tests phải pass
npm test

# 3. Không có TypeScript error
npx tsc --noEmit
```

Cả 3 phải xanh. **Không tuyên bố xong nếu chưa chạy 3 lệnh này.**

---

## Cấu trúc project

```
src/
├── auth/
│   ├── dto/            — RegisterDto, LoginDto (class-validator)
│   ├── strategies/     — JwtStrategy, JwtRefreshStrategy
│   ├── guards/         — JwtAuthGuard, JwtRefreshGuard
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   └── auth.module.ts
├── users/
│   ├── dto/            — UpdateProgressDto
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── users.module.ts
├── prisma/
│   ├── prisma.service.ts
│   └── prisma.module.ts
├── common/
│   ├── filters/        — HttpExceptionFilter (global)
│   └── config/         — env.schema.ts (Zod)
├── app.module.ts
└── main.ts
```

---

## Env vars

Xem `.env.example`. Bắt buộc phải có khi start:
- `DATABASE_URL`
- `FRONTEND_URL`
- `JWT_SECRET` (min 32 chars)
- `JWT_REFRESH_SECRET` (min 32 chars)

App sẽ **crash lúc startup** nếu thiếu — đây là behavior mong muốn (fail fast).

---

## API Endpoints

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| POST | `/auth/register` | — | Tạo tài khoản |
| POST | `/auth/login` | — | Đăng nhập |
| POST | `/auth/refresh` | cookie | Lấy access token mới |
| POST | `/auth/logout` | cookie | Đăng xuất |
| GET | `/users/me` | cookie | Profile + progress |
| PATCH | `/users/me/progress` | cookie | Sync progress |

Swagger UI: `http://localhost:3001/api` (chỉ ở dev)

---

## Cross-origin Cookie (quan trọng)

Frontend (`game/`) và backend (`game-api/`) khác domain ở production:
- Cookie phải `sameSite: 'none'` + `secure: true`
- CORS phải `credentials: true` + `origin: FRONTEND_URL`
- Frontend fetch phải `credentials: 'include'`
- **Dev local:** dùng Next.js rewrites proxy hoặc `sameSite: 'lax'` nếu cùng localhost
