# Workflow Topic Template Seed Data

- Nguồn markdown gốc: `phan-bo-hieu-suat-cong-viec.md`
- File CSV dùng để seed: `workflow-topic-template.csv`

Chạy seed:

```bash
cd web
php artisan db:seed --class=Database\\Seeders\\WorkflowTopicTemplateSeeder
```

Hoặc chạy command import trực tiếp:

```bash
cd web
php artisan workflow:import-sheet --mode=replace
```

