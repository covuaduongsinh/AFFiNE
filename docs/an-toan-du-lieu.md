# An toàn dữ liệu cho AFFiNE cờ vua

Trước khi nạp giáo án hàng loạt, dữ liệu cần thoát khỏi tình trạng "chỉ nằm trong trình duyệt một máy". Tài liệu này mô tả hai lớp bảo vệ đã dựng và việc cần làm định kỳ.

## Hai lớp bảo vệ

**Lớp 1 — trong ứng dụng.** Khi mở app, trang xin trình duyệt cấp quyền lưu trữ bền (`navigator.storage.persist()`), tức là trình duyệt từ bỏ quyền tự xoá dữ liệu khi thiếu đĩa. Ngoài ra có nút **Full Backup** ở hai chỗ: banner cảnh báo phía trên, và Settings → workspace → Storage. Nút này tải về một file `.bs.zip` chứa toàn bộ tài liệu kèm ảnh.

Chrome quyết định cấp quyền lưu trữ bền dựa trên mức độ gắn bó với site. Nếu console báo `denied`, hãy bookmark `localhost:8080` hoặc cài nó thành ứng dụng (biểu tượng cài đặt trên thanh địa chỉ), rồi tải lại trang.

**Lớp 2 — server tự vận hành.** `@chess/sync` chạy ở cổng 3010, dữ liệu nằm trên đĩa thay vì trong trình duyệt. Workspace đã bật đồng bộ sẽ tự đẩy lên server, và mở được từ máy khác hay trình duyệt khác. Đây là server MIT tự viết, không phải bản Docker của AFFiNE, và **không cần Docker**: Postgres chạy nhúng trong tiến trình bằng PGlite.

## Khởi động server

```bash
CHESS_SYNC_DATA_DIR=/đường/dẫn/tuyệt/đối/chess-sync-data \
  node --import tsx packages/chess/sync/src/cli.ts
```

Luôn đặt `CHESS_SYNC_DATA_DIR` bằng đường dẫn tuyệt đối. Mặc định là `./data/chess-sync` tính theo thư mục đang đứng, nên chạy nhầm chỗ sẽ tạo ra một cơ sở dữ liệu rỗng **trông hệt như mất sạch dữ liệu**. Server in ra thư mục dữ liệu ngay khi khởi động; đọc dòng đó mỗi lần bật.

Kiểm tra server sống: `curl http://127.0.0.1:3010/health` phải trả `{"ok":true,"version":"0.27.0"}`. Mở `http://127.0.0.1:3010` bằng trình duyệt thì ra 404 — đó là API, không phải giao diện.

Bên trong `dataDir` có ba thứ, cả ba đều cần khi sao lưu:

| Đường dẫn                   | Nội dung                                                        |
| --------------------------- | --------------------------------------------------------------- |
| `pg/`                       | Cơ sở dữ liệu PGlite: tài khoản, workspace, tài liệu, bình luận |
| `blobs/{workspaceId}/{key}` | Ảnh và tệp đính kèm                                             |
| `jwt-secret`                | Khoá ký phiên. Xoá là mọi lần đăng nhập mất hiệu lực            |

Ứng dụng web ở `localhost:5173` tự tìm thấy server này: `scripts/serve-dist.mjs` chuyển tiếp `/api`, `/graphql`, `/socket.io` sang cổng 3010, nên trình duyệt xem web và backend là **cùng một origin** — đó là điều kiện để cookie đăng nhập và socket đồng bộ hoạt động.

**Dừng server bằng `Ctrl-C` hoặc `kill -TERM`, đừng bao giờ `kill -9`.** PGlite chỉ ghi nốt dữ liệu ra đĩa trong lúc đóng; giết cứng là bắt nó phải phục hồi từ nhật ký ở lần bật sau, và các thay đổi chưa kịp ghi sẽ mất.

## Giới hạn cần biết của file .bs.zip

File `.bs.zip` chứa nội dung tài liệu, tiêu đề và toàn bộ ảnh đính kèm — nhưng **không** chứa cây thư mục ở sidebar, tag và mục yêu thích. Khi nhập lại (Import → Snapshot), tài liệu về đủ nhưng phải sắp xếp lại thư mục. Đây là bản sao lưu nội dung, không phải bản sao lưu nguyên trạng.

