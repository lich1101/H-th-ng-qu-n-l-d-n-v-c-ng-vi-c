# Client Auto Rotation QA Scenarios

Tai lieu nay dung de QA/tester test nhanh co che xoay khach hang tu dong.

## Cau hinh mac dinh dung cho bang scenario

- Cron chay luc `12:00` moi ngay, timezone `Asia/Ho_Chi_Minh`.
- `comment_stale_days = 3`
- `opportunity_stale_days = 30`
- `contract_stale_days = 90`
- `warning_days = 3`
- `daily_receive_limit = 5`
- `client_rotation_same_department_only = false`
- Loai khach dang duoc chon trong setting: `Khach hang tiem nang`
- Danh sach nhan su tham gia xoay: `A`, `B`, `C`, `D`
- `A` la nguoi dang phu trach khach trong cac scenario duoi day.
- `B`, `C`, `D` dang active, va deu nam trong danh sach xoay.
- Pham vi chon nguoi nhan la toan bo nhan su da duoc tick trong setting, khong con gioi han theo phong ban.

## Quy uoc doc bang

- Cot `Canh bao` la `ngay bat dau canh bao dau tien`.
- Neu khach van chua du dieu kien xoay, cron co the tiep tuc ban canh bao moi ngay 1 lan cho toi ngay xoay.
- Tat ca moc thoi gian hoat dong nen set dung `12:00` de tranh sai so boundary.
- Neu cot `Nguoi nhan` ghi `Khong co`, khach phai giu lai de cron ngay hom sau xu ly tiep.

## Bang scenario chuan

