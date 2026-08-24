/** Supported derived age bands. Exact birth dates are intentionally excluded. */
export const AGE_BANDS = ["5", "6-9", "10-12", "13-15", "16-17", "18+"] as const;

export type AgeBand = (typeof AGE_BANDS)[number];

export const AGE_ASSURANCE_LEVELS = [
  "self-asserted",
  "guardian-attested",
  "provider-asserted",
  "verified",
] as const;

export type AgeAssuranceLevel = (typeof AGE_ASSURANCE_LEVELS)[number];

export const AGE_ASSURANCE_METHODS = [
  "self-assertion",
  "guardian-attestation",
  "provider-age-signal",
  "verified-provider",
  "manual-review",
] as const;

export type AgeAssuranceMethod = (typeof AGE_ASSURANCE_METHODS)[number];

/** Minimal, non-PII evidence carried with an age decision. */
export interface AgeAssuranceEvidence {
  level: AgeAssuranceLevel;
  method: AgeAssuranceMethod;
  assertedAt: string;
  expiresAt?: string;
  evidenceRef?: string;
}

export type PrincipalAccountType = "user" | "managed-child";

/** An opaque account reference. It contains no roles or profile information. */
export interface PrincipalReference {
  accountId: string;
  accountType: PrincipalAccountType;
}

export type PrincipalType = "self" | "guardian-delegated";

/** Self-principal `/oauth/me` contract separating a legacy storage alias from authority. */
export const COMPATIBILITY_PRINCIPAL_CONTRACT_VERSION = 2 as const;
export const LEGACY_STORAGE_OWNER_USER_ID_KIND = "legacy-storage-owner" as const;

/**
 * Server-authoritative identity for the authenticated actor and effective subject.
 * Guardian roles are deliberately not part of this browser contract.
 */
export interface ActorSubjectPrincipal {
  actor: PrincipalReference;
  subject: PrincipalReference;
  principalType: PrincipalType;
  relationshipId?: string;
  authorizationVersion?: number;
  ageBand?: AgeBand;
  assurance?: AgeAssuranceEvidence;
  authenticatedAt: string;
}

/** Public session shape retained by AuthContext. */
export interface AuthSessionIdentity {
  /**
   * Backwards-compatible active-subject identifier, or a versioned legacy
   * storage alias. Never use it as Token authority.
   */
  userId: string;
  principal: ActorSubjectPrincipal;
  /**
   * Additive provenance metadata. Consumers requiring canonical authority must
   * check for the exact `server-principal` value; absence is non-authoritative.
   */
  readonly authoritySource?: "server-principal" | "legacy-synthesized";
  readonly principalContractVersion?:
    | typeof COMPATIBILITY_PRINCIPAL_CONTRACT_VERSION
    | null;
  readonly userIdKind?: typeof LEGACY_STORAGE_OWNER_USER_ID_KIND | null;
}

/**
 * Fully normalized identity returned by this package's parsing and legacy
 * synthesis helpers. The broader `AuthSessionIdentity` remains structurally
 * compatible with pre-phased mocks.
 */
export interface ResolvedAuthSessionIdentity extends AuthSessionIdentity {
  readonly authoritySource: "server-principal" | "legacy-synthesized";
  readonly principalContractVersion:
    | typeof COMPATIBILITY_PRINCIPAL_CONTRACT_VERSION
    | null;
  readonly userIdKind: typeof LEGACY_STORAGE_OWNER_USER_ID_KIND | null;
}

/** Backwards-compatible `/oauth/me` response contract. */
export interface AuthMeResponse {
  userId?: string;
  principalContractVersion?: typeof COMPATIBILITY_PRINCIPAL_CONTRACT_VERSION;
  userIdKind?: typeof LEGACY_STORAGE_OWNER_USER_ID_KIND;
  principal?: ActorSubjectPrincipal;
  principals?: ActorSubjectPrincipal | readonly [ActorSubjectPrincipal];
}

const MAX_IDENTIFIER_LENGTH = 256;
const MAX_DATE_EPOCH_MS = 8_640_000_000_000_000;
const ISO_UTC_TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/u;

interface ParsedTimestamp {
  value: string;
  epochMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && allowed.some((candidate) => candidate === value);
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 31 || codeUnit === 127) return true;
  }

  return false;
}

function parseBoundedString(value: unknown, maximumLength: number): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    hasControlCharacters(value)
  ) {
    return null;
  }

  return value;
}

function parseIdentifier(value: unknown): string | null {
  return parseBoundedString(value, MAX_IDENTIFIER_LENGTH);
}

function parseTimestamp(
  value: unknown,
  nowMs: number,
  allowFuture: boolean,
): ParsedTimestamp | null {
  if (typeof value !== "string") return null;

  const match = ISO_UTC_TIMESTAMP.exec(value);
  const base = match?.[1];
  if (!base) return null;

  const milliseconds = (match?.[2] ?? "").padEnd(3, "0");
  const canonical = `${base}.${milliseconds}Z`;
  const epochMs = Date.parse(canonical);

  if (
    !Number.isFinite(epochMs) ||
    new Date(epochMs).toISOString() !== canonical ||
    (!allowFuture && epochMs > nowMs)
  ) {
    return null;
  }

  return { value, epochMs };
}

