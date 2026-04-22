# Client Auto Rotation QA Scenarios

Tai lieu nay dung de QA/tester test nhanh co che xoay khach hang tu dong.

## Cau hinh mac dinh dung cho bang scenario

- Cron chay luc `12:00` moi ngay, timezone `Asia/Ho_Chi_Minh`.
- `comment_stale_days = 3`
- `opportunity_stale_days = 30`
- `contract_stale_days = 90`
- `daily_receive_limit = 5`
- `client_rotation_same_department_only = false`
- Loai khach dang duoc chon trong setting: `Khach hang tiem nang`
- Danh sach nhan su tham gia xoay: `A`, `B`, `C`, `D`
- `A` la nguoi dang phu trach khach trong cac scenario duoi day.
- `B`, `C`, `D` dang active, va deu nam trong danh sach xoay.
- Pham vi chon nguoi nhan la toan bo nhan su da duoc tick trong setting, khong con gioi han theo phong ban.
- Nhip canh bao co dinh:
  - `comment`: con `2` ngay thi nhac moi ngay
  - `opportunity`: con `14` ngay thi nhac moi `3` ngay
  - `contract`: con `45` ngay thi nhac moi `7` ngay

## Quy uoc doc bang

- Cot `Canh bao` la `ngay bat dau canh bao dau tien`.
- Neu khach van chua du dieu kien xoay, cron co the tiep tuc ban canh bao moi ngay 1 lan cho toi ngay xoay.
- Tat ca moc thoi gian hoat dong nen set dung `12:00` de tranh sai so boundary.
- Neu cot `Nguoi nhan` ghi `Khong co`, khach phai giu lai de cron ngay hom sau xu ly tiep.

## Bang scenario chuan

