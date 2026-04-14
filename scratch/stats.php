<?php
header('Content-Type: application/json');

function get_cpu_usage() {
    $load = sys_getloadavg();
    return $load[0]; // 1 min average
}

function get_memory_usage() {
    $free = shell_exec('free -m');
    $free = (string)trim($free);
    $free_arr = explode("\n", $free);
    $mem = explode(" ", preg_replace('/\s+/', ' ', $free_arr[1]));
    
    $total = $mem[1];
    $used = $mem[2];
    $percent = round(($used / $total) * 100, 2);
    
    return [
        'total' => $total,
        'used' => $used,
        'percent' => $percent
    ];
}

function get_disk_usage() {
    $disktotal = disk_total_space("/");
    $diskfree = disk_free_space("/");
    $used = $disktotal - $diskfree;
    
    return [
        'total' => round($disktotal / (1024 * 1024 * 1024), 2),
        'used' => round($used / (1024 * 1024 * 1024), 2),
        'percent' => round(($used / $disktotal) * 100, 2)
    ];
}

function get_uptime() {
    $uptime = shell_exec('uptime -p');
    return trim($uptime);
}

$response = [
    'status' => 'success',
    'timestamp' => time(),
    'data' => [
        'cpu' => get_cpu_usage(),
        'memory' => get_memory_usage(),
        'disk' => get_disk_usage(),
        'uptime' => get_uptime()
    ]
];

echo json_encode($response);
?>