function parsePrincipalReference(value: unknown): PrincipalReference | null {
  if (!isRecord(value)) return null;

  const accountId = parseIdentifier(value.accountId);
  if (!accountId || (value.accountType !== "user" && value.accountType !== "managed-child")) {
    return null;
  }

  return {
    accountId,
    accountType: value.accountType,
  };
}

function parseAgeAssurance(
  value: unknown,
  nowMs: number,
  authenticatedAtMs: number,
): AgeAssuranceEvidence | null {
  if (!isRecord(value)) return null;
  if (!isOneOf(value.level, AGE_ASSURANCE_LEVELS)) return null;
  if (!isOneOf(value.method, AGE_ASSURANCE_METHODS)) return null;

  const assertedAt = parseTimestamp(value.assertedAt, nowMs, false);
  if (!assertedAt || assertedAt.epochMs > authenticatedAtMs) return null;

  let expiresAt: ParsedTimestamp | undefined;
  if (hasOwn(value, "expiresAt")) {
    const parsedExpiry = parseTimestamp(value.expiresAt, nowMs, true);
    if (
      !parsedExpiry ||
      parsedExpiry.epochMs <= assertedAt.epochMs ||
      parsedExpiry.epochMs <= nowMs
    ) {
      return null;
    }
    expiresAt = parsedExpiry;
  }

  let evidenceRef: string | undefined;
  if (hasOwn(value, "evidenceRef")) {
    const parsedReference = parseIdentifier(value.evidenceRef);
    if (!parsedReference) return null;
    evidenceRef = parsedReference;
  }

  const hasValidLevelMethodPair =
    (value.level === "self-asserted" && value.method === "self-assertion") ||
    (value.level === "guardian-attested" &&
      value.method === "guardian-attestation") ||
    (value.level === "provider-asserted" &&
      value.method === "provider-age-signal") ||
    (value.level === "verified" &&
      (value.method === "verified-provider" || value.method === "manual-review"));
  if (!hasValidLevelMethodPair) return null;

  return {
    level: value.level,
    method: value.method,
    assertedAt: assertedAt.value,
    ...(expiresAt ? { expiresAt: expiresAt.value } : {}),
    ...(evidenceRef ? { evidenceRef } : {}),
  };
}

/**
 * Validates and minimizes an actor/subject principal received across the network.
 * Unknown fields (including roles and raw age data) are intentionally discarded.
 */
export function parseActorSubjectPrincipal(
  value: unknown,
  nowMs = Date.now(),
): ActorSubjectPrincipal | null {
  if (
    !Number.isFinite(nowMs) ||
    nowMs < 0 ||
    nowMs > MAX_DATE_EPOCH_MS ||
    !isRecord(value)
  ) {
    return null;
  }

  const actor = parsePrincipalReference(value.actor);
  const subject = parsePrincipalReference(value.subject);
  const authenticatedAt = parseTimestamp(value.authenticatedAt, nowMs, false);

  if (
    !actor ||
    !subject ||
    !authenticatedAt ||
    (value.principalType !== "self" && value.principalType !== "guardian-delegated")
  ) {
    return null;
  }

  const hasRelationshipId = hasOwn(value, "relationshipId");
  const relationshipId = hasRelationshipId
    ? parseIdentifier(value.relationshipId)
    : undefined;
  if (hasRelationshipId && !relationshipId) return null;

  const hasAuthorizationVersion = hasOwn(value, "authorizationVersion");
  const authorizationVersion = hasAuthorizationVersion
    ? value.authorizationVersion
    : undefined;
  if (
    hasAuthorizationVersion &&
    (!Number.isSafeInteger(authorizationVersion) || (authorizationVersion as number) < 1)
  ) {
    return null;
  }

  const hasAgeBand = hasOwn(value, "ageBand");
  const ageBand = hasAgeBand && isOneOf(value.ageBand, AGE_BANDS) ? value.ageBand : undefined;
  if (hasAgeBand && !ageBand) return null;

  const hasAssurance = hasOwn(value, "assurance");
  const assurance = hasAssurance
    ? parseAgeAssurance(value.assurance, nowMs, authenticatedAt.epochMs)
    : undefined;
  if (hasAssurance && !assurance) return null;
  if (hasAgeBand !== hasAssurance) return null;

  if (value.principalType === "self") {
    if (
      actor.accountType !== "user" ||
      subject.accountType !== "user" ||
      actor.accountId !== subject.accountId ||
      hasRelationshipId ||
      hasAuthorizationVersion ||
      (assurance?.level === "provider-asserted" && ageBand !== "18+")
    ) {
      return null;
    }
  } else if (
    actor.accountType !== "user" ||
    subject.accountType !== "managed-child" ||
    actor.accountId === subject.accountId ||
    !relationshipId ||
    !hasAuthorizationVersion ||
    !ageBand ||
    ageBand === "18+" ||
    !assurance ||
    assurance.level === "self-asserted" ||
    assurance.level === "provider-asserted"
  ) {
    return null;
  }

  return {
    actor,
    subject,
    principalType: value.principalType,
    ...(relationshipId ? { relationshipId } : {}),
    ...(hasAuthorizationVersion
      ? { authorizationVersion: authorizationVersion as number }
      : {}),
    ...(ageBand ? { ageBand } : {}),
    ...(assurance ? { assurance } : {}),
    authenticatedAt: authenticatedAt.value,
  };
}

