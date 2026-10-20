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
  @{ src = "livekit/agent-skills";                note = "livekit skills x7: building / testing / debugging / operating LiveKit voice agents (skills only, no MCP)" },
  @{ src = "Leonxlnx/taste-skill";                note = "taste-skill: anti AI-slop frontend rules (shape lock, typography, depth) - from the Oct 13 Duncan video" },
  @{ src = "kylezantos/design-motion-principles"; note = "design-motion-principles: build + audit motion, anti-slop checklist, motion cookbook - from the Oct 13 video" }
)

# MengTo/Skills (MIT, 177 skills by the author of ThreeUI) - only the ones that fit this project's look:
# cinematic dark scenes, sky/water/atmosphere, glass panels, orbs, Three.js worlds, motion systems, anti-slop audits.
$mengto = @(
  "no-ai-design-slop","audit-ai-design-slop","design-first-ui-prompting",
  "3d-sky-background","3d-sky-rays","3d-ultra-realistic-water","3d-underwater-god-rays","3d-high-poly-models","3d-high-resolution-textures","3d-metal-material","3d-orbit-inspect-demo","3d-retina-resolution",
  "atmosphere-background","ambient-section-particles","beam-glow-states","beautiful-shadows","dark-glass-clean-layout","glass-dark-ui","glass-dark-mode-clock","mesh-gradient-dark-blue-clean","dark-blue-contrasting-clean",
  "cinematic-gsap-lenis-motion-system","animation-systems","gsap","build-threejs-scroll-worlds","threejs","threejs-landscape","threejs-weather","webgl-3d-object","background-grid-webgl","build-wireframe-scan-reveal",
  "thinking-orbs","operational-enterprise-ai","add-mouse-driven-orbit","add-shader-cursor-trail","shaders-cursor-ripples","progressive-blur","masked-reveal","gooey-blob-system","liquid-metal-border","unicorn-studio","vantajs",
  "video-to-superprompt","html-to-interaction-prompts","optimize-web-animations","performance-profiling","iterate-until-verified","audit-verify-explain-grade-5","elevenlabs-tts",
  "build-game-audio-feedback","build-game-camera-controls","optimize-threejs-games","create-game-vfx","build-mobile-threejs-games"
)

$ok = @(); $failed = @()
foreach ($s in $sources) {
  Write-Host ""
  Write-Host ("==> " + $s.src + "  (" + $s.note + ")") -ForegroundColor Cyan
  & npx --yes skills@latest add $s.src -a claude-code -s "*" -y --copy
  if ($LASTEXITCODE -eq 0) { $ok += $s.src } else { $failed += $s.src }
}

Write-Host ""
Write-Host ("==> MengTo/Skills  (" + $mengto.Count + " selected skills: cinematic 3D scenes, glass, orbs, motion, anti-slop)") -ForegroundColor Cyan
& npx --yes skills@latest add MengTo/Skills -a claude-code -s $mengto -y --copy
if ($LASTEXITCODE -eq 0) { $ok += "MengTo/Skills" } else { $failed += "MengTo/Skills" }

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
