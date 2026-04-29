# Client Auto Rotation QA Scenarios

Tai lieu nay dung de QA/tester test nhanh co che xoay khach hang tu dong theo logic moi.

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
- `B`, `C`, `D` dang active va deu nam trong danh sach xoay.

## Nguyen tac nghiep vu can nho

He thong khong dem song song 3 moc nua. He thong dem tuan tu theo 3 tang:

1. Tang `hop dong`: chi canh bao va theo doi moc hop dong truoc.
2. Chi khi tang hop dong da qua han, he thong moi bat dau dem tang `co hoi`.
3. Chi khi tang co hoi cung da qua han, he thong moi bat dau dem tang `binh luan / ghi chu`.
4. Khach chi vao dien can chuyen nguoi phu trach khi tang cuoi cung la `binh luan / ghi chu` cung qua han.

Moc dem cua tung tang:

- Tang `hop dong`: tinh tu `max(last_contract_at, care_rotation_reset_at)`.
- Tang `co hoi`: chi bat dau sau khi tang hop dong qua han, tinh tu `max(last_opportunity_at, ngay qua han tang hop dong)`.
- Tang `binh luan`: chi bat dau sau khi tang co hoi qua han, tinh tu `max(last_comment_at, ngay qua han tang co hoi)`.

Canh bao cung chi bam theo tang hien tai:

- Tang `contract`: con `45` ngay thi nhac moi `7` ngay.
- Tang `opportunity`: con `14` ngay thi nhac moi `3` ngay.
- Tang `comment`: con `2` ngay thi nhac moi ngay.

Neu khach du dieu kien xoay ma khong con nguoi nhan hop le:

- khach khong o lai CRM thuong de cron ngay hom sau thu lai nua
- khach se duoc dua vao `kho so`
- trong `kho so` chi hien ten khach
- nhan su bam `Nhan khach` thi moi tro thanh nguoi phu trach va moi duoc nhin day du thong tin

## Quy uoc doc bang

- Cot `Canh bao dau tien` la ngay nhac dau tien cua tang dang hoat dong.
- Cot `Xoay luc` la ngay du dieu kien chuyen nguoi phu trach that su.
- Tat ca moc thoi gian hoat dong nen set dung `12:00` de tranh sai so boundary.
- Neu cot `Nguoi nhan` ghi `Vao kho so`, cron phai dua khach vao pool ngay tai lan chay do.

## Bang scenario chuan

