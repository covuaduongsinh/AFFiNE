# P3 — Kết quả bàn giao (HLV AI thuê bao)

|                |                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Ngày**       | 2026-08-19                                                                                                            |
| **Nhánh**      | `chess-editing-suite`                                                                                                 |
| **Nguồn**      | [p2-ket-qua-ban-giao.md](p2-ket-qua-ban-giao.md) §6, [ke-hoach-tong-the.md](ke-hoach-tong-the.md) Phần D / F          |
| **Trạng thái** | **P3 đóng.** 8 việc §6.2 đã giao. Đã xác nhận trên Electron Windows với Claude Max và Grok Build (thuê bao máy user). |

Sản phẩm P3: **desktop local-first có HLV AI**. Agent mượn **thuê bao Claude Code / Grok của user**, gọi tool cờ qua một Hub, diễn giải số **Arasan**. Không spawn engine thứ hai. Không backend. Extra API chỉ là fallback ẩn.

---

## 1. P3 đã giao gì

| #   | Việc (P2 §6.2)                             | Kết quả trên máy                                                                                                                                                |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Claude Code thuê bao                       | Spawn `claude` stdin + `stream-json`. Login Claude Max (`duongsinhchess@gmail.com`) đã trả lời Evergreen: eval / PV / diễn giải.                                |
| 2   | MCP Hub + CLI gắn được                     | `127.0.0.1` + bearer. `tools/list` + `tools/call`. Audit JSONL. Mở URL trên Chrome ra `unauthorized` là **đúng** (thiếu token).                                 |
| 3   | `chess.analyze` / `scan_game` / `read_doc` | Bọc `ChessEngine` + ván focus. Analyze ≡ panel Analyze cùng FEN/depth.                                                                                          |
| 4   | `chess.write_doc` tự Apply                 | `apply_scan` / comment / NAG. Một `writeGame` = một `captureSync`. NAG `!` / `!!` / `!?` giữ.                                                                   |
| 5   | Panel HLV                                  | Sidebar `chess-coach` + **Ask coach**. Analyze / Scan / Apply tay **không** tắt.                                                                                |
| 6   | Grok thuê bao                              | Spawn `grok -p --output-format streaming-json --always-approve`. Auth: `grok login`. Đã phân tích Evergreen: `#4` + biến `Qxd7+…fxe7#` từ Arasan, chữ của Grok. |
| 7   | `chess.make_puzzle`                        | Mỏng: puzzle từ blunder scan gần nhất.                                                                                                                          |
| 8   | API extra (dự phòng)                       | OpenRouter / OpenAI / xAI. Khóa `safeStorage`. **Ẩn** trừ khi chọn `Khóa API (extra)`.                                                                          |

Không tự Apply trừ `apply: true` hoặc `write_doc` `apply_scan`.

**Phân công đã thấy trên UI:** Arasan = số (eval, PV, ACPL, nhãn). Claude/Grok = chữ. LLM không được bịa điểm nếu không gọi tool.

---

## 2. Sửa phát sinh khi chạy máy (cùng ngày)

Không đổi hợp đồng P3. Bắt buộc để thuê bao dùng được trên Windows + Grok 1.0.5.

| Lỗi trên máy                                  | Nguyên nhân                                                                           | Sửa                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Panel luôn hiện OpenRouter / ô API            | Extra trông như bắt buộc                                                              | API chỉ hiện khi chọn `api`. Claude/Grok luôn chọn được.                                    |
| Chọn Claude vẫn có thể rơi sang API           | `resolveProvider` fall-through                                                        | Giữ preferred; không tự nhảy extra.                                                         |
| Grok: `unexpected argument '--mcp-config'`    | Flag của Claude; Grok 1.0 không có                                                    | Ghi `.grok/config.toml` + `--cwd`. Bỏ `--mcp-config` / `--no-auto-update`.                  |
| Grok tool ok nhưng không có chữ               | ACP: `{type:"text", data:"…"}`                                                        | `parseGrokLine` đọc `data`; bỏ `thought` / `usage` / `available_commands`; `end` → `final`. |
| Treo ~10 phút + overlay `could not be cloned` | IPC không clone được payload tool                                                     | `cloneToolResult` JSON-hóa; `replyTool` lỗi vẫn settle.                                     |
| Cửa sổ nhấp nháy mỗi ~0.6s                    | `yarn affine @affine/electron dev` rebuild layer vòng (esbuild watch → kill Electron) | Dev xem app: chạy `electron.exe` **một lần**, không watch.                                  |

---

## 3. Bản đồ code

```
UI  ChessCoachPanel / “Ask coach”
  → ChessCoachService.session        @affine/core
       → runChessTool                @blocksuite/chess-engine
       → ChessEngine.evaluate/scan   (P2, không đổi)
  → DesktopCoachHost IPC chessCoach
       → cloneToolResult             trước toolResult
       → ChessCoachHub HTTP /mcp
       → queryClaude | queryGrok | queryOpenAiCompatible
       → requestRendererTool → tab focus
```

