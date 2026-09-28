#!/usr/bin/env node
/* ============================================================
   WANI.SYS — CONTEST RADAR SCRAPER
   AI 공모전 / 개발 해커톤·경진대회 / 창업 공모전 공고를 여러 사이트에서
   긁어 contests/data.json 하나로 합친다. 의존성 없음(Node 20+ 내장 fetch).

   실행:  node scripts/scrape-contests.mjs        (hub/ 루트에서)
   출력:  contests/data.json  — 페이지(contests/index.html)가 fetch해서 그림

   소스:
     linkareer  https://linkareer.com/list/contest   (GraphQL, 공모전 전체)
     hola       https://holaworld.io/hola-it         (REST, hackathon/contest)
     wevity     https://www.wevity.com               (HTML, IT/SW/과학/아이디어/영상 분야)
     devevent   github.com/brave-people/Dev-Event    (README 마크다운, 분류=대회)
     kstartup   https://www.k-startup.go.kr          (HTML, 모집중 사업공고)

   설계 메모:
   - 소스 하나가 죽어도 전체가 죽지 않는다. 실패한 소스는 직전 data.json의
     항목을 그대로 유지하고 meta.sources[name].error 에 이유를 남긴다.
   - firstSeen 은 직전 data.json에서 이어받는다 (페이지의 NEW 배지용).
   - wevity 상세 페이지(접수기간·상금·공식 홈페이지)는 새 항목만 가져오고
     나머지는 직전 결과를 캐시로 쓴다 — 상대 서버에 부담 안 주기 위해.
   - 제목 정규화로 소스 간 중복을 합친다 (sources 배열에 출처 전부 보존).
   ============================================================ */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "contests/data.json");
const UA = "Mozilla/5.0 (compatible; toowani-contest-radar/1.0; +https://toowani.com/contests/)";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/* ---------- 분류 규칙 ----------
   제목(+소스 분야명)에 대해 정규식으로 태그를 붙인다. 태그가 하나도 없으면
   버린다(단, 소스 자체가 개발 행사 전용인 경우는 dev 강제). */
const RULES = {
  ai: /\bAI\b|A\.I\.|인공지능|생성형|생성 ?AI|LLM|GPT|딥러닝|머신러닝|기계학습|데이터 ?분석|빅데이터|데이터 ?활용|프롬프트|에이전트|\bML\b|\bDL\b|컴퓨터 ?비전|자연어|NLP|Deep ?Learning|Machine ?Learning|AIGC|바이브 ?코딩|Vibe ?Coding|딥페이크|로보틱스|자율주행/i,
  dev: /해커톤|Hackathon|메이커톤|아이디어톤|Ideathon|경진대회|챌린지|Challenge|개발 ?(공모전|대회|콘테스트|경진)|코딩|프로그래밍|Programming|\bSW\b|소프트웨어|Software|앱 ?(개발|공모|콘테스트)|\bApp\b|게임 ?(개발|잼|제작)|Game ?Jam|알고리즘|오픈소스|Open ?Source|API|블록체인|Web3|클라우드|IoT|임베디드|로봇|드론|버그 ?바운티|CTF|보안 ?(대회|경진)|데이터톤|Datathon|캡스톤|ICT|디지털 ?(혁신|전환|서비스)|플랫폼 ?(개발|공모)|테크|Tech/i,
  startup: /창업|스타트업|Startup|사업화|예비 ?창업|데모 ?데이|Demo ?Day|\bIR\b|투자 ?유치|비즈니스 ?(모델|아이디어|플랜)|\bBM\b|엑셀러레이팅|Accelerat|인큐베이팅|벤처|Venture|기업가 ?정신|사업 ?계획서|피칭|Pitch/i,
  video: /영상|비디오|Video|UCC|숏폼|Short-?form|쇼츠|Shorts|필름|Film|영화|다큐|애니메이션|모션 ?그래픽|콘텐츠 ?(제작|공모)|미디어 ?아트|뮤직 ?비디오/i,
};
/* 명백히 청소년·아동 전용은 뺀다 (대학생·일반 포함이면 유지) */
const YOUTH_ONLY = /초등|중학생|고등학생|고교생|중고생|초중고|청소년|어린이|유아|아동|키즈|Kids/i;
const ADULT_OK = /대학|일반인|일반부|성인|누구나|전 ?국민|제한 ?없|청년|직장인|전문가/i;
/* 공모전이 아닌 행사(취업 멘토링·포럼·밋업 등) — 제목에 대회 성격 단어가 없을 때만 뺀다 */
const NOISE = /취업|이직|멘토링|컨퍼런스|Conference|세미나|강연|채용|설명회|박람회|포럼|Forum|밋업|Meet-?up|부트캠프|Bootcamp|워크숍|Workshop|웨비나|Webinar|교육생|수강생|스터디|입주기업|주관기관/i;
const CONTESTY = /공모|경진|대회|해커톤|Hackathon|챌린지|Challenge|콘테스트|Contest|경연|어워드|Award|데모 ?데이|Demo ?Day|메이커톤|아이디어톤|Competition|Jam/i;

