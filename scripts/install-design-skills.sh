#!/usr/bin/env bash
# Same job as scripts/install-design-skills.ps1, for Linux/macOS and for GitHub Actions
# (.github/workflows/install-design-skills.yml). Installs every design / motion / 3D /
# graph / voice skill into this project with the official `skills` CLI, copying files
# (no symlinks) and recording versions in skills-lock.json. Index: docs/SKILLS.md
set -u
cd "$(dirname "$0")/.."

if ! command -v npx >/dev/null 2>&1; then
  echo "npx not found. Install Node.js 20+ and run again." >&2
  exit 1
fi

SOURCES=(
  "zanwei/design-dna"
  "LottieFiles/motion-design-skill"
  "greensock/gsap-skills"
  "cloudai-x/threejs-skills"
  "emalorenzo/three-agent-skills"
  "https://genjutsu.athevon.dev"
  "wheresryan22/anatomy"
  "annnguyentt/anatomy-reveal-skill"
  "lucasmarkes/hairline"
  "motiondivision/ai-kit"
  "majidmanzarpour/blender-game-skills"
  "remotion-dev/skills"
  "framara/react-flow-skill"
  "livekit/agent-skills"
  "Leonxlnx/taste-skill"
  "kylezantos/design-motion-principles"
  "gkren22/cinematic-3d-website"
  "gkren22/procedural-3d-realism"
  "agiwhitelist/auteur"
  "emilkowalski/skills"
  "Dammyjay93/interface-design"
  "codeswithroh/tastemaker"
)

# Selected skills from larger collections (name list after the repo)
SELECTED=(
  "vercel-labs/agent-skills|web-design-guidelines vercel-react-best-practices vercel-react-native-skills vercel-react-view-transitions vercel-composition-patterns"
  "anthropics/skills|webapp-testing"
  "sickn33/antigravity-awesome-skills|3d-web-experience fixing-motion-performance"
)

# MengTo/Skills (MIT): only the skills that fit this project's look (see docs/SKILLS.md)
MENGTO=(
  no-ai-design-slop audit-ai-design-slop design-first-ui-prompting
  3d-sky-background 3d-sky-rays 3d-ultra-realistic-water 3d-underwater-god-rays 3d-high-poly-models 3d-high-resolution-textures 3d-metal-material 3d-orbit-inspect-demo 3d-retina-resolution
  atmosphere-background ambient-section-particles beam-glow-states beautiful-shadows dark-glass-clean-layout glass-dark-ui glass-dark-mode-clock mesh-gradient-dark-blue-clean dark-blue-contrasting-clean
  cinematic-gsap-lenis-motion-system animation-systems gsap build-threejs-scroll-worlds threejs threejs-landscape threejs-weather webgl-3d-object background-grid-webgl build-wireframe-scan-reveal
  thinking-orbs operational-enterprise-ai add-mouse-driven-orbit add-shader-cursor-trail shaders-cursor-ripples progressive-blur masked-reveal gooey-blob-system liquid-metal-border unicorn-studio vantajs
  video-to-superprompt html-to-interaction-prompts optimize-web-animations performance-profiling iterate-until-verified audit-verify-explain-grade-5 elevenlabs-tts
  build-game-audio-feedback build-game-camera-controls optimize-threejs-games create-game-vfx build-mobile-threejs-games
)

OK=(); FAILED=()
for src in "${SOURCES[@]}"; do
  echo; echo "==> $src"
  if npx --yes skills@latest add "$src" -a claude-code -s '*' -y --copy; then OK+=("$src"); else FAILED+=("$src"); fi
done

for entry in "${SELECTED[@]}"; do
  repo="${entry%%|*}"; names="${entry#*|}"
  echo; echo "==> $repo ($names)"
  # shellcheck disable=SC2086
  if npx --yes skills@latest add "$repo" -a claude-code -s $names -y --copy; then OK+=("$repo"); else FAILED+=("$repo"); fi
done

echo; echo "==> MengTo/Skills (${#MENGTO[@]} selected skills)"
if npx --yes skills@latest add MengTo/Skills -a claude-code -s "${MENGTO[@]}" -y --copy; then OK+=("MengTo/Skills"); else FAILED+=("MengTo/Skills"); fi

