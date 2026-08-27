[CmdletBinding()]
param(
    [ValidateSet('gui', 'install', 'repair', 'uninstall', 'none')]
    [string]$Action = 'gui',
    [string[]]$Root,
    [string]$InstallDir,
    [switch]$NoRestart,
    [switch]$NoDiscordConfig,
    [switch]$SelfTest,
    [string]$Repo = 'DarkModeBR/DiscordUtils',
    [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$script:SelfPath = $null
try { $script:SelfPath = $MyInvocation.MyCommand.Path } catch { $script:SelfPath = $null }
$script:IsPiped = -not $script:SelfPath

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir -and $script:SelfPath) {
    try { $ScriptDir = Split-Path -Parent $script:SelfPath } catch { $ScriptDir = $null }
}

$script:PluginSrc = $null
if ($ScriptDir) {
    if (Test-Path (Join-Path $ScriptDir 'renderer.js')) {
        $script:PluginSrc = $ScriptDir
    } elseif (Test-Path (Join-Path $ScriptDir 'plugin' | Join-Path -ChildPath 'renderer.js')) {
        $script:PluginSrc = Join-Path $ScriptDir 'plugin'
    }
}
$script:FromRepo = -not $script:PluginSrc

$Install     = if ($InstallDir) { $InstallDir } else { Join-Path $env:APPDATA 'DiscordUtils' }
$InjectFile  = Join-Path $Install 'inject.js'
$MarkerStart = '/* === DiscordUtils inject start === */'
$MarkerEnd   = '/* === DiscordUtils inject end === */'
$DevFlag     = 'DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING'
$DisblockUrl = 'https://allpurposemat.codeberg.page/Disblock-Origin/DisblockOrigin.theme.css'


Add-Type -Namespace DiscordUtils -Name NativeConsole -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("kernel32.dll")] public static extern bool FreeConsole();
[DllImport("kernel32.dll")] public static extern uint GetConsoleProcessList(uint[] buffer, uint count);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'@

