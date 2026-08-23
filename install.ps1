#Requires -Version 5.1
[CmdletBinding()]
param(
  [switch]$Uninstall,
  [string]$Branch = 'main',
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\spark-cli')
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$BinDir = Join-Path $InstallDir 'bin'
$Shim = Join-Path $BinDir 'spark.cmd'
$Archive = 'https://github.com/T4meri/spark-cli/archive/refs/heads/{0}.zip' -f $Branch

function Write-Step { param($Text) Write-Host "  $Text" -ForegroundColor DarkGray }
function Write-Good { param($Text) Write-Host "  $Text" -ForegroundColor Green }
function Write-Bad  { param($Text) Write-Host "  $Text" -ForegroundColor Red }

function Get-UserPath {
  [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Remove-FromPath {
  $current = Get-UserPath
  if (-not $current) { return }

  $kept = $current -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ne $BinDir.TrimEnd('\') }
  [Environment]::SetEnvironmentVariable('Path', ($kept -join ';'), 'User')
}

function Add-ToPath {
  $current = Get-UserPath
  $already = $current -split ';' | Where-Object { $_.TrimEnd('\') -eq $BinDir.TrimEnd('\') }

  if ($already) {
    Write-Step "already on your PATH"
    return $false
  }

  $updated = if ([string]::IsNullOrWhiteSpace($current)) { $BinDir } else { "$($current.TrimEnd(';'));$BinDir" }
  [Environment]::SetEnvironmentVariable('Path', $updated, 'User')
  $env:Path = "$env:Path;$BinDir"
  return $true
}

Write-Host ''
Write-Host '  Spark CLI' -ForegroundColor White

if ($Uninstall) {
  Write-Host ''
  if (Test-Path $InstallDir) {
    Remove-Item -Recurse -Force $InstallDir
    Write-Good "removed $InstallDir"
  } else {
    Write-Step "nothing installed at $InstallDir"
  }

  Remove-FromPath
  Write-Good 'taken off your PATH'
  Write-Host ''
  Write-Step 'your API key was left alone, delete it with: spark auth rm'
  Write-Host ''
  return
}

Write-Host ''

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Bad 'Node.js is not installed, or not on your PATH.'
  Write-Step 'Get it from https://nodejs.org and run this again. Version 20 or newer.'
  Write-Host ''
  exit 1
}

$version = (& node --version).TrimStart('v')
$major = [int]($version -split '\.')[0]

if ($major -lt 20) {
  Write-Bad "Node $version is too old. Spark CLI needs 20 or newer."
  Write-Host ''
  exit 1
}

Write-Good "node v$version"

$temp = Join-Path ([IO.Path]::GetTempPath()) ("spark-cli-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null

try {
  Write-Step "downloading $Branch"
  $zip = Join-Path $temp 'spark-cli.zip'
  Invoke-WebRequest -Uri $Archive -OutFile $zip -UseBasicParsing

  Write-Step 'unpacking'
  Expand-Archive -Path $zip -DestinationPath $temp -Force

  $unpacked = Get-ChildItem -Path $temp -Directory | Where-Object { $_.Name -like 'spark-cli-*' } | Select-Object -First 1
  if (-not $unpacked) { throw 'The archive did not contain what was expected.' }

  if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

  foreach ($item in @('bin', 'src', 'package.json', 'README.md', 'LICENSE')) {
    $source = Join-Path $unpacked.FullName $item
    if (Test-Path $source) { Copy-Item -Recurse -Force $source $InstallDir }
  }

  New-Item -ItemType Directory -Path $BinDir -Force | Out-Null

  $entry = Join-Path $InstallDir 'bin\spark.js'
  Set-Content -Path $Shim -Encoding ASCII -Value @(
    '@echo off',
    "node `"$entry`" %*"
  )

  Write-Good "installed to $InstallDir"
}
finally {
  Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
}

$added = Add-ToPath
if ($added) { Write-Good "added $BinDir to your PATH" }

Write-Host ''
& $Shim --version | ForEach-Object { Write-Good "spark $_" }
Write-Host ''
Write-Host '  Next' -ForegroundColor White
Write-Step 'spark login                     paste a key from the web app'
Write-Step 'spark chart "days per month"    see what it can do'
Write-Step 'spark --help                    everything else'
Write-Host ''

if ($added) {
  Write-Step 'open a new terminal first, so it picks up the PATH change'
  Write-Host ''
}
