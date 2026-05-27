/**
 * GBrain resolver — brain-first lookup and save-to-brain for thinking skills.
 *
 * GBrain is a "mod" for gstack. When installed, coding skills become brain-aware:
 * they search the brain for context before starting and save results after finishing.
 *
 * These resolvers are suppressed on hosts that don't support brain features
 * (via suppressedResolvers in each host config). For those hosts,
 * {{GBRAIN_CONTEXT_LOAD}}, {{GBRAIN_SAVE_RESULTS}}, {{BRAIN_PREFLIGHT}},
 * {{BRAIN_CACHE_REFRESH}}, and {{BRAIN_WRITE_BACK}} all resolve to empty string.
 *
 * Compatible with GBrain >= v0.10.0 (search CLI, doctor --fast --json, entity enrichment).
 *
 * Brain-aware planning (T4 / v1.48 plan): adds three new resolvers powered by
 * the bin/gstack-brain-cache CLI and scripts/brain-cache-spec.ts. The new
 * resolvers fire only for the 5 planning skills registered in
 * SKILL_DIGEST_SUBSETS (office-hours, plan-ceo-review, plan-eng-review,
 * plan-design-review, plan-devex-review).
 */
import type { TemplateContext } from './types';
import {
  SKILL_DIGEST_SUBSETS,
  SKILL_CALIBRATION_WEIGHTS,
  BRAIN_CACHE_ENTITIES,
  getSkillSubset,
  getInvalidationTargets,
} from '../brain-cache-spec';

export function generateGBrainContextLoad(ctx: TemplateContext): string {
  let base = `## Brain Context Load

Before starting this skill, search your brain for relevant context:

1. Extract 2-4 keywords from the user's request (nouns, error names, file paths, technical terms).
   Search GBrain: \`gbrain search "keyword1 keyword2"\`
   Example: for "the login page is broken after deploy", search \`gbrain search "login broken deploy"\`
   Search returns lines like: \`[slug] Title (score: 0.85) - first line of content...\`
2. If few results, broaden to the single most specific keyword and search again.
3. For each result page, read it: \`gbrain get_page "<page_slug>"\`
   Read the top 3 pages for context.
4. Use this brain context to inform your analysis.

If GBrain is not available or returns no results, proceed without brain context.
Any non-zero exit code from gbrain commands should be treated as a transient failure.`;

  if (ctx.skillName === 'investigate') {
    base += `\n\nIf the user's request is about tracking, extracting, or researching structured data (e.g., "track this data", "extract from emails", "build a tracker"), route to GBrain's data-research skill instead: \`gbrain call data-research\`. This skill has a 7-phase pipeline optimized for structured data extraction.`;
  }

  return base;
}