echo; echo "==> pbakaus/impeccable"
if npx --yes impeccable install --providers=claude --scope=project </dev/null; then OK+=("pbakaus/impeccable"); else FAILED+=("pbakaus/impeccable"); fi

echo; echo "==> nextlevelbuilder/ui-ux-pro-max-skill"
if npx --yes ui-ux-pro-max-cli init --ai claude </dev/null; then OK+=("nextlevelbuilder/ui-ux-pro-max-skill"); else FAILED+=("nextlevelbuilder/ui-ux-pro-max-skill"); fi

# Three skills the skills CLI rejects for format reasons (upstream issues, not ours):
#  - tsogjavklann/awwwards-3d: SKILL.md description is an unquoted YAML scalar containing ':'
#  - zyliu0/3d-frontend: the skill file is named 3D-frontend.md instead of SKILL.md
#  - MengTo/Skills 3d-metal-material: same unquoted ':' in the description (the other 53 install fine)
# Install them by hand: shallow clone (sparse when the skill is a subfolder of a big repo), copy
# without .git and the duplicated docs/ gallery, then rewrite the frontmatter as a folded block
# scalar so every YAML parser accepts it.
manual_skill() {
  local repo="$1" folder="$2" skillfile="$3" subdir="${4:-}" dest=".claude/skills/$2" tmp src
  tmp="$(mktemp -d)"
  echo; echo "==> $repo${subdir:+/$subdir} (manual install: $folder)"
  if [ -n "$subdir" ]; then
    if ! git clone -q --depth 1 --filter=blob:none --sparse "https://github.com/$repo.git" "$tmp/src" \
       || ! git -C "$tmp/src" sparse-checkout set "$subdir" >/dev/null 2>&1; then
      FAILED+=("$repo/$subdir"); rm -rf "$tmp"; return
    fi
    src="$tmp/src/$subdir"
  else
    if ! git clone -q --depth 1 "https://github.com/$repo.git" "$tmp/src"; then
      FAILED+=("$repo"); rm -rf "$tmp"; return
    fi
    src="$tmp/src"
  fi
  rm -rf "$dest"; mkdir -p "$dest"
  tar -C "$src" --exclude=.git --exclude=docs --exclude=.DS_Store -cf - . | tar -C "$dest" -xf -
  if python3 -I - "$dest" "$skillfile" "$folder" <<'PY'
import re, sys, pathlib
dest, skillfile, name = sys.argv[1:4]
d = pathlib.Path(dest)
if skillfile != "SKILL.md":
    (d / skillfile).replace(d / "SKILL.md")
p = d / "SKILL.md"
text = p.read_text(encoding="utf-8")
m = re.match(r"---\r?\n(.*?)\r?\n---\r?\n", text, re.S)
if not m:
    sys.exit("no frontmatter in " + str(p))
fields = {}
for line in m.group(1).splitlines():
    k, sep, v = line.partition(":")
    if sep and k.strip() and not line[:1].isspace():
        fields[k.strip()] = v.strip()
desc = " ".join(fields.get("description", "").strip().strip('"').strip("'").split())
out = ["---", "name: " + name, "description: >-", "  " + desc]
if fields.get("license"):
    out.append("license: " + fields["license"])
out.append("---")
p.write_text("\n".join(out) + "\n" + text[m.end():], encoding="utf-8")
print("  fixed frontmatter: " + str(p))
PY
  then OK+=("$repo${subdir:+/$subdir}"); else FAILED+=("$repo${subdir:+/$subdir}"); fi
  rm -rf "$tmp"
}
manual_skill tsogjavklann/awwwards-3d awwwards-3d SKILL.md
manual_skill zyliu0/3d-frontend 3d-frontend 3D-frontend.md
manual_skill MengTo/Skills 3d-metal-material SKILL.md agent-skills/3d/3d-metal-material

echo; echo "Installed:"; printf '  + %s\n' "${OK[@]}"
if [ ${#FAILED[@]} -gt 0 ]; then echo "Failed:"; printf '  - %s\n' "${FAILED[@]}"; fi
echo; echo "Now in .claude/skills:"; ls -1 .claude/skills | sed 's/^/  /'