Bản sao lưu nguyên trạng là thư mục `data/` của server, vì nó giữ cả cấu trúc lẫn nội dung.

## Việc định kỳ

Hàng tuần, hoặc sau mỗi đợt soạn bài lớn:

1. Settings → workspace → Storage → **Full Backup**, cất file `.bs.zip` ra nơi khác máy này (ổ cloud hoặc USB).
2. Sao lưu dữ liệu server. Phải **dừng hẳn** rồi mới chép, để không chép phải cơ sở dữ liệu đang ghi dở:

   ```bash
   kill -TERM "$(pgrep -f 'chess/sync/src/cli.ts')"
   while pgrep -f 'chess/sync/src/cli.ts' >/dev/null; do sleep 0.2; done

   tar -C "$(dirname "$DATA")" -czf "backup-chess-sync-$(date +%Y%m%d).tar.gz" \
     "$(basename "$DATA")/pg" "$(basename "$DATA")/blobs" "$(basename "$DATA")/jwt-secret"
   ```

   Không có `pg_dump` cho server này. PGlite chạy nhúng trong tiến trình, không mở cổng Postgres và không có container để `exec` vào — thư mục dữ liệu **chính là** cơ sở dữ liệu. Chép nguội là cách duy nhất.

3. Thử khôi phục bản vừa tạo, đừng tin một bản sao lưu chưa từng được mở lại:

   ```bash
   mkdir -p /tmp/thu-khoi-phuc && tar -C /tmp/thu-khoi-phuc -xzf backup-chess-sync-YYYYMMDD.tar.gz
   CHESS_SYNC_DATA_DIR=/tmp/thu-khoi-phuc/chess-sync-data CHESS_SYNC_PORT=3011 \
     node --import tsx packages/chess/sync/src/cli.ts
   ```

   Đạt khi `/health` trả về đúng, và:

   ```bash
   curl -s -X POST localhost:3011/api/auth/preflight \
     -H 'content-type: application/json' -d '{"email":"email-cua-anh@gmail.com"}'
   ```

   trả `"registered":true`. Đây mới là phép thử sắc: nó chứng minh dòng tài khoản sống sót qua bản
   sao lưu, mà không tạo thêm gì. Thử kèm một email chưa từng có để chắc nó không gật bừa — phải
   ra `"registered":false`.

## Sao lưu tự động lên Google Drive hoặc Dropbox

Đây là chỗ Drive và Dropbox thuộc về: nơi cất bản sao lưu, không phải nơi đồng bộ. `rclone` nói
được cả hai.

Cấu hình một lần bằng `rclone config`: tạo remote `gdrive` (hoặc `dropbox`), rồi tạo tiếp một
remote kiểu `crypt` bọc lên nó. **Bọc mã hoá là bắt buộc** — gói sao lưu chứa `jwt-secret` và toàn
bộ hash mật khẩu, không nên để Google giữ bản đọc được.

Script và bộ hẹn giờ có sẵn ở `deploy/backup-chess-sync.sh`, `deploy/chess-backup.timer`. Nó dừng
service, chép nguội, bật lại, kiểm tra file nén, rồi đẩy lên. Có bẫy `trap` để nếu bước nén hay
tải lên hỏng thì server vẫn được bật lại — không có nó, một lần sao lưu lỗi lúc 3 giờ sáng nghĩa
là server nằm im tới khi có người phát hiện.

Với cơ sở dữ liệu 28 MB, khoảng dừng chỉ vài giây, mà các máy khách đều local-first nên vẫn gõ
được trong lúc đó. **Không cần** đổi sang Postgres thật chỉ để sao lưu mà khỏi dừng.

Mỗi tháng khôi phục thử một lần theo đúng mục trên. Một bản sao lưu chưa từng khôi phục chỉ là
một giả thuyết.

## Nếu cần quay lại trạng thái cũ

Khi bật đồng bộ, workspace cũ trong trình duyệt **không bị xoá** — ứng dụng chỉ gỡ nó khỏi danh sách hiển thị, còn cơ sở dữ liệu IndexedDB vẫn nguyên. Để khôi phục, thêm lại id workspace vào khoá `affine-local-workspace` trong localStorage rồi tải lại trang. Vì vậy nên ghi lại id workspace trước khi bật đồng bộ, và giữ dữ liệu cũ vài tuần trước khi dọn.
