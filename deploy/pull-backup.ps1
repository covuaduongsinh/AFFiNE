# Kéo bản sao lưu mới nhất từ VPS về máy này.
#
# Việc sao lưu đã tự động trên VPS rồi — mỗi đêm 3:15 nó dừng service, chép
# nguội, bật lại. Script này chỉ làm nốt bước còn thiếu: mang bản sao ra khỏi
# chính cái máy đang giữ dữ liệu gốc. Một bản sao nằm cùng chỗ với bản gốc thì
# không phải bản sao lưu.
#
# Chạy:  .\pull-backup.ps1
# Hoặc:  .\pull-backup.ps1 -Dest "D:\backup\affine" -Keep 12

param(
  [string]$VpsUser = 'root',
  [string]$VpsHost = '217.15.160.118',
  [string]$Dest    = "$env:USERPROFILE\Documents\affine-backup",
  # Giữ bao nhiêu bản trên máy này. Mỗi bản khoảng 3 MB.
  [int]$Keep       = 12
)

$ErrorActionPreference = 'Stop'
$target = "$VpsUser@$VpsHost"

New-Item -ItemType Directory -Force -Path $Dest | Out-Null

Write-Host "Đang hỏi VPS bản mới nhất..." -ForegroundColor Cyan
$remote = (ssh $target "ls -t /var/backups/chess-sync/*.tar.zst 2>/dev/null | head -1").Trim()
if (-not $remote) {
  throw "Không thấy bản sao lưu nào trên VPS. Kiểm tra: ssh $target 'systemctl status chess-backup.timer'"
}

$name  = Split-Path $remote -Leaf
$local = Join-Path $Dest $name

if (Test-Path $local) {
  Write-Host "Đã có sẵn: $name" -ForegroundColor Yellow
} else {
  Write-Host "Đang tải $name ..." -ForegroundColor Cyan
  scp "${target}:${remote}" $local
}

# Đối chiếu vân tay hai đầu. Một file tải hỏng giữa chừng trông y hệt một file
# tốt cho tới ngày cần khôi phục — và đó là ngày tệ nhất để phát hiện.
Write-Host "Đang đối chiếu vân tay..." -ForegroundColor Cyan
$remoteHash = (ssh $target "sha256sum '$remote' | cut -d' ' -f1").Trim()
$localHash  = (Get-FileHash -Algorithm SHA256 $local).Hash.ToLower()

if ($remoteHash -ne $localHash) {
  Remove-Item $local -Force
  throw "VÂN TAY KHÔNG KHỚP — file tải về đã hỏng, đã xoá. Chạy lại script."
}

$sizeMB = [math]::Round((Get-Item $local).Length / 1MB, 1)
Write-Host "ĐẠT  $name  ($sizeMB MB)  vân tay khớp" -ForegroundColor Green
Write-Host "     $local"

# Dọn bản cũ, giữ lại $Keep bản gần nhất.
$all = Get-ChildItem $Dest -Filter 'chess-sync-*.tar.zst' | Sort-Object Name -Descending
if ($all.Count -gt $Keep) {
  $all | Select-Object -Skip $Keep | ForEach-Object {
    Write-Host "Xoá bản cũ: $($_.Name)" -ForegroundColor DarkGray
    Remove-Item $_.FullName -Force
  }
}

# Cảnh báo khi bản mới nhất đã cũ — nghĩa là job trên VPS có thể đã hỏng.
# "chess-sync-" là 11 ký tự, nên dấu thời gian bắt đầu ở vị trí 11.
$stamp = [datetime]::ParseExact($name.Substring(11, 15), 'yyyyMMddTHHmmss', $null)
$age   = (Get-Date).ToUniversalTime() - $stamp
if ($age.TotalDays -gt 2) {
  Write-Host ""
  Write-Host "CẢNH BÁO: bản mới nhất đã $([math]::Round($age.TotalDays)) ngày tuổi." -ForegroundColor Red
  Write-Host "Job hằng đêm trên VPS có thể đã hỏng. Kiểm tra:" -ForegroundColor Red
  Write-Host "  ssh $target 'journalctl -u chess-backup.service -n 20'"
}

Write-Host ""
Write-Host "Tổng cộng $($all.Count) bản trong $Dest" -ForegroundColor Cyan
