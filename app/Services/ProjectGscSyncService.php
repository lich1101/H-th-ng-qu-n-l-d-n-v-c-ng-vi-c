<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\Project;
use App\Models\ProjectGscDailyStat;
use Illuminate\Support\Carbon;

class ProjectGscSyncService
{
    private $searchConsole;

    public function __construct(GoogleSearchConsoleService $searchConsole)
    {
        $this->searchConsole = $searchConsole;
    }

    public function syncProject(Project $project, bool $force = false): ?ProjectGscDailyStat
    {
        $siteUrl = $this->normalizeSiteUrl($project->website_url);
        if (! $siteUrl) {
            return null;
        }

        $setting = AppSetting::query()->first();
        if (! $this->canSync($setting)) {
            return null;
        }

        $now = Carbon::now('Asia/Ho_Chi_Minh');
        $metricDate = $now->copy()->subDay()->toDateString();
        $priorDate = $now->copy()->subDays(6)->toDateString();

        if (! $force) {
            $existing = ProjectGscDailyStat::query()
                ->where('project_id', $project->id)
                ->whereDate('metric_date', $metricDate)
                ->first();
            if ($existing && $existing->updated_at && $existing->updated_at->isToday()) {
                return $existing;
            }
        }

        $accessToken = $this->searchConsole->getAccessToken($setting);
        if (! $accessToken) {
            throw new \RuntimeException('Không lấy được access token Google Search Console. Kiểm tra client_id/client_secret/refresh_token.');
        }

        $rowLimit = max(100, min((int) ($setting->gsc_row_limit ?? 2500), 25000));
        $dataState = in_array((string) ($setting->gsc_data_state ?? 'all'), ['all', 'final'], true)
            ? (string) $setting->gsc_data_state
            : 'all';

        $priorRaw = $this->searchConsole->querySearchAnalytics(
            $accessToken,
            $siteUrl,
            $priorDate,
            $priorDate,
            $rowLimit,
            $dataState
        );
        $lastRaw = $this->searchConsole->querySearchAnalytics(
            $accessToken,
            $siteUrl,
            $metricDate,
            $metricDate,
            $rowLimit,
            $dataState
        );

        $priorRows = $this->normalizeRows('priorDay', $priorRaw);
        $lastRows = $this->normalizeRows('lastDay', $lastRaw);
        $compared = $this->compareRows($priorRows, $lastRows);

        $brandTerms = $this->brandTerms($setting);
        $recipesPath = trim((string) ($setting->gsc_recipes_path_token ?? '/recipes'));
        $segments = $this->segmentRows($compared, $brandTerms, $recipesPath !== '' ? $recipesPath : '/recipes');

        $threshold = max(1, min((int) ($setting->gsc_alert_threshold_percent ?? 30), 100));
        $alertsBrand = $this->countFlaggedAlerts($segments['brand'], $threshold);
        $alertsBrandRecipes = $this->countFlaggedAlerts($segments['brandRecipes'], $threshold);
        $alertsRecipes = $this->countFlaggedAlerts($segments['recipes'], $threshold);
        $alertsNonbrand = $this->countFlaggedAlerts($segments['nonbrand'], $threshold);

        $lastClicks = $this->sumInt($lastRows, 'clicks');
        $priorClicks = $this->sumInt($priorRows, 'clicks');
        $lastImpressions = $this->sumInt($lastRows, 'impressions');
        $priorImpressions = $this->sumInt($priorRows, 'impressions');

        $lastCtr = $this->safeCtr($lastClicks, $lastImpressions);
        $priorCtr = $this->safeCtr($priorClicks, $priorImpressions);
        $lastPosition = $this->weightedAveragePosition($lastRows);
        $priorPosition = $this->weightedAveragePosition($priorRows);

        $topMovers = array_values(array_slice(array_map(function (array $row): array {
            return [
                'page' => $row['page'],
                'query' => $row['query'],
                'delta_clicks' => $row['deltaClicks'],
                'percent_change_clicks' => $row['percentChangeClicksValue'],
                'clicks_last' => $row['clicksLastDay'],
                'clicks_prior' => $row['clicksPriorDay'],
                'delta_impressions' => $row['deltaImpressions'],
                'delta_position' => $row['deltaPosition'],
            ];
        }, $compared), 0, 40));

        $data = [
            'prior_date' => $priorDate,
            'site_url' => $siteUrl,
            'prior_rows_count' => count($priorRows),
            'last_rows_count' => count($lastRows),
            'compared_rows_count' => count($compared),
            'last_clicks' => $lastClicks,
            'prior_clicks' => $priorClicks,
            'delta_clicks' => $lastClicks - $priorClicks,
            'delta_clicks_percent' => $this->safePercent($lastClicks - $priorClicks, $priorClicks),
            'last_impressions' => $lastImpressions,
            'prior_impressions' => $priorImpressions,
            'delta_impressions' => $lastImpressions - $priorImpressions,
            'last_ctr' => $lastCtr,
            'prior_ctr' => $priorCtr,
            'delta_ctr' => ($lastCtr !== null && $priorCtr !== null) ? ($lastCtr - $priorCtr) : null,
            'last_avg_position' => $lastPosition,
            'prior_avg_position' => $priorPosition,
            'delta_avg_position' => ($lastPosition !== null && $priorPosition !== null) ? ($lastPosition - $priorPosition) : null,
            'alerts_brand' => $alertsBrand,
            'alerts_brand_recipes' => $alertsBrandRecipes,
            'alerts_recipes' => $alertsRecipes,
            'alerts_nonbrand' => $alertsNonbrand,
            'alerts_total' => $alertsBrand + $alertsBrandRecipes + $alertsRecipes + $alertsNonbrand,
            'segment_totals' => [
                'brand' => count($segments['brand']),
                'brand_recipes' => count($segments['brandRecipes']),
                'recipes' => count($segments['recipes']),
                'nonbrand' => count($segments['nonbrand']),
            ],
            'top_movers' => $topMovers,
        ];

        $stat = ProjectGscDailyStat::query()->updateOrCreate(
            [
                'project_id' => $project->id,
                'metric_date' => $metricDate,
            ],
            $data
        );

        return $stat->fresh();
    }

