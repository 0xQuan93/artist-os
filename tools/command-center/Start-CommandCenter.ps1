param(
  [int]$Port = 8989,
  [ValidateSet('overview', 'nursery', 'incubator', 'tools', 'asset-forge', 'music-maker', 'visual-maker', 'gallery', 'journey', 'music', 'approvals', 'publishing', 'metrics')]
  [string]$View = 'overview',
  [switch]$NoBrowser,
  [switch]$ConfigurePostiz,
  [switch]$ConfigureQuilLive,
  [string]$PostizApiUrl = 'https://api.postiz.com'
)

$ErrorActionPreference = 'Stop'
$AppRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BaseUrl = "http://127.0.0.1:$Port"
$Url = if ($View -eq 'overview') { $BaseUrl } else { "$BaseUrl/?view=$View" }
$InUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if (-not $InUse) {
  & node (Join-Path $AppRoot 'doctor.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Command Center readiness check failed.' }

  $PreviousPort = $env:PORT
  $PreviousPostizEnabled = $env:ARTISTOS_ENABLE_POSTIZ
  $PreviousPostizKey = $env:POSTIZ_API_KEY
  $PreviousPostizUrl = $env:POSTIZ_API_URL
  $PreviousQuilLiveEnabled = $env:ARTISTOS_ENABLE_QUIL_LIVE
  $PreviousQuilLiveToken = $env:ARTISTOS_QUIL_LIVE_TOKEN
  $env:PORT = "$Port"
  Remove-Item Env:ARTISTOS_ENABLE_POSTIZ -ErrorAction SilentlyContinue
  Remove-Item Env:POSTIZ_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:POSTIZ_API_URL -ErrorAction SilentlyContinue
  Remove-Item Env:ARTISTOS_ENABLE_QUIL_LIVE -ErrorAction SilentlyContinue
  Remove-Item Env:ARTISTOS_QUIL_LIVE_TOKEN -ErrorAction SilentlyContinue
  if ($ConfigurePostiz) {
    $SecureKey = Read-Host 'Paste your Postiz API key (input is hidden)' -AsSecureString
    $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureKey)
    try {
      $env:ARTISTOS_ENABLE_POSTIZ = '1'
      $env:POSTIZ_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
      $env:POSTIZ_API_URL = $PostizApiUrl
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)
    }
  }
  if ($ConfigureQuilLive) {
    $SecureQuilToken = Read-Host 'Enter a private QUIL LIVE token of at least 32 characters (input is hidden)' -AsSecureString
    $QuilPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureQuilToken)
    try {
      $QuilToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($QuilPointer)
      if ($QuilToken.Length -lt 32) { throw 'The QUIL LIVE token must contain at least 32 characters.' }
      $env:ARTISTOS_ENABLE_QUIL_LIVE = '1'
      $env:ARTISTOS_QUIL_LIVE_TOKEN = $QuilToken
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($QuilPointer)
    }
  }
  try {
    Start-Process node -ArgumentList 'server.mjs' -WorkingDirectory $AppRoot -WindowStyle Hidden
  } finally {
    if ($null -eq $PreviousPort) { Remove-Item Env:PORT -ErrorAction SilentlyContinue } else { $env:PORT = $PreviousPort }
    if ($null -eq $PreviousPostizEnabled) { Remove-Item Env:ARTISTOS_ENABLE_POSTIZ -ErrorAction SilentlyContinue } else { $env:ARTISTOS_ENABLE_POSTIZ = $PreviousPostizEnabled }
    if ($null -eq $PreviousPostizKey) { Remove-Item Env:POSTIZ_API_KEY -ErrorAction SilentlyContinue } else { $env:POSTIZ_API_KEY = $PreviousPostizKey }
    if ($null -eq $PreviousPostizUrl) { Remove-Item Env:POSTIZ_API_URL -ErrorAction SilentlyContinue } else { $env:POSTIZ_API_URL = $PreviousPostizUrl }
    if ($null -eq $PreviousQuilLiveEnabled) { Remove-Item Env:ARTISTOS_ENABLE_QUIL_LIVE -ErrorAction SilentlyContinue } else { $env:ARTISTOS_ENABLE_QUIL_LIVE = $PreviousQuilLiveEnabled }
    if ($null -eq $PreviousQuilLiveToken) { Remove-Item Env:ARTISTOS_QUIL_LIVE_TOKEN -ErrorAction SilentlyContinue } else { $env:ARTISTOS_QUIL_LIVE_TOKEN = $PreviousQuilLiveToken }
  }
} elseif ($ConfigurePostiz -or $ConfigureQuilLive) {
  throw "Port $Port is already in use. Stop the current Command Center before relaunching with integration credentials."
}

try {
  $Status = $null
  for ($Attempt = 0; $Attempt -lt 20 -and -not $Status; $Attempt++) {
    try { $Status = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api/health" -TimeoutSec 2 } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $Status) { throw 'The local health endpoint did not respond.' }
  if ($Status.StatusCode -ne 200) { throw "Unexpected status $($Status.StatusCode)" }
  $Health = $Status.Content | ConvertFrom-Json
  if (-not $Health.ok -or $Health.mode -ne 'LOCAL_PRIVATE') {
    throw "A different or unhealthy service is already running on port $Port."
  }
} catch {
  throw "Command Center did not start at $Url. $($_.Exception.Message)"
}

Write-Host "ArtistOS // REGALIA Command Center: $Url"
if (-not $NoBrowser) { Start-Process $Url }
