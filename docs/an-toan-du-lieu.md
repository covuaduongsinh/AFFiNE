# An toàn dữ liệu cho AFFiNE cờ vua

Trước khi nạp giáo án hàng loạt, dữ liệu cần thoát khỏi tình trạng "chỉ nằm trong trình duyệt một máy". Tài liệu này mô tả hai lớp bảo vệ đã dựng và việc cần làm định kỳ.

## Hai lớp bảo vệ

**Lớp 1 — trong ứng dụng.** Khi mở app, trang xin trình duyệt cấp quyền lưu trữ bền (`navigator.storage.persist()`), tức là trình duyệt từ bỏ quyền tự xoá dữ liệu khi thiếu đĩa. Ngoài ra có nút **Full Backup** ở hai chỗ: banner cảnh báo phía trên, và Settings → workspace → Storage. Nút này tải về một file `.bs.zip` chứa toàn bộ tài liệu kèm ảnh.

Chrome quyết định cấp quyền lưu trữ bền dựa trên mức độ gắn bó với site. Nếu console báo `denied`, hãy bookmark `localhost:8080` hoặc cài nó thành ứng dụng (biểu tượng cài đặt trên thanh địa chỉ), rồi tải lại trang.

**Lớp 2 — server tự vận hành.** Một server AFFiNE chạy bằng Docker ở cổng 3010, dữ liệu nằm trong Postgres thay vì trình duyệt. Workspace đã bật đồng bộ sẽ tự đẩy lên server, và mở được từ máy khác hay trình duyệt khác.

## Khởi động server

```powershell
cd d:\code\AFFiNE\.docker\selfhost
docker compose up -d
```

Lần đầu tiên với thư mục `data/` trống, Postgres bị báo unhealthy vì khởi tạo lâu hơn thời gian chờ của healthcheck — chỉ cần chạy lại `docker compose up -d` là xong.

Ứng dụng web ở `localhost:8080` tự tìm thấy server này (`scripts/serve-dist.mjs` chuyển tiếp `/api`, `/graphql`, `/socket.io` sang cổng 3010). Trang quản trị thì phải mở thẳng: `http://localhost:3010/admin/setup`.

## Giới hạn cần biết của file .bs.zip

File `.bs.zip` chứa nội dung tài liệu, tiêu đề và toàn bộ ảnh đính kèm — nhưng **không** chứa cây thư mục ở sidebar, tag và mục yêu thích. Khi nhập lại (Import → Snapshot), tài liệu về đủ nhưng phải sắp xếp lại thư mục. Đây là bản sao lưu nội dung, không phải bản sao lưu nguyên trạng.

Bản sao lưu nguyên trạng là thư mục `data/` của server, vì nó giữ cả cấu trúc lẫn nội dung.

## Việc định kỳ

Hàng tuần, hoặc sau mỗi đợt soạn bài lớn:

1. Settings → workspace → Storage → **Full Backup**, cất file `.bs.zip` ra nơi khác máy này (ổ cloud hoặc USB).
2. Sao lưu dữ liệu server:

   ```powershell
   cd d:\code\AFFiNE\.docker\selfhost
   docker compose down
   Copy-Item -Recurse data "D:\backup\affine-data-$(Get-Date -Format yyyyMMdd)"
   docker compose up -d
   ```

   Dừng stack trước khi chép để Postgres không bị chép giữa chừng. Nếu không muốn dừng, dùng bản kết xuất cơ sở dữ liệu thay thế:

   ```powershell
   docker compose exec postgres pg_dump -U affine affine > "D:\backup\affine-$(Get-Date -Format yyyyMMdd).sql"
   ```

## Nếu cần quay lại trạng thái cũ

Khi bật đồng bộ, workspace cũ trong trình duyệt **không bị xoá** — ứng dụng chỉ gỡ nó khỏi danh sách hiển thị, còn cơ sở dữ liệu IndexedDB vẫn nguyên. Để khôi phục, thêm lại id workspace vào khoá `affine-local-workspace` trong localStorage rồi tải lại trang. Vì vậy nên ghi lại id workspace trước khi bật đồng bộ, và giữ dữ liệu cũ vài tuần trước khi dọn.