    public function latest(Project $project): ?ProjectGscDailyStat
    {
        return ProjectGscDailyStat::query()
            ->where('project_id', $project->id)
            ->orderByDesc('metric_date')
            ->orderByDesc('id')
            ->first();
    }

    public function trend(Project $project, int $days = 21): array
    {
        $days = max(1, min($days, 120));
        $fromDate = Carbon::now('Asia/Ho_Chi_Minh')->subDays($days - 1)->toDateString();

        return ProjectGscDailyStat::query()
            ->where('project_id', $project->id)
            ->whereDate('metric_date', '>=', $fromDate)
            ->orderBy('metric_date')
            ->get()
            ->map(function (ProjectGscDailyStat $row): array {
                return [
                    'date' => optional($row->metric_date)->toDateString(),
                    'clicks' => (int) ($row->last_clicks ?? 0),
                    'impressions' => (int) ($row->last_impressions ?? 0),
                    'delta_clicks' => (int) ($row->delta_clicks ?? 0),
                    'delta_clicks_percent' => $row->delta_clicks_percent !== null
                        ? round((float) $row->delta_clicks_percent, 2)
                        : null,
                    'alerts_total' => (int) ($row->alerts_total ?? 0),
                ];
            })
            ->values()
            ->all();
    }

    public function canSync(?AppSetting $setting): bool
    {
        if (! $setting || ! (bool) ($setting->gsc_enabled ?? false)) {
            return false;
        }

        return $this->searchConsole->isConfigured($setting);
    }

    public function normalizeSiteUrl(?string $raw): ?string
    {
        $value = trim((string) $raw);
        if ($value === '') {
            return null;
        }

        if (! preg_match('/^https?:\/\//i', $value)) {
            $value = 'https://'.$value;
        }

        $parts = parse_url($value);
        if (! is_array($parts) || empty($parts['host'])) {
            return null;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? 'https'));
        $host = strtolower((string) $parts['host']);
        $port = isset($parts['port']) ? ':'.$parts['port'] : '';
        $path = isset($parts['path']) ? rtrim((string) $parts['path'], '/') : '';
        $path = $path === '' ? '/' : $path.'/';