| ID | Input activity / setup | Canh bao dau tien | Xoay luc | Nguoi nhan | Diem can check |
| --- | --- | --- | --- | --- | --- |
| S01 | `last_comment_at = 2026-04-18 12:00`, `last_opportunity_at = 2026-03-22 12:00`, `last_contract_at = 2026-01-21 12:00`. Pool nhan: `B(hist=2, load=9, auto_today=1)`, `C(hist=4, load=5, auto_today=0)`, `D(hist=2, load=11, auto_today=1)`. | `2026-04-18 12:00` | `2026-04-21 12:00` | `B` | Case baseline theo moc cham soc. Du co co hoi va hop dong con trong han, khach van bi xoay ngay khi du `3` ngay khong co binh luan/ghi chu moi. `B` duoc chon do `historical auto receive` it nhat, sau do den `client load`, roi `auto_today`. |
| S02 | `last_comment_at = 2026-04-20 12:00`, `last_opportunity_at = 2026-03-23 12:00`, `last_contract_at = 2026-01-24 12:00`. | `2026-04-21 12:00` | `2026-04-24 12:00` | `Khong co` tai `2026-04-21` | Muc canh bao dau tien den tu moc cham soc. `status_label` phai hien `Con 3 ngay nua se cham moc cham soc` tai `2026-04-21`, sau do den `2026-04-24` thi xoay. |
| S03 | `last_comment_at = 2026-04-21 12:00`, `last_opportunity_at = 2026-03-22 12:00`, `last_contract_at = 2026-04-15 12:00`. | `2026-04-19 12:00` | `2026-04-21 12:00` | `Khong co` tai `2026-04-19` | Du co hop dong moi gan day va comment van vua cap nhat, khach van bi xoay ngay khi du `30` ngay khong co co hoi moi. Day la case xac nhan rule `opportunity` khong bi binh luan moi chan lai. |
| S04 | `last_comment_at = 2026-04-21 12:00`, `last_opportunity_at = 2026-04-20 12:00`, `last_contract_at = 2026-01-22 12:00`. | `2026-04-19 12:00` | `2026-04-22 12:00` | `Khong co` tai `2026-04-19` | Du co binh luan va co hoi moi sat ngay, khach van bi xoay khi du `90` ngay khong co hop dong moi. Day la case xac nhan rule `contract` co uu tien cao nhat va cham moc nay thi chac chan chuyen. |
| S05 | Giong `S01` nhung truoc `2026-04-21 12:00` da co `staff_transfer_request` o trang thai `pending` cho chinh khach nay. | `Khong canh bao khi request con pending` | `Khong xoay khi request con pending` | `Khong co` | Cron phai bo qua ca canh bao lan auto-rotation cho den khi request duoc xu ly xong. |
| S06 | Giong `S01`, nhung pool nhan la `B(hist=2, load=9, auto_today=1)` va `D(hist=2, load=6, auto_today=1)`. | `2026-04-18 12:00` | `2026-04-21 12:00` | `D` | Hai nguoi bang `historical auto receive`, he thong phai chon nguoi co `client load` nho hon. |
| S07 | Giong `S01`, nhung pool nhan la `B(hist=2, load=8, auto_today=1)` va `D(hist=2, load=8, auto_today=0)`. | `2026-04-18 12:00` | `2026-04-21 12:00` | `D` | Hai nguoi bang `historical` va bang `load`, he thong phai chon nguoi co `auto_today` it hon. |
| S08 | Giong `S01`, nhung pool nhan la `B(hist=1, load=4, auto_today=5)` va `D(hist=2, load=7, auto_today=1)`. | `2026-04-18 12:00` | `2026-04-21 12:00` | `D` | `B` dang la nguoi dep hon ve ranking nhung da cham `limit/day = 5`, nen phai bi loai va nhay sang `D`. |
| S09 | Giong `S01`, nhung `B(auto_today=5)`, `C(auto_today=5)`, `D(auto_today=5)`. | `2026-04-18 12:00` | `2026-04-21 12:00` nhung `khong chuyen duoc` | `Khong co` | Khach da du dieu kien xoay nhung tat ca nguoi nhan deu het quota trong ngay, nen khach phai duoc giu lai va cron ngay hom sau thu lai. |
| S10 | Giong `S01`. Truoc `2026-04-21 12:00`, `B` da nhan `4` khach auto trong ngay. Luc `09:30`, `B` nhan them `1` khach qua `manual transfer request accepted`. | `2026-04-18 12:00` | `2026-04-21 12:00` | `B` | Manual transfer khong duoc tinh vao `daily auto receive limit`. Sau hanh dong tay, `B` van chi bi tinh `auto_today = 4`, nen van duoc nhan them 1 khach auto de thanh `5`. |
| S11 | Giong `S01`. Truoc `2026-04-21 12:00`, `B` da nhan `4` khach auto trong ngay. Luc `10:00`, admin doi phu trach truc tiep `1` khach khac sang `B` tu man sua CRM. | `2026-04-18 12:00` | `2026-04-21 12:00` | `B` | `manual_direct_assignment` cung khong duoc tinh vao `daily auto receive limit`. He thong chi dem `action_type = auto_rotation`. |
| S12 | Giong `S01`, nhung `B` thuoc phong `Sales`, `C` thuoc phong `CSKH`, `D` thuoc phong `Backoffice`. `B(hist=2, load=9, auto_today=1)`, `C(hist=1, load=8, auto_today=0)`, `D(hist=3, load=4, auto_today=0)`. | `2026-04-18 12:00` | `2026-04-21 12:00` | `C` | Case xac nhan pham vi moi: auto-rotation duoc phep chuyen khach cho nhan su khac phong ban, mien la nguoi do da duoc chon trong setting va chua vuot quota/ngay. |
| S13 | Giong `S12`, nhung bat them `client_rotation_same_department_only = true`. `A` va `B` cung phong `Sales`, `C` va `D` khac phong. `B(hist=2, load=9, auto_today=1)`, `C(hist=1, load=8, auto_today=0)`, `D(hist=3, load=4, auto_today=0)`. | `2026-04-18 12:00` | `2026-04-21 12:00` | `B` | Case xac nhan setting moi: du `C` dep hon ve ranking, he thong van phai bo qua `C`, `D` vi khac phong ban khi bat che do chi xoay trong cung phong. |
| S14 | `care_rotation_reset_at = 2026-01-01 12:00`, `last_comment_at = 2026-01-02 12:00`, `last_opportunity_at = 2026-01-10 12:00`, `last_contract_at = 2026-04-20 12:00`. | `2026-04-20 12:00` | `2026-04-23 12:00` | `Khong co` tai `2026-04-20` | Hop dong moi phai reset lai toan bo moc dem. Tai `2026-04-21`, `days_since_comment`, `days_since_opportunity`, `days_since_contract` deu phai tinh tu `2026-04-20 12:00` thay vi tinh tu comment/opportunity cu. |
| S15 | Giong `S01`, nhung khach vua duoc auto-rotate luc `2026-04-21 12:00`. Sau do khong co them hoat dong nao moi. | `2026-04-21 12:00` | `2026-04-24 12:00` | `Theo pool cua nguoi nhan moi` | Sau khi doi nguoi phu trach thanh cong, bo dem phai reset tu `2026-04-21 12:00`. Neu 3 ngay tiep theo van khong co binh luan/ghi chu moi thi khach co the vao vong xoay tiep theo rule moi. |
| S16 | `care_rotation_reset_at = 2026-04-01 12:00`, `last_comment_at = 2026-04-05 12:00`, `last_opportunity_at = 2026-04-20 12:00`, `last_contract_at = 2026-03-01 12:00`. | `2026-04-20 12:00` | `2026-04-23 12:00` | `Khong co` tai `2026-04-20` | Co hoi moi phai reset ca moc `opportunity` va moc `comment`. Tai `2026-04-21`, `days_since_opportunity = 1` va `days_since_comment` cung phai = `1`, du comment cu nhat la `2026-04-05`. |
| S17 | `comment_stale_days = 3`, `last_comment_at = 2026-04-20 12:00`, `last_opportunity_at = 2026-04-20 12:00`, `last_contract_at = 2026-04-20 12:00`. | `2026-04-21 12:00` | `2026-04-23 12:00` | `Khong co` tai `2026-04-21` | Nhac cham soc phai bat dau khi con `2` ngay va lap lai moi ngay. Warning can co vao `2026-04-21` (con 2 ngay) va `2026-04-22` (con 1 ngay), sau do `2026-04-23` thi vao dien xoay. |
| S18 | `opportunity_stale_days = 30`, `last_opportunity_at = 2026-04-06 12:00`, `last_comment_at = 2026-04-06 12:00`, `last_contract_at = 2026-04-06 12:00`. | `2026-04-22 12:00` | `2026-05-06 12:00` | `Khong co` tai `2026-04-22` | Nhac co hoi phai bat dau khi con `14` ngay va lap lai moi `3` ngay: `2026-04-22`, `2026-04-25`, `2026-04-28`, `2026-05-01`, `2026-05-04`. |
| S19 | `contract_stale_days = 90`, `last_contract_at = 2026-01-22 12:00`, `last_opportunity_at = 2026-01-22 12:00`, `last_comment_at = 2026-01-22 12:00`. | `2026-03-08 12:00` | `2026-04-22 12:00` | `Khong co` tai `2026-03-08` | Nhac hop dong phai bat dau khi con `45` ngay va lap lai moi `7` ngay: `2026-03-08`, `2026-03-15`, `2026-03-22`, `2026-03-29`, `2026-04-05`, `2026-04-12`, `2026-04-19`. |

