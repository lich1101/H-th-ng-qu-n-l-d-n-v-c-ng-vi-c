# Web App (`web`)

Du an web dung Laravel + React + MySQL cho he thong quan ly du an, task va ban giao noi bo.

## Stack hien tai

- Laravel `8.x` (duoc cau hinh de deploy voi PHP `8.3`).
- React + Inertia.
- MySQL.
- Laravel Mix (Webpack).
- Da cap nhat `inertiajs/inertia-laravel` len `^1.3` de tuong thich deploy PHP `8.3`.

## Cai dat

1. Cai backend:
   ```bash
   composer install
   cp .env.example .env
   php artisan key:generate
   ```
2. Cai frontend:
   ```bash
   npm install
   npm run dev
   ```
3. Chay web:
   ```bash
   php artisan migrate
   php artisan db:seed
   # Chi seed users: SEED_ONLY_USERS=true php artisan db:seed
   php artisan storage:link
   php artisan serve
   ```

## Bien moi truong quan trong

- `APP_URL`, `FRONTEND_URL`: URL web.
- `DB_*`: thong tin MySQL.
- `MOBILE_APP_*`: thong tin deep link va ten app Flutter.
- `MIX_API_BASE_URL`: endpoint API cho frontend.
- `CORS_ALLOWED_ORIGINS`: danh sach origin duoc phep goi API.
- `DEADLINE_CHANNELS`: danh sach kenh nhac han (vd: `in_app,email,telegram,zalo`).
- `DEADLINE_TELEGRAM_WEBHOOK`: webhook gui nhac han Telegram (tuy chon, fallback).
- `DEADLINE_ZALO_WEBHOOK`: webhook gui nhac han Zalo (tuy chon, fallback).
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`: gui nhac han Telegram qua Bot API.
- `ZALO_OA_ACCESS_TOKEN`, `ZALO_OA_RECIPIENT_ID`, `ZALO_OA_API_URL`: gui nhac han qua Zalo OA.
- `WORKLOAD_THRESHOLD`: nguong task dang xu ly de canh bao qua tai (mac dinh 8).

## API khoi tao

- `GET /api/v1/health`
- `GET /api/v1/meta` (roles, project status, task status, service types)
- `POST /api/v1/login` (lay sanctum token)
- `GET /api/v1/me` (can bearer token)
- `POST /api/v1/logout` (can bearer token)
- `GET /api/v1/projects`, `POST /api/v1/projects`, `PUT/DELETE /api/v1/projects/{id}`
- `GET /api/v1/tasks`, `POST /api/v1/tasks`, `PUT/DELETE /api/v1/tasks/{id}`
- `GET/POST/PUT/DELETE /api/v1/tasks/{task}/comments...`
- `GET/POST/DELETE /api/v1/tasks/{task}/attachments...`
- `GET/POST/PUT/DELETE /api/v1/tasks/{task}/reminders...`
- `GET /api/v1/activity-logs`

## RBAC API

- Middleware moi: `role`.
- Quyen route chinh:
  - `projects:create/update`: `admin`, `quan_ly`
  - `projects:delete`: `admin`
  - `tasks:create/delete`: `admin`, `quan_ly`
  - `tasks:update`: `admin`, `quan_ly`, `nhan_vien`
  - `reminders:*`: `admin`, `quan_ly`
  - `activity-logs:view`: `admin`, `quan_ly`

## Activity log tu dong

- He thong tu dong ghi `activity_logs` khi doi `status` cua `tasks`.
- He thong tu dong ghi `activity_logs` khi doi `status` hoac `handover_status` cua `projects`.
- Log gom: `action`, `subject_type`, `subject_id`, `changes(old/new)`, `user_id`, `ip_address`, `user_agent`, `created_at`.

## Tai khoan seed mac dinh

Mat khau chung: `password123`

- `dangvanbinh11012003@gmail.com` - role `admin` (mat khau: `khongdoipass`)
- `manager@noibo.local` - role `quan_ly`
- `staff@noibo.local` - role `nhan_vien`
- `accountant@noibo.local` - role `ke_toan`

## Database schema da khoi tao

Da bo sung migration cho cac module chinh:

- Nguoi dung va phan quyen: `users` (them role/department/workload).
- CRM mini: `clients`, `customer_payments`.
- Du an: `projects`, `project_members`.
- Task va quy trinh giao viec: `tasks`, `task_assignments`.
- Ban giao tai lieu/video + chat: `task_attachments`, `task_comments`.
- Lich hop: `project_meetings`, `meeting_attendees`.
- Nhac han va log: `deadline_reminders`, `activity_logs`.
- Bao cao KPI: `kpi_snapshots`.
- Dich vu dac thu: `service_backlink_items`, `service_content_items`, `service_audit_items`, `service_website_care_items`.

## Cap nhat gan day

- Trang thai hop dong khong con luu/chinh tay bang cot `contracts.status`.
- API hop dong gio tinh trang thai dong theo `approval_status`, tong da thu, cong no va `end_date`.
- Bo loc trang thai hop dong van giu nguyen tren giao dien nhung backend loc theo dung nghiep vu thay vi loc theo cot DB cu.

> Luu y: can dam bao MySQL dang chay truoc khi `php artisan migrate`.

## Huong giao dien stitch

Dashboard hien tai da dat san danh sach template tham chieu tu bo giao dien `stitch`:
- `manager_dashboard_overview`
- `project_kanban_board_view`
- `task_details_and_collaboration`
- `service_performance_reports`
- `t_ng_quan_dashboard_ng_b_kh_i`

## Giao dien web tieng Viet (da tao)

Da bo sung bo giao dien day du theo module nghiep vu:

- `dashboard`: tong quan van hanh
- `du-an`: quan ly du an theo Kanban
- `cong-viec`: danh sach task va tien do
- `deadline`: canh bao va lich nhac han
- `ban-giao`: tai lieu/video + version
- `bao-cao-kpi`: bao cao tong hop va theo dich vu
- `quy-trinh-dich-vu`: backlinks/content/audit/website care
- `lich-hop`: quan ly meeting ban giao
- `chat-noi-bo`: giao tiep theo task
- `nhat-ky-he-thong`: theo doi thao tac va thay doi trang thai
- `crm-mini`: quan ly khach hang va thanh toan
- `phan-quyen`: ma tran vai tro va quyen
- `tai-khoan`: bang dieu khien tai khoan nguoi dung (phan bo role, trang thai, canh bao)

## Giao dien bieu do

- Da bo sung bieu do cot thanh (bar chart) cho dashboard va tai khoan nguoi dung.
- Da bo sung cac progress chart cho KPI/trang thai de theo doi nhanh.

## API tai khoan nguoi dung (real data)

- `GET /api/v1/users/accounts`
  - Ho tro query: `search`, `role`, `status` (`active|inactive`), `per_page`
  - Tra ve danh sach co phan trang de hien thi bang tai khoan.
- `GET /api/v1/users/accounts/stats`
  - Tra ve thong ke realtime: tong so tai khoan, so dang hoat dong/tam khoa, phan bo theo role.
- `POST /api/v1/users/accounts`
  - Them moi tai khoan (admin).
- `PUT /api/v1/users/accounts/{user}`
  - Chinh sua tai khoan (admin).
- `DELETE /api/v1/users/accounts/{user}`
  - Xoa tai khoan (admin, khong cho xoa chinh minh/khong xoa admin cuoi cung).

## API module mo rong da noi du lieu that

- Meetings:
  - `GET/POST /api/v1/meetings`
  - `PUT/DELETE /api/v1/meetings/{meeting}`
  - Ho tro filter query: `search`, `date_from`, `date_to`, `per_page`, `page`
- CRM:
  - `GET/POST /api/v1/crm/clients`
  - Filter clients: `search`, `per_page`, `page`
  - `PUT/DELETE /api/v1/crm/clients/{client}`
  - `GET/POST /api/v1/crm/payments`
  - Filter payments: `status`, `per_page`, `page`
  - `PUT/DELETE /api/v1/crm/payments/{payment}`
- Reports:
  - `GET /api/v1/reports/dashboard-summary`
- Public cho app:
  - `GET /api/v1/public/summary`
  - `GET /api/v1/public/accounts-summary`

## Scheduler nhac han tu dong

- Command: `php artisan reminders:sync-deadline` (tu dong tao reminders 3 ngay/1 ngay/qua han)
- Command: `php artisan reminders:send-deadline` (gui reminders dang pending)
- Da duoc dang ky trong scheduler: `sync` chay moi gio, `send` chay moi phut (`app/Console/Kernel.php`)
- Ho tro channel:
  - `in_app` (danh dau da gui trong DB)
  - `email` (gui den email nguoi phu trach task neu co)
  - `telegram` / `zalo` (gui qua Bot/OA API, co fallback webhook neu cau hinh)

## Trung tam thong bao in-app

- Giao dien web: route `thong-bao` (Notification Center)
- API: `GET /api/v1/notifications/in-app`
- API mark read:
  - `POST /api/v1/notifications/in-app/read`
  - `POST /api/v1/notifications/in-app/read-all`
- Du lieu hien thi:
  - danh sach nhac deadline (deadline_reminders)
  - danh sach activity logs moi nhat
  - trang thai da doc/chua doc theo tung user (bang `notification_reads`)

## CRUD UI Meetings/CRM (web)

- `lich-hop`: da ho tro tao/sua/xoa ngay tren giao dien.
- `crm-mini`: da ho tro tao/sua/xoa khach hang va thanh toan ngay tren giao dien.
- Da bo sung bo loc va dieu huong phan trang ngay tren UI `lich-hop` va `crm-mini`.
- Da dong bo bo loc/phan trang vao URL query de reload/truyen link van giu nguyen trang thai.
- Da bo sung toast thong bao thanh cong/that bai cho thao tac CRUD va tai du lieu.
- Toast duoc quan ly theo co che dung chung: `ToastProvider` + hook `useToast` (file `resources/js/Contexts/ToastContext.jsx`).
