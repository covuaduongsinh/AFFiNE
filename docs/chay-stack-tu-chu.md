# Chạy stack tự chủ: backend, đăng nhập, đồng bộ

Bản web mặc định là local-first: workspace nằm trong IndexedDB của một trình duyệt, một máy. Tài liệu này mô tả cách chạy nó với backend `@chess/sync` để có đăng nhập, đồng bộ nhiều máy, và dữ liệu nằm trên đĩa của mình — không phụ thuộc cloud AFFiNE.

Tài liệu này mô tả cách chạy trên máy của anh. Dựng lên VPS thì xem
[../deploy/README.md](../deploy/README.md). Sao lưu và khôi phục nằm ở
[an-toan-du-lieu.md](an-toan-du-lieu.md). Kiến trúc backend nằm ở
[p4-ket-qua-ban-giao.md](p4-ket-qua-ban-giao.md).

## Hai tiến trình

```
trình duyệt ──► :5173  serve-dist.mjs   phục vụ selfhost.html + dist
                          │
                          └─ /api /graphql /socket.io ──► :3010  @chess/sync
                                                                    ├── pg/          PGlite
                                                                    ├── blobs/       tệp đính kèm
                                                                    └── jwt-secret   khoá phiên
```

Điểm mấu chốt là proxy: trình duyệt chỉ nói chuyện với `:5173`, nên web và backend là **cùng một origin**. Cookie đăng nhập và handshake socket.io đều dựa vào điều đó. Trỏ thẳng trình duyệt vào `:3010` sẽ không đăng nhập được.

## Dựng lần đầu

```bash
# 1. Backend. Đường dẫn dữ liệu phải tuyệt đối.
CHESS_SYNC_DATA_DIR=/absolute/path/chess-sync-data \
  node --import tsx packages/chess/sync/src/cli.ts

# 2. Bản web. PUBLIC_PATH=/ là bắt buộc, thiếu nó bundle trỏ vào CDN của AFFiNE.
PUBLIC_PATH=/ yarn affine build -p web
find packages/frontend/apps/web/dist -name '*.map' -delete   # không phát tán mã nguồn

# 3. Phục vụ.
node scripts/serve-dist.mjs
```

Mở `http://localhost:5173`, đăng nhập, tạo workspace và chọn server **Chess Sync**.

**Đăng nhập chính là đăng ký.** Email chưa có thì tài khoản được tạo ngay lúc đăng nhập đầu tiên, mật khẩu 8–32 ký tự. Không có allowlist, không có vai trò quản trị, không xác minh email.

## Biến môi trường

| Biến                  | Nơi đọc        | Ý nghĩa                                                                     |
| --------------------- | -------------- | --------------------------------------------------------------------------- |
| `CHESS_SYNC_DATA_DIR` | CLI standalone | Thư mục dữ liệu. Electron **không** đọc biến này khi tự chạy server nhúng   |
| `CHESS_SYNC_HOST`     | cả hai         | Địa chỉ lắng nghe, mặc định `127.0.0.1`                                     |
| `CHESS_SYNC_PORT`     | cả hai         | Cổng, mặc định `3010`                                                       |
| `CHESS_SYNC_URL`      | Electron       | Trỏ app desktop vào một backend có sẵn, và **không** bật server nhúng       |
| `API_ORIGIN`          | serve-dist     | Backend để proxy tới, mặc định `127.0.0.1:3010`                             |
| `APP_HTML`            | serve-dist     | Đặt `index.html` để phục vụ bản không-self-hosted. Mặc định `selfhost.html` |

## Dùng chung một backend cho desktop và trình duyệt

Mặc định bản Electron tự bật server nhúng riêng với thư mục dữ liệu riêng trong `userData`. Muốn nó dùng chung backend với trình duyệt thì trỏ nó vào:

```bash
CHESS_SYNC_URL=http://192.168.1.10:3010    # máy đang chạy backend
```

Khi đó Electron bỏ qua server nhúng và đăng ký thẳng địa chỉ này. Máy chạy backend phải mở ra mạng bằng `CHESS_SYNC_HOST=0.0.0.0`.

Lưu ý: server chung sẽ **không** trở thành server mặc định trong app — phải chọn tay ở bộ chọn workspace. Đó là do phía client cứng id server mặc định, không phải lỗi cấu hình.

## Mở ra mạng: nợ bảo mật phải trả trước

Có hai lỗ chưa vá, và cả hai chỉ nguy hiểm khi server với tới được từ ngoài. Chừng nào còn một
lớp xác thực đứng trước (mật khẩu ở Caddy, hoặc VPN) thì chưa ai khai thác được. **Đừng gỡ lớp đó
trước khi vá xong hai mục đầu.**

| # | Lỗ | Ở đâu |
| - | -- | ----- |
| 1 | **Ghi file tuỳ ý.** `setBlob` lấy thẳng tên file client gửi làm khoá rồi ghép vào đường dẫn không kiểm tra. Tên chứa `../../` ghi ra ngoài cây blob, tới bất cứ đâu tiến trình có quyền | `graphql/resolvers.ts:684`, `blob/store.ts:9-11` |
| 2 | **Đăng nhập chính là đăng ký.** Không allowlist, không admin, không xác minh email. Dùng một mình thì một danh sách một dòng đóng gần hết rủi ro | `auth/routes.ts:126-144` |
| 3 | **`ctx.origin` đọc từ header client gửi** và bị ghi vào cơ sở dữ liệu qua `uploadAvatar`. Sai một lần là có `http://` nằm vĩnh viễn trong dữ liệu, trình duyệt chặn vì nội dung hỗn hợp. Hiện `blobs/` còn rỗng nên chưa có URL nào bị ghi hỏng — vá trước khi tải ảnh đại diện đầu tiên là thoát hẳn | `server.ts:53-64`, `resolvers.ts:807` |
| 4 | Cookie phiên thiếu `secure`; CORS `origin: true` phản chiếu mọi origin kèm credentials | `auth/session.ts:26-29`, `server.ts:37` |
| 5 | Không có giới hạn tần suất ở đâu cả. Argon2 chạy mỗi lần thử đăng nhập là đòn bẩy CPU | toàn bộ package |

Nếu sau này vá mục 4 bằng danh sách CORS cụ thể, **phải kèm cả origin của Electron** (`assets://.`
và `assets://another-host`, xem `packages/frontend/apps/electron/src/shared/internal-origin.ts`),
nếu không app desktop mất khả năng đăng nhập.

Còn một điều không phải lỗ nhưng nên biết: dữ liệu tài liệu đi qua cột `bytea`, và
`db/schema.ts:18-20` trả `Uint8Array` cho driver. PGlite nhận được, nhưng node-postgres chỉ nhận
diện `Buffer` — nên nếu có ngày đổi sang Postgres thật mà quên sửa chỗ này, dữ liệu hỏng âm thầm
chứ không báo lỗi.

## Rủi ro đã biết: schema không có migration

Lược đồ cơ sở dữ liệu được áp lại mỗi lần khởi động bằng một khối `CREATE TABLE IF NOT EXISTS`. Trên thư mục dữ liệu đã có sẵn, mọi câu lệnh đều thành lệnh rỗng. Hôm nay vô hại, nhưng ngày nào `packages/chess/sync/src/db/schema.ts` thêm một cột thì bảng cũ sẽ **không** được sửa, và truy vấn sẽ hỏi một cột Postgres không có — hỏng âm thầm. Mỗi lần đổi schema phải xử lý việc nâng cấp dữ liệu cũ bằng tay.
