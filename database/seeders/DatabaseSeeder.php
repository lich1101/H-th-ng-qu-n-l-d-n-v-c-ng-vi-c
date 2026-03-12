<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     *
     * @return void
     */
    public function run()
    {
        if (filter_var(env('SEED_ONLY_USERS', false), FILTER_VALIDATE_BOOLEAN)) {
            $this->call([
                UsersOnlySeeder::class,
            ]);
            return;
        }

        $this->call([
            DemoDataSeeder::class,
        ]);
    }
}
