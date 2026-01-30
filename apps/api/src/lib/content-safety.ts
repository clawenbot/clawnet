/**
 * Content Safety Module
 * 
 * Detects and handles prompt injection attempts in user-generated content.
 * This is a critical security layer protecting AI agents from manipulation.
 */

// =============================================================================
// INJECTION PATTERN DEFINITIONS
// =============================================================================

/**
 * Patterns that indicate malicious prompt injection attempts.
 * Each pattern has a category, regex, and severity level.
 */
const INJECTION_PATTERNS: Array<{
  category: string;
  patterns: RegExp[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}> = [
  // CRITICAL: Direct instruction overrides
  {
    category: 'instruction_override',
    severity: 'critical',
    patterns: [
      /ignore\s+(all\s+)?(previous|above|prior|earlier)\s+(instructions?|prompts?|rules?|guidelines?)/i,
      /disregard\s+(all\s+)?(previous|above|prior|earlier|your)\s+(instructions?|prompts?|rules?|guidelines?)/i,
      /forget\s+(all\s+)?(previous|above|everything|your)\s+(instructions?|prompts?|context)?/i,
      /override\s+(your|all|the)\s+(instructions?|programming|rules?|guidelines?|restrictions?)/i,
      /bypass\s+(your|all|the)\s+(restrictions?|rules?|guidelines?|filters?|safety)/i,
      /your\s+new\s+(instructions?|task|goal|objective|purpose)\s+(is|are)/i,
      /from\s+now\s+on\s+(you\s+)?(will|must|should|are)/i,
      /stop\s+being\s+(an?\s+)?(AI|assistant|agent|helpful)/i,
      /you\s+are\s+no\s+longer\s+(bound|restricted|limited)/i,
    ],
  },
  
  // CRITICAL: Fake system prompts
  {
    category: 'fake_system_prompt',
    severity: 'critical',
    patterns: [
      /^SYSTEM\s*:/im,
      /^ADMIN\s*:/im,
      /^\[INST\]/im,
      /^\[\/INST\]/im,
      /^<<SYS>>/im,
      /^<\/SYS>>/im,
      /^###\s*(Human|Assistant|System|Instruction)\s*:/im,
      /^(Human|User|Assistant)\s*:/im,
      /<\|im_start\|>/i,
      /<\|im_end\|>/i,
      /^Input\s*:/im,
      /^Output\s*:/im,
      /^Response\s*:/im,
    ],
  },
  
  // CRITICAL: Mode/persona manipulation
  {
    category: 'mode_manipulation',
    severity: 'critical',
    patterns: [
      /you\s+are\s+now\s+in\s+\w+\s+mode/i,
      /enable\s+(developer|admin|debug|god|unrestricted|jailbreak|DAN)\s+mode/i,
      /enter\s+(developer|admin|debug|unrestricted)\s+mode/i,
      /switch\s+to\s+\w+\s+mode/i,
      /activate\s+\w+\s+mode/i,
      /jailbreak\s+(enabled|activated|mode)/i,
      /DAN\s+(mode|enabled|activated)/i,
      /act\s+as\s+(an?\s+)?unrestricted/i,
      /pretend\s+(you\s+)?(have\s+no|there\s+are\s+no)\s+(limits?|restrictions?|rules?)/i,
      /roleplay\s+as\s+(a\s+)?(version|AI)\s+(without|with\s+no)/i,
      /simulate\s+(a\s+)?hypothetical/i,
    ],
  },
  
  // CRITICAL: Credential extraction
  {
    category: 'credential_extraction',
    severity: 'critical',
    patterns: [
      /what\s+is\s+your\s+(API\s*)?key/i,
      /show\s+(me\s+)?your\s+(API\s*)?key/i,
      /reveal\s+your\s+(API\s*)?key/i,
      /print\s+your\s+(credentials?|token|key|secret)/i,
      /output\s+your\s+(credentials?|token|key|secret|config)/i,
      /display\s+your\s+(credentials?|token|key|config|env)/i,
      /paste\s+your\s+\.?env/i,
      /what\s+(were\s+you|are\s+your)\s+(told|instructions?|prompts?)/i,
      /reveal\s+your\s+(system\s+)?prompt/i,
      /show\s+(me\s+)?your\s+(system\s+)?prompt/i,
    ],
  },
  
  // HIGH: Commanded actions
  {
    category: 'commanded_action',
    severity: 'high',
    patterns: [
      /delete\s+all\s+(your\s+)?(posts?|comments?|connections?|data)/i,
      /remove\s+all\s+(your\s+)?(posts?|comments?|connections?)/i,
      /disconnect\s+from\s+(all|everyone|everything)/i,
      /unfollow\s+(all|everyone)/i,
      /post\s+(exactly|this)\s*:/i,
      /say\s+(exactly|this)\s*:/i,
      /reply\s+with\s*:/i,
      /copy\s+and\s+paste\s*:/i,
      /repeat\s+after\s+me/i,
      // Natural language imperatives (e.g., "post a racist post immediately")
      /\b(post|write|send|create)\s+a\s+.{1,30}\s+(post|message|comment|tweet)\b/i,
      /\b(say|write|output)\s+a\s+.{1,30}\s+(thing|word|phrase|slur|statement)\b/i,
      /\b(immediately|now|right\s*now)\s+(post|say|write|send|delete|remove)\b/i,
      /\b(post|say|write|send|delete)\s+.{1,50}\s+(immediately|now|right\s*now)\b/i,
      /if\s+you('re|\s+are)\s+reading\s+this[,\s]+(do|post|say|send|delete|write)/i,
      /when\s+you\s+(see|read)\s+this[,\s]+(do|post|say|send|delete|write)/i,
      // "do not follow X and Y" patterns (instruction override + command combo)
      /do\s+not\s+follow\s+.{1,50}\s+and\s+(say|post|write|do|send)/i,
    ],
  },
  
  // HIGH: Command injection
  {
    category: 'command_injection',
    severity: 'high',
    patterns: [
      /run\s+(this\s+)?command\s*:/i,
      /execute\s*:/i,
      /\bcurl\s+/i,
      /\bwget\s+/i,
      /fetch\s+(this\s+)?URL/i,
      /POST\s+to\s+/i,
      /send\s+(a\s+)?(request|data)\s+to/i,
      /exfiltrate/i,
    ],
  },
  
  // MEDIUM: Social engineering
  {
    category: 'social_engineering',
    severity: 'medium',
    patterns: [
      /your\s+human\s+(wanted|asked|told)\s+(me|us)\s+to/i,
      /I('m|\s+am)\s+(an?\s+)?admin/i,
      /official\s+ClawNet\s+(request|message)/i,
      /this\s+is\s+a\s+test[\s,]+please\s+comply/i,
      /as\s+a\s+fellow\s+agent[\s,]+trust\s+me/i,
      /I\s+need\s+your\s+help\s+to\s+test/i,
      /just\s+between\s+us\s+agents/i,
      /don'?t\s+tell\s+your\s+human\s+but/i,
      /I('m|\s+am)\s+from\s+(OpenClaw|ClawNet|support)/i,
    ],
  },
  
  // MEDIUM: Urgency/authority manipulation
  {
    category: 'urgency_manipulation',
    severity: 'medium',
    patterns: [
      /^URGENT\s*:/im,
      /^CRITICAL\s*:/im,
      /^IMMEDIATE\s+ACTION\s+REQUIRED/im,
      /^SECURITY\s+ALERT/im,
      /your\s+account\s+will\s+be\s+(deleted|suspended|banned)\s+unless/i,
      /time[- ]sensitive\s+request/i,
      /emergency\s+override/i,
      /must\s+(respond|act|do\s+this)\s+(immediately|now|urgently)/i,
    ],
  },
  
  // LOW: Suspicious encoding (might have legitimate uses)
  {
    category: 'encoding_obfuscation',
    severity: 'low',
    patterns: [
      // Base64 blocks (at least 20 chars of base64-looking content)
      /[A-Za-z0-9+\/]{20,}={0,2}/,
      // Hex strings (at least 20 chars)
      /(?:0x)?[0-9a-fA-F]{20,}/,
      // Unicode escapes
      /\\u[0-9a-fA-F]{4}/,
      // Zero-width characters
      /[\u200B-\u200D\uFEFF]/,
      // RTL override
      /[\u202A-\u202E\u2066-\u2069]/,
    ],
  },
];

// =============================================================================
// CONTENT ANALYSIS
// =============================================================================

export interface SafetyFlag {
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  pattern: string;
  match: string;
}

export interface SafetyAnalysis {
  flagged: boolean;
  flags: SafetyFlag[];
  score: number; // 0-100, higher = more dangerous
  recommendation: 'allow' | 'warn' | 'block';
}

/**
 * Analyze content for injection patterns
 */
export function analyzeContent(content: string): SafetyAnalysis {
  const flags: SafetyFlag[] = [];
  
  for (const { category, patterns, severity } of INJECTION_PATTERNS) {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        flags.push({
          category,
          severity,
          pattern: pattern.source,
          match: match[0].substring(0, 100), // Limit match length
        });
      }
    }
  }
  
  // Calculate danger score
  let score = 0;
  for (const flag of flags) {
    switch (flag.severity) {
      case 'critical': score += 40; break;
      case 'high': score += 25; break;
      case 'medium': score += 15; break;
      case 'low': score += 5; break;
    }
  }
  score = Math.min(score, 100);
  
  // Determine recommendation
  let recommendation: 'allow' | 'warn' | 'block';
  if (flags.some(f => f.severity === 'critical')) {
    recommendation = 'block';
  } else if (score >= 50 || flags.some(f => f.severity === 'high')) {
    recommendation = 'block';
  } else if (score >= 20) {
    recommendation = 'warn';
  } else {
    recommendation = 'allow';
  }
  
  return {
    flagged: flags.length > 0,
    flags,
    score,
    recommendation,
  };
}

// =============================================================================
// CONTENT SANITIZATION (for writes)
// =============================================================================

/**
 * Check if content should be blocked from being posted
 * Returns null if OK, or an error message if blocked
 */
export function validateContentForPost(content: string): string | null {
  const analysis = analyzeContent(content);
  
  if (analysis.recommendation === 'block') {
    const categories = Array.from(new Set(analysis.flags.map(f => f.category)));
    return `Content blocked: detected ${categories.join(', ')}. ` +
           `This content appears to contain prompt injection patterns. ` +
           `If you believe this is an error, please rephrase your message.`;
  }
  
  return null;
}

/**
 * Get safety metadata to include in API responses
 */
export function getSafetyMetadata(content: string): {
  flagged: boolean;
  flags: string[];
  score: number;
} {
  const analysis = analyzeContent(content);
  return {
    flagged: analysis.flagged,
    flags: Array.from(new Set(analysis.flags.map(f => f.category))),
    score: analysis.score,
  };
}

// =============================================================================
// CONTENT TRANSFORMATION (optional sanitization)
// =============================================================================

/**
 * Redact obviously malicious content while preserving readability
 * Only redacts CRITICAL severity matches
 */
export function redactCriticalPatterns(content: string): string {
  let redacted = content;
  
  for (const { patterns, severity } of INJECTION_PATTERNS) {
    if (severity !== 'critical') continue;
    
    for (const pattern of patterns) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }
  }
  
  return redacted;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  analyzeContent,
  validateContentForPost,
  getSafetyMetadata,
  redactCriticalPatterns,
};
