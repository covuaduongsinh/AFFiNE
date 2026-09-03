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

**Đăng nhập chính là đăng ký.** Email chưa có thì tài khoản được tạo ngay lúc đăng nhập đầu tiên, mật khẩu 8–32 ký tự. Không có vai trò quản trị, không xác minh email. Khi mở ra mạng thì đặt `CHESS_SYNC_ALLOWED_EMAILS` để chặn — xem mục dưới.

## Biến môi trường

| Biến                        | Nơi đọc        | Ý nghĩa                                                                                            |
| --------------------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| `CHESS_SYNC_DATA_DIR`       | CLI standalone | Thư mục dữ liệu. Electron **không** đọc biến này khi tự chạy server nhúng                          |
| `CHESS_SYNC_HOST`           | cả hai         | Địa chỉ lắng nghe, mặc định `127.0.0.1`                                                            |
| `CHESS_SYNC_PORT`           | cả hai         | Cổng, mặc định `3010`                                                                              |
| `CHESS_SYNC_URL`            | Electron       | Trỏ app desktop vào một backend có sẵn, và **không** bật server nhúng                              |
| `CHESS_SYNC_PUBLIC_ORIGIN`  | cả hai         | Địa chỉ công khai. Quyết định URL ghi vào cơ sở dữ liệu, cờ `secure` của cookie, và danh sách CORS |
| `CHESS_SYNC_ALLOWED_EMAILS` | cả hai         | Danh sách email được phép đăng nhập, ngăn cách bằng dấu phẩy. Trống = ai cũng đăng ký được         |
| `API_ORIGIN`                | serve-dist     | Backend để proxy tới, mặc định `127.0.0.1:3010`                                                    |
| `APP_HTML`                  | serve-dist     | Đặt `index.html` để phục vụ bản không-self-hosted. Mặc định `selfhost.html`                        |

## Dùng chung một backend cho desktop và trình duyệt

Mặc định bản Electron tự bật server nhúng riêng với thư mục dữ liệu riêng trong `userData`. Muốn nó dùng chung backend với trình duyệt thì trỏ nó vào:

```bash
CHESS_SYNC_URL=http://192.168.1.10:3010    # máy đang chạy backend
```

Khi đó Electron bỏ qua server nhúng và đăng ký thẳng địa chỉ này. Máy chạy backend phải mở ra mạng bằng `CHESS_SYNC_HOST=0.0.0.0`.

Lưu ý: server chung sẽ **không** trở thành server mặc định trong app — phải chọn tay ở bộ chọn workspace. Đó là do phía client cứng id server mặc định, không phải lỗi cấu hình.

## Mở ra mạng

Ba lỗ nghiêm trọng nhất **đã vá**:

| Đã vá                             | Trước đây                                                                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ghi file tuỳ ý**                | `setBlob` lấy tên file client gửi làm đường dẫn. Tên chứa `../../` ghi ra ngoài cây blob. Giờ `blobPath` kiểm tra đường dẫn giải ra có còn nằm trong thư mục blob không |
| **Đăng nhập chính là đăng ký**    | Ai vào được cổng cũng tạo được tài khoản. Giờ có `CHESS_SYNC_ALLOWED_EMAILS`, kiểm **trước** cả truy vấn lẫn argon2, nên một email lạ chỉ tốn một phép so chuỗi         |
| **URL sai ghi vào cơ sở dữ liệu** | `ctx.origin` dựng từ header client gửi rồi bị `uploadAvatar` ghi vào bảng. Giờ `CHESS_SYNC_PUBLIC_ORIGIN` thắng, header chỉ còn là đường lui khi chạy cục bộ            |
| **Cookie thiếu `secure`**         | Giờ tự bật khi `PUBLIC_ORIGIN` là https, và tự tắt khi chạy http cục bộ                                                                                                 |
| **CORS `origin: true`**           | Phản chiếu mọi origin kèm credentials. Giờ là danh sách cụ thể, **có kèm `assets://.` và `assets://another-host`** — thiếu hai cái đó là app desktop mất đăng nhập      |

Để trống `CHESS_SYNC_ALLOWED_EMAILS` thì hành vi như cũ, để bản chạy trên máy và server nhúng
trong Electron không phải cấu hình gì.

**Còn nợ:** chưa có giới hạn tần suất, và CSRF chỉ kiểm ở route đăng xuất. Với danh sách email
thì hai thứ đó bớt gấp — một email lạ bị chặn trước khi kịp tốn CPU băm mật khẩu.

## Rủi ro đã biết: schema không có migration

Lược đồ cơ sở dữ liệu được áp lại mỗi lần khởi động bằng một khối `CREATE TABLE IF NOT EXISTS`. Trên thư mục dữ liệu đã có sẵn, mọi câu lệnh đều thành lệnh rỗng. Hôm nay vô hại, nhưng ngày nào `packages/chess/sync/src/db/schema.ts` thêm một cột thì bảng cũ sẽ **không** được sửa, và truy vấn sẽ hỏi một cột Postgres không có — hỏng âm thầm. Mỗi lần đổi schema phải xử lý việc nâng cấp dữ liệu cũ bằng tay.
