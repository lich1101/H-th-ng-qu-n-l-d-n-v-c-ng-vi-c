<?php

namespace Database\Seeders;

use App\Models\ActivityLog;
use App\Models\Client;
use App\Models\Project;
use App\Models\ServiceAuditItem;
use App\Models\ServiceBacklinkItem;
use App\Models\ServiceContentItem;
use App\Models\ServiceWebsiteCareItem;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DemoDataSeeder extends Seeder
{
    public function run()
    {
        $admin = User::updateOrCreate(
            ['email' => 'admin@noibo.local'],
            [
                'name' => 'Admin System',
                'password' => Hash::make('password123'),
                'role' => 'admin',
                'department' => 'quan_tri',
                'is_active' => true,
            ]
        );

        $sales = User::updateOrCreate(
            ['email' => 'sales@noibo.local'],
            [
                'name' => 'Sales Executive',
                'password' => Hash::make('password123'),
                'role' => 'nhan_su_kinh_doanh',
                'department' => 'kinh_doanh',
                'is_active' => true,
            ]
        );

        $leader = User::updateOrCreate(
            ['email' => 'leader@noibo.local'],
            [
                'name' => 'Production Leader',
                'password' => Hash::make('password123'),
                'role' => 'truong_phong_san_xuat',
                'department' => 'san_xuat',
                'is_active' => true,
            ]
        );

        $staff = User::updateOrCreate(
            ['email' => 'staff@noibo.local'],
            [
                'name' => 'Production Staff',
                'password' => Hash::make('password123'),
                'role' => 'nhan_su_san_xuat',
                'department' => 'san_xuat',
                'is_active' => true,
            ]
        );

        $client = Client::updateOrCreate(
            ['email' => 'client@acme.local'],
            [
                'name' => 'Acme Client',
                'company' => 'Acme Co.',
                'phone' => '0900000000',
                'sales_owner_id' => $sales->id,
            ]
        );

        $projectWebsiteCare = Project::updateOrCreate(
            ['code' => 'PRJ-0001'],
            [
                'name' => 'SEO Tổng Thể Q2',
                'client_id' => $client->id,
                'service_type' => 'cham_soc_website_tong_the',
                'start_date' => now()->toDateString(),
                'deadline' => now()->addDays(30)->toDateString(),
                'status' => 'dang_trien_khai',
                'handover_status' => 'chua_ban_giao',
                'customer_requirement' => 'Tăng traffic và tối ưu conversion.',
                'created_by' => $sales->id,
                'approved_by' => $leader->id,
                'approved_at' => now(),
            ]
        );

        $taskAudit = Task::updateOrCreate(
            ['project_id' => $projectWebsiteCare->id, 'title' => 'Audit 20 URL ưu tiên'],
            [
                'description' => 'Audit onpage và kỹ thuật cho nhóm URL ưu tiên.',
                'priority' => 'high',
                'status' => 'dang_trien_khai',
                'start_at' => now(),
                'deadline' => now()->addDays(5),
                'progress_percent' => 35,
                'created_by' => $leader->id,
                'assigned_by' => $leader->id,
                'assignee_id' => $staff->id,
                'reviewer_id' => $leader->id,
                'require_acknowledgement' => true,
                'acknowledged_at' => now(),
            ]
        );

        $projectBacklinks = Project::updateOrCreate(
            ['code' => 'PRJ-BL-01'],
            [
                'name' => 'Chiến dịch Backlinks Q3',
                'client_id' => $client->id,
                'service_type' => 'backlinks',
                'start_date' => now()->subDays(5)->toDateString(),
                'deadline' => now()->addDays(20)->toDateString(),
                'status' => 'dang_trien_khai',
                'handover_status' => 'chua_ban_giao',
                'customer_requirement' => 'Build 50 backlinks chất lượng.',
                'created_by' => $sales->id,
            ]
        );

        $taskBacklinks = Task::updateOrCreate(
            ['project_id' => $projectBacklinks->id, 'title' => 'Outreach guest post tuần 1'],
            [
                'description' => 'Liên hệ domain DA cao để đặt link.',
                'priority' => 'urgent',
                'status' => 'dang_trien_khai',
                'deadline' => now()->addDays(7),
                'progress_percent' => 50,
                'created_by' => $leader->id,
                'assigned_by' => $leader->id,
                'assignee_id' => $staff->id,
            ]
        );

        $backlinkSeeds = [
            ['domain' => 'techcrunch.com', 'status' => 'live'],
            ['domain' => 'forbes.com', 'status' => 'live'],
            ['domain' => 'theverge.com', 'status' => 'pending'],
            ['domain' => 'hubspot.com', 'status' => 'pending'],
            ['domain' => 'moz.com', 'status' => 'published'],
            ['domain' => 'semrush.com', 'status' => 'live'],
            ['domain' => 'searchenginejournal.com', 'status' => 'pending'],
            ['domain' => 'backlinko.com', 'status' => 'live'],
        ];

        foreach ($backlinkSeeds as $seed) {
            ServiceBacklinkItem::updateOrCreate(
                [
                    'project_id' => $projectBacklinks->id,
                    'domain' => $seed['domain'],
                    'target_url' => 'https://acme.co/seo',
                ],
                [
                    'task_id' => $taskBacklinks->id,
                    'anchor_text' => 'dịch vụ SEO tổng thể',
                    'status' => $seed['status'],
                    'report_date' => now()->toDateString(),
                    'note' => 'Theo dõi tình trạng xuất bản.',
                ]
            );
        }

        $projectContent = Project::updateOrCreate(
            ['code' => 'PRJ-CT-01'],
            [
                'name' => 'Content SEO cho Blog Sản phẩm',
                'client_id' => $client->id,
                'service_type' => 'viet_content',
                'start_date' => now()->subDays(2)->toDateString(),
                'deadline' => now()->addDays(15)->toDateString(),
                'status' => 'dang_trien_khai',
                'created_by' => $sales->id,
            ]
        );

        $taskContent = Task::updateOrCreate(
            ['project_id' => $projectContent->id, 'title' => 'Viết 5 bài landing page'],
            [
                'description' => 'Triển khai bài viết chuẩn SEO theo outline đã duyệt.',
                'priority' => 'medium',
                'status' => 'dang_trien_khai',
                'deadline' => now()->addDays(10),
                'progress_percent' => 40,
                'created_by' => $leader->id,
                'assigned_by' => $leader->id,
                'assignee_id' => $staff->id,
            ]
        );

        $contentSeeds = [
            ['keyword' => 'dịch vụ SEO tổng thể', 'words' => 1800, 'seo' => 92],
            ['keyword' => 'backlinks chất lượng', 'words' => 1500, 'seo' => 88],
            ['keyword' => 'audit content', 'words' => 1200, 'seo' => 90],
        ];

        foreach ($contentSeeds as $seed) {
            ServiceContentItem::updateOrCreate(
                [
                    'project_id' => $projectContent->id,
                    'main_keyword' => $seed['keyword'],
                ],
                [
                    'task_id' => $taskContent->id,
                    'secondary_keywords' => 'SEO checklist, tối ưu onpage',
                    'outline_status' => 'approved',
                    'required_words' => $seed['words'] + 200,
                    'actual_words' => $seed['words'],
                    'seo_score' => $seed['seo'],
                    'duplicate_percent' => 3,
                    'approval_status' => 'approved',
                ]
            );
        }

        $projectAudit = Project::updateOrCreate(
            ['code' => 'PRJ-AD-01'],
            [
                'name' => 'Audit Content Q3',
                'client_id' => $client->id,
                'service_type' => 'audit_content',
                'start_date' => now()->subDays(1)->toDateString(),
                'deadline' => now()->addDays(12)->toDateString(),
                'status' => 'dang_trien_khai',
                'created_by' => $sales->id,
            ]
        );

        $taskAuditDetail = Task::updateOrCreate(
            ['project_id' => $projectAudit->id, 'title' => 'Audit nhóm bài top traffic'],
            [
                'description' => 'Rà soát vấn đề SEO và đề xuất cải thiện.',
                'priority' => 'high',
                'status' => 'dang_trien_khai',
                'deadline' => now()->addDays(8),
                'progress_percent' => 25,
                'created_by' => $leader->id,
                'assigned_by' => $leader->id,
                'assignee_id' => $staff->id,
            ]
        );

        $auditSeeds = [
            ['url' => 'https://acme.co/blog/seo-2024', 'issue' => 'Missing H2', 'priority' => 'high'],
            ['url' => 'https://acme.co/blog/backlinks', 'issue' => 'Thin content', 'priority' => 'medium'],
            ['url' => 'https://acme.co/blog/audit', 'issue' => 'Slow page', 'priority' => 'high'],
        ];

        foreach ($auditSeeds as $seed) {
            ServiceAuditItem::updateOrCreate(
                [
                    'project_id' => $projectAudit->id,
                    'url' => $seed['url'],
                ],
                [
                    'task_id' => $taskAuditDetail->id,
                    'issue_type' => $seed['issue'],
                    'issue_description' => 'Cần tối ưu để tăng hiệu suất.',
                    'suggestion' => 'Bổ sung nội dung và tối ưu cấu trúc.',
                    'priority' => $seed['priority'],
                    'status' => 'open',
                ]
            );
        }

        $careSeeds = [
            ['issue' => 'Lỗi 404 trên 5 URL', 'traffic' => 1200, 'delta' => 2],
            ['issue' => 'Tối ưu lại sitemap', 'traffic' => 980, 'delta' => 1],
        ];

        foreach ($careSeeds as $seed) {
            ServiceWebsiteCareItem::updateOrCreate(
                [
                    'project_id' => $projectWebsiteCare->id,
                    'technical_issue' => $seed['issue'],
                ],
                [
                    'task_id' => $taskAudit->id,
                    'check_date' => now()->toDateString(),
                    'index_status' => 'indexed',
                    'traffic' => $seed['traffic'],
                    'ranking_delta' => $seed['delta'],
                    'monthly_report' => 'Báo cáo tháng cập nhật hệ thống.',
                ]
            );
        }

        $logSeeds = [
            ['action' => 'task_status_changed', 'subject_type' => 'task', 'subject_id' => $taskAudit->id, 'user_id' => $leader->id],
            ['action' => 'project_status_changed', 'subject_type' => 'project', 'subject_id' => $projectBacklinks->id, 'user_id' => $admin->id],
            ['action' => 'upload_handover', 'subject_type' => 'task', 'subject_id' => $taskContent->id, 'user_id' => $staff->id],
        ];

        foreach ($logSeeds as $seed) {
            ActivityLog::updateOrCreate(
                [
                    'action' => $seed['action'],
                    'subject_type' => $seed['subject_type'],
                    'subject_id' => $seed['subject_id'],
                ],
                [
                    'user_id' => $seed['user_id'],
                    'changes' => ['note' => 'Seed log'],
                    'ip_address' => '127.0.0.1',
                    'user_agent' => 'seed',
                    'created_at' => now()->subMinutes(10),
                ]
            );
        }
    }
}
