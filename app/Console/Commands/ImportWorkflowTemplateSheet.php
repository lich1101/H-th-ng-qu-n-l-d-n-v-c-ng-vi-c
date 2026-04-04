<?php

namespace App\Console\Commands;

use App\Models\WorkflowTopic;
use App\Models\WorkflowTopicTask;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ImportWorkflowTemplateSheet extends Command
{
    protected $signature = 'workflow:import-sheet
        {--file= : Đường dẫn CSV. Mặc định: database/seeders/data/workflow-topic-template.csv}
        {--mode=replace : replace|append}
        {--dry-run : Chỉ kiểm tra dữ liệu, không ghi DB}';

    protected $description = 'Import template barem công việc từ sheet CSV vào workflow_topics/workflow_topic_tasks/workflow_topic_task_items.';

    private const REQUIRED_COLUMNS = [
        'topic_name',
        'task_title',
        'task_weight_percent',
        'item_title',
        'item_weight_percent',
    ];

    public function handle(): int
    {
        $relativePath = 'database/seeders/data/workflow-topic-template.csv';
        $fileOption = trim((string) $this->option('file'));
        $csvPath = $fileOption !== '' ? $fileOption : base_path($relativePath);
        if (! Str::startsWith($csvPath, DIRECTORY_SEPARATOR)) {
            $csvPath = base_path($csvPath);
        }

        if (! is_file($csvPath)) {
            $this->error("Không tìm thấy file CSV: {$csvPath}");
            return self::FAILURE;
        }

        $mode = strtolower((string) $this->option('mode'));
        if (! in_array($mode, ['replace', 'append'], true)) {
            $this->error('Giá trị --mode chỉ nhận: replace hoặc append.');
            return self::FAILURE;
        }

        try {
            $rows = $this->readCsv($csvPath);
        } catch (\Throwable $e) {
            $this->error($e->getMessage());
            return self::FAILURE;
        }
        if (empty($rows)) {
            $this->warn('File CSV không có dữ liệu.');
            return self::SUCCESS;
        }

        $grouped = $this->groupRowsByTopic($rows);
        if (empty($grouped)) {
            $this->warn('Không có topic hợp lệ để import.');
            return self::SUCCESS;
        }

        $dryRun = (bool) $this->option('dry-run');
        $createdTopics = 0;
        $updatedTopics = 0;
        $createdTasks = 0;
        $createdItems = 0;

        foreach ($grouped as $topicKey => $topicData) {
            [$ok, $message] = $this->validateTopicWeights($topicData);
            if (! $ok) {
                $this->error("Bỏ qua topic \"{$topicData['topic_name']}\": {$message}");
                continue;
            }

            if ($dryRun) {
                $this->line("[DRY-RUN] Hợp lệ: {$topicData['topic_name']} ({$topicKey})");
                $createdTasks += count($topicData['tasks']);
                foreach ($topicData['tasks'] as $task) {
                    $createdItems += count($task['items']);
                }
                continue;
            }

            DB::transaction(function () use (
                $topicData,
                $mode,
                &$createdTopics,
                &$updatedTopics,
                &$createdTasks,
                &$createdItems
            ) {
                $topic = $this->upsertTopic($topicData, $mode, $createdTopics, $updatedTopics);

                $taskMap = [];
                foreach ($topicData['tasks'] as $taskRow) {
                    $task = WorkflowTopicTask::query()->create([
                        'workflow_topic_id' => (int) $topic->id,
                        'title' => $taskRow['task_title'],
                        'description' => $taskRow['task_description'] ?: null,
                        'priority' => $taskRow['task_priority'] ?: 'medium',
                        'status' => $taskRow['task_status'] ?: 'todo',
                        'weight_percent' => (int) $taskRow['task_weight_percent'],
                        'start_offset_days' => (int) $taskRow['task_start_offset_days'],
                        'duration_days' => (int) $taskRow['task_duration_days'],
                        'sort_order' => (int) $taskRow['task_sort_order'],
                    ]);

                    $createdTasks++;
                    $taskMap[$taskRow['task_key']] = $task;
                }

                foreach ($topicData['tasks'] as $taskRow) {
                    $task = $taskMap[$taskRow['task_key']] ?? null;
                    if (! $task) {
                        continue;
                    }

                    foreach ($taskRow['items'] as $itemRow) {
                        $task->items()->create([
                            'title' => $itemRow['item_title'],
                            'description' => $itemRow['item_description'] ?: null,
                            'priority' => $itemRow['item_priority'] ?: 'medium',
                            'status' => $itemRow['item_status'] ?: 'todo',
                            'weight_percent' => (int) $itemRow['item_weight_percent'],
                            'start_offset_days' => (int) $itemRow['item_start_offset_days'],
                            'duration_days' => (int) $itemRow['item_duration_days'],
                            'sort_order' => (int) $itemRow['item_sort_order'],
                        ]);
                        $createdItems++;
                    }
                }
            });

            $this->info("Đã import topic: {$topicData['topic_name']}");
        }

        $this->newLine();
        $this->info('Hoàn tất import sheet barem.');
        $this->line("Topic tạo mới: {$createdTopics}");
        $this->line("Topic cập nhật: {$updatedTopics}");
        $this->line("Công việc mẫu đã ghi: {$createdTasks}");
        $this->line("Đầu việc mẫu đã ghi: {$createdItems}");

        return self::SUCCESS;
    }

    private function readCsv(string $csvPath): array
    {
        $handle = fopen($csvPath, 'r');
        if ($handle === false) {
            return [];
        }

        $header = fgetcsv($handle);
        if (! is_array($header)) {
            fclose($handle);
            return [];
        }

        $header = array_map(static function ($value) {
            return trim((string) $value);
        }, $header);

        foreach (self::REQUIRED_COLUMNS as $required) {
            if (! in_array($required, $header, true)) {
                fclose($handle);
                throw new \RuntimeException("Thiếu cột bắt buộc trong sheet: {$required}");
            }
        }

        $rows = [];
        while (($data = fgetcsv($handle)) !== false) {
            if ($data === [null] || $data === false) {
                continue;
            }
            $row = [];
            foreach ($header as $index => $column) {
                $row[$column] = trim((string) ($data[$index] ?? ''));
            }
            if (($row['topic_name'] ?? '') === '' || ($row['task_title'] ?? '') === '' || ($row['item_title'] ?? '') === '') {
                continue;
            }
            $rows[] = $row;
        }

        fclose($handle);
        return $rows;
    }

    private function groupRowsByTopic(array $rows): array
    {
        $topics = [];

        foreach ($rows as $row) {
            $topicCode = trim((string) ($row['topic_code'] ?? ''));
            $topicName = trim((string) ($row['topic_name'] ?? ''));
            if ($topicName === '') {
                continue;
            }

            $topicKey = $topicCode !== '' ? "code:{$topicCode}" : 'name:'.mb_strtolower($topicName);
            if (! isset($topics[$topicKey])) {
                $topics[$topicKey] = [
                    'topic_name' => $topicName,
                    'topic_code' => $topicCode !== '' ? $topicCode : null,
                    'topic_description' => trim((string) ($row['topic_description'] ?? '')),
                    'tasks' => [],
                ];
            }

            $taskSort = (int) ($row['task_sort_order'] ?? 0);
            $taskKey = implode('|', [
                $topicKey,
                trim((string) ($row['task_title'] ?? '')),
                $taskSort > 0 ? $taskSort : 0,
            ]);

            if (! isset($topics[$topicKey]['tasks'][$taskKey])) {
                $topics[$topicKey]['tasks'][$taskKey] = [
                    'task_key' => $taskKey,
                    'task_title' => trim((string) ($row['task_title'] ?? '')),
                    'task_description' => trim((string) ($row['task_description'] ?? '')),
                    'task_weight_percent' => $this->toIntInRange($row['task_weight_percent'] ?? null, 1, 100, 1),
                    'task_priority' => trim((string) ($row['task_priority'] ?? 'medium')),
                    'task_status' => trim((string) ($row['task_status'] ?? 'todo')),
                    'task_start_offset_days' => $this->toIntInRange($row['task_start_offset_days'] ?? null, 0, 3650, 0),
                    'task_duration_days' => $this->toIntInRange($row['task_duration_days'] ?? null, 1, 3650, 1),
                    'task_sort_order' => $taskSort > 0 ? $taskSort : (count($topics[$topicKey]['tasks']) + 1),
                    'items' => [],
                ];
            }

            $taskRef = &$topics[$topicKey]['tasks'][$taskKey];
            $taskRef['items'][] = [
                'item_title' => trim((string) ($row['item_title'] ?? '')),
                'item_description' => trim((string) ($row['item_description'] ?? '')),
                'item_weight_percent' => $this->toIntInRange($row['item_weight_percent'] ?? null, 1, 100, 1),
                'item_priority' => trim((string) ($row['item_priority'] ?? 'medium')),
                'item_status' => trim((string) ($row['item_status'] ?? 'todo')),
                'item_start_offset_days' => $this->toIntInRange($row['item_start_offset_days'] ?? null, 0, 3650, 0),
                'item_duration_days' => $this->toIntInRange($row['item_duration_days'] ?? null, 1, 3650, 1),
                'item_sort_order' => $this->toIntInRange($row['item_sort_order'] ?? null, 1, 100000, count($taskRef['items']) + 1),
            ];
            unset($taskRef);
        }

        foreach ($topics as &$topic) {
            $topic['tasks'] = array_values($topic['tasks']);
        }
        unset($topic);

        return $topics;
    }

    private function validateTopicWeights(array $topicData): array
    {
        $taskWeight = 0;
        foreach ($topicData['tasks'] as $task) {
            $taskWeight += (int) $task['task_weight_percent'];
            $itemWeight = 0;
            foreach ($task['items'] as $item) {
                $itemWeight += (int) $item['item_weight_percent'];
            }
            if ($itemWeight > 100) {
                return [false, "Tổng tỷ trọng đầu việc của công việc \"{$task['task_title']}\" = {$itemWeight}% (>100%)."];
            }
        }
        if ($taskWeight > 100) {
            return [false, "Tổng tỷ trọng công việc = {$taskWeight}% (>100%)."];
        }
        return [true, 'ok'];
    }

    private function upsertTopic(array $topicData, string $mode, int &$createdTopics, int &$updatedTopics): WorkflowTopic
    {
        $query = WorkflowTopic::query();
        $code = trim((string) ($topicData['topic_code'] ?? ''));

        if ($code !== '') {
            $topic = $query->where('code', $code)->first();
        } else {
            $topic = $query->where('name', $topicData['topic_name'])->first();
        }

        if (! $topic) {
            $topic = WorkflowTopic::query()->create([
                'name' => $topicData['topic_name'],
                'code' => $code !== '' ? $code : null,
                'description' => $topicData['topic_description'] ?: null,
                'is_active' => true,
            ]);
            $createdTopics++;
            return $topic;
        }

        $topic->update([
            'name' => $topicData['topic_name'],
            'code' => $code !== '' ? $code : $topic->code,
            'description' => $topicData['topic_description'] ?: $topic->description,
        ]);
        $updatedTopics++;

        if ($mode === 'replace') {
            $topic->tasks()->delete();
        }

        return $topic;
    }

    private function toIntInRange($value, int $min, int $max, int $default): int
    {
        if ($value === null || $value === '') {
            return $default;
        }
        $n = (int) $value;
        if ($n < $min) {
            return $min;
        }
        if ($n > $max) {
            return $max;
        }
        return $n;
    }
}