| ID | Input activity / setup | Canh bao dau tien | Xoay luc | Nguoi nhan | Diem can check |
| --- | --- | --- | --- | --- | --- |
| S01 | `last_comment_at = 2026-04-18 12:00`, `last_opportunity_at = 2026-03-22 12:00`, `last_contract_at = 2026-01-21 12:00`. Pool nhan: `B(hist=2, load=9, auto_today=1)`, `C(hist=4, load=5, auto_today=0)`, `D(hist=2, load=11, auto_today=1)`. | `2026-04-18 12:00` | `2026-04-21 12:00` | `B` | Case baseline. Khach du dieu kien xoay vi ca 3 moc deu het han. `B` duoc chon do `historical auto receive` it nhat, sau do den `client load`, roi `auto_today`. |
| S02 | `last_comment_at = 2026-04-10 12:00`, `last_opportunity_at = 2026-03-10 12:00`, `last_contract_at = 2026-01-24 12:00`. | `2026-04-21 12:00` | `2026-04-24 12:00` | `Khong co` tai `2026-04-21` | Contract van con trong 90 ngay nen khach chua duoc xoay. `status_label` phai cho thay dang duoc giu boi contract. |
| S03 | `last_comment_at = 2026-04-01 12:00`, `last_opportunity_at = 2026-03-24 12:00`, `last_contract_at = 2026-01-01 12:00`. | `2026-04-20 12:00` | `2026-04-23 12:00` | `Khong co` tai `2026-04-21` | Contract da het han nhung opportunity van con trong 30 ngay. Khach chua bi xoay cho toi khi opportunity cung het han. |
| S04 | `last_comment_at = 2026-04-19 12:00`, `last_opportunity_at = 2026-03-01 12:00`, `last_contract_at = 2026-01-01 12:00`. | `2026-04-19 12:00` | `2026-04-22 12:00` | `Khong co` tai `2026-04-21` | Contract va opportunity da het han, nhung comment/ghi chu moi nhat moi 2 ngay nen chua duoc xoay. |
| S05 | Giong `S01` nhung truoc `2026-04-21 12:00` da co `staff_transfer_request` o trang thai `pending` cho chinh khach nay. | `Khong canh bao khi request con pending` | `Khong xoay khi request con pending` | `Khong co` | Cron phai bo qua ca canh bao lan auto-rotation cho den khi request duoc xu ly xong. |
| S06 | Giong `S01`, nhung pool nhan la `B(hist=2, load=9, auto_today=1)` va `D(hist=2, load=6, auto_today=1)`. | `2026-04-18 12:00` | `2026-04-21 12:00` | `D` | Hai nguoi bang `historical auto receive`, he thong phai chon nguoi co `client load` nho hon. |
| S07 | Giong `S01`, nhung pool nhan la `B(hist=2, load=8, auto_today=1)` va `D(hist=2, load=8, auto_today=0)`. | `2026-04-18 12:00` | `2026-04-21 12:00` | `D` | Hai nguoi bang `historical` va bang `load`, he thong phai chon nguoi co `auto_today` it hon. |
| S08 | Giong `S01`, nhung pool nhan la `B(hist=1, load=4, auto_today=5)` va `D(hist=2, load=7, auto_today=1)`. | `2026-04-18 12:00` | `2026-04-21 12:00` | `D` | `B` dang la nguoi dep hon ve ranking nhung da cham `limit/day = 5`, nen phai bi loai va nhay sang `D`. |
| S09 | Giong `S01`, nhung `B(auto_today=5)`, `C(auto_today=5)`, `D(auto_today=5)`. | `2026-04-18 12:00` | `2026-04-21 12:00` nhung `khong chuyen duoc` | `Khong co` | Khach da du dieu kien xoay nhung tat ca nguoi nhan deu het quota trong ngay, nen khach phai duoc giu lai va cron ngay hom sau thu lai. |
| S10 | Giong `S01`. Truoc `2026-04-21 12:00`, `B` da nhan `4` khach auto trong ngay. Luc `09:30`, `B` nhan them `1` khach qua `manual transfer request accepted`. | `2026-04-18 12:00` | `2026-04-21 12:00` | `B` | Manual transfer khong duoc tinh vao `daily auto receive limit`. Sau hanh dong tay, `B` van chi bi tinh `auto_today = 4`, nen van duoc nhan them 1 khach auto de thanh `5`. |
| S11 | Giong `S01`. Truoc `2026-04-21 12:00`, `B` da nhan `4` khach auto trong ngay. Luc `10:00`, admin doi phu trach truc tiep `1` khach khac sang `B` tu man sua CRM. | `2026-04-18 12:00` | `2026-04-21 12:00` | `B` | `manual_direct_assignment` cung khong duoc tinh vao `daily auto receive limit`. He thong chi dem `action_type = auto_rotation`. |
| S12 | Giong `S01`, nhung `B` thuoc phong `Sales`, `C` thuoc phong `CSKH`, `D` thuoc phong `Backoffice`. `B(hist=2, load=9, auto_today=1)`, `C(hist=1, load=8, auto_today=0)`, `D(hist=3, load=4, auto_today=0)`. | `2026-04-18 12:00` | `2026-04-21 12:00` | `C` | Case xac nhan pham vi moi: auto-rotation duoc phep chuyen khach cho nhan su khac phong ban, mien la nguoi do da duoc chon trong setting va chua vuot quota/ngay. |
| S13 | Giong `S12`, nhung bat them `client_rotation_same_department_only = true`. `A` va `B` cung phong `Sales`, `C` va `D` khac phong. `B(hist=2, load=9, auto_today=1)`, `C(hist=1, load=8, auto_today=0)`, `D(hist=3, load=4, auto_today=0)`. | `2026-04-18 12:00` | `2026-04-21 12:00` | `B` | Case xac nhan setting moi: du `C` dep hon ve ranking, he thong van phai bo qua `C`, `D` vi khac phong ban khi bat che do chi xoay trong cung phong. |

## Checklist UI/API can doi chieu nhanh

- Chi tiet khach hang phai hien dung:
  - `days_since_comment`
  - `days_since_opportunity`
  - `days_since_contract`
  - `days_until_rotation`
  - `status_label`
- Warning notification phai co:
  - ten khach
  - so ngay chua co comment/ghi chu
  - so ngay chua co opportunity moi
  - so ngay chua co contract moi
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