const TAG_MIN = { ai: 1, dev: 1, startup: 1, video: 1 };

function classify(text, forced = []) {
  const tags = new Set(forced);
  for (const [tag, re] of Object.entries(RULES)) if (re.test(text)) tags.add(tag);
  // 영상만 붙은 항목은 "AI 생성 영상물" 류일 때만 관심 대상 → ai 없이 video만 있으면 버린다
  if (tags.has("video") && !tags.has("ai") && !tags.has("dev") && !tags.has("startup")) tags.delete("video");
  return [...tags].filter((t) => TAG_MIN[t]);
}
function isYouthOnly(text) {
  return YOUTH_ONLY.test(text) && !ADULT_OK.test(text);
}
function isNoise(title) {
  return NOISE.test(title) && !CONTESTY.test(title);
}
/* 모든 소스 공통 마지막 관문 */
function reject(title, extra = "") {
  return isYouthOnly(`${title} ${extra}`) || isNoise(title);
}

/* ---------- 유틸 ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchText(url, opts = {}, retries = 2) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { "user-agent": UA, "accept-language": "ko,en;q=0.8", ...(opts.headers || {}) },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.text();
    } catch (e) {
      if (i >= retries) throw e;
      await sleep(800 * (i + 1));
    }
  }
}
async function fetchJSON(url, opts) {
  return JSON.parse(await fetchText(url, opts));
}
/* 동시성 제한 map */
async function pmap(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·" };
function decode(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, k) => ENT[k.toLowerCase()] ?? m);
}
const strip = (html) => decode(String(html || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
/* epoch ms / ISO → KST 기준 YYYY-MM-DD */
function kstDate(v) {
  if (v == null || v === "") return null;
  const t = typeof v === "number" ? v : Date.parse(v);
  if (!Number.isFinite(t)) return null;
  return new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10);
}
const todayKST = () => kstDate(Date.now());
const pad2 = (n) => String(n).padStart(2, "0");
/* 중복 병합용 제목 키 */
function titleKey(t) {
  return String(t)
    .toLowerCase()
    .replace(/[\[\(【].*?[\]\)】]/g, " ") // [주최] (부제) 제거
    .replace(/제\s*\d+\s*회|\d{4}\s*년?|20\d\d/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

/* ============================================================
   SOURCE 1 — linkareer (GraphQL)
   ============================================================ */
async function scrapeLinkareer() {
  const endpoint = "https://api.linkareer.com/graphql";
  const query = `query ActivityList($filterBy: ActivityFilter, $orderBy: ActivityOrder, $pagination: Pagination) {
    activities(filterBy: $filterBy, orderBy: $orderBy, pagination: $pagination) {
      totalCount nodes { id title organizationName recruitCloseAt recruitStartAt createdAt categories { name } targets { name } }
    } }`;
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const body = JSON.stringify({
      operationName: "ActivityList",
      variables: {
        filterBy: { activityTypeID: "3", status: "OPEN" },
        orderBy: { direction: "DESC", field: "CREATED_AT" },
        pagination: { page, pageSize: 200 },
      },
      query,
    });
    const res = await fetchJSON(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://linkareer.com", referer: "https://linkareer.com/list/contest" },
      body,
    });
    if (res.errors) throw new Error("linkareer graphql: " + JSON.stringify(res.errors).slice(0, 200));
    const { nodes, totalCount } = res.data.activities;
    for (const n of nodes) {
      const cats = (n.categories || []).map((c) => c.name);
      const targets = (n.targets || []).map((c) => c.name).join(", ");
      const text = `${n.title} ${cats.join(" ")}`;
      const forced = [];
      if (cats.includes("창업")) forced.push("startup");
      const tags = classify(text, forced);
      if (!tags.length) continue;
      if (reject(n.title, targets)) continue;
      out.push({
        id: `linkareer:${n.id}`,
        source: "linkareer",
        title: n.title.trim(),
        host: n.organizationName || null,
        url: `https://linkareer.com/activity/${n.id}`,
        officialUrl: null,
        applyStart: kstDate(n.recruitStartAt),
        applyEnd: kstDate(n.recruitCloseAt),
        postedAt: kstDate(n.createdAt),
        prize: null,
        place: null,
        target: targets || null,
        sourceCategory: cats.join(", ") || null,
        tags,
      });
    }
    if (page * 200 >= totalCount || nodes.length === 0) break;
    await sleep(300);
  }
  // 공식 홈페이지 URL은 상세 쿼리로 (실패해도 무시)
  await pmap(out, 4, async (it) => {
    try {
      const id = it.id.split(":")[1];
      const res = await fetchJSON(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://linkareer.com", referer: it.url },
        body: JSON.stringify({ query: `{ activity(id: ${id}) { id homepageURL } }` }),
      });
      const u = res?.data?.activity?.homepageURL;
      if (u && /^https?:\/\//.test(u)) it.officialUrl = u;
    } catch { /* optional */ }
    await sleep(120);
  });
  return out;
}

/* ============================================================
   SOURCE 2 — holaworld.io (REST)
   ============================================================ */
async function scrapeHola() {
  const out = [];
  for (const type of ["hackathon", "contest"]) {
    for (let page = 1; page <= 15; page++) {
      const list = await fetchJSON(`https://api.holaworld.io/api/events?page=${page}&eventType=${type}`);
      if (!Array.isArray(list) || list.length === 0) break;
      for (const e of list) {
        if (e.isDeleted || e.status !== "approved") continue;
        const text = `${e.title} ${type === "hackathon" ? "해커톤" : ""}`;
        const tags = classify(text, type === "hackathon" ? ["dev"] : []);
        if (!tags.length) continue;
        if (reject(e.title)) continue;
        out.push({
          id: `hola:${e._id}`,
          source: "hola",
          title: e.title.trim(),
          host: e.organization || null,
          url: `https://holaworld.io/hola-it/${e._id}`,
          officialUrl: e.link && /^https?:\/\//.test(e.link) ? e.link : null,
          applyStart: kstDate(e.applicationStartDate),
          applyEnd: kstDate(e.applicationEndDate),
          eventStart: kstDate(e.startDate),
          eventEnd: kstDate(e.endDate),
          postedAt: kstDate(e.createdAt),
          prize: null,
          place: e.onlineOrOffline === "on" ? "온라인" : e.place && !/장소 ?미상/.test(e.place) ? `오프라인 · ${e.place.replace(/^오프라인\s*[·(]?\s*/, "").replace(/\)$/, "")}` : "오프라인",
          target: null,
          sourceCategory: type === "hackathon" ? "해커톤" : "공모전",
          tags,
        });
      }
      if (list.length < 20) break;
      await sleep(250);
    }
  }
  return out;
}

/* ============================================================
   SOURCE 3 — wevity (HTML 목록 + 상세)
   ============================================================ */
const WEVITY_CATS = { 21: "게임/소프트웨어", 20: "웹/모바일/IT", 22: "과학/공학", 1: "기획/아이디어", 10: "영상/UCC/사진" };
const WEVITY_PAGES = 4;
async function scrapeWevity(cache) {
  const seen = new Map(); // ix → list item
  for (const [cidx, catName] of Object.entries(WEVITY_CATS)) {
    for (let gp = 1; gp <= WEVITY_PAGES; gp++) {
      const html = await fetchText(`https://www.wevity.com/?c=find&s=1&gub=1&cidx=${cidx}&gp=${gp}`);
      const lis = html.split(/<li\b/).slice(1);
      let n = 0;
      for (const li of lis) {
        const m = li.match(/href="([^"]*gbn=view[^"]*ix=(\d+))">([\s\S]*?)<\/a>/);
        if (!m) continue;
        n++;
        const ix = m[2];
        if (seen.has(ix)) continue;
        const title = strip(m[3].replace(/<span[^>]*class='stat[^>]*>[^<]*<\/span>/g, ""));
        const sub = strip((li.match(/<div class="sub-tit">([\s\S]*?)<\/div>/) || [])[1]).replace(/^분야\s*:\s*/, "");
        const organ = strip((li.match(/<div class="organ">([\s\S]*?)<\/div>/) || [])[1]);
        const stat = (li.match(/class="dday (\w+)"/) || [])[1] || "";
        const dtxt = strip((li.match(/<div class="day">([\s\S]*?)<\/div>/) || [])[1]);
        seen.set(ix, { ix, title, sub, organ, stat, dtxt, catName });
      }
      if (n < 10) break; // 마지막 페이지
      await sleep(400);
    }
  }
  const candidates = [...seen.values()].filter((it) => {
    if (it.stat === "end") return false; // 마감된 건 안 가져옴
    const tags = classify(`${it.title} ${it.sub}`);
    if (!tags.length) return false;
    if (reject(it.title)) return false;
    it.tags = tags;
    return true;
  });
  // 상세: 캐시에 있으면 재사용, 없으면 fetch
  const out = [];
  await pmap(candidates, 3, async (it) => {
    const id = `wevity:${it.ix}`;
    const url = `https://www.wevity.com/?c=find&s=1&gub=1&gbn=view&ix=${it.ix}`;
    let detail = cache.get(id)?._detail;
    if (!detail) {
      try {
        const html = await fetchText(url);
        const hidden = (name) => decode((html.match(new RegExp(`name="${name}" value="([^"]*)"`)) || [])[1] || "");
        const during = hidden("during");
        const dm = during.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
        const home = hidden("homepage");
        const target = strip((html.match(/<span class="tit">응모대상<\/span>([\s\S]*?)<\/li>/) || [])[1]);
        detail = {
          applyStart: dm ? dm[1] : null,
          applyEnd: dm ? dm[2] : null,
          prize: [hidden("money1"), hidden("money2") && `1등 ${hidden("money2")}`].filter(Boolean).join(" · ") || null,
          officialUrl: /^https?:\/\//.test(home) ? home : null,
          target: target || null,
        };
        await sleep(300);
      } catch (e) {
        detail = { applyStart: null, applyEnd: null, prize: null, officialUrl: null, target: null, _err: String(e.message) };
      }
    }
    out.push({
      id,
      source: "wevity",
      title: it.title,
      host: it.organ || null,
      url,
      officialUrl: detail.officialUrl,
      applyStart: detail.applyStart,
      applyEnd: detail.applyEnd,
      postedAt: null,
      prize: detail.prize,
      place: null,
      target: detail.target,
      sourceCategory: it.sub || it.catName,
      tags: it.tags,
      _detail: detail,
    });
  });
  return out;
}

/* ============================================================
   SOURCE 4 — Dev-Event (GitHub README)
   ============================================================ */
async function scrapeDevEvent() {
  const md = await fetchText("https://raw.githubusercontent.com/brave-people/Dev-Event/master/README.md");
  const out = [];
  // "## `26년 09월`" 섹션별로 자른다. "지난 행사 기록" 이후는 무시
  const sections = md.split(/^## /m).slice(1);
  for (const sec of sections) {
    const head = sec.split("\n")[0].replace(/`/g, "").trim();
    const ym = head.match(/(\d{2})년\s*(\d{2})월/);
    if (!ym) continue;
    const year = 2000 + +ym[1];
    const month = +ym[2];
    const re = /^- __\[(.+?)\]\((.+?)\)__\n((?:[ \t]+- .+\n?)+)/gm;
    let m;
    while ((m = re.exec(sec))) {
      const [, title, link, body] = m;
      const tagsLine = (body.match(/분류:\s*(.+)/) || [])[1] || "";
      const cats = tagsLine.split(",").map((s) => s.replace(/`/g, "").trim()).filter(Boolean);
      const host = (body.match(/주최:\s*(.+)/) || [])[1]?.trim() || null;
      const isContest = cats.includes("대회") || /해커톤|hackathon|공모전|경진대회/i.test(title);
      if (!isContest || reject(title)) continue;
      const tags = classify(`${title} ${cats.join(" ")}`, ["dev"]);
      // 접수: "09. 14(월) ~ 09. 23(수)" / 일시: "09. 23(수) 08:00 ~ 09. 25(금) 11:30"
      const parseRange = (line) => {
        if (!line) return [null, null];
        const ds = [...line.matchAll(/(\d{1,2})\.\s*(\d{1,2})/g)].map((x) => [+x[1], +x[2]]);
        if (!ds.length) return [null, null];
        const mk = (mm, dd, yy) => `${yy}-${pad2(mm)}-${pad2(dd)}`;
        const s = ds[0];
        const e = ds[1] || ds[0];
        const sy = s[0] < month - 6 ? year + 1 : year; // 12월 섹션에 1월 날짜 등
        const ey = e[0] < s[0] ? sy + 1 : sy;
        return [mk(s[0], s[1], sy), mk(e[0], e[1], ey)];
      };
      const [as, ae] = parseRange((body.match(/접수:\s*(.+)/) || [])[1]);
      const [es, ee] = parseRange((body.match(/일시:\s*(.+)/) || [])[1]);
      const place = cats.find((c) => /^오프라인|^온라인/.test(c)) || null;
      out.push({
        id: `devevent:${link}`,
        source: "devevent",
        title: title.trim(),
        host,
        url: link,
        officialUrl: link,
        applyStart: as,
        applyEnd: ae || es, // 접수 정보 없으면 행사 시작일을 데드라인으로
        eventStart: es,
        eventEnd: ee,
        postedAt: null,
        prize: null,
        place,
        target: null,
        sourceCategory: cats.filter((c) => !/^오프라인|^온라인|^무료|^유료/.test(c)).join(", ") || null,
        tags,
      });
    }
  }
  return out;
}

/* ============================================================
   SOURCE 5 — K-Startup 사업공고(모집중)
   ============================================================ */
async function scrapeKStartup() {
  const out = [];
  const seen = new Set();
  for (let page = 1; page <= 25; page++) {
    const html = await fetchText(`https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?page=${page}&pbancEndYn=N`);
    const lis = html.split(/<li\b/).slice(1).filter((s) => /go_view\(\d+\)/.test(s) && /class="tit"/.test(s));
    let n = 0;
    for (const li of lis) {
      const sn = (li.match(/go_view\((\d+)\)/) || [])[1];
      if (!sn) continue;
      n++;
      if (seen.has(sn)) continue;
      seen.add(sn);
      const title = strip((li.match(/<p class="tit">([\s\S]*?)<\/p>/) || [])[1]);
      const flags = [...li.matchAll(/<span class="flag (?:type\d+|agency)">([\s\S]*?)<\/span>/g)].map((x) => strip(x[1]));
      const lists = [...li.matchAll(/<span class="list">([\s\S]*?)<\/span>/g)].map((x) => strip(x[1]));
      const get = (label) => (lists.find((s) => s.startsWith(label)) || "").replace(label, "").trim() || null;
      const org = lists.find((s) => !/일자|조회/.test(s) && s !== lists[0]) || null;
      const text = `${title} ${flags.join(" ")} ${lists[0] || ""}`;
      // 창업 포털이라 전부 startup이긴 하지만, 공모전·대회·해커톤·데모데이 성격만 취한다
      if (!/공모|경진|대회|해커톤|챌린지|오디션|데모데이|Demo ?Day|피칭|경연|어워드|Award|아이디어|선발/i.test(title)) continue;
      const tags = classify(text, ["startup"]);
      if (reject(title)) continue;
      out.push({
        id: `kstartup:${sn}`,
        source: "kstartup",
        title,
        host: org,
        url: `https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?schM=view&pbancSn=${sn}`,
        officialUrl: null,
        applyStart: get("시작일자"),
        applyEnd: get("마감일자"),
        postedAt: get("등록일자"),
        prize: null,
        place: null,
        target: null,
        sourceCategory: flags.filter((f) => f !== "교육").join(", ") || lists[0] || null,
        tags,
      });
    }
    if (n < 20) break;
    await sleep(350);
  }
  return out;
}

/* ============================================================
   병합 · 출력
   ============================================================ */
const SOURCE_PRIORITY = ["wevity", "linkareer", "kstartup", "hola", "devevent"];
function mergeDuplicates(items) {
  const byKey = new Map();
  for (const it of items) {
    const k = titleKey(it.title);
    if (!k) continue;
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, { ...it, sources: [{ source: it.source, url: it.url }] });
      continue;
    }
    // 우선순위 높은 소스를 대표로, 빈 필드는 서로 채운다
    const a = SOURCE_PRIORITY.indexOf(prev.source);
    const b = SOURCE_PRIORITY.indexOf(it.source);
    const main = b < a ? { ...it } : { ...prev };
    const other = b < a ? prev : it;
    for (const f of ["host", "officialUrl", "applyStart", "applyEnd", "eventStart", "eventEnd", "postedAt", "prize", "place", "target", "sourceCategory"]) {
      if (main[f] == null && other[f] != null) main[f] = other[f];
    }
    main.tags = [...new Set([...(prev.tags || []), ...(it.tags || [])])];
    main.sources = [...prev.sources, { source: it.source, url: it.url }];
    main.id = main.sources.map((s) => s.source).includes(main.source) ? main.id : prev.id;
    byKey.set(k, main);
  }
  return [...byKey.values()];
}

