# P4 — Kết quả bàn giao (backend cộng tác MIT)

|                |                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Ngày**       | 2026-08-19                                                                                                                        |
| **Nhánh**      | `chess-editing-suite`                                                                                                             |
| **Nguồn**      | [p3-ket-qua-ban-giao.md](p3-ket-qua-ban-giao.md) §8, [ke-hoach-tong-the.md](ke-hoach-tong-the.md) Phần B / F                      |
| **Trạng thái** | **P4.0 đóng.** Auth, workspace, Yjs, blob, comment chạy trên `@chess/sync`. Đã login + tạo workspace cloud trên Electron Windows. |

Sản phẩm P4: **desktop local-first + sync self-host**. Analyze / HLV không cần mạng. Sau login `Chess Sync` (`http://127.0.0.1:3010`), hai client một workspace thấy Yjs, blob, comment.

Không Docker. Không đọc `packages/backend/**` (EE). Không host Claude/Grok. Không bump `metadata.version` chess. Không explorer / tablebase.

---

## 1. P4 đã giao gì

| #   | Việc (P3 §8.2)       | Kết quả trên máy                                                                                         |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Cắt bề mặt GraphQL   | Yoga SDL trong `@chess/sync`: serverConfig, user, workspace, invite, blob, comment + stub không 400      |
| 2   | Auth                 | Sign-in = đăng ký. Cookie web + native exchange JWT 15 phút / refresh 30 ngày. Đổi mật khẩu REST         |
| 3   | Workspace            | Tạo / xoá / rời / mời / accept / grant / revoke. UI: `test workspace backend` + `coach@test.local`       |
| 4   | Doc sync socket.io   | `space:join` / `push-doc-update` / `broadcast-doc-update` / load-doc / awareness / realtime RPC          |
| 5   | Blob                 | `createBlobUpload` luôn `GRAPHQL`; `setBlob` multipart; `GET /api/workspaces/:id/blobs/:key`             |
| 6   | Comment              | create / list / resolve. Attachment ghi `{dataDir}/blobs/{workspaceId}/comment-*`                        |
| 7   | Desktop              | `chessSync.info` + auto-register `addOrGetServerByBaseUrl`. Offline: Demo Workspace + Analyze/HLV nguyên |
| 8   | Explorer / tablebase | **Không** — P4.x                                                                                         |

`serverConfig`: `version: "0.27.0"`, `type: Selfhosted`, `features: [Comment, LocalWorkspace]`.

---

## 2. Bản đồ code

```
Electron chessSync.info
  → startChessSync({ host, port 3010–3020, dataDir: userData/chess-sync })
       Fastify :3010
         GET  /health
         /api/auth/*          cookie + native JWT
         POST /graphql        Yoga
         GET  /api/workspaces/:id/blobs/:key
         GET  /api/workspaces/:id/docs/:docId
         socket.io /socket.io  space:* + realtime:*
       PGlite  {dataDir}/pg
       blobs   {dataDir}/blobs/{workspaceId}/{key}
       JWT     {dataDir}/jwt-secret
```

| Chỗ                                                    | Việc                                           |
| ------------------------------------------------------ | ---------------------------------------------- |
| `packages/chess/sync/`                                 | Package MIT `@chess/sync`                      |
| `src/server.ts` `startChessSync`                       | Fastify + Yoga + socket.io                     |
| `src/auth/`                                            | REST phiên, argon2id, jose HS256               |
| `src/graphql/`                                         | SDL + resolvers                                |
| `src/sync/`                                            | Yjs cache, compact >100 update, CRDT broadcast |
| `src/blob/`                                            | Đĩa + GET bytes                                |
| `packages/frontend/apps/electron/src/main/chess-sync/` | Manager + IPC `chessSync.info`                 |
| `packages/frontend/core/.../desktop-api.ts`            | Auto-register khi `ApplicationStarted`         |
| `packages/frontend/core/.../change-password/index.tsx` | Selfhosted: POST `/api/auth/change-password`   |
| `CHESS_SYNC_ALLOW_MULTI_INSTANCE=1`                    | Bỏ single-instance lock (test 2 cửa sổ)        |

CLI: `yarn workspace @chess/sync exec node --import tsx src/cli.ts` → `listening on http://127.0.0.1:3010`. Data mặc định `./data/chess-sync`.

---

## 3. Kiểm chứng đã chạy

**Unit (`packages/chess/sync`)**

```
yarn workspace @chess/sync exec vitest run
```