| ID | Input activity / setup | Canh bao dau tien | Xoay luc | Nguoi nhan | Diem can check |
| --- | --- | --- | --- | --- | --- |
| S01 | `care_rotation_reset_at = 2026-01-01 12:00`, `last_contract_at = 2026-01-25 12:00`, `last_opportunity_at = 2026-02-10 12:00`, `last_comment_at = 2026-02-12 12:00`. Pool nhan: `B(hist=2, load=9, auto_today=1)`, `C(hist=4, load=5, auto_today=0)`, `D(hist=2, load=11, auto_today=1)`. | `2026-03-11 12:00` | `2026-05-28 12:00` | `B` | Baseline theo co che tuan tu. Tang hop dong qua han luc `2026-04-25`, tang co hoi bat dau tu ngay do va qua han luc `2026-05-25`, tang binh luan bat dau tu `2026-05-25` va qua han luc `2026-05-28`. |
| S02 | `last_contract_at = 2026-01-21 12:00`, `last_opportunity_at = 2026-04-30 12:00`, `last_comment_at = 2026-02-01 12:00`. | `2026-03-07 12:00` | `2026-06-02 12:00` | `Khong co` tai `2026-06-02` | Tang hop dong qua han luc `2026-04-21`. Vi co hoi moi xuat hien sau khi da qua tang hop dong, tang co hoi phai reset theo `2026-04-30` va qua han luc `2026-05-30`. Tang binh luan chi duoc bat dau tu `2026-05-30`, sau 3 ngay moi du dieu kien xoay. |
| S03 | `last_contract_at = 2026-01-21 12:00`, `last_opportunity_at = 2026-02-01 12:00`, `last_comment_at = 2026-05-22 12:00`. | `2026-03-07 12:00` | `2026-05-25 12:00` | `Khong co` tai `2026-05-25` | Tang hop dong qua han luc `2026-04-21`, tang co hoi qua han luc `2026-05-21`, tang binh luan bat dau tu `2026-05-22` vi co comment moi sau khi da mo tang cuoi. |
| S04 | Giong `S03`, nhung co them comment moi vao `2026-05-24 12:00`, `2026-05-26 12:00`, `2026-05-28 12:00`. | `2026-03-07 12:00` | `Khong xoay` khi comment van duoc cap nhat deu | `Khong co` | Day la case xac nhan mot khach co the nam mai voi 1 nhan su neu tang cuoi cung luon duoc reset bang comment moi. Moi lan co comment moi sau khi da vao tang 3, he thong phai day moc xoay ra them `3` ngay nua. |
| S05 | Giong `S01`, nhung truoc luc den han xoay da co `staff_transfer_request` trang thai `pending` cho chinh khach nay. | `Khong canh bao khi request con pending` | `Khong xoay khi request con pending` | `Khong co` | Cron phai bo qua ca warning lan auto-rotation cho den khi request duoc xu ly xong. |
| S06 | Giong `S01`, nhung pool nhan la `B(hist=2, load=9, auto_today=1)` va `D(hist=2, load=6, auto_today=1)`. | `2026-03-11 12:00` | `2026-05-28 12:00` | `D` | Hai nguoi bang `historical auto receive`, he thong phai chon nguoi co `client load` nho hon. |
| S07 | Giong `S01`, nhung `B(auto_today=5)`, `C(auto_today=5)`, `D(auto_today=5)`. | `2026-03-11 12:00` | `2026-05-28 12:00` | `Vao kho so` | Khi tat ca nguoi nhan da het quota auto trong ngay, khach phai vao kho so ngay lap tuc. Khong duoc de lai CRM thuong de cron ngay sau xu ly tiep. |
| S08 | Giong `S01`. Truoc lan cron xoay, `B` da nhan `4` khach qua auto-rotation trong ngay. Luc `09:30`, `B` nhan them `1` khach qua `manual transfer request accepted` va `1` khach tu kho so. | `2026-03-11 12:00` | `2026-05-28 12:00` | `B` | Manual transfer va nhan tu kho so khong duoc cong vao `daily_receive_limit` cua cron. Neu truoc do `auto_today` cua `B` la `4` thi `B` van duoc nhan them 1 khach tu cron. |
| S09 | Giong `S01`, nhung `client_rotation_scope_mode = same_department`. `A` va `B` cung phong `Sales`, `C` va `D` khac phong. | `2026-03-11 12:00` | `2026-05-28 12:00` | `B` | Bat che do cung phong ban thi chi duoc xet nguoi nhan trong cung phong voi `A`. |
| S10 | Giong `S01`, nhung `client_rotation_scope_mode = balanced_department`. `A` thuoc `Sales`, `B` thuoc `SEO`, `C` va `D` thuoc `Content`. Chi so phong ban: `SEO(hist=1, load=12, auto_today=1)`, `Content(hist=1, load=7, auto_today=0)`. Trong phong `Content`: `C(hist=2, load=4, auto_today=0)`, `D(hist=1, load=3, auto_today=0)`. | `2026-03-11 12:00` | `2026-05-28 12:00` | `D` | He thong phai chon phong `Content` truoc vi can bang cap phong ban tot hon `SEO`, sau do moi chia deu tiep cho nhan su trong phong `Content`. |
| S11 | Giong `S01`, nhung `A` bat mode `chi nhan vao`. | `Khong canh bao` | `Khong xoay` | `Khong co` | Khach cua `A` van o trong CRM thuong nhung khong duoc vao warning queue va khong duoc vao hang cho xoay. |
| S12 | Giong `S01`, nhung `B` bat mode `chi cho di`, `C(hist=3, load=8, auto_today=0)`, `D(hist=4, load=5, auto_today=0)`. | `2026-03-11 12:00` | `2026-05-28 12:00` | `C` | `B` phai bi loai khoi pool nhan vi dang `chi cho di`. |
| S13 | Giong `S01`, nhung `B` bat dong thoi `chi nhan vao` va `chi cho di`. | `2026-03-11 12:00` | `2026-05-28 12:00` | `B` neu `B` dang dep nhat | Bat ca 2 co thi he thong phai coi nhu `binh thuong`, tuc van co the nhan vao va cung co the bi xoay ra ve sau. |
| S14 | Khach da vao `kho so` luc `2026-05-28 12:00`. Luc `2026-05-28 14:00`, `C` bam `Nhan khach`. | `Khong ap dung` | `2026-05-28 14:00` | `C` | Sau khi nhan tu kho so, `assigned_staff_id` phai doi sang `C`, `is_in_rotation_pool = false`, `care_rotation_reset_at` reset theo thoi diem nhan, nhom cham soc cu phai duoc don lai de chi con nguoi vua nhan, va khach moi hien lai day du trong CRM cua `C`. |
| S14b | Giong `S14`, nhung `C` da co `pool_claim_today=5` truoc khi bam nhan kho so. | `Khong ap dung` | `Khong duoc nhan` | `Khong co` | Nut nhan phai tra loi het quota nhan kho so/ngay. Khach van nam trong kho so de nhan su khac con quota nhan. |
| S15 | `last_contract_at = 2026-04-20 12:00`, `last_opportunity_at = 2026-01-10 12:00`, `last_comment_at = 2026-01-12 12:00`. | `2026-06-04 12:00` | `2026-08-21 12:00` | `Khong co` tai `2026-08-21` | Tang hop dong chua qua han cho toi `2026-07-19`, nen du co hoi va comment da cu tu truoc, he thong van chua duoc dem tang 2 va tang 3. Tang co hoi chi bat dau tu `2026-07-19` va qua han luc `2026-08-18`; tang binh luan chi bat dau tu `2026-08-18` va qua han luc `2026-08-21`. |
| S16 | `care_rotation_reset_at = 2026-05-28 12:00` sau khi khach vua duoc auto-rotate. Khong co them hoat dong nao moi. | `2026-07-12 12:00` | `2026-09-28 12:00` | `Theo ranking cua nguoi nhan moi` | Sau moi lan doi phu trach thanh cong, chuoi dem phai bat dau lai tu `care_rotation_reset_at` moi. Tang hop dong qua han luc `2026-08-26`, tang co hoi qua han luc `2026-09-25`, tang binh luan qua han luc `2026-09-28`. |