        return "{$scheme}://{$host}{$port}{$path}";
    }

    private function normalizeRows(string $day, array $rows): array
    {
        return array_map(function ($row) use ($day): array {
            return [
                'day' => $day,
                'page' => data_get($row, 'keys.0'),
                'query' => data_get($row, 'keys.1'),
                'clicks' => (int) data_get($row, 'clicks', 0),
                'impressions' => (int) data_get($row, 'impressions', 0),
                'ctr' => (float) data_get($row, 'ctr', 0),
                'position' => data_get($row, 'position') === null
                    ? null
                    : (float) data_get($row, 'position', 0),
            ];
        }, $rows);
    }

    private function compareRows(array $priorRows, array $lastRows): array
    {
        $priorMap = [];
        foreach ($priorRows as $row) {
            if (empty($row['page']) || empty($row['query'])) {
                continue;
            }
            $priorMap[$row['page'].'|||'.$row['query']] = $row;
        }

        $out = [];
        foreach ($lastRows as $row) {
            if (empty($row['page']) || empty($row['query'])) {
                continue;
            }

            $key = $row['page'].'|||'.$row['query'];
            $prior = $priorMap[$key] ?? null;
            if (! $prior) {
                continue;
            }

            $deltaClicks = (int) $row['clicks'] - (int) $prior['clicks'];
            $deltaImpressions = (int) $row['impressions'] - (int) $prior['impressions'];
            $deltaCtr = (float) $row['ctr'] - (float) $prior['ctr'];
            $deltaPosition = ($row['position'] === null || $prior['position'] === null)
                ? null
                : ((float) $row['position'] - (float) $prior['position']);

            $pctClicks = (int) $prior['clicks'] !== 0
                ? (($deltaClicks / (int) $prior['clicks']) * 100)
                : null;

            $out[] = [
                'page' => $row['page'],
                'query' => $row['query'],
                'deltaClicks' => $deltaClicks,
                'percentChangeClicks' => $pctClicks === null ? null : round($pctClicks, 1).'%',
                'percentChangeClicksValue' => $pctClicks,
                'clicksLastDay' => (int) $row['clicks'],
                'clicksPriorDay' => (int) $prior['clicks'],
                'deltaImpressions' => $deltaImpressions,
                'deltaCTR' => round($deltaCtr * 100, 1).'%',
                'deltaPosition' => $deltaPosition,
            ];
        }

        usort($out, function (array $a, array $b): int {
            return (int) $b['deltaClicks'] <=> (int) $a['deltaClicks'];
        });

        return $out;
    }

    private function segmentRows(array $rows, array $brandTerms, string $recipesPath): array
    {
        $segments = [
            'brand' => [],
            'brandRecipes' => [],
            'recipes' => [],
            'nonbrand' => [],
        ];

        foreach ($rows as $row) {
            $query = mb_strtolower((string) ($row['query'] ?? ''));
            $page = mb_strtolower((string) ($row['page'] ?? ''));

            $isBrand = false;
            foreach ($brandTerms as $term) {
                if ($term !== '' && str_contains($query, $term)) {
                    $isBrand = true;
                    break;
                }
            }

            $isRecipes = str_contains($page, mb_strtolower($recipesPath));

            if ($isBrand && $isRecipes) {
                $segments['brandRecipes'][] = $row;
            } elseif ($isBrand) {
                $segments['brand'][] = $row;
            } elseif ($isRecipes) {
                $segments['recipes'][] = $row;
            } else {
                $segments['nonbrand'][] = $row;
            }
        }

        return $segments;
    }

    private function countFlaggedAlerts(array $rows, int $threshold): int
    {
        $count = 0;
        foreach ($rows as $row) {
            $pct = (float) ($row['percentChangeClicksValue'] ?? 0);
            if (abs($pct) >= $threshold) {
                $count++;
            }
        }
        return $count;
    }

    private function sumInt(array $rows, string $key): int
    {
        $total = 0;
        foreach ($rows as $row) {
            $total += (int) ($row[$key] ?? 0);
        }
        return $total;
    }

    private function safeCtr(int $clicks, int $impressions): ?float
    {
        if ($impressions <= 0) {
            return null;
        }

        return $clicks / $impressions;
    }

    private function safePercent(int $delta, int $base): ?float
    {
        if ($base === 0) {
            return null;
        }

        return round(($delta / $base) * 100, 2);
    }

    private function weightedAveragePosition(array $rows): ?float
    {
        $weightedSum = 0.0;
        $weightTotal = 0;

        foreach ($rows as $row) {
            if ($row['position'] === null) {
                continue;
            }
            $weight = max(0, (int) ($row['impressions'] ?? 0));
            if ($weight <= 0) {
                continue;
            }

            $weightedSum += ((float) $row['position']) * $weight;
            $weightTotal += $weight;
        }

        if ($weightTotal <= 0) {
            return null;
        }

        return round($weightedSum / $weightTotal, 3);
    }

    private function brandTerms(AppSetting $setting): array
    {
        $terms = $setting->gsc_brand_terms;
        if (! is_array($terms)) {
            return [];
        }

        $clean = [];
        foreach ($terms as $term) {
            $value = mb_strtolower(trim((string) $term));
            if ($value === '') {
                continue;
            }
            $clean[] = $value;
        }

        return array_values(array_unique($clean));
    }
}
