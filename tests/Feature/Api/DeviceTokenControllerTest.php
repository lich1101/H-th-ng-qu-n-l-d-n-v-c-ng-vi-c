<?php

namespace Tests\Feature\Api;

use App\Models\User;
use App\Models\UserDeviceToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DeviceTokenControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_store_replaces_old_tokens_of_same_user(): void
    {
        $user = User::factory()->create();

        UserDeviceToken::query()->create([
            'user_id' => $user->id,
            'token' => 'old-token-1',
            'platform' => 'android',
            'device_name' => 'Job ClickOn',
            'last_seen_at' => now()->subHour(),
        ]);
        UserDeviceToken::query()->create([
            'user_id' => $user->id,
            'token' => 'old-token-2',
            'platform' => 'ios',
            'device_name' => 'Job ClickOn',
            'last_seen_at' => now()->subMinutes(30),
        ]);

        Sanctum::actingAs($user);
        $res = $this->postJson('/api/v1/device-tokens', [
            'token' => 'new-token-abc',
            'platform' => 'android',
            'device_name' => 'Job ClickOn',
            'notifications_enabled' => true,
        ]);

        $res->assertOk();
        $this->assertDatabaseCount('user_device_tokens', 1);
        $this->assertDatabaseHas('user_device_tokens', [
            'user_id' => $user->id,
            'token' => 'new-token-abc',
            'platform' => 'android',
            'device_name' => 'Job ClickOn',
            'notifications_enabled' => true,
        ]);
        $this->assertDatabaseMissing('user_device_tokens', ['token' => 'old-token-1']);
        $this->assertDatabaseMissing('user_device_tokens', ['token' => 'old-token-2']);
    }

    public function test_store_moves_existing_token_to_current_user(): void
    {
        $oldOwner = User::factory()->create();
        $newOwner = User::factory()->create();

        UserDeviceToken::query()->create([
            'user_id' => $oldOwner->id,
            'token' => 'shared-token-123',
            'platform' => 'android',
            'device_name' => 'Job ClickOn',
            'last_seen_at' => now()->subMinutes(10),
        ]);

        Sanctum::actingAs($newOwner);
        $res = $this->postJson('/api/v1/device-tokens', [
            'token' => 'shared-token-123',
            'platform' => 'android',
            'device_name' => 'Job ClickOn',
            'notifications_enabled' => true,
        ]);

        $res->assertOk();
        $this->assertDatabaseHas('user_device_tokens', [
            'user_id' => $newOwner->id,
            'token' => 'shared-token-123',
        ]);
        $this->assertDatabaseMissing('user_device_tokens', [
            'user_id' => $oldOwner->id,
            'token' => 'shared-token-123',
        ]);
    }
}
