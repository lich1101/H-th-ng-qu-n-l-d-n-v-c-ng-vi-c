# Client Auto Rotation QA Scenarios

Tai lieu nay dung de QA/test nhanh co che xoay khach hang theo logic `ngay du kien xoay lon nhat`.

## Cau hinh mac dinh dung cho bang scenario

- Cron chay luc `12:00` moi ngay, timezone `Asia/Ho_Chi_Minh`.
- `comment_stale_days = 3`
- `opportunity_stale_days = 30`
- `contract_stale_days = 90`
- `daily_receive_limit = 5` cho cron auto-rotation
- `pool_claim_daily_limit = 5` cho nhan thu cong trong kho so
- `client_rotation_scope_mode = global_staff`
- Loai khach dang duoc chon trong setting: `Khach hang tiem nang`
- Danh sach nhan su tham gia xoay: `A`, `B`, `C`, `D`
- `A` la nguoi dang phu trach khach trong cac scenario duoi day.

## Nguyen tac nghiep vu can nho

He thong khong dem tuan tu 3 tang nua. Moi khach chi co **1 ngay du kien xoay**:

`projected_rotation_at = max(`
`care_rotation_reset_at|created_at + comment_stale_days,`
`last_comment_at + comment_stale_days,`
`last_opportunity_at + opportunity_stale_days,`
`last_contract_effective_at + contract_stale_days`
`)`

Trong do:

- `last_contract_effective_at` uu tien `start_date`, neu hop dong khong co `start_date` thi fallback ve `approved_at`, `signed_at`, roi `created_at`.
- `last_opportunity_at` lay theo `created_at` cua co hoi moi nhat.
- `last_comment_at` lay theo ghi chu cham soc / comment moi nhat.
- Neu mot moc moi cong them ma **khong vuot qua** `projected_rotation_at` hien tai thi khong doi ngay xoay.
- Neu `now >= projected_rotation_at` thi khach vao dien xoay.

## Quy tac canh bao

He thong chi canh bao theo **moc dang giu ngay xoay xa nhat**:

- Neu moc dang giu la `contract`: con `45` ngay thi nhac moi `7` ngay.
- Neu moc dang giu la `opportunity`: con `14` ngay thi nhac moi `3` ngay.
- Neu moc dang giu la `comment` hoac `moc reset / tao`: con `2` ngay thi nhac moi ngay.

## Quy uoc doc bang

- Cot `Canh bao dau tien` la ngay warning dau tien theo moc dang giu ngay xoay.
- Cot `Xoay luc` la ngay cron bat dau duoc phep dieu chuyen that su.
- Tat ca moc thoi gian hoat dong nen set dung `12:00` de tranh sai so boundary.
- Neu cot `Nguoi nhan` ghi `Vao kho so`, cron phai dua khach vao pool ngay tai lan chay do.

## Bang scenario chuan

