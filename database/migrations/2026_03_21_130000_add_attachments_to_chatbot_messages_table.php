<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('chatbot_messages')) {
            return;
        }

        Schema::table('chatbot_messages', function (Blueprint $table) {
            if (! Schema::hasColumn('chatbot_messages', 'attachment_path')) {
                $table->string('attachment_path', 1024)->nullable()->after('content');
            }
            if (! Schema::hasColumn('chatbot_messages', 'attachment_url')) {
                $table->string('attachment_url', 1024)->nullable()->after('attachment_path');
            }
            if (! Schema::hasColumn('chatbot_messages', 'attachment_name')) {
                $table->string('attachment_name', 255)->nullable()->after('attachment_url');
            }
            if (! Schema::hasColumn('chatbot_messages', 'attachment_mime')) {
                $table->string('attachment_mime', 191)->nullable()->after('attachment_name');
            }
            if (! Schema::hasColumn('chatbot_messages', 'attachment_size')) {
                $table->unsignedBigInteger('attachment_size')->nullable()->after('attachment_mime');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('chatbot_messages')) {
            return;
        }

        Schema::table('chatbot_messages', function (Blueprint $table) {
            if (Schema::hasColumn('chatbot_messages', 'attachment_size')) {
                $table->dropColumn('attachment_size');
            }
            if (Schema::hasColumn('chatbot_messages', 'attachment_mime')) {
                $table->dropColumn('attachment_mime');
            }
            if (Schema::hasColumn('chatbot_messages', 'attachment_name')) {
                $table->dropColumn('attachment_name');
            }
            if (Schema::hasColumn('chatbot_messages', 'attachment_url')) {
                $table->dropColumn('attachment_url');
            }
            if (Schema::hasColumn('chatbot_messages', 'attachment_path')) {
                $table->dropColumn('attachment_path');
            }
        });
    }
};