function Start-DedicatedGui {
    $dir = Join-Path $env:TEMP 'DiscordUtils-boot'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $self = Join-Path $dir 'install-plugin.ps1'
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
    try {
        Invoke-WebRequest -UseBasicParsing -OutFile $self -Uri "https://raw.githubusercontent.com/$Repo/$Branch/plugin/install-plugin.ps1"
    } catch {
        Write-Host "  Nao consegui baixar o instalador de $Repo ($Branch):" -ForegroundColor Red
        Write-Host "  $($_.Exception.Message)" -ForegroundColor DarkGray
        return
    }
    Start-Process powershell -WindowStyle Hidden -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$self`""
    )
    Write-Host ''
    Write-Host '  Abrindo o Discord Utils...' -ForegroundColor Green
    Write-Host '  Use a janela para instalar.' -ForegroundColor DarkGray
    Write-Host ''
}

function Hide-Console {
    if ($script:IsPiped) { return }
    try {
        $h = [DiscordUtils.NativeConsole]::GetConsoleWindow()
        $buf = New-Object uint32[] 8
        $n = [DiscordUtils.NativeConsole]::GetConsoleProcessList($buf, 8)
        if ($h -ne [IntPtr]::Zero -and $n -le 1) {
            [void][DiscordUtils.NativeConsole]::ShowWindow($h, 0)
        }
        [void][DiscordUtils.NativeConsole]::FreeConsole()
    } catch { }
}

$script:LogSink = { param($m, $k)
    $color = switch ($k) { 'ok' { 'Green' } 'warn' { 'Yellow' } 'err' { 'Red' } default { 'Cyan' } }
    Write-Host "  $m" -ForegroundColor $color
}
function Write-Log([string]$m, [string]$k = 'info') { & $script:LogSink $m $k }

function Write-StatusLine {
    $st = Get-PatchStatus
    if (-not $st.Installed) { Write-Log 'Status: nao instalado' 'warn' }
    elseif ($st.Active) { Write-Log 'Status: instalado e ativo' 'ok' }
    else { Write-Log 'Status: instalado - rode Reparar' 'warn' }
}

function Get-DiscordRoots {
    if ($Root) { return , @($Root | Where-Object { Test-Path $_ }) }
    $out = @()
    foreach ($n in @('Discord', 'DiscordCanary', 'DiscordPTB')) {
        $p = Join-Path $env:LOCALAPPDATA $n
        if (Test-Path $p) { $out += $p }
    }
    return , $out
}

function Get-CoreTargets {
    $targets = @()
    foreach ($root in (Get-DiscordRoots)) {
        $apps = Get-ChildItem -Path $root -Directory -Filter 'app-*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending
        foreach ($app in $apps) {
            $modules = Join-Path $app.FullName 'modules'
            if (-not (Test-Path $modules)) { continue }
            $core = Get-ChildItem -Path $modules -Directory -Filter 'discord_desktop_core-*' -ErrorAction SilentlyContinue |
                    Sort-Object Name -Descending | Select-Object -First 1
            if (-not $core) { continue }
            $idx = Join-Path $core.FullName 'discord_desktop_core\index.js'
            if (Test-Path $idx) {
                $targets += [pscustomobject]@{ Index = $idx; AppDir = $app.FullName; Root = $root }
            }
        }
    }
    return , $targets
}

function Find-DiscordExe {
    foreach ($root in (Get-DiscordRoots)) {
        $apps = Get-ChildItem -Path $root -Directory -Filter 'app-*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending
        foreach ($app in $apps) {
            foreach ($n in @('Discord.exe', 'DiscordCanary.exe', 'DiscordPTB.exe')) {
                $exe = Join-Path $app.FullName $n
                if (Test-Path $exe) { return $exe }
            }
        }
    }
    return $null
}

function Get-PatchStatus {
    $script:AllTargets = Get-CoreTargets
    $active = $true
    $seen = $false
    foreach ($root in (Get-DiscordRoots)) {
        $newest = Get-ChildItem -Path $root -Directory -Filter 'app-*' -ErrorAction SilentlyContinue |
                  Sort-Object Name -Descending | Select-Object -First 1
        if (-not $newest) { continue }
        $idx = ($script:AllTargets | Where-Object { $_.AppDir -eq $newest.FullName } | Select-Object -First 1)
        if (-not $idx) { continue }
        $seen = $true
        try { if (-not ([System.IO.File]::ReadAllText($idx.Index).Contains($MarkerStart))) { $active = $false } }
        catch { $active = $false }
    }
    return [pscustomobject]@{ Active = ($seen -and $active); Installed = (Test-Path $InjectFile) }
}

function Stop-Discord {
    if ($NoRestart) { return }
    $found = $false
    foreach ($n in @('Discord', 'DiscordCanary', 'DiscordPTB')) {
        Get-Process -Name $n -ErrorAction SilentlyContinue | ForEach-Object {
            $found = $true
            try { $_ | Stop-Process -Force -ErrorAction SilentlyContinue } catch { }
        }
    }
    if ($found) { Start-Sleep -Seconds 2; Write-Log 'Discord fechado' }
}

function Start-Discord {
    if ($NoRestart) { return }
    $exe = Find-DiscordExe
    if ($exe) { Start-Process -FilePath $exe; Write-Log 'Discord reiniciado' 'ok'; return }
    foreach ($root in (Get-DiscordRoots)) {
        $upd = Join-Path $root 'Update.exe'
        if (Test-Path $upd) { Start-Process -FilePath $upd -ArgumentList '--processStart', 'Discord.exe'; Write-Log 'Discord reiniciado' 'ok'; return }
    }
    Write-Log 'Abra o Discord manualmente.' 'warn'
}

function Get-PluginFromRepo {
    $dir = Join-Path $env:TEMP 'DiscordUtils-src'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
    $ProgressPreference = 'SilentlyContinue'
    $base = "https://raw.githubusercontent.com/$Repo/$Branch/plugin"
    foreach ($f in @('inject.js', 'renderer.js')) {
        Write-Log "Baixando $f do GitHub..."
        try {
            Invoke-WebRequest -Uri "$base/$f" -OutFile (Join-Path $dir $f) -UseBasicParsing
        } catch {
            throw "Nao consegui baixar $f de $Repo ($Branch): $($_.Exception.Message)"
        }
    }
    Write-Log 'Plugin baixado' 'ok'
    return $dir
}

function Resolve-PluginSrc {
    if ($script:PluginSrc) { return $script:PluginSrc }
    $script:PluginSrc = Get-PluginFromRepo
    $script:FromRepo = $true
    return $script:PluginSrc
}

function Copy-PluginFiles {
    $src = Resolve-PluginSrc
    if (-not (Test-Path (Join-Path $src 'inject.js')) -or -not (Test-Path (Join-Path $src 'renderer.js'))) {
        throw "Nao achei inject.js e renderer.js em: $src"
    }
    New-Item -ItemType Directory -Force -Path $Install | Out-Null
    Copy-Item -LiteralPath (Join-Path $src 'inject.js')   -Destination $InjectFile -Force
    Copy-Item -LiteralPath (Join-Path $src 'renderer.js') -Destination (Join-Path $Install 'renderer.js') -Force
    Write-Log 'Arquivos do plugin copiados' 'ok'
}

function Get-DisblockCss {
    $file = Join-Path $Install 'disblock.css'
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $DisblockUrl -OutFile $file -UseBasicParsing
        Write-Log 'Tema Disblock Origin baixado' 'ok'
    } catch {
        Write-Log 'Disblock nao baixou agora (o plugin tenta de novo ao abrir)' 'warn'
    }
}

function Sync-PluginSettings {
    $file = Join-Path $Install 'settings.json'
    $cfg = $null
    if (Test-Path $file) { try { $cfg = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json } catch { $cfg = $null } }
    if ($null -eq $cfg) { $cfg = [pscustomobject]@{} }

    $cfg | Add-Member -NotePropertyName 'devtools' -NotePropertyValue $true -Force
    if ($script:FromRepo) {
        $cfg | Add-Member -NotePropertyName 'repo' -NotePropertyValue $Repo -Force
        $cfg | Add-Member -NotePropertyName 'branch' -NotePropertyValue $Branch -Force
        $cfg.PSObject.Properties.Remove('sourceDir')
    } else {
        $cfg | Add-Member -NotePropertyName 'sourceDir' -NotePropertyValue $script:PluginSrc -Force
        $cfg.PSObject.Properties.Remove('repo')
        $cfg.PSObject.Properties.Remove('branch')
    }
    if (-not ($cfg.PSObject.Properties.Name -contains 'autoUpdate')) {
        $cfg | Add-Member -NotePropertyName 'autoUpdate' -NotePropertyValue $true -Force
    }
    $cfg | Add-Member -NotePropertyName 'autoPatch' -NotePropertyValue $true -Force

    [System.IO.File]::WriteAllText($file, ($cfg | ConvertTo-Json -Depth 10))
    return [bool]$cfg.devtools
}

function Sync-DiscordDevToolsFlag([bool]$want) {
    if ($NoDiscordConfig) { return }
    foreach ($dir in @('discord', 'discordcanary', 'discordptb')) {
        $file = Join-Path $env:APPDATA (Join-Path $dir 'settings.json')
        if (-not (Test-Path $file)) { continue }
        try { $json = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json } catch { $json = $null }
        if ($null -eq $json) { $json = [pscustomobject]@{} }
        if ($json.PSObject.Properties.Name -contains $DevFlag) { $json.$DevFlag = $want }
        else { $json | Add-Member -NotePropertyName $DevFlag -NotePropertyValue $want -Force }
        [System.IO.File]::WriteAllText($file, ($json | ConvertTo-Json -Depth 20))
    }
}

function Add-CorePatch {
    $targets = Get-CoreTargets
    if ($targets.Count -eq 0) { throw 'Nao achei discord_desktop_core\index.js. Abra o Discord uma vez, feche e tente de novo.' }
    $escaped = $InjectFile.Replace('\', '\\').Replace("'", "\'")
    $block = "$MarkerStart`r`ntry { require('$escaped'); } catch (e) { console.error('[DiscordUtils] inject failed', e); }`r`n$MarkerEnd"
    foreach ($t in $targets) {
        $raw = [System.IO.File]::ReadAllText($t.Index)
        if ($raw.Contains($MarkerStart)) {
            $pattern = [regex]::Escape($MarkerStart) + '[\s\S]*?' + [regex]::Escape($MarkerEnd)
            $raw = [regex]::Replace($raw, $pattern, $block)
        } else {
            $bak = $t.Index + '.discordutils.bak'
            if (-not (Test-Path $bak)) { Copy-Item -LiteralPath $t.Index -Destination $bak -Force }
            $raw = $block + "`r`n" + $raw
        }
        [System.IO.File]::WriteAllText($t.Index, $raw)
        Write-Log ("Patch aplicado: " + (Split-Path -Leaf $t.AppDir))
    }
    return $targets.Count
}

function Remove-CorePatch {
    $n = 0
    foreach ($t in (Get-CoreTargets)) {
        $bak = $t.Index + '.discordutils.bak'
        if (Test-Path $bak) {
            Copy-Item -LiteralPath $bak -Destination $t.Index -Force
            Remove-Item -LiteralPath $bak -Force -ErrorAction SilentlyContinue
            $n++
        } else {
            $raw = [System.IO.File]::ReadAllText($t.Index)
            if ($raw.Contains($MarkerStart)) {
                $pattern = [regex]::Escape($MarkerStart) + '[\s\S]*?' + [regex]::Escape($MarkerEnd) + '\r?\n?'
                [System.IO.File]::WriteAllText($t.Index, [regex]::Replace($raw, $pattern, ''))
                $n++
            }
        }
        Write-Log ("Restaurado: " + (Split-Path -Leaf $t.AppDir))
    }
    return $n
}

function Invoke-Install {
    Write-Log 'Instalando Discord Utils...'
    Copy-PluginFiles
    Get-DisblockCss
    $dev = Sync-PluginSettings
    Sync-DiscordDevToolsFlag $dev
    Stop-Discord
    $n = Add-CorePatch
    Write-Log "Plugin injetado em $n versao(oes) do Discord" 'ok'
    Start-Discord
    Write-StatusLine
    Write-Log 'Pronto. Procure "Discord Utils" na barra lateral.' 'ok'
    Write-Log 'A partir de agora ele se reinstala sozinho quando o Discord atualizar.' 'ok'
}

function Invoke-Repair {
    Write-Log 'Reparando instalacao...'
    Copy-PluginFiles
    Get-DisblockCss
    $dev = Sync-PluginSettings
    Sync-DiscordDevToolsFlag $dev
    $n = Add-CorePatch
    Write-Log "Patch reaplicado em $n versao(oes)" 'ok'
    Write-StatusLine
    Write-Log 'Reinicie o Discord (ou de Ctrl+R) para carregar.' 'ok'
}

function Invoke-Uninstall {
    Write-Log 'Removendo Discord Utils...'
    Stop-Discord
    $n = Remove-CorePatch
    if (Test-Path $Install) {
        Remove-Item -LiteralPath $Install -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log 'Pasta do plugin removida' 'ok'
    }
    Write-Log "Patch removido de $n versao(oes)" 'ok'
    Write-Log 'O Discord volta ao normal. O inspecionar continua liberado nas configuracoes dele.' 'warn'
}

function New-RoundPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    if ($d -gt $w) { $d = $w }
    if ($d -gt $h) { $d = $h }
    if ($d -le 0) { $p.AddRectangle((New-Object System.Drawing.RectangleF($x, $y, $w, $h))); return $p }
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function Split-LogLine([string]$text, [int]$cols) {

    if ($cols -lt 8) { return , @($text) }
    if ([string]::IsNullOrEmpty($text)) { return , @('') }
    $out = New-Object System.Collections.ArrayList
    $line = ''
    foreach ($word in ($text -split ' ')) {
        $w = $word

        while ($w.Length -gt $cols) {
            if ($line.Length -gt 0) { [void]$out.Add($line); $line = '' }
            [void]$out.Add($w.Substring(0, $cols))
            $w = $w.Substring($cols)
        }
        if ($line.Length -eq 0) { $line = $w }
        elseif (($line.Length + 1 + $w.Length) -le $cols) { $line = "$line $w" }
        else { [void]$out.Add($line); $line = $w }
    }
    [void]$out.Add($line)
    return , $out.ToArray()
}

function Set-DoubleBuffered($ctl) {
    try {
        $prop = [System.Windows.Forms.Control].GetProperty('DoubleBuffered',
            [System.Reflection.BindingFlags]'Instance,NonPublic')
        $prop.SetValue($ctl, $true, $null)
    } catch { }
}

function Show-Gui {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [System.Windows.Forms.Application]::EnableVisualStyles()

    $cBg    = [System.Drawing.Color]::FromArgb(11, 11, 15)
    $cHead  = [System.Drawing.Color]::FromArgb(19, 19, 25)
    $cCard  = [System.Drawing.Color]::FromArgb(24, 24, 31)
    $cCardH = [System.Drawing.Color]::FromArgb(34, 34, 43)
    $cLine  = [System.Drawing.Color]::FromArgb(42, 42, 52)
    $cTxt   = [System.Drawing.Color]::FromArgb(236, 236, 237)
    $cMut   = [System.Drawing.Color]::FromArgb(125, 125, 137)
    $cAcc   = [System.Drawing.Color]::FromArgb(139, 92, 246)
    $cAccH  = [System.Drawing.Color]::FromArgb(124, 70, 236)
    $cRed   = [System.Drawing.Color]::FromArgb(255, 107, 110)
    $cGreen = [System.Drawing.Color]::FromArgb(126, 224, 163)
    $cLog   = [System.Drawing.Color]::FromArgb(8, 8, 11)

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Discord Utils'
    $form.ClientSize = New-Object System.Drawing.Size(420, 452)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'None'   
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.BackColor = $cBg
    $form.ForeColor = $cTxt
    $form.KeyPreview = $true
    $form.Font = New-Object System.Drawing.Font('Segoe UI', 9)
    Set-DoubleBuffered $form
    $form.Region = New-Object System.Drawing.Region((New-RoundPath 0 0 $form.Width $form.Height 12))

    $form.Add_Paint({
        param($s, $e)
        $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $pen = New-Object System.Drawing.Pen($cLine, 1)
        $path = New-RoundPath 0 0 ($s.Width - 1) ($s.Height - 1) 12
        $e.Graphics.DrawPath($pen, $path)
        $pen.Dispose(); $path.Dispose()
    })
    $form.Add_KeyDown({ if ($_.KeyCode -eq 'Escape') { $form.Close() } })


    $head = New-Object System.Windows.Forms.Panel
    $head.SetBounds(1, 1, 418, 58)
    $head.BackColor = $cHead
    Set-DoubleBuffered $head
    $form.Controls.Add($head)

    $head.Add_Paint({
        param($s, $e)
        $g = $e.Graphics
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
        $pen = New-Object System.Drawing.Pen($cLine, 1)
        $g.DrawLine($pen, 0, $s.Height - 1, $s.Width, $s.Height - 1)
        $pen.Dispose()
        $sf = New-Object System.Drawing.StringFormat
        $sf.Alignment = [System.Drawing.StringAlignment]::Center
        $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
        $f = New-Object System.Drawing.Font('Segoe UI Semibold', 13.5)
        $b = New-Object System.Drawing.SolidBrush($cTxt)
        $r = New-Object System.Drawing.RectangleF(0, 0, $s.Width, $s.Height)
        $g.DrawString('Discord Utils', $f, $b, $r, $sf)
        $f.Dispose(); $b.Dispose(); $sf.Dispose()
    })

    $script:dragging = $false
    $script:dragOff = New-Object System.Drawing.Point(0, 0)
    $head.Add_MouseDown({ $script:dragging = $true; $script:dragOff = $_.Location })
    $head.Add_MouseUp({ $script:dragging = $false })
    $head.Add_MouseMove({
        if (-not $script:dragging) { return }
        $p = [System.Windows.Forms.Cursor]::Position
        $form.Location = New-Object System.Drawing.Point(
            ($p.X - $script:dragOff.X - 1), ($p.Y - $script:dragOff.Y - 1))
    })

    $close = New-Object System.Windows.Forms.Panel
    $close.SetBounds(374, 14, 30, 30)
    $close.BackColor = $cHead
    $close.Cursor = [System.Windows.Forms.Cursors]::Hand
    $close | Add-Member -NotePropertyName Hover -NotePropertyValue $false -Force
    Set-DoubleBuffered $close
    $close.Add_Paint({
        param($s, $e)
        $g = $e.Graphics
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        if ($s.Hover) {
            $bp = New-RoundPath 0 0 ($s.Width - 1) ($s.Height - 1) 8
            $bb = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(237, 66, 69))
            $g.FillPath($bb, $bp); $bb.Dispose(); $bp.Dispose()
        }
        $col = if ($s.Hover) { [System.Drawing.Color]::White } else { $cMut }
        $pen = New-Object System.Drawing.Pen($col, 1.6)
        $g.DrawLine($pen, 10, 10, $s.Width - 11, $s.Height - 11)
        $g.DrawLine($pen, $s.Width - 11, 10, 10, $s.Height - 11)
        $pen.Dispose()
    })
    $close.Add_MouseEnter({ $this.Hover = $true; $this.Invalidate() })
    $close.Add_MouseLeave({ $this.Hover = $false; $this.Invalidate() })
    $close.Add_Click({ $form.Close() })
    $head.Controls.Add($close)

    $status = New-Object System.Windows.Forms.Label
    $status.ForeColor = $cMut
    $status.TextAlign = 'MiddleCenter'
    $status.SetBounds(24, 70, 372, 22)
    $form.Controls.Add($status)

    function New-RoundButton([string]$text, [int]$y, $fill, $fillHover, $fore, $border) {
        $b = New-Object System.Windows.Forms.Panel
        $b.SetBounds(24, $y, 372, 46)
        $b.BackColor = $cBg
        $b.Cursor = [System.Windows.Forms.Cursors]::Hand
        $b.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10.5)
        $b | Add-Member -NotePropertyName Fill      -NotePropertyValue $fill      -Force
        $b | Add-Member -NotePropertyName FillHover -NotePropertyValue $fillHover -Force
        $b | Add-Member -NotePropertyName Fore      -NotePropertyValue $fore      -Force
        $b | Add-Member -NotePropertyName BorderCol -NotePropertyValue $border    -Force
        $b | Add-Member -NotePropertyName Label     -NotePropertyValue $text      -Force
        $b | Add-Member -NotePropertyName Hover     -NotePropertyValue $false     -Force
        $b | Add-Member -NotePropertyName Busy      -NotePropertyValue $false     -Force
        Set-DoubleBuffered $b
        $b.Add_Paint({
            param($s, $e)
            $g = $e.Graphics
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
            $path = New-RoundPath 0.5 0.5 ($s.Width - 1) ($s.Height - 1) 11
            $fill = if ($s.Busy) { [System.Drawing.Color]::FromArgb(28, 28, 34) }
                    elseif ($s.Hover) { $s.FillHover } else { $s.Fill }
            $br = New-Object System.Drawing.SolidBrush($fill)
            $g.FillPath($br, $path); $br.Dispose()
            $pen = New-Object System.Drawing.Pen($s.BorderCol, 1)
            $g.DrawPath($pen, $path); $pen.Dispose()
            $sf = New-Object System.Drawing.StringFormat
            $sf.Alignment = [System.Drawing.StringAlignment]::Center
            $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
            $fore = if ($s.Busy) { [System.Drawing.Color]::FromArgb(110, 110, 122) } else { $s.Fore }
            $tb = New-Object System.Drawing.SolidBrush($fore)
            $rect = New-Object System.Drawing.RectangleF(0, 0, $s.Width, $s.Height)
            $g.DrawString($s.Label, $s.Font, $tb, $rect, $sf)
            $tb.Dispose(); $sf.Dispose(); $path.Dispose()
        })
        $b.Add_MouseEnter({ if (-not $this.Busy) { $this.Hover = $true; $this.Invalidate() } })
        $b.Add_MouseLeave({ $this.Hover = $false; $this.Invalidate() })
        $form.Controls.Add($b)
        return $b
    }

    $btnInstall   = New-RoundButton 'Instalar / Atualizar' 104 $cAcc  $cAccH $([System.Drawing.Color]::White) $cAcc
    $btnRepair    = New-RoundButton 'Reparar'              158 $cCard $cCardH $cTxt $cLine
    $btnUninstall = New-RoundButton 'Desinstalar'          212 $cCard $cCardH $cRed $cLine


    $script:logLines = New-Object System.Collections.ArrayList
    $script:logTop = 0
    $script:logCols = 40
    $script:logKind = @{
        'info' = @{ Color = $cMut;   Mark = '>' }
        'ok'   = @{ Color = $cGreen; Mark = '+' }
        'warn' = @{ Color = [System.Drawing.Color]::FromArgb(240, 182, 116); Mark = '!' }
        'err'  = @{ Color = $cRed;   Mark = 'x' }
    }
    $log = New-Object System.Windows.Forms.Panel
    $log.SetBounds(24, 274, 372, 158)
    $log.BackColor = $cLog
    $log.Font = New-Object System.Drawing.Font('Consolas', 8.5)
    Set-DoubleBuffered $log
    $form.Controls.Add($log)

    $script:logPad = 10
    $script:logLineH = 15
    $script:logTextX = 28
    function Get-LogVisible { [Math]::Max(1, [int][Math]::Floor(($log.Height - 2 * $script:logPad) / $script:logLineH)) }

    $gTmp = $log.CreateGraphics()
    $charW = $gTmp.MeasureString('MMMMMMMMMMMMMMMMMMMM', $log.Font).Width / 20
    $gTmp.Dispose()
    $script:logCols = [Math]::Max(12, [int][Math]::Floor(($log.Width - $script:logTextX - 16) / $charW))

    $log.Add_Paint({
        param($s, $e)
        $g = $e.Graphics
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.Clear($s.Parent.BackColor)
        $path = New-RoundPath 0.5 0.5 ($s.Width - 1) ($s.Height - 1) 11
        $bg = New-Object System.Drawing.SolidBrush($cLog)
        $g.FillPath($bg, $path); $bg.Dispose()
        $pen = New-Object System.Drawing.Pen($cLine, 1)
        $g.DrawPath($pen, $path); $pen.Dispose()

        $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
        $vis = Get-LogVisible
        $total = $script:logLines.Count
        $y = $script:logPad
        for ($i = $script:logTop; $i -lt [Math]::Min($total, $script:logTop + $vis); $i++) {
            $row = $script:logLines[$i]
            $style = $script:logKind[$row.Kind]
            if (-not $style) { $style = $script:logKind['info'] }
            $br = New-Object System.Drawing.SolidBrush($style.Color)
            if ($row.First -and $row.Text -ne '') {
                $g.DrawString($style.Mark, $s.Font, $br, 12, $y)
            }
            $g.DrawString([string]$row.Text, $s.Font, $br, $script:logTextX, $y)
            $br.Dispose()
            $y += $script:logLineH
        }

        if ($total -gt $vis) {
            $trackH = $s.Height - 2 * $script:logPad
            $thumbH = [Math]::Max(28, [int]($trackH * $vis / $total))
            $maxTop = $total - $vis
            $off = if ($maxTop -gt 0) { [int](($trackH - $thumbH) * $script:logTop / $maxTop) } else { 0 }
            $tb = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(58, 58, 70))
            $tp = New-RoundPath ($s.Width - 9) ($script:logPad + $off) 4 $thumbH 2
            $g.FillPath($tb, $tp); $tb.Dispose(); $tp.Dispose()
        }
        $path.Dispose()
    })

    $form.Add_MouseWheel({
        $p = $log.PointToClient([System.Windows.Forms.Cursor]::Position)
        if ($p.X -lt 0 -or $p.Y -lt 0 -or $p.X -gt $log.Width -or $p.Y -gt $log.Height) { return }
        $max = [Math]::Max(0, $script:logLines.Count - (Get-LogVisible))
        $step = if ($_.Delta -gt 0) { -3 } else { 3 }
        $script:logTop = [Math]::Min($max, [Math]::Max(0, $script:logTop + $step))
        $log.Invalidate()
    })

    $script:LogSink = {
        param($m, $k)
        if (-not $k) { $k = 'info' }
        foreach ($line in ([string]$m -split "`n")) {
            $first = $true
            foreach ($piece in (Split-LogLine $line $script:logCols)) {
                [void]$script:logLines.Add([pscustomobject]@{ Text = $piece; Kind = $k; First = $first })
                $first = $false
            }
        }
        while ($script:logLines.Count -gt 400) { $script:logLines.RemoveAt(0) }
        $script:logTop = [Math]::Max(0, $script:logLines.Count - (Get-LogVisible))
        $log.Invalidate()
        [System.Windows.Forms.Application]::DoEvents()
    }

    function Update-Status {
        $st = Get-PatchStatus
        if (-not $st.Installed) {
            $status.Text = 'Nao instalado'
            $status.ForeColor = $cMut
        } elseif ($st.Active) {
            $status.Text = 'Instalado e ativo'
            $status.ForeColor = $cGreen
        } else {
            $status.Text = 'Instalado - clique em Reparar'
            $status.ForeColor = [System.Drawing.Color]::FromArgb(240, 182, 116)
        }
    }

    $btns = @($btnInstall, $btnRepair, $btnUninstall)
    $run = {
        param($fn)
        foreach ($b in $btns) { $b.Busy = $true; $b.Hover = $false; $b.Invalidate() }
        $script:logLines.Clear(); $script:logTop = 0; $log.Invalidate()
        try { & $fn } catch { Write-Log ('Erro: ' + $_.Exception.Message) 'err' }
        Update-Status
        foreach ($b in $btns) { $b.Busy = $false; $b.Invalidate() }
    }

    $btnInstall.Add_Click({ if (-not $this.Busy) { & $run { Invoke-Install } } })
    $btnRepair.Add_Click({ if (-not $this.Busy) { & $run { Invoke-Repair } } })
    $btnUninstall.Add_Click({
        if ($this.Busy) { return }
        $ans = [System.Windows.Forms.MessageBox]::Show(
            'Remover o Discord Utils e restaurar o Discord?', 'Desinstalar',
            [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Warning)
        if ($ans -eq [System.Windows.Forms.DialogResult]::Yes) { & $run { Invoke-Uninstall } }
    })

    Update-Status

    if ($SelfTest) {
        $form.Opacity = 0
        $form.ShowInTaskbar = $false

        $form.Add_Shown({
            try {
                $mi = [System.Windows.Forms.Control].GetMethod('OnClick',
                    [System.Reflection.BindingFlags]'Instance,NonPublic')
                $mi.Invoke($btnRepair, @([System.EventArgs]::Empty))
            } catch { Write-Host ('SelfTest: ' + $_.Exception.Message) }
            finally { $form.Close() }
        })

        $kill = New-Object System.Windows.Forms.Timer
        $kill.Interval = 60000
        $kill.Add_Tick({ $kill.Stop(); $form.Close() })
        $kill.Start()
    }
    Write-Log 'Instalar / Atualizar - copia o plugin e liga em todas as versoes do Discord.'
    Write-Log 'Reparar - reaplica o patch sem fechar o Discord.'
    Write-Log 'Desinstalar - restaura o Discord e apaga a pasta do plugin.'
    Write-Log ''
    Write-Log 'Depois de instalado o plugin se reinstala sozinho quando o Discord atualiza.'

    [void]$form.ShowDialog()
}

switch ($Action) {
    'gui' {
        
        if ($script:IsPiped -and -not $SelfTest) { Start-DedicatedGui; return }
        if (-not $SelfTest) { Hide-Console }
        try {
            Show-Gui
        } catch {

            try {
                Add-Type -AssemblyName System.Windows.Forms
                [void][System.Windows.Forms.MessageBox]::Show(
                    $_.Exception.Message, 'Discord Utils',
                    [System.Windows.Forms.MessageBoxButtons]::OK,
                    [System.Windows.Forms.MessageBoxIcon]::Error)
            } catch { }
        }
    }
    'install'   { Invoke-Install }
    'repair'    { Invoke-Repair }
    'uninstall' { Invoke-Uninstall }
    'none'      { }   
}