| ID | Input activity / setup | Moc dang giu ngay xoay | Canh bao dau tien | Xoay luc | Nguoi nhan | Diem can check |
| --- | --- | --- | --- | --- | --- | --- |
| S01 | `care_rotation_reset_at = 2026-05-01 12:00`. Khong co hop dong, co hoi, binh luan. | `reset + 3 ngay = 2026-05-04 12:00` | `2026-05-02 12:00` | `2026-05-04 12:00` | Theo ranking | Case baseline. Khong co activity nao giu moc xa hon, nen ngay xoay = mốc reset + nguong comment. |
| S02 | `care_rotation_reset_at = 2026-05-01 12:00`, `last_comment_at = 2026-05-02 12:00`. Khong co co hoi, hop dong. | `comment + 3 ngay = 2026-05-05 12:00` | `2026-05-03 12:00` | `2026-05-05 12:00` | Theo ranking | Binh luan moi nhat day moc xoay ra xa hon baseline. |
| S03 | `care_rotation_reset_at = 2026-05-01 12:00`, `last_opportunity_at = 2026-05-10 12:00`, khong co hop dong, binh luan cu hon. | `opportunity + 30 ngay = 2026-06-09 12:00` | `2026-05-26 12:00` | `2026-06-09 12:00` | Theo ranking | Co hoi moi day moc xoay xa hon binh luan / reset, nen warning chuyen sang lich cua co hoi. |
| S04 | `care_rotation_reset_at = 2026-05-01 12:00`, `last_opportunity_at = 2026-05-10 12:00`, `last_contract_effective_at = 2026-05-15 12:00`. | `contract + 90 ngay = 2026-08-13 12:00` | `2026-06-29 12:00` | `2026-08-13 12:00` | Theo ranking | Hop dong hieu luc moi nhat phai de moc xoay xa nhat va warning chuyen sang lich hop dong. |
| S05 | `care_rotation_reset_at = 2026-05-01 12:00`, `last_opportunity_at = 2026-05-10 12:00`, `last_comment_at = 2026-05-20 12:00`. | `opportunity + 30 ngay = 2026-06-09 12:00` | `2026-05-26 12:00` | `2026-06-09 12:00` | Theo ranking | Comment moi chi tao moc `2026-05-23`, nho hon moc co hoi `2026-06-09`, nen he thong phai giu nguyen ngay xoay theo co hoi. |
| S06 | `care_rotation_reset_at = 2026-05-01 12:00`, `last_contract_effective_at = 2026-02-01 12:00`, `last_opportunity_at = 2026-05-20 12:00`, `last_comment_at = 2026-05-25 12:00`. | `opportunity + 30 ngay = 2026-06-19 12:00` | `2026-06-05 12:00` | `2026-06-19 12:00` | Theo ranking | Hop dong cu da het tac dung bao ve. Co hoi moi nhat dang giu moc xa hon comment. |
| S07 | Giong `S04`, nhung tat ca nguoi nhan hop le deu da het `daily_receive_limit`. | `contract + 90 ngay = 2026-08-13 12:00` | `2026-06-29 12:00` | `2026-08-13 12:00` | `Vao kho so` | Den han xoay ma khong con nguoi nhan hop le thi phai dua vao kho so ngay tai lan cron do. |
| S08 | Khach da vao `kho so` luc `2026-08-13 12:00`. `C` bam `Nhan khach` luc `2026-08-13 14:00`. | `claim reset + 3 ngay = 2026-08-16 14:00` neu khong co them activity | `2026-08-14 12:00` | `2026-08-16 14:00` | `C` | Sau khi nhan tu kho so, `care_rotation_reset_at` phai reset theo thoi diem nhan, khach tro lai CRM thuong cua `C`, va chu ky xoay bat dau lai tu mốc moi. |
| S09 | Giong `S04`, nhung co `pending transfer request` ton tai tai luc cron. | Khong ap dung | Khong canh bao | Khong xoay | Khong co | Pending transfer phai chan ca warning lan auto-rotation cho den khi request duoc xu ly xong. |
| S10 | Giong `S01`, nhung `A` dang bat mode `chi nhan vao`. | `reset + 3 ngay` | Khong canh bao | Khong xoay | Khong co | Khach cua nhan su dang `chi nhan vao` khong duoc dua vao hang cho xoay. |

## Checklist UI/API can doi chieu nhanh

- Chi tiet khach hang phai hien dung:
  - `rotation_anchor_at`
  - `rotation_anchor_label`
  - `projected_rotation_at`
  - `active_rule_type`
  - `active_rule_source`
  - `active_rule_label`
  - `active_rule_due_at`
  - `days_until_rotation`
  - `trigger_type`
  - `trigger_source`
  - `trigger_threshold_days`
  - `trigger_overdue_days`
  - `last_comment_at`
  - `last_opportunity_at`
  - `last_contract_at`
- UI phai hien:
  - activity nao chua co thi hien `Chua co`
  - moc nao dang giu ngay xoay thi hien ten moc do ro rang
  - `Ngay xoay du kien` phai bang dung `projected_rotation_at`
- Warning notification phai co:
  - ten khach
  - moc dang giu ngay xoay hien tai
  - so ngay con lai den `projected_rotation_at`
- Khi auto-rotation thanh cong:
  - nguoi mat khach nhan thong bao `khach da bi dieu chuyen`
  - nguoi nhan khach nhan thong bao `vua nhan them khach`
  - khong hien ten nguoi chuyen o 2 dau thong bao
- Khi dua vao `kho so`:
  - khach bien mat khoi CRM thuong
  - trong `kho so` chi hien ten khach va nut nhan khach
  - sau khi nhan, `care_rotation_reset_at` reset theo thoi diem nhan
- `manual_transfer_request` va `manual_direct_assignment` phai reset moc dem cho chinh khach do, nhung khong duoc cong vao quota cron/day hoac quota kho so/day cua nguoi nhan.
- Quota cron/day chi tinh `auto_rotation`.
- Quota kho so/day chi tinh `rotation_pool_claim`.