| Chỗ                                                                    | Việc                                                                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `blocksuite/chess/engine/src/tools.ts`                                 | Schema + `runChessTool`                                                                               |
| `packages/frontend/core/src/modules/chess-coach/`                      | Session, service, Null/Desktop host                                                                   |
| `packages/frontend/core/src/modules/chess-coach/hosts/desktop-host.ts` | `cloneToolResult`                                                                                     |
| `packages/frontend/core/src/blocksuite/view-extensions/chess/coach-*`  | Panel thuê bao trước extra                                                                            |
| `packages/frontend/apps/electron/src/main/chess-coach/`                | Hub, Claude, Grok, API, bridge                                                                        |
| `grok.ts` `writeGrokMcpConfig`                                         | TOML MCP cho Grok 1.0                                                                                 |
| IPC                                                                    | `status` / `hubInfo` / `query` / `stop` / `setProvider` / `saveApiKey` / `clearApiKey` / `toolResult` |
| Events                                                                 | `onStream` / `onToolCall`                                                                             |

Binary Claude/Grok: PATH + `~/.local/bin` + `~/.grok/bin` + npm `.cmd`. `AFFINE_CLAUDE_PATH` / `AFFINE_GROK_PATH` ghi đè.

---

## 4. Kiểm chứng đã chạy

**Unit**

- `blocksuite/chess/engine` vitest: tool whitelist / analyze / scan+apply / puzzle (bộ package).
- Electron `chess-coach-claude`: parse + fixture + PATH helper.
- Electron `chess-coach-grok`: **6/6** — fixture, không `--mcp-config`, ACP `data`/`end`, TOML MCP.
- Electron `chess-coach-hub` / `bridge` / `api`.
- Core `coach.spec.ts`: analyze ≡ `evaluate`; scan+apply một write; tool lạ deny; flag engine off; web/null host; `replyTool` clone fail vẫn settle; `cloneToolResult`.

**Trên máy (2026-08-19)**

- Claude Max: Evergreen — `chess.analyze` / `scan_game` / chữ _Máy nói gì (Arasan 26.0, depth 18)_.
- Grok Build 1.0.5: Evergreen sau `20…Nxe7` — `#4`, PV `Qxd7+…fxe7#`, diễn giải. Thuê bao, không extra.
- Chrome `http://127.0.0.1:<port>/mcp` → `unauthorized` (đúng).

Live Claude CI: `AFFINE_COACH_LIVE=1 yarn vitest run test/main/chess-coach-live.spec.ts` — skip mặc định.

Desktop e2e: `tests/affine-desktop/e2e/chess-coach.spec.ts` — panel mở; API key **không** hiện mặc định; Send bật thì gửi analyze.

---

## 5. Nợ không chặn P3 (đẩy P4 / P2.x)

| Nợ                                                   | Ghi chú                                              |
| ---------------------------------------------------- | ---------------------------------------------------- |
| `chess.explorer` / `chess.tablebase`                 | Đã chốt P2 §6.2 → P4 / P3.x                          |
| WASM / macOS / Linux engine                          | Nợ P2; HLV web không có engine                       |
| Codex CLI                                            | §6.1 nêu tên; §6.5 chỉ Claude rồi Grok. Không mở P3. |
| E2E desktop đóng gói + CLI đã login trên CI          | Spec có; máy không login thì unavailable             |
| Grok lần đầu nói “MCP chưa kết nối” rồi vẫn gọi tool | Nhiễu lời CLI; không sai số Arasan                   |
| `yarn affine @affine/electron dev` flicker           | Không dùng khi demo; chỉ `electron.exe` một lần      |
| P0 rebrand / cắt EE                                  | Vẫn trên cây AFFiNE đầy đủ                           |

---

## 6. Việc P3 không làm (giữ)

- Không spawn Arasan lần hai, không UCI thô, không Stockfish.
- Không host AI bằng thuê bao công ty.
- Schema `affine:chess-game` version vẫn 1.
- `analysisJson` không xuất markdown.
- Không backend, không sync hội thoại HLV lên mây.

---

## 7. Cách chạy trên Windows (dev, xem app)

