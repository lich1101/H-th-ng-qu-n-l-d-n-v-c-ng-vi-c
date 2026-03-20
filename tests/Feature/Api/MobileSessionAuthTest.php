<?php

namespace Tests\Feature\Api;

use App\Models\User;
use App\Models\UserDeviceToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MobileSessionAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_revokes_existing_mobile_tokens_and_device_tokens(): void
    {
        $user = User::factory()->create([
            'password' => bcrypt('secret123'),
        ]);

        $user->createToken('old-mobile-a');
        $user->createToken('old-mobile-b');

        UserDeviceToken::query()->create([
            'user_id' => $user->id,
            'token' => 'old-device-token',
            'platform' => 'android',
            'device_name' => 'Jobs ClickOn',
            'last_seen_at' => now()->subMinute(),
        ]);

        $response = $this->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => 'secret123',
            'device_name' => 'Jobs ClickOn',
        ]);

        $response->assertOk();
        $this->assertDatabaseCount('personal_access_tokens', 1);
        $this->assertDatabaseCount('user_device_tokens', 0);
    }

    public function test_logout_clears_current_user_device_token(): void
    {
        $user = User::factory()->create();
        UserDeviceToken::query()->create([
            'user_id' => $user->id,
            'token' => 'device-token-1',
            'platform' => 'android',
            'device_name' => 'Jobs ClickOn',
            'last_seen_at' => now(),
        ]);

        Sanctum::actingAs($user, ['mobile']);

        $response = $this->postJson('/api/v1/logout');

        $response->assertOk();
        $this->assertDatabaseCount('user_device_tokens', 0);
    }
}
