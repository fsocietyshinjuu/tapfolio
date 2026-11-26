param(
  [Parameter(Mandatory = $true)]
  [string]$GitHubUser,

  [string]$RepoName = "tapfolio",

  [string]$CommitMessage = "Initial Tapfolio release"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "Git is not installed. Install it first:" -ForegroundColor Yellow
  Write-Host "  winget install --id Git.Git -e" -ForegroundColor Cyan
  Write-Host "Then restart your terminal and run this script again."
  exit 1
}

$origin = "https://github.com/$GitHubUser/$RepoName.git"

Write-Host "Initializing Tapfolio repository..." -ForegroundColor Cyan

if (-not (Test-Path ".git")) {
  git init -b main
}

git add .

$status = git status --porcelain
if ($status) {
  git commit -m $CommitMessage
} else {
  Write-Host "Nothing new to commit." -ForegroundColor Yellow
}

$remotes = git remote
if ($remotes -contains "origin") {
  git remote set-url origin $origin
} else {
  git remote add origin $origin
}

Write-Host "Pushing to $origin ..." -ForegroundColor Cyan
git push -u origin main

Write-Host ""
Write-Host "Done. In GitHub, go to Settings > Pages > Source and choose GitHub Actions." -ForegroundColor Green
Write-Host "Site: https://$GitHubUser.github.io/$RepoName/" -ForegroundColor Green
Write-Host "Profile: https://$GitHubUser.github.io/$RepoName/u/shinjuu" -ForegroundColor Green
