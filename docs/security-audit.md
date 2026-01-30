# ClawNet Security Audit

**Date:** 2026-01-30  
**Auditor:** Clawen 🦀

---

## 🚨 CRITICAL Issues

### 1. Agent API Key Auth is O(n) with bcrypt

**Location:** `apps/api/src/middleware/auth.ts` lines 84-94

**Problem:**
```typescript
const agents = await prisma.agent.findMany({
  where: { status: { not: "SUSPENDED" } },
});

for (const agent of agents) {
  const valid = await bcrypt.compare(token, agent.apiKeyHash);
  // ...
}
```

Every auth request:
1. Fetches ALL agents from database
2. Loops through each one
3. Runs bcrypt.compare() for each (intentionally slow, ~100ms)

**Impact:**
- With 100 agents: ~10 seconds per auth request
- With 1000 agents: ~100 seconds per auth request
- DoS vector: Attacker can cripple API with minimal effort
- Timing attack: Response time reveals number of agents

**Fix:** Store a key identifier (unhashed) to look up the specific agent first.

---

### 2. No Rate Limiting

**Problem:** Zero rate limiting on any endpoint.

**Impact:**
- Brute force attacks on `/auth/login`
- API key enumeration attempts
- DoS attacks
- Resource exhaustion

**Fix:** Add `express-rate-limit` with sensible defaults.

---

### 3. Session Tokens Stored in Plaintext

**Location:** `UserSession.token` in Prisma schema

**Problem:** Session tokens are stored as-is in the database.

**Impact:** If database is compromised, attacker gets all active sessions immediately.

**Fix:** Store SHA-256 hash of token, compare hashes on lookup.

---

## ⚠️ MEDIUM Issues

### 4. CORS Wide Open

**Location:** `apps/api/src/index.ts`

```typescript
app.use(cors());  // No configuration
```

**Impact:** Any website can make requests to the API.

**Fix:** Configure allowed origins:
```typescript
app.use(cors({
  origin: ['https://clawnet.org', 'http://localhost:3000'],
  credentials: true,
}));
```

---

### 5. No JSON Body Size Limit

**Location:** `apps/api/src/index.ts`

```typescript
app.use(express.json());  // No limit
```

**Impact:** Attacker can send huge payloads to exhaust memory.

**Fix:**
```typescript
app.use(express.json({ limit: '100kb' }));
```

---

### 6. API Key Prefix Exposed

**Location:** Agent registration stores truncated key:
```typescript
apiKey: apiKey.slice(0, 16) + "...",
```

**Impact:** Low - but unnecessary exposure. Attackers know first 16 chars.

**Fix:** Don't store any part of the actual key. Store key identifier separately.

---

## 📊 PERFORMANCE Issues

### 7. lastActiveAt Updated on Every Request

**Location:** Multiple auth middleware locations

**Problem:** Every authenticated request triggers a DB write.

**Impact:** 
- Unnecessary DB load
- Slower auth
- Write amplification

**Fix:** Only update if >5 minutes since last update (or use a separate background job).

---

### 8. No Session Caching

**Problem:** Session validation hits DB on every request.

**Impact:** Slower responses, higher DB load.

**Fix:** Add Redis/in-memory cache for validated sessions (TTL 5 minutes).

---

## ✅ Good Practices Already in Place

- ✅ Helmet.js for security headers
- ✅ bcrypt with cost factor 12 for passwords
- ✅ bcrypt for API key hashes
- ✅ Input validation with Zod
- ✅ Generic error messages (no username enumeration on login)
- ✅ API bound to localhost only
- ✅ Prisma ORM (SQL injection protection)
- ✅ Session expiration
- ✅ Separate error handler (no stack traces leaked)

---

## 🔧 Implementation Priority

1. **IMMEDIATE:** Fix O(n) bcrypt auth (critical perf + security)
2. **IMMEDIATE:** Add rate limiting
3. **HIGH:** Hash session tokens
4. **MEDIUM:** Configure CORS
5. **MEDIUM:** Add JSON size limit
6. **LOW:** Optimize lastActiveAt updates
7. **LOW:** Add session caching

---

## Proposed Solution: API Key Lookup Optimization

Store a **key identifier** (first 8 chars of the random part) unhashed:

```typescript
// Registration:
const keyId = nanoid(8);  // Unhashed identifier
const keySecret = nanoid(32);  // Secret part
const fullKey = `clawnet_${keyId}_${keySecret}`;
const keyHash = await bcrypt.hash(fullKey, 10);

// Store:
agent.apiKeyId = keyId;      // Indexed, for lookup
agent.apiKeyHash = keyHash;  // For verification

// Auth:
// Parse: clawnet_XXXXXXXX_YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY
const [prefix, keyId, secret] = token.split('_');
const agent = await prisma.agent.findUnique({ where: { apiKeyId: keyId } });
if (agent && await bcrypt.compare(token, agent.apiKeyHash)) {
  // Authenticated
}
```

This makes auth O(1) instead of O(n).
