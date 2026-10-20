# Installs the design / motion / 3D / graph / voice skills for Claude Code into this project.
# Run from the repo root in PowerShell:  .\scripts\install-design-skills.ps1
# Requires Node.js 20+ (npx). Installs project-level (no -g), copies files
# (no symlinks, so it works on Windows) and records versions in skills-lock.json.
# Index of what each skill is for: docs/SKILLS.md
# design-dna is already in the repo (installed from the cloud session); re-installing is harmless.

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  Write-Host "npx not found. Install Node.js 20+ from https://nodejs.org and run again." -ForegroundColor Red
  exit 1
}

# source -> what it installs (all free, MIT unless noted)
$sources = @(
  @{ src = "zanwei/design-dna";                   note = "design-dna: direction (tokens + style + effects JSON from reference images)" },
  @{ src = "LottieFiles/motion-design-skill";     note = "motion-design: timing, easing, choreography, 12 principles" },
  @{ src = "greensock/gsap-skills";               note = "gsap-*: 8 official GSAP skills (timeline, scrolltrigger, react, ...)" },
  @{ src = "cloudai-x/threejs-skills";            note = "threejs-*: 13 Three.js skills incl. react-three-fiber + postprocessing" },
  @{ src = "emalorenzo/three-agent-skills";       note = "r3f-best-practices + three-best-practices (covers react-three-rapier + react-postprocessing)" },
  @{ src = "https://genjutsu.athevon.dev";        note = "genjutsu: cast / paint (/ bunshin - do not use). URL, not the repo, so the 17 modules come too" },
  @{ src = "wheresryan22/anatomy";                note = "anatomy: interactive isometric SVG figures" },
  @{ src = "annnguyentt/anatomy-reveal-skill";    note = "anatomy-reveal: exploded object + reveal video" },
  @{ src = "lucasmarkes/hairline";                note = "hairline-create + hairline-adopt: thin line figures from an idea or an SVG" },
  @{ src = "motiondivision/ai-kit";               note = "motion: free /motion skill (CSS springs, easing, performance) without the Motion+ MCP" },
  @{ src = "majidmanzarpour/blender-game-skills"; note = "blender-image-to-3d: concept image -> game-ready GLB in Blender" },
  @{ src = "remotion-dev/skills";                 note = "remotion-*: cinematic video from code (intro / transition clips). Remotion licence: free for individuals" },
  @{ src = "framara/react-flow-skill";            note = "react-flow: the live n8n-style node graph (@xyflow/react) - custom nodes, edges, layout, performance" },
  @{ src = "livekit/agent-skills";                note = "livekit skills x7: building / testing / debugging / operating LiveKit voice agents (skills only, no MCP)" }
)

$ok = @(); $failed = @()
foreach ($s in $sources) {
  Write-Host ""
  Write-Host ("==> " + $s.src + "  (" + $s.note + ")") -ForegroundColor Cyan
  & npx --yes skills@latest add $s.src -a claude-code -s "*" -y --copy
  if ($LASTEXITCODE -eq 0) { $ok += $s.src } else { $failed += $s.src }
}

# Two skills ship with their own installers (both write into ./.claude at project scope):
Write-Host ""
Write-Host "==> pbakaus/impeccable  (impeccable: /impeccable craft|critique|audit|polish|animate - anti AI-slop design, Apache-2.0)" -ForegroundColor Cyan
& npx --yes impeccable install --providers=claude --scope=project
if ($LASTEXITCODE -eq 0) { $ok += "pbakaus/impeccable" } else { $failed += "pbakaus/impeccable" }

Write-Host ""
Write-Host "==> nextlevelbuilder/ui-ux-pro-max-skill  (ui-ux-pro-max: design-system generator, 79 styles, 192 palettes, 74 font pairings, MIT)" -ForegroundColor Cyan
& npx --yes ui-ux-pro-max-cli init --ai claude
if ($LASTEXITCODE -eq 0) { $ok += "nextlevelbuilder/ui-ux-pro-max-skill" } else { $failed += "nextlevelbuilder/ui-ux-pro-max-skill" }

Write-Host ""
Write-Host "Installed:" -ForegroundColor Green
$ok | ForEach-Object { Write-Host ("  + " + $_) }
if ($failed.Count -gt 0) {
  Write-Host "Failed (run that line again, or check the network):" -ForegroundColor Yellow
  $failed | ForEach-Object { Write-Host ("  - " + $_) }
}

Write-Host ""
Write-Host "Now in .claude/skills:" -ForegroundColor Green
Get-ChildItem .claude/skills -Directory | Select-Object -ExpandProperty Name | Sort-Object | ForEach-Object { Write-Host ("  " + $_) }

Write-Host ""
Write-Host "Next: review, then  git add .claude skills-lock.json  and commit (see docs/SKILLS.md)." -ForegroundColor Green
