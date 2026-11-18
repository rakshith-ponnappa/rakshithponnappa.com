// Cheap pre-filter for obvious prompt-injection attempts. The system prompt and output checks are the
// real defence; this just avoids spending neurons on questions that are clearly not about Rakshith.

const PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget)\b.{0,30}\b(previous|prior|above|earlier|preceding|all|your|the)\b.{0,20}\b(instructions?|prompts?|rules?|context|messages?|directions?)\b/i,
  /\boverride\s+(your|all|the\s+system)\s+(rules|instructions|guidelines)\b/i,
  /\b(ignore|disregard)\s+(everything\s+|all\s+)?(of\s+)?(the\s+|that\s+)?(previous|above|prior|preceding)\b/i,
  /\bsystem\s*prompt\b/i,
  /\byou\s+are\s+now\b/i,
  /\bdeveloper\s+mode\b/i,
  /\bjail\s*-?\s*break/i,
  /\bDAN\s+mode\b/i,
  /\bpretend\s+(to\s+be|you\s+are|that\s+you)\b/i,
  /\b(act|behave)\s+as\s+(if\s+you\s+were\s+)?(an?\s+)?(unrestricted|unfiltered|different|new|evil)\b/i,
  /\b(reveal|print|show|repeat|output|leak|dump)\b.{0,20}\b(your|the|initial|hidden)\b.{0,20}\b(instructions?|prompt|rules|guidelines)\b/i,
  /\bnew\s+instructions?\b/i,
  /<\/?\s*(system|context|instructions?|assistant|user)\b/i,
  /\[\/?(INST|SYS)\]|<<\/?SYS>>|<\|[a-z_]+\|>/i,
  /\b(role\s*play|roleplay)\b/i,
];

export function looksLikeInjection(text: string): boolean {
  return PATTERNS.some((re) => re.test(text));
}