## Checklist UI/API can doi chieu nhanh

- Chi tiet khach hang phai hien dung:
  - `days_since_comment`
  - `days_since_opportunity`
  - `days_since_contract`
  - `days_until_rotation`
  - `status_label`
  - `trigger_type`
  - `rotation_anchor_at`
  - `effective_comment_at`
  - `effective_opportunity_at`
  - `effective_contract_at`
- Warning notification phai co:
  - ten khach
  - danh sach cac moc dang den lich nhac trong ngay (`comment` / `opportunity` / `contract`)
  - so ngay chua co comment/ghi chu
  - so ngay chua co opportunity moi
  - so ngay chua co contract moi
- Nhip nhac can dung:
  - `comment`: con `2` ngay thi nhac moi ngay
  - `opportunity`: con `14` ngay thi nhac moi `3` ngay
  - `contract`: con `45` ngay thi nhac moi `7` ngay
- Khi auto-rotation thanh cong:
  - nguoi mat khach nhan thong bao `khach da bi dieu chuyen`
  - nguoi nhan khach nhan thong bao `vua nhan them khach`
  - khong hien ten nguoi chuyen o 2 dau thong bao
- `rotation_history` chi admin/administrator moi thay.
- `manual_transfer_request` va `manual_direct_assignment` phai reset moc dem cho chinh khach do, nhung khong duoc cong vao quota auto/day cua nguoi nhan.

## Note cho QA neu muon test random tie-break

Neu 2 nguoi nhan cung bang nhau o ca 3 tieu chi:

- `historical auto receive`
- `client load`
- `auto receive today`

thi he thong moi random trong nhom dong hang. Scenario random nen test bang cach lap lai tren nhieu client, khong assert cung 1 user co dinh.
