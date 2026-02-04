<# Enable branch protection for main and show Pages status #>

$owner = 'nicaaureliu'
$repo = 'red-folder-atl'
$branch = 'main'
$token = $env:GITHUB_TOKEN

if (-not $token) {
    Write-Error "GITHUB_TOKEN not set. Set it and re-run the script."
    exit 1
}

$headers = @{
    Authorization = "Bearer $token"
    Accept = 'application/vnd.github+json'
    'User-Agent' = 'protect-main-script'
}

# Check Pages
$pagesUrl = "https://api.github.com/repos/$owner/$repo/pages"
Write-Output "Checking GitHub Pages status..."
try { Invoke-RestMethod -Uri $pagesUrl -Headers $headers -Method Get -ErrorAction Stop | ConvertTo-Json | Write-Output } catch { Write-Output "Pages not configured or access denied: $($_.Exception.Message)" }

# Branch protection payload
$body = @{
    required_status_checks = $null
    enforce_admins = $false
    required_pull_request_reviews = @{
        dismissal_restrictions = @{ }
        dismiss_stale_reviews = $true
        require_code_owner_reviews = $true
        required_approving_review_count = 1
    }
    restrictions = $null
} | ConvertTo-Json -Depth 10

$protectionUrl = "https://api.github.com/repos/$owner/$repo/branches/$branch/protection"
Write-Output "Applying branch protection to '$branch'..."
try {
    Invoke-RestMethod -Uri $protectionUrl -Headers $headers -Method Put -Body $body -ContentType 'application/json' -ErrorAction Stop
    Write-Output "Branch protection applied."
} catch { Write-Error "Failed to apply protection: $($_.Exception.Message)"; exit 1 }

Write-Output "Complete."
