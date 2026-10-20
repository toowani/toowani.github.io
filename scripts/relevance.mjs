/* ============================================================
   WANI.SYS — CONTEST RADAR 맞춤 판정 (docs/notice-relevance.md 기준)
   scrape-contests.mjs가 항목마다 gradeItem()을 불러 grade/reasonTags/
   reasonText를 매긴다. 키워드는 contests/relevance-rules.json 한 곳.
   party4life(session3)의 사업 공고 판정과 같은 명세를 따른다 — 그 쪽
   구현과 규칙이 갈라지면 docs/notice-relevance.md부터 맞출 것.
   ============================================================ */

export function loadProfile(env) {
  const raw = env.CONTEST_PROFILE;
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    return p;
  } catch {
    return null;
  }
}

function haystackOf(item) {
  return [item.title, item.sourceCategory, item.target, item.place, item.host, item.prize]
    .filter(Boolean)
    .join(" ");
}
function hasAny(text, list) {
  return (list || []).some((k) => text.includes(k));
}
function findAny(text, list) {
  return (list || []).find((k) => text.includes(k)) || null;
}

/* ---------- 분야 (3-1) ---------- */
function judgeField(text, rules) {
  const mismatch = findAny(text, rules.mismatchKeywords);
  if (!mismatch) return null;
  const hasInterest = hasAny(text, rules.interestKeywords);
  if (hasInterest) {
    return { level: "uncertain", tag: "분야 확인 필요", note: `'${mismatch}' 키워드가 있지만 관심 분야 키워드도 같이 있어요` };
  }
  return { level: "disallow", tag: "분야 불일치", note: `제목·분야에 '${mismatch}' 키워드가 있어요` };
}

/* ---------- 지역 (3-2, 개인 판정 기준) ---------- */
function judgeRegion(text, rules) {
  if (hasAny(text, rules.nationwideTerms)) return null;
  const gj = findAny(text, rules.gwangjuTerms);
  if (gj) {
    if (/광주.{0,10}주민등록|주민등록.{0,10}광주/.test(text)) {
      return { level: "disallow", tag: "지역 불가", note: "지역 조건(주민등록 기준)이 안 맞을 수 있어요" };
    }
    return null; // 광주 거주·재학·활동·소재 — 통과
  }
  const dg = findAny(text, rules.daeguTerms);
  if (dg) {
    if (/대구.{0,10}주민등록|주민등록.{0,10}대구/.test(text)) return null; // 통과
    if (/대구.{0,10}(거주|활동)|(거주|활동).{0,10}대구/.test(text)) {
      return { level: "disallow", tag: "지역 불가", note: "지역 조건(거주·활동 기준)이 안 맞을 수 있어요" };
    }
    return { level: "uncertain", tag: "지역 확인 필요", note: "지역 조건이 공고에서 분명하지 않아요" };
  }
  const other = findAny(text, rules.otherRegionNames);
  if (other) {
    return { level: "disallow", tag: "지역 불가", note: `'${other}' 지역 한정으로 보여요` };
  }
  // 시·군 단위 — 이름 바로 뒤에 시/군이 붙은 경우만(예산시스템·구리시설 같은 오탐 제외)
  for (const c of rules.otherCityNames || []) {
    const m = text.match(new RegExp(c + "(시|군)(?!스템|설)"));
    if (m) return { level: "disallow", tag: "지역 불가", note: `'${m[0]}' 지역 한정으로 보여요` };
  }
  return null;
}

/* ---------- 대상·연령 (3-3) ---------- */
function judgeTarget(text, rules, profile) {
  const bad = findAny(text, rules.disallowedTargetKeywords);
  if (bad) return { level: "disallow", tag: "대상 불가", note: `'${bad}' 조건이라 지원 대상이 아니에요` };

  const ageOver = text.match(/만?\s*(\d{1,2})\s*세\s*이상/);
  if (ageOver && profile.ageMax != null && +ageOver[1] > profile.ageMax) {
    return { level: "disallow", tag: "연령 불가", note: `만 ${ageOver[1]}세 이상 조건이라 나이가 안 맞아요` };
  }
  const ageUnder = text.match(/만?\s*(\d{1,2})\s*세\s*이하/);
  if (ageUnder && profile.ageMin != null && +ageUnder[1] < profile.ageMin) {
    return { level: "disallow", tag: "연령 불가", note: `만 ${ageUnder[1]}세 이하 조건이라 나이가 안 맞아요` };
  }

  const unsure = findAny(text, rules.uncertainTargetKeywords);
  if (unsure) return { level: "uncertain", tag: "대상 확인 필요", note: `'${unsure}' 조건이 공고에 있어 자격이 되는지 직접 확인이 필요해요` };
  return null;
}

