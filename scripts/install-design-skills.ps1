# Installs the design / motion / 3D skills for Claude Code into this project.
# Run from the repo root in PowerShell:  .\scripts\install-design-skills.ps1
# Requires Node.js 20+ (npx). Installs project-level (no -g), copies files
# (no symlinks, so it works on Windows) and records versions in skills-lock.json.
# Index of what each skill is for: docs/SKILLS.md

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  Write-Host "npx not found. Install Node.js 20+ from https://nodejs.org and run again." -ForegroundColor Red
  exit 1
}

# source -> what it installs
$sources = @(
  @{ src = "zanwei/design-dna";                  note = "design-dna: direction (tokens + style + effects JSON)" },
  @{ src = "LottieFiles/motion-design-skill";    note = "motion-design: timing, easing, choreography" },
  @{ src = "greensock/gsap-skills";              note = "gsap-*: 8 official GSAP skills" },
  @{ src = "cloudai-x/threejs-skills";           note = "threejs-*: 13 Three.js skills incl. react-three-fiber + postprocessing" },
  @{ src = "emalorenzo/three-agent-skills";      note = "r3f-best-practices + three-best-practices (covers rapier physics + react-postprocessing)" },
  @{ src = "https://genjutsu.athevon.dev";       note = "genjutsu: cast / paint / bunshin (use the URL, not the repo, so the modules come too)" },
  @{ src = "wheresryan22/anatomy";               note = "anatomy: interactive isometric SVG figures" },
  @{ src = "annnguyentt/anatomy-reveal-skill";   note = "anatomy-reveal: exploded object + reveal video" },
  @{ src = "lucasmarkes/hairline";               note = "hairline-create + hairline-adopt: line figures from an idea or an SVG" },
  @{ src = "motiondivision/ai-kit";              note = "motion: free /motion skill (CSS springs, easing) without the Motion+ MCP server" },
  @{ src = "majidmanzarpour/blender-game-skills"; note = "blender-image-to-3d: concept image -> game-ready GLB in Blender" },
  @{ src = "remotion-dev/skills";                note = "remotion-*: cinematic video from code (intro / transition clips)" }
)

$ok = @(); $failed = @()
foreach ($s in $sources) {
  Write-Host ""
  Write-Host ("==> " + $s.src + "  (" + $s.note + ")") -ForegroundColor Cyan
  & npx --yes skills@latest add $s.src -a claude-code -s "*" -y --copy
  if ($LASTEXITCODE -eq 0) { $ok += $s.src } else { $failed += $s.src }
}

Write-Host ""
Write-Host "Installed:" -ForegroundColor Green
$ok | ForEach-Object { Write-Host ("  + " + $_) }
if ($failed.Count -gt 0) {
  Write-Host "Failed (run the line again, or check the network):" -ForegroundColor Yellow
  $failed | ForEach-Object { Write-Host ("  - " + $_) }
}

Write-Host ""
Write-Host "Now in .claude/skills:" -ForegroundColor Green
Get-ChildItem .claude/skills -Directory | Select-Object -ExpandProperty Name | Sort-Object | ForEach-Object { Write-Host ("  " + $_) }

Write-Host ""
Write-Host "Next: review, then commit .claude/skills, .agents/skills and skills-lock.json (see docs/SKILLS.md)." -ForegroundColor Green
