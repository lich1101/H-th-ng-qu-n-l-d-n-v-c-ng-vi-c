<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

class ExpandClientsPhoneLength extends Migration
{
    public function up()
    {
        $driver = DB::getDriverName();

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE clients MODIFY phone VARCHAR(255) NULL');
            return;
        }

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE clients ALTER COLUMN phone TYPE VARCHAR(255)');
        }
    }

    public function down()
    {
        $driver = DB::getDriverName();

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE clients MODIFY phone VARCHAR(30) NULL');
            return;
        }

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE clients ALTER COLUMN phone TYPE VARCHAR(30)');
        }
    }
}