1. Native: `yarn affine @affine/native build` (đã có).
2. Renderer: `yarn affine dev -p @affine/electron-renderer` → `http://localhost:8080`.
3. Main: `DEV_SERVER_URL=http://localhost:8080` rồi **`electron.exe` trỏ `packages/frontend/apps/electron`**. **Không** `yarn affine @affine/electron dev` khi đang xem (watch layer sẽ nhấp nháy).
4. **Không** để `NODE_OPTIONS=--import=tsx` lọt vào Electron.
5. Cài và login [Claude Code](https://claude.ai/code) và/hoặc [Grok Build](https://docs.x.ai/build/overview) (`claude` / `grok login`).
6. Mở ván → **Ask coach**. Chọn _Claude Code (thuê bao)_ hoặc _Grok (thuê bao)_. Extra chỉ khi chủ động chọn _Khóa API (extra)_.

Web: `yarn affine dev -p @affine/web` — panel hiện, chat disabled.

---

## 8. P4 — Section mở (bàn giao)

**Mục tiêu sản phẩm:** bản **cộng tác** — auth, workspace, đồng bộ doc, blob, comment. Bán cho học viện/CLB. HLV AI **không** chuyển lên server công ty.

### 8.1 Nguyên tắc (từ kế hoạch + P3)

1. **Không đọc backend EE.** Đặc tả từ MIT: `packages/common/graphql/src/graphql/**`, `nbstore/impls/cloud/socket.ts`, `nbstore/impls/cloud/{doc,blob,awareness,indexer}.ts`.
2. **Không host inference.** HLV vẫn spawn CLI trên máy user. Backend P4 không gọi Claude/Grok bằng thuê bao công ty.
3. **Tập con thật sự cần** (~35–45 GraphQL + 8 sự kiện socket): auth, workspace, doc sync (socket.io), blob, comment. **Bỏ:** payment, license, calendar, copilot cloud, admin, indexer.
4. **Hai service** (kế hoạch B.3): Sync/Doc = Node + Fastify + Yjs + Postgres (`Update` + `Snapshot`). AI Orchestrator = Python chỉ nếu self-host _của tổ chức_ dùng CLI _của tổ chức_ — không phải đường desktop P3.
5. Desktop local-first **vẫn chạy khi không có mạng**. P4 thêm sync, không phá SQLite/IndexedDB.
6. Giữ hợp đồng P2/P3: một process Arasan, PGN nguồn sự thật, schema chess version 1, MIT only.

### 8.2 Việc P4 phải làm (thứ tự đề xuất)

| #   | Việc                                                                                   | Ghi chú móc sẵn                                 |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | Cắt bề mặt GraphQL: liệt kê ~35–45 operation frontend chess thật sự gọi                | Đọc `.gql` MIT, không đọc `packages/backend/**` |
| 2   | Auth tối thiểu: đăng ký, đăng nhập, phiên, đổi mật khẩu                                | Không OAuth bên thứ 3 trong P4.0                |
| 3   | Workspace: tạo / xoá / liệt kê / mời / quyền                                           | Học viện = nhiều thành viên một workspace       |
| 4   | Doc sync socket.io: `space:join`, `push-doc-update`, `broadcast-doc-update`, awareness | Hợp đồng `nbstore/impls/cloud/socket.ts`        |
| 5   | Blob: upload / list / delete (ảnh, PGN, ghi âm)                                        | Đủ giáo án                                      |
| 6   | Comment: tạo / sửa / xoá / resolve                                                     | Chấm bài sau (P5) dùng cái này                  |
| 7   | Desktop: bật cloud provider khi user login; offline vẫn local                          | Không bắt buộc server để Analyze/HLV            |
| 8   | (Tuỳ) `chess.explorer` Lichess CC0 + cache                                             | Nợ P3.x; không chặn auth/sync                   |

### 8.3 Việc P4 không được làm

- Đọc / fork / copy `packages/backend/**` (EE).
- Host HLV tập trung bằng thuê bao công ty.
- Spawn Arasan trên server trừ khi là tuỳ chọn C5 (không chặn P4.0).
- Bump `metadata.version` chess blocks.
- Payment / license / copilot cloud / admin EE.
- Rebrand P0 nếu chưa tách fork — làm song song, không nhét vào PR sync.

### 8.4 Kiểm chứng P4 (khi làm)

- Hai máy login cùng workspace: sửa một doc → máy kia thấy update (CRDT).
- Offline: mở app, Analyze + HLV Claude/Grok vẫn chạy; online lại thì sync.
- Blob PGN upload / download tròn.
- Comment resolve trên một nước đi (block `affine:chess-game`).
- Không có process Arasan thứ hai khi HLV + Analyze cùng lúc.

### 8.5 Quyết định P4 chưa chốt (không chặn đọc đặc tả)

| #   | Câu hỏi                                   | Gợi ý                                                                  |
| --- | ----------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Host đâu trước?                           | Self-host một Docker Compose cho học viện, hay chỉ sync nhúng desktop? |
| 2   | Postgres ngay hay SQLite server cho P4.0? | SQLite nhanh demo; Postgres đúng kế hoạch scale.                       |
| 3   | Explorer/tablebase trong P4.0 hay P4.x?   | Không chặn cộng tác.                                                   |

P4 có thể bắt đầu từ 8.2 #1 (liệt kê operation) mà không chờ ba câu trên.

---

## 9. Liên kết

- Lộ trình: [ke-hoach-tong-the.md](ke-hoach-tong-the.md) Phần B (backend), D (AI), F (P4)
- P2: [p2-ket-qua-ban-giao.md](p2-ket-qua-ban-giao.md)
- Design engine: [p2-arasan-engine.md](p2-arasan-engine.md)