## Checklist UI/API can doi chieu nhanh

- Chi tiet khach hang phai hien dung:
  - `days_since_contract`
  - `days_since_opportunity`
  - `days_since_comment`
  - `days_until_rotation`
  - `active_stage_type`
  - `active_stage_remaining_days`
  - `opportunity_stage_started`
  - `comment_stage_started`
  - `status_label`
  - `trigger_type`
  - `rotation_anchor_at`
  - `effective_contract_at`
  - `effective_opportunity_at`
  - `effective_comment_at`
  - `current_owner_rotation_mode`
  - `current_owner_rotation_mode_label`
  - `thresholds.scope_mode`
- UI phai hien:
  - tang chua bat dau thi hien `Chua dem` / `Chua bat dau`
  - tang dang hoat dong thi hien so ngay cua tang do
  - tong `days_until_rotation` van la tong so ngay con lai cho den luc vao dien xoay that su
- Warning notification phai co:
  - ten khach
  - tang dang hoat dong hien tai
  - so ngay con lai cua tang dang hoat dong
  - khong duoc nhac dong thoi ca 3 tang trong cung 1 lan warning
- Khi auto-rotation thanh cong:
  - nguoi mat khach nhan thong bao `khach da bi dieu chuyen`
  - nguoi nhan khach nhan thong bao `vua nhan them khach`
  - khong hien ten nguoi chuyen o 2 dau thong bao
- Khi dua vao `kho so`:
  - khach bien mat khoi CRM thuong
  - trong `kho so` chi hien ten khach va nut nhan khach
  - sau khi nhan, lich su dieu chuyen phai co action `Nhan khach tu kho so`
- `rotation_history` chi admin/administrator moi thay.
- `manual_transfer_request` va `manual_direct_assignment` phai reset moc dem cho chinh khach do, nhung khong duoc cong vao quota cron/day hoac quota kho so/day cua nguoi nhan.
- Quota cron/day chi tinh `auto_rotation`.
- Quota kho so/day chi tinh `rotation_pool_claim`.

## Note cho QA neu muon test random tie-break

Neu 2 nguoi nhan cung bang nhau o ca 3 tieu chi:

- `historical auto receive`
- `client load`
- `auto receive today`

thi he thong moi random trong nhom dong hang. Scenario random nen test bang cach lap lai tren nhieu client, khong assert cung 1 user co dinh.
