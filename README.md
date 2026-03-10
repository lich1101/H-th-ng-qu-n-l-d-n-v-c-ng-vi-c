# Web App (`web`)

Du an web dung Laravel + React + MySQL cho he thong quan ly du an, task va ban giao noi bo.

## Stack hien tai

- Laravel `8.x` (phu hop PHP `7.3` may hien tai).
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
   php artisan serve
   ```

## Bien moi truong quan trong

- `APP_URL`, `FRONTEND_URL`: URL web.
- `DB_*`: thong tin MySQL.
- `MOBILE_APP_*`: thong tin deep link va ten app Flutter.
- `MIX_API_BASE_URL`: endpoint API cho frontend.
- `CORS_ALLOWED_ORIGINS`: danh sach origin duoc phep goi API.

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
  - `projects:create/update`: `admin`, `nhan_su_kinh_doanh`, `truong_phong_san_xuat`
  - `projects:delete`: `admin`
  - `tasks:create/delete`: `admin`, `truong_phong_san_xuat`
  - `tasks:update`: `admin`, `truong_phong_san_xuat`, `nhan_su_san_xuat`
  - `reminders:*`: `admin`, `truong_phong_san_xuat`
  - `activity-logs:view`: `admin`, `truong_phong_san_xuat`

## Activity log tu dong

- He thong tu dong ghi `activity_logs` khi doi `status` cua `tasks`.
- He thong tu dong ghi `activity_logs` khi doi `status` hoac `handover_status` cua `projects`.
- Log gom: `action`, `subject_type`, `subject_id`, `changes(old/new)`, `user_id`, `ip_address`, `user_agent`, `created_at`.

## Tai khoan seed mac dinh

Mat khau chung: `password123`

- `admin@noibo.local` - role `admin`
- `sales@noibo.local` - role `nhan_su_kinh_doanh`
- `leader@noibo.local` - role `truong_phong_san_xuat`
- `staff@noibo.local` - role `nhan_su_san_xuat`

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

> Luu y: can dam bao MySQL dang chay truoc khi `php artisan migrate`.

## Huong giao dien stitch

Dashboard hien tai da dat san danh sach template tham chieu tu bo giao dien `stitch`:
- `manager_dashboard_overview`
- `project_kanban_board_view`
- `task_details_and_collaboration`
- `service_performance_reports`
- `t_ng_quan_dashboard_ng_b_kh_i`