5/5: auth REST, GraphQL workspace+invite, blob multipart, comment resolve, hai `socket.io-client` CRDT (`map.k === 'v'`).

**Hiện trạng không phá P2/P3**

```
yarn workspace @blocksuite/chess-engine exec vitest run   # 38/38
yarn vitest run packages/frontend/core/src/modules/chess-coach  # 8/8
```

**CLI**

`GET http://127.0.0.1:3010/health` → `{ ok: true, version: "0.27.0" }`.

**Trên máy (2026-08-19, Electron Windows)**

1. Mở app → menu workspace hiện **Chess Sync**.
2. Login `coach@test.local` / `password1` (lần đầu tạo user).
3. Tạo workspace cloud **test workspace backend**.
4. `Demo Workspace` vẫn local; Analyze + Chess coach Claude Code chạy, không cần sync.

Hai cửa sổ CRDT: cổng là vitest (3). UI 2 Electron không chặn P4.0.

---

## 4. Sửa phát sinh khi chạy máy

| Lỗi trên máy                               | Nguyên nhân                                 | Sửa                                                                            |
| ------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /` trình duyệt 404                    | 3010 là API, không phải UI                  | Đúng. Health: `/health`. App = Electron                                        |
| Overlay `Can't resolve './field-shield'`   | Renderer watch bản cũ                       | Restart `yarn affine dev -p @affine/electron-renderer`                         |
| PGlite `ExitStatus 1`                      | Tạo `{dataDir}/blobs` trước khi init PGDATA | PGlite vào `{dataDir}/pg`                                                      |
| PGlite fail trong Vitest threads           | WASM + thread pool                          | `vitest` `pool: 'forks'`                                                       |
| `dist/main.js` không chứa `chessSync`      | Layer Electron chưa rebuild                 | Source đã wire. Dev: rebuild layer hoặc Add Server tay `http://127.0.0.1:3010` |
| `yarn affine @affine/electron dev` flicker | Nợ P3                                       | `electron.exe` một lần + `DEV_SERVER_URL=http://localhost:8080`                |

---

## 5. Cách chạy trên Windows (dev)

1. Renderer: `yarn affine dev -p @affine/electron-renderer` → `http://localhost:8080`.
2. Sync: `yarn workspace @chess/sync exec node --import tsx src/cli.ts` **hoặc** để Electron `chessSync.info` tự mở (cần layer main đã bundle `@chess/sync`).
3. Main: `DEV_SERVER_URL=http://localhost:8080` + `electron.exe` trong `packages/frontend/apps/electron`. **Không** `yarn affine @affine/electron dev`.
4. Menu workspace → **Chess Sync** → login `coach@test.local` / `password1`.
5. Tạo workspace **cloud**. Không dùng Demo Workspace để test sync.
6. LAN: `CHESS_SYNC_HOST=0.0.0.0`. Hai cửa sổ: `CHESS_SYNC_ALLOW_MULTI_INSTANCE=1`.

---

## 6. Việc P4 không làm (giữ)

- Không đọc / fork `packages/backend/**`.
- Không Docker Compose, không `DATABASE_URL` Postgres ngoài (schema đã Postgres; PGlite in-process).
- Không host HLV trên server.
- Không spawn Arasan lần hai.
- Không OAuth / Captcha / Payment / Copilot / Indexer.
- Không bump schema chess `metadata.version`.
- Không `chess.explorer` / tablebase.

---

## 7. Nợ không chặn P4.0 (P4.x / P5)

| Nợ                                 | Ghi chú                                              |
| ---------------------------------- | ---------------------------------------------------- |
| Rebuild layer Electron vào `dist/` | Auto-register chỉ có sau `build:dev` / bundle mới    |
| UI 2 Electron CRDT                 | Vitest đủ P4.0                                       |
| Comment live `realtime:event`      | `comment.changes.get` rỗng; reload `listComments` đủ |
| Postgres ngoài + Docker            | P4.x khi máy mạnh                                    |
| Explorer / tablebase               | P4.x                                                 |
| Chấm bài / comment trên nước đi    | P5 dùng comment đã có                                |

---

## 8. Liên kết

- Lộ trình: [ke-hoach-tong-the.md](ke-hoach-tong-the.md) Phần B / F
- P3: [p3-ket-qua-ban-giao.md](p3-ket-qua-ban-giao.md) §8
- P2: [p2-ket-qua-ban-giao.md](p2-ket-qua-ban-giao.md)