export function generateGBrainSaveResults(ctx: TemplateContext): string {
  // gbrain v0.18+ renamed `put_page` → `put <slug>` and moved --title/--tags
  // into YAML frontmatter inside --content. These templates render into
  // SKILL.md files as user-facing instructions; using the old subcommand
  // ships broken copy-paste to every gstack user.
  const skillSaveMap: Record<string, string> = {
    'office-hours': 'Save the design document as a brain page:\n```bash\ngbrain put "office-hours/<project-slug>" --content "$(cat <<\'EOF\'\n---\ntitle: "Office Hours: <project name>"\ntags: [design-doc, <project-slug>]\n---\n<design doc content in markdown>\nEOF\n)"\n```',
    'investigate': 'Save the root cause analysis as a brain page:\n```bash\ngbrain put "investigations/<issue-slug>" --content "$(cat <<\'EOF\'\n---\ntitle: "Investigation: <issue summary>"\ntags: [investigation, <affected-files>]\n---\n<investigation findings in markdown>\nEOF\n)"\n```',
    'plan-ceo-review': 'Save the CEO plan as a brain page:\n```bash\ngbrain put "ceo-plans/<feature-slug>" --content "$(cat <<\'EOF\'\n---\ntitle: "CEO Plan: <feature name>"\ntags: [ceo-plan, <feature-slug>]\n---\n<scope decisions and vision in markdown>\nEOF\n)"\n```',
    'retro': 'Save the retrospective as a brain page:\n```bash\ngbrain put "retros/<date>" --content "$(cat <<\'EOF\'\n---\ntitle: "Retro: <date range>"\ntags: [retro, <date>]\n---\n<retro output in markdown>\nEOF\n)"\n```',
    'plan-eng-review': 'Save the architecture decisions as a brain page:\n```bash\ngbrain put "eng-reviews/<feature-slug>" --content "$(cat <<\'EOF\'\n---\ntitle: "Eng Review: <feature name>"\ntags: [eng-review, <feature-slug>]\n---\n<review findings and decisions in markdown>\nEOF\n)"\n```',
    'ship': 'Save the release notes as a brain page:\n```bash\ngbrain put "releases/<version>" --content "$(cat <<\'EOF\'\n---\ntitle: "Release: <version>"\ntags: [release, <version>]\n---\n<changelog entry and deploy details in markdown>\nEOF\n)"\n```',
    'cso': 'Save the security audit as a brain page:\n```bash\ngbrain put "security-audits/<date>" --content "$(cat <<\'EOF\'\n---\ntitle: "Security Audit: <date>"\ntags: [security-audit, <date>]\n---\n<findings and remediation status in markdown>\nEOF\n)"\n```',
    'design-consultation': 'Save the design system as a brain page:\n```bash\ngbrain put "design-systems/<project-slug>" --content "$(cat <<\'EOF\'\n---\ntitle: "Design System: <project name>"\ntags: [design-system, <project-slug>]\n---\n<design decisions in markdown>\nEOF\n)"\n```',
  };

  const saveInstruction = skillSaveMap[ctx.skillName] || 'Save the skill output as a brain page if the results are worth preserving:\n```bash\ngbrain put "<slug>" --content "$(cat <<\'EOF\'\n---\ntitle: "<descriptive title>"\ntags: [<relevant>, <tags>]\n---\n<content in markdown>\nEOF\n)"\n```';

  return `## Save Results to Brain

After completing this skill, persist the results to your brain for future reference:

${saveInstruction}

After saving the page, extract and enrich mentioned entities: for each actual person name or company/organization name found in the output, \`gbrain search "<entity name>"\` to check if a page exists. If not, create a stub page:
\`\`\`bash
gbrain put "entities/<entity-slug>" --content "$(cat <<'EOF'
---
title: "<Person or Company Name>"
tags: [entity, person]
---
Stub page. Mentioned in <skill name> output.
EOF
)"
\`\`\`
Only extract actual person names and company/organization names. Skip product names, section headings, technical terms, and file paths.

Throttle errors appear as: exit code 1 with stderr containing "throttle", "rate limit", "capacity", or "busy". If GBrain returns a throttle or rate-limit error on any save operation, defer the save and move on. The brain is busy — the content is not lost, just not persisted this run. Any other non-zero exit code should also be treated as a transient failure.

Add backlinks to related brain pages if they exist. If GBrain is not available, skip this step.

After brain operations complete, note in your completion output: how many pages were found in the initial search, how many entities were enriched, and whether any operations were throttled. This helps the user see brain utilization over time.`;
}

// ────────────────────────────────────────────────────────────────────
// Brain-aware planning resolvers (T4 / v1.48 plan)
// ────────────────────────────────────────────────────────────────────

/**
 * Returns true when this skill is registered for brain preflight. Skills not
 * in SKILL_DIGEST_SUBSETS get an empty BRAIN_PREFLIGHT block (no behavior).
 */
function isPreflightSkill(skillName: string): boolean {
  return Object.prototype.hasOwnProperty.call(SKILL_DIGEST_SUBSETS, skillName);
}

/**
 * Renders the per-skill BRAIN_PREFLIGHT block. The rendered output is a single
 * bash script that:
 *   1. Reads each digest file from gstack-brain-cache get (one call per digest)
 *   2. Falls back to "(brain context unavailable)" on missing
 *   3. Concatenates outputs into a single ## Brain Context block injected
 *      into the skill's prompt context
 *   4. Tells the agent: "use this context to skip already-known questions"
 *
 * The cache CLI handles cold-refresh + lock dedup + stale-but-usable
 * fallback internally. From the resolver's perspective the call is one
 * shell command per digest.
 */
export function generateBrainPreflight(ctx: TemplateContext): string {
  if (!isPreflightSkill(ctx.skillName)) return '';
  const subset = getSkillSubset(ctx.skillName);
  const binDir = ctx.paths.binDir;
  // Build the bash that loads each digest. Per-skill subset is small (2-5 entries).
  const loadLines = subset.map((entityName) => {
    const entity = BRAIN_CACHE_ENTITIES[entityName];
    if (!entity) return '';
    const projectFlag = entity.scope === 'per-project' ? '--project "$SLUG"' : '';
    return `  printf '\\n### %s\\n\\n' "${entityName}"\n  ${binDir}/gstack-brain-cache get ${entityName} ${projectFlag} 2>/dev/null || printf '_(no ${entityName} digest available yet)_\\n'`;
  }).join('\n');

  return `## Brain Context (preflight)

Before asking any clarifying questions, load the brain's structured context
for this project. The cache layer handles staleness, refresh, and stale-but-
usable fallback automatically. Skip questions whose answers are already
present in the loaded context; ground recommendations in what the brain
already knows about the user, the product, the goals, and recent decisions.

\`\`\`bash
eval "$(${binDir}/gstack-slug 2>/dev/null)" 2>/dev/null || true
{
  printf '## Brain Context\\n\\n'
${loadLines}
} > /tmp/.gstack-brain-context-$$.md 2>/dev/null
[ -s /tmp/.gstack-brain-context-$$.md ] && cat /tmp/.gstack-brain-context-$$.md
rm -f /tmp/.gstack-brain-context-$$.md 2>/dev/null || true
\`\`\`

**How to use this context:**
- If \`product\` digest names the value prop, target user, or stage — don't re-ask.
- If \`goals\` digest lists active goals — frame recommendations against them.
- If \`recent-decisions\` digest names a prior scope/architecture choice — flag if this plan contradicts.
- If \`user-profile\` digest carries calibration pattern statements ("tends to over-engineer security") — surface them when relevant.
- If a digest is \`(no X digest available yet)\`, treat that section as cold; ask the user.

**Privacy:** Salience digest is filtered by allowlist (D9 default: \`projects/\`,
\`gstack/\`, \`concepts/\` only). Personal/family/therapy content never leaks here.
`;
}