function principalsMatch(
  first: ActorSubjectPrincipal,
  second: ActorSubjectPrincipal,
): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function synthesizeSelfIdentity(
  userId: string,
  nowMs: number,
): ResolvedAuthSessionIdentity {
  const authenticatedAt = new Date(nowMs).toISOString();
  const reference: PrincipalReference = { accountId: userId, accountType: "user" };

  return {
    userId,
    authoritySource: "legacy-synthesized",
    principalContractVersion: null,
    userIdKind: null,
    principal: {
      actor: reference,
      subject: { ...reference },
      principalType: "self",
      authenticatedAt,
    },
  };
}

/** Creates the same self-principal fallback used for legacy local `setUserId` calls. */
export function createLegacySelfIdentity(
  userId: unknown,
  nowMs = Date.now(),
): ResolvedAuthSessionIdentity | null {
  const parsedUserId = parseIdentifier(userId);
  if (
    !parsedUserId ||
    !Number.isFinite(nowMs) ||
    nowMs < 0 ||
    nowMs > MAX_DATE_EPOCH_MS
  ) {
    return null;
  }

  return synthesizeSelfIdentity(parsedUserId, nowMs);
}

/**
 * Parses legacy and actor/subject `/oauth/me` responses. Any ambiguity or mismatch
 * invalidates the whole response instead of falling back to a weaker identity.
 */
export function parseAuthMeResponse(
  value: unknown,
  nowMs = Date.now(),
): ResolvedAuthSessionIdentity | null {
  if (
    !Number.isFinite(nowMs) ||
    nowMs < 0 ||
    nowMs > MAX_DATE_EPOCH_MS ||
    !isRecord(value)
  ) {
    return null;
  }

  const hasUserId = hasOwn(value, "userId");
  const userId = hasUserId ? parseIdentifier(value.userId) : undefined;
  if (hasUserId && !userId) return null;

  const hasPrincipalContractVersion = hasOwn(value, "principalContractVersion");
  const hasUserIdKind = hasOwn(value, "userIdKind");
  const hasCompatibilityMarkers =
    hasPrincipalContractVersion
    && hasUserIdKind
    && value.principalContractVersion === COMPATIBILITY_PRINCIPAL_CONTRACT_VERSION
    && value.userIdKind === LEGACY_STORAGE_OWNER_USER_ID_KIND;
  if (
    (hasPrincipalContractVersion || hasUserIdKind)
    && (!hasCompatibilityMarkers || !userId)
  ) {
    return null;
  }

  const hasPrincipal = hasOwn(value, "principal");
  const hasPrincipals = hasOwn(value, "principals");

  let principal: ActorSubjectPrincipal | null = null;
  if (hasPrincipal) {
    principal = parseActorSubjectPrincipal(value.principal, nowMs);
    if (!principal) return null;
  }

  if (hasPrincipals) {
    const aliasValue = Array.isArray(value.principals)
      ? value.principals.length === 1
        ? value.principals[0]
        : undefined
      : value.principals;
    const aliasPrincipal = parseActorSubjectPrincipal(aliasValue, nowMs);
    if (!aliasPrincipal) return null;
    if (principal && !principalsMatch(principal, aliasPrincipal)) return null;
    principal = aliasPrincipal;
  }

  if (!principal) {
    if (hasCompatibilityMarkers) return null;
    return userId ? synthesizeSelfIdentity(userId, nowMs) : null;
  }

  const compatibilityAliasContract =
    hasCompatibilityMarkers
    && principal.principalType === "self"
    && userId !== principal.subject.accountId;
  if (hasCompatibilityMarkers && !compatibilityAliasContract) return null;

  if (
    userId
    && userId !== principal.subject.accountId
    && !compatibilityAliasContract
  ) {
    return null;
  }

  return {
    userId: userId ?? principal.subject.accountId,
    authoritySource: "server-principal",
    principalContractVersion: compatibilityAliasContract
      ? COMPATIBILITY_PRINCIPAL_CONTRACT_VERSION
      : null,
    userIdKind: compatibilityAliasContract
      ? LEGACY_STORAGE_OWNER_USER_ID_KIND
      : null,
    principal,
  };
}