/* ---------- 종합 판정 ---------- */
export function gradeItem(item, profile, rules) {
  if (!profile || !rules) return { grade: null, reasonTags: [], reasonText: "" };
  const text = haystackOf(item);
  const checks = [judgeField(text, rules), judgeRegion(text, rules), judgeTarget(text, rules, profile)].filter(Boolean);

  const disallows = checks.filter((c) => c.level === "disallow");
  const uncertains = checks.filter((c) => c.level === "uncertain");

  if (disallows.length) {
    return {
      grade: "비추천",
      reasonTags: [...new Set(disallows.map((c) => c.tag))],
      reasonText: disallows.map((c) => c.note).slice(0, 2).join(". ") + ".",
    };
  }
  if (uncertains.length) {
    return {
      grade: "확인 필요",
      reasonTags: [...new Set(uncertains.map((c) => c.tag))],
      reasonText: uncertains.map((c) => c.note).slice(0, 2).join(". ") + ".",
    };
  }
  const interestHits = (rules.interestKeywords || []).filter((k) => text.includes(k));
  const fieldNote = interestHits.length ? `관심 분야(${interestHits.slice(0, 2).join("·")})와 맞고 ` : "";
  return { grade: "추천", reasonTags: [], reasonText: `${fieldNote}자격 조건에 걸리는 내용이 안 보여요.` };
}

/* ============================================================
   매일 바뀌는 맞춤 추천 (notice-relevance.md 4절)
   ============================================================ */
function dayDiff(a, b) {
  return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000);
}

export function scoreItem(item, { today, recentIds, interestKeywords }) {
  let score = 0;
  const hits = (interestKeywords || []).filter((k) => haystackOf(item).includes(k));
  if (hits.length >= 2) score += 4;
  else if (hits.length === 1) score += 3;
  if (item._grade === "추천") score += 2;
  if (item.applyEnd) {
    const d = dayDiff(item.applyEnd, today);
    if (d >= 5 && d <= 21) score += 2;
    else if (d >= 2 && d <= 4) score += 1;
    else if (d <= 1) score -= 1;
  }
  if (item.prize) score += 1;
  if (haystackOf(item).includes("광주")) score += 1;
  if (item.firstSeen && dayDiff(today, item.firstSeen) <= 3) score += 1;
  if (recentIds && recentIds.has(item.id)) score -= 2;
  return score;
}

// 상위 N건 + 동점은 날짜를 시드로 섞는다 — 매일 순서가 달라지되 같은 날엔 고정.
function seededShuffle(arr, seed) {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function seedFromDate(dateStr) {
  let h = 0;
  for (const ch of dateStr) h = (h * 31 + ch.charCodeAt(0)) & 0x7fffffff;
  return h || 1;
}

/* "오늘의 추천" 전용 이유 문장 -- 등급 사유(reasonText, 자격 설명 위주)와는 달리
   오늘 왜 상위에 떴는지(분야·마감 임박·상금·지역)를 설명한다. 공고 쪽 조건만
   적고 개인 원값은 넣지 않는다 (5절). */
function buildRecommendReason(item, { today, interestKeywords }) {
  const text = haystackOf(item);
  const parts = [];
  const hits = (interestKeywords || []).filter((k) => text.includes(k));
  const eligible = item.grade === "추천" ? "지원 자격이 될 것 같아요" : "분야는 맞지만 자격 조건은 직접 확인해보세요";
  parts.push(hits.length ? `${hits.slice(0, 2).join("·")} 분야라 관심사와 맞고 ${eligible}` : eligible);

  const bits = [];
  if (item.applyEnd) {
    const d = dayDiff(item.applyEnd, today);
    if (d === 0) bits.push("오늘 마감");
    else if (d > 0 && d <= 21) bits.push(`마감까지 ${d}일`);
  }
  if (item.prize) bits.push("상금·지원금 안내 있음");
  if (text.includes("광주")) bits.push("광주 지역 공고");
  if (bits.length) parts.push(bits.join(", "));

  return parts.join(". ") + ".";
}

/* items: grade/reasonTags/reasonText가 이미 매겨진 전체 목록.
   recommendHistory: { "YYYY-MM-DD": ["id", ...] } 최근 3일치. */
export function buildRecommendation(items, { today, recommendHistory, interestKeywords, limit = 10 }) {
  const recentIds = new Set();
  Object.entries(recommendHistory || {})
    .filter(([date]) => dayDiff(today, date) >= 1 && dayDiff(today, date) <= 3)
    .forEach(([, ids]) => ids.forEach((id) => recentIds.add(id)));

  const candidates = items.filter((it) => {
    if (it.grade !== "추천" && it.grade !== "확인 필요") return false;
    if (it.applyEnd && it.applyEnd < today) return false;
    return true;
  });
  // 추천 등급을 확인 필요보다 우선 — 추천이 10건 이상이면 확인 필요는 후보에서 제외
  const haveEnoughRecommended = candidates.filter((it) => it.grade === "추천").length >= limit;
  const pool = haveEnoughRecommended ? candidates.filter((it) => it.grade === "추천") : candidates;

  const scored = pool.map((it) => ({
    item: it,
    score: scoreItem({ ...it, _grade: it.grade }, { today, recentIds, interestKeywords }),
  }));
  scored.sort((a, b) => b.score - a.score);

  // 동점 구간만 날짜 시드로 섞는다
  const groups = new Map();
  for (const s of scored) {
    if (!groups.has(s.score)) groups.set(s.score, []);
    groups.get(s.score).push(s);
  }
  const seed = seedFromDate(today);
  const ordered = [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .flatMap(([, group]) => seededShuffle(group, seed));

  return ordered.slice(0, limit).map((s) => ({
    id: s.item.id,
    score: s.score,
    grade: s.item.grade,
    reasonText: buildRecommendReason(s.item, { today, interestKeywords }),
  }));
}