/**
 * Renders the at-skill-end background refresh hook. Fires after the skill's
 * own work completes (telemetry has already logged); kicks any digest whose
 * age exceeds half its TTL but hasn't yet expired, so the NEXT invocation
 * gets a fresh cache without paying the cold-miss tax.
 *
 * Subordinate to {{TELEMETRY}} — runs after. Doesn't block the user.
 */
export function generateBrainCacheRefresh(ctx: TemplateContext): string {
  if (!isPreflightSkill(ctx.skillName)) return '';
  const binDir = ctx.paths.binDir;
  return `## Brain Cache Background Refresh

After the skill's work completes (and telemetry has logged), kick a
background refresh of any cache digest that's getting close to its TTL.
This is non-blocking — the user doesn't wait. Next invocation benefits
from the warm cache.

\`\`\`bash
eval "$(${binDir}/gstack-slug 2>/dev/null)" 2>/dev/null || true
(${binDir}/gstack-brain-cache refresh --project "$SLUG" 2>/dev/null &) || true
\`\`\`
`;
}

/**
 * Renders the calibration write-back block. ONLY emits when the skill makes
 * typed decisions worth a kind=bet take AND the brain trust policy is
 * personal. Phase 2 / E5 cross-skill calibration.
 *
 * Gated behind BRAIN_CALIBRATION_WRITEBACK feature flag in the resolver
 * output — the flag stays false until upstream gbrain ships takes_add MCP
 * op (T8). When the flag flips, the existing skill templates pick up the
 * write-back behavior without any template changes.
 */
export function generateBrainWriteBack(ctx: TemplateContext): string {
  if (!isPreflightSkill(ctx.skillName)) return '';
  const weight = SKILL_CALIBRATION_WEIGHTS[ctx.skillName];
  if (weight == null) return '';
  // List the cache digests this skill's writes should invalidate. Multiple
  // skills write to multiple entities; the invalidation map captures this.
  const invalidatesEntities = getInvalidationTargets(`/${ctx.skillName}`);
  const invalidateBash = invalidatesEntities
    .map((e) => `  ${ctx.paths.binDir}/gstack-brain-cache invalidate ${e} --project "$SLUG" 2>/dev/null || true`)
    .join('\n');

  return `## Brain Calibration Write-Back (Phase 2 / gated)

When the skill makes a typed prediction worth tracking (scope decision,
TTHW target, architectural bet, wedge commitment), it MAY write a
\`kind=bet\` take to the brain so a calibration profile builds over time.

**Gated on two things:**
1. Brain trust policy for the active endpoint is \`personal\` (check via
   \`${ctx.paths.binDir}/gstack-config get brain_trust_policy@<endpoint-hash>\`).
   Shared brains skip write-back to avoid polluting team calibration.
2. Feature flag \`BRAIN_CALIBRATION_WRITEBACK\` is set (today: false; flips
   to true when upstream gbrain v0.42+ ships \`takes_add\` MCP op).

When both gates pass, the write-back path uses \`mcp__gbrain__takes_add\`
to record a take with weight ${weight} (per SKILL_CALIBRATION_WEIGHTS).
If the MCP op is unavailable, fall back to \`mcp__gbrain__put_page\` with
a gstack:takes fence block (documented but uglier path).

Mandatory take frontmatter shape:
\`\`\`yaml
kind: bet
holder: <user identity from whoami>
claim: <one-line prediction the skill is making>
weight: ${weight}
since_date: <today's date>
expected_resolution: <date in 1-3 months depending on skill>
source_skill: ${ctx.skillName}
\`\`\`

After write, invalidate the affected digests so the next preflight reflects
the new state:

\`\`\`bash
eval "$(${ctx.paths.binDir}/gstack-slug 2>/dev/null)" 2>/dev/null || true
${invalidateBash || '  # (no per-skill invalidation targets configured)'}
\`\`\`
`;
}
