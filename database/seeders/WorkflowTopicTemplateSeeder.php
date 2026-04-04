<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;

class WorkflowTopicTemplateSeeder extends Seeder
{
    /**
     * Seed workflow topic templates from CSV sheet.
     */
    public function run(): void
    {
        $exitCode = Artisan::call('workflow:import-sheet', [
            '--file' => 'database/seeders/data/workflow-topic-template.csv',
            '--mode' => 'replace',
        ]);

        $this->command?->line(Artisan::output());

        if ($exitCode !== 0) {
            throw new \RuntimeException('Seed WorkflowTopicTemplateSeeder thất bại.');
        }
    }
}
