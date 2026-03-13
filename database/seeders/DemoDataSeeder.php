<?php

namespace Database\Seeders;

use App\Models\ActivityLog;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Department;
use App\Models\DepartmentAssignment;
use App\Models\LeadForm;
use App\Models\LeadType;
use App\Models\Product;
use App\Models\Project;
use App\Models\RevenueTier;
use App\Models\ServiceAuditItem;
use App\Models\ServiceBacklinkItem;
use App\Models\ServiceContentItem;
use App\Models\ServiceWebsiteCareItem;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DemoDataSeeder extends Seeder
{
    public function run()
    {
        $admin = User::updateOrCreate(
            ['email' => 'dangvanbinh11012003@gmail.com'],
            [
                'name' => 'Admin System',
                'password' => Hash::make('khongdoipass'),
                'role' => 'admin',
                'department' => 'quan_tri',
                'is_active' => true,
            ]
        );

        $manager = User::updateOrCreate(
            ['email' => 'manager@noibo.local'],
            [
                'name' => 'Quản lý phòng ban',
                'password' => Hash::make('password123'),
                'role' => 'quan_ly',
                'department' => 'quan_ly',
                'is_active' => true,
            ]
        );

        $staff = User::updateOrCreate(
            ['email' => 'staff@noibo.local'],
            [
                'name' => 'Nhân sự sản xuất',
                'password' => Hash::make('password123'),
                'role' => 'nhan_vien',
                'department' => 'nhan_vien',
                'is_active' => true,
            ]
        );

        $accountant = User::updateOrCreate(
            ['email' => 'accountant@noibo.local'],
            [
                'name' => 'Kế toán',
                'password' => Hash::make('password123'),
                'role' => 'ke_toan',
                'department' => 'ke_toan',
                'is_active' => true,
            ]
        );

        $sanXuat = Department::updateOrCreate(
            ['name' => 'Phòng Sản xuất'],
            ['manager_id' => $manager->id]
        );
        $kinhDoanh = Department::updateOrCreate(
            ['name' => 'Phòng Kinh doanh'],
            ['manager_id' => $manager->id]
        );

        $manager->update(['department_id' => $kinhDoanh->id]);
        $staff->update(['department_id' => $sanXuat->id]);

        $leadPotential = LeadType::updateOrCreate(
            ['name' => 'Khách hàng tiềm năng'],
            ['color_hex' => '#04BC5C', 'sort_order' => 1]
        );
        $leadCaring = LeadType::updateOrCreate(
            ['name' => 'Đang chăm sóc'],
            ['color_hex' => '#F59E0B', 'sort_order' => 2]
        );
        $leadInterested = LeadType::updateOrCreate(
            ['name' => 'Quan tâm'],
            ['color_hex' => '#16A34A', 'sort_order' => 3]
        );
        $leadNotFit = LeadType::updateOrCreate(
            ['name' => 'Chưa phù hợp'],
            ['color_hex' => '#9CA3AF', 'sort_order' => 4]
        );

        RevenueTier::updateOrCreate(
            ['name' => 'da_tung_mua'],
            ['label' => 'Đã từng mua hàng', 'color_hex' => '#22C55E', 'min_amount' => 1, 'sort_order' => 1]
        );
        RevenueTier::updateOrCreate(
            ['name' => 'bac'],
            ['label' => 'Bạc', 'color_hex' => '#9CA3AF', 'min_amount' => 50000000, 'sort_order' => 2]
        );
        RevenueTier::updateOrCreate(
            ['name' => 'vang'],
            ['label' => 'Vàng', 'color_hex' => '#F59E0B', 'min_amount' => 100000000, 'sort_order' => 3]
        );
        RevenueTier::updateOrCreate(
            ['name' => 'kim_cuong'],
            ['label' => 'Kim cương', 'color_hex' => '#6366F1', 'min_amount' => 500000000, 'sort_order' => 4]
        );

        $productBacklinks = Product::updateOrCreate(
            ['code' => 'SP-BL-001'],
            [
                'name' => 'Gói Backlinks chất lượng',
                'unit' => 'gói',
                'unit_price' => 65000000,
                'description' => 'Gói xây dựng backlink chất lượng theo tháng.',
                'is_active' => true,
            ]
        );
        $productContent = Product::updateOrCreate(
            ['code' => 'SP-CT-001'],
            [
                'name' => 'Gói Content SEO',
                'unit' => 'bài',
                'unit_price' => 1200000,
                'description' => 'Content chuẩn SEO theo outline.',
                'is_active' => true,
            ]
        );
        $productAudit = Product::updateOrCreate(
            ['code' => 'SP-AD-001'],
            [
                'name' => 'Gói Audit Content',
                'unit' => 'dự án',
                'unit_price' => 30000000,
                'description' => 'Audit Content và đề xuất tối ưu.',
                'is_active' => true,
            ]
        );
        $productWebsiteCare = Product::updateOrCreate(
            ['code' => 'SP-WC-001'],
            [
                'name' => 'Website Care tổng thể',
                'unit' => 'tháng',
                'unit_price' => 80000000,
                'description' => 'Theo dõi, tối ưu kỹ thuật và báo cáo định kỳ.',
                'is_active' => true,
            ]
        );

        $client = Client::updateOrCreate(
            ['email' => 'client@acme.local'],
            [
                'name' => 'Acme Client',
                'company' => 'Acme Co.',
                'phone' => '0900000000',
                'sales_owner_id' => $manager->id,
                'assigned_department_id' => $kinhDoanh->id,
                'assigned_staff_id' => $manager->id,
                'lead_type_id' => $leadPotential->id,
                'lead_source' => 'lead_form',
                'lead_channel' => 'iframe',
                'lead_message' => 'Quan tâm gói SEO tổng thể.',
            ]
        );

        $clientWarm = Client::updateOrCreate(
            ['email' => 'warm@client.local'],
            [
                'name' => 'Warm Lead',
                'company' => 'Warm Company',
                'phone' => '0911111111',
                'sales_owner_id' => $manager->id,
                'assigned_department_id' => $kinhDoanh->id,
                'assigned_staff_id' => $manager->id,
                'lead_type_id' => $leadCaring->id,
                'lead_source' => 'page_message',
                'lead_channel' => 'facebook',
                'lead_message' => 'Inbox tư vấn dịch vụ backlinks.',
            ]
        );

        $clientHot = Client::updateOrCreate(
            ['email' => 'hot@client.local'],
            [
                'name' => 'Hot Lead',
                'company' => 'Hot Co.',
                'phone' => '0922222222',
                'sales_owner_id' => $manager->id,
                'assigned_department_id' => $kinhDoanh->id,
                'assigned_staff_id' => $manager->id,
                'lead_type_id' => $leadInterested->id,
                'lead_source' => 'zalo',
                'lead_channel' => 'zalo',
                'lead_message' => 'Cần báo giá gấp.',
            ]
        );

        Client::updateOrCreate(
            ['email' => 'lost@client.local'],
            [
                'name' => 'Lead Chưa phù hợp',
                'company' => 'Not Fit Co.',
                'phone' => '0933333333',
                'sales_owner_id' => $manager->id,
                'assigned_department_id' => $kinhDoanh->id,
                'assigned_staff_id' => $manager->id,
                'lead_type_id' => $leadNotFit->id,
                'lead_source' => 'website',
                'lead_channel' => 'form',
                'lead_message' => 'Ngân sách chưa phù hợp.',
            ]
        );

        LeadForm::updateOrCreate(
            ['slug' => 'tu-van-seo'],
            [
                'name' => 'Form tư vấn SEO tổng thể',
                'lead_type_id' => $leadPotential->id,
                'department_id' => $kinhDoanh->id,
                'public_key' => Str::random(16),
                'is_active' => true,
                'redirect_url' => null,
                'description' => 'Form thu thập lead SEO tổng thể.',
                'created_by' => $admin->id,
            ]
        );

        LeadForm::updateOrCreate(
            ['slug' => 'tu-van-backlinks'],
            [
                'name' => 'Form tư vấn Backlinks',
                'lead_type_id' => $leadPotential->id,
                'department_id' => $kinhDoanh->id,
                'public_key' => Str::random(16),
                'is_active' => true,
                'redirect_url' => null,
                'description' => 'Form tư vấn gói backlinks.',
                'created_by' => $admin->id,
            ]
        );

        $websiteItems = $this->buildItems([
            ['product' => $productWebsiteCare, 'quantity' => 1, 'unit_price' => 80000000],
            ['product' => $productContent, 'quantity' => 10, 'unit_price' => 1200000],
        ]);
        $websiteTotal = $this->sumItems($websiteItems);

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
                'created_by' => $manager->id,
                'approved_by' => $admin->id,
                'approved_at' => now(),
            ]
        );

        $contractWebsiteCare = Contract::updateOrCreate(
            ['code' => 'CTR-0001'],
            [
                'title' => 'Hợp đồng SEO Tổng Thể Q2',
                'client_id' => $client->id,
                'project_id' => $projectWebsiteCare->id,
                'value' => $websiteTotal,
                'status' => 'success',
                'approval_status' => 'approved',
                'approved_by' => $accountant->id,
                'approved_at' => now(),
                'signed_at' => now()->subDays(2)->toDateString(),
                'start_date' => now()->toDateString(),
                'end_date' => now()->addDays(30)->toDateString(),
                'notes' => 'Gói chăm sóc website tổng thể Q2.',
                'created_by' => $accountant->id,
            ]
        );
        $this->syncContractItems($contractWebsiteCare, $websiteItems);
        $projectWebsiteCare->update(['contract_id' => $contractWebsiteCare->id]);

        DepartmentAssignment::updateOrCreate(
            [
                'client_id' => $client->id,
                'contract_id' => $contractWebsiteCare->id,
                'department_id' => $sanXuat->id,
            ],
            [
                'assigned_by' => $admin->id,
                'manager_id' => $sanXuat->manager_id,
                'requirements' => 'Triển khai chăm sóc website tổng thể theo hợp đồng.',
                'deadline' => now()->addDays(25),
                'allocated_value' => $websiteTotal,
                'status' => 'in_progress',
                'progress_percent' => 30,
                'progress_note' => 'Đã triển khai audit và tối ưu onpage.',
                'accepted_at' => now()->subDays(1),
            ]
        );

        $taskAudit = Task::updateOrCreate(
            ['project_id' => $projectWebsiteCare->id, 'title' => 'Audit 20 URL ưu tiên'],
            [
                'description' => 'Audit onpage và kỹ thuật cho nhóm URL ưu tiên.',
                'priority' => 'high',
                'status' => 'doing',
                'start_at' => now(),
                'deadline' => now()->addDays(5),
                'progress_percent' => 35,
                'created_by' => $manager->id,
                'assigned_by' => $manager->id,
                'assignee_id' => $staff->id,
                'reviewer_id' => $manager->id,
                'require_acknowledgement' => true,
                'acknowledged_at' => now(),
            ]
        );

        $backlinkItems = $this->buildItems([
            ['product' => $productBacklinks, 'quantity' => 1, 'unit_price' => 65000000],
        ]);
        $backlinkTotal = $this->sumItems($backlinkItems);

        $projectBacklinks = Project::updateOrCreate(
            ['code' => 'PRJ-BL-01'],
            [
                'name' => 'Chiến dịch Backlinks Q3',
                'client_id' => $clientWarm->id,
                'service_type' => 'backlinks',
                'start_date' => now()->subDays(5)->toDateString(),
                'deadline' => now()->addDays(20)->toDateString(),
                'status' => 'dang_trien_khai',
                'handover_status' => 'chua_ban_giao',
                'customer_requirement' => 'Build 50 backlinks chất lượng.',
                'created_by' => $manager->id,
            ]
        );

        $contractBacklinks = Contract::updateOrCreate(
            ['code' => 'CTR-BL-01'],
            [
                'title' => 'Hợp đồng Backlinks Q3',
                'client_id' => $clientWarm->id,
                'project_id' => $projectBacklinks->id,
                'value' => $backlinkTotal,
                'status' => 'active',
                'approval_status' => 'approved',
                'approved_by' => $accountant->id,
                'approved_at' => now()->subDays(4),
                'signed_at' => now()->subDays(5)->toDateString(),
                'start_date' => now()->subDays(5)->toDateString(),
                'end_date' => now()->addDays(20)->toDateString(),
                'notes' => 'Cam kết số lượng backlinks theo tuần.',
                'created_by' => $accountant->id,
            ]
        );
        $this->syncContractItems($contractBacklinks, $backlinkItems);
        $projectBacklinks->update(['contract_id' => $contractBacklinks->id]);

        $taskBacklinks = Task::updateOrCreate(
            ['project_id' => $projectBacklinks->id, 'title' => 'Outreach guest post tuần 1'],
            [
                'description' => 'Liên hệ domain DA cao để đặt link.',
                'priority' => 'urgent',
                'status' => 'doing',
                'deadline' => now()->addDays(7),
                'progress_percent' => 50,
                'created_by' => $manager->id,
                'assigned_by' => $manager->id,
                'assignee_id' => $staff->id,
            ]
        );

        $contentItems = $this->buildItems([
            ['product' => $productContent, 'quantity' => 12, 'unit_price' => 1100000],
        ]);
        $contentTotal = $this->sumItems($contentItems);

        $projectContent = Project::updateOrCreate(
            ['code' => 'PRJ-CT-01'],
            [
                'name' => 'Content SEO cho Blog Sản phẩm',
                'client_id' => $clientHot->id,
                'service_type' => 'viet_content',
                'start_date' => now()->subDays(2)->toDateString(),
                'deadline' => now()->addDays(15)->toDateString(),
                'status' => 'dang_trien_khai',
                'created_by' => $manager->id,
            ]
        );

        $contractContent = Contract::updateOrCreate(
            ['code' => 'CTR-CT-01'],
            [
                'title' => 'Hợp đồng Content SEO',
                'client_id' => $clientHot->id,
                'project_id' => $projectContent->id,
                'value' => $contentTotal,
                'status' => 'signed',
                'approval_status' => 'pending',
                'signed_at' => now()->subDays(2)->toDateString(),
                'start_date' => now()->subDays(2)->toDateString(),
                'end_date' => now()->addDays(15)->toDateString(),
                'notes' => 'Content blog + landing page.',
                'created_by' => $manager->id,
            ]
        );
        $this->syncContractItems($contractContent, $contentItems);
        $projectContent->update(['contract_id' => $contractContent->id]);

        $taskContent = Task::updateOrCreate(
            ['project_id' => $projectContent->id, 'title' => 'Content 5 bài landing page'],
            [
                'description' => 'Triển khai bài viết chuẩn SEO theo outline đã duyệt.',
                'priority' => 'medium',
                'status' => 'doing',
                'deadline' => now()->addDays(10),
                'progress_percent' => 40,
                'created_by' => $manager->id,
                'assigned_by' => $manager->id,
                'assignee_id' => $staff->id,
            ]
        );

        $auditItems = $this->buildItems([
            ['product' => $productAudit, 'quantity' => 1, 'unit_price' => 30000000],
        ]);
        $auditTotal = $this->sumItems($auditItems);

        $projectAudit = Project::updateOrCreate(
            ['code' => 'PRJ-AD-01'],
            [
                'name' => 'Audit Content Q3',
                'client_id' => $client->id,
                'service_type' => 'audit_content',
                'start_date' => now()->subDays(1)->toDateString(),
                'deadline' => now()->addDays(12)->toDateString(),
                'status' => 'dang_trien_khai',
                'created_by' => $manager->id,
            ]
        );

        $contractAudit = Contract::updateOrCreate(
            ['code' => 'CTR-AD-01'],
            [
                'title' => 'Hợp đồng Audit Content Q3',
                'client_id' => $client->id,
                'project_id' => $projectAudit->id,
                'value' => $auditTotal,
                'status' => 'active',
                'approval_status' => 'approved',
                'approved_by' => $accountant->id,
                'approved_at' => now()->subDays(1),
                'signed_at' => now()->subDays(1)->toDateString(),
                'start_date' => now()->subDays(1)->toDateString(),
                'end_date' => now()->addDays(12)->toDateString(),
                'notes' => 'Audit theo danh sách URL ưu tiên.',
                'created_by' => $accountant->id,
            ]
        );
        $this->syncContractItems($contractAudit, $auditItems);
        $projectAudit->update(['contract_id' => $contractAudit->id]);

        $taskAuditDetail = Task::updateOrCreate(
            ['project_id' => $projectAudit->id, 'title' => 'Audit nhóm bài top traffic'],
            [
                'description' => 'Audit vấn đề SEO và đề xuất cải thiện.',
                'priority' => 'high',
                'status' => 'doing',
                'deadline' => now()->addDays(8),
                'progress_percent' => 25,
                'created_by' => $manager->id,
                'assigned_by' => $manager->id,
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
            ['action' => 'task_status_changed', 'subject_type' => 'task', 'subject_id' => $taskAudit->id, 'user_id' => $manager->id],
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

        $this->syncClientRevenue($client);
        $this->syncClientRevenue($clientWarm);
        $this->syncClientRevenue($clientHot);

        $client->refresh();
    }

    private function buildItems(array $items): array
    {
        return array_map(function ($item) {
            $product = $item['product'];
            $unitPrice = (float) $item['unit_price'];
            $quantity = (int) ($item['quantity'] ?? 1);
            return [
                'product_id' => $product->id,
                'product_name' => $product->name,
                'unit' => $product->unit,
                'unit_price' => $unitPrice,
                'quantity' => $quantity,
                'total_price' => $unitPrice * $quantity,
                'note' => $item['note'] ?? null,
            ];
        }, $items);
    }

    private function sumItems(array $items): float
    {
        return (float) array_sum(array_map(function ($item) {
            return (float) ($item['total_price'] ?? 0);
        }, $items));
    }

    private function syncContractItems(Contract $contract, array $items): void
    {
        $contract->items()->delete();
        foreach ($items as $item) {
            $contract->items()->create($item);
        }
    }

    private function syncClientRevenue(Client $client): void
    {
        $totalRevenue = (float) Contract::query()
            ->where('client_id', $client->id)
            ->where('approval_status', 'approved')
            ->sum('value');

        $tierId = null;
        if ($totalRevenue > 0) {
            $tierId = RevenueTier::query()
                ->where('min_amount', '<=', $totalRevenue)
                ->orderByDesc('min_amount')
                ->value('id');

            if (! $tierId) {
                $tierId = RevenueTier::query()
                    ->where('min_amount', '>', 0)
                    ->orderBy('min_amount')
                    ->value('id');
            }
        }

        $client->update([
            'total_revenue' => $totalRevenue,
            'has_purchased' => $totalRevenue > 0,
            'revenue_tier_id' => $tierId,
        ]);
    }
}