async function main() {
  let prev = { items: [], sources: {} };
  try {
    prev = JSON.parse(await readFile(OUT, "utf8"));
  } catch { /* 첫 실행 */ }
  const prevById = new Map();
  for (const it of prev.items || []) {
    prevById.set(it.id, it);
    for (const s of it.sources || []) prevById.set(`${s.source}:${s.url}`, it);
  }
  const prevFirstSeen = new Map((prev.items || []).map((it) => [it.id, it.firstSeen]));
  // wevity 상세 캐시: 직전 항목의 _detail 을 id로 찾는다 (병합돼 대표가 바뀐 경우도 포함)
  const wevCache = new Map();
  for (const it of prev.items || []) {
    if (it._detail && it.source === "wevity") wevCache.set(it.id, it);
    for (const s of it.sources || []) if (s.source === "wevity" && s._detail) wevCache.set(`wevity:${s.url.match(/ix=(\d+)/)?.[1]}`, { _detail: s._detail });
  }

  const sources = {
    linkareer: () => scrapeLinkareer(),
    hola: () => scrapeHola(),
    wevity: () => scrapeWevity(wevCache),
    devevent: () => scrapeDevEvent(),
    kstartup: () => scrapeKStartup(),
  };
  const meta = {};
  const collected = [];
  const results = await Promise.allSettled(Object.entries(sources).map(async ([name, fn]) => [name, await fn()]));
  for (const [i, r] of results.entries()) {
    const name = Object.keys(sources)[i];
    if (r.status === "fulfilled") {
      const [, items] = r.value;
      meta[name] = { ok: true, count: items.length, fetchedAt: new Date().toISOString() };
      collected.push(...items);
      console.error(`[${name}] ${items.length} items`);
    } else {
      // 실패 → 직전 결과 유지
      const kept = (prev.items || []).filter((it) => it.source === name || (it.sources || []).some((s) => s.source === name));
      const keptOwn = kept.filter((it) => it.source === name);
      meta[name] = { ok: false, count: keptOwn.length, error: String(r.reason?.message || r.reason).slice(0, 300), fetchedAt: prev.sources?.[name]?.fetchedAt || null, stale: true };
      collected.push(...keptOwn.map((it) => ({ ...it, sources: undefined })));
      console.error(`[${name}] FAILED: ${r.reason?.message || r.reason} — keeping ${keptOwn.length} stale items`);
    }
  }

  const today = todayKST();
  let items = mergeDuplicates(collected);
  // 마감이 2일 넘게 지난 건 버린다 (마감일 미상은 유지)
  const cutoff = kstDate(Date.now() - 2 * 86400000);
  items = items.filter((it) => !it.applyEnd || it.applyEnd >= cutoff);
  for (const it of items) {
    it.firstSeen = prevFirstSeen.get(it.id) || today;
    // wevity 상세 캐시는 대표 항목에만 보존 (sources 쪽에도 남겨 병합 후에도 찾을 수 있게)
    if (it._detail) {
      const s = it.sources.find((x) => x.source === "wevity");
      if (s) s._detail = it._detail;
      delete it._detail;
    }
  }
  items.sort((a, b) => (a.applyEnd || "9999").localeCompare(b.applyEnd || "9999") || a.title.localeCompare(b.title));
  // 소스별 건수는 최종 목록 기준(병합·마감 컷 이후)으로 다시 센다
  for (const name of Object.keys(meta)) {
    meta[name].count = items.filter((it) => it.sources.some((s) => s.source === name)).length;
  }

  const data = {
    generatedAt: new Date().toISOString(),
    today,
    sources: meta,
    count: items.length,
    items,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data, null, 1) + "\n");
  console.error(`wrote ${OUT}: ${items.length} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
