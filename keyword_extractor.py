"""
keyword_extractor.py
---------------------
CU/GS25 게시글의 제목+본문에서 Kiwi 형태소 분석기로 명사 기반 연관키워드를 추출한다.
collect.py, backfill_keywords.py가 공용으로 사용하는 모듈.

분석 파이프라인:
  1. HTML 태그 / URL / "[이미지 N장]" 같은 placeholder 제거
  2. Kiwi로 형태소 분석
  3. NNG(일반명사) · NNP(고유명사) · SL(외국어/Latin) 태그만 추출
     - VV(동사) · VA(형용사)는 분석 대상에서 제외 (연관키워드는 명사 기반으로 한정)
  4. 연속된 명사 태그를 하나의 run으로 묶고, run 내부에서 원문 기준으로 공백 없이
     붙어있는 토큰들은 하나의 단어로 병합 (예: "크림"+"빵" → "크림빵").
     공백으로 떨어진 명사들은 개별 단어로 유지하되, run 전체를 복합어(phrase)로도 추출
     (예: "반값 택배 서비스").
  5. 브랜드명 변형 및 불용어 제외
     - 게시글 자신의 brand에 해당하는 변형만 제외 (예: brand=gs 게시글에서는 GS25 계열만 제외).
       상대 브랜드 언급("GS25 게시글 속 CU")은 비교/경쟁 맥락에서 정보량이 있으므로 유지.
  6. 게시글당 반복 횟수 캡 없음
     - 프론트엔드 랭킹/필터/색상은 document frequency(등장 게시글 수) 기준으로 집계하므로
       게시글 1건 내부의 반복 횟수는 집계 결과에 영향을 주지 않음. 캡을 둘 이유가 없음.
  7. 제목(title)과 본문(content) 빈도를 분리해서 저장 (title 가중치 계산용)

저장 구조 (posts.keywords jsonb):
  {
    "terms":      {"크림빵": 3, "재고": 2},   # 제목+본문 합산, 게시글 내 실제 출현 횟수
    "titleTerms": {"크림빵": 1},               # 제목에서만 집계한 빈도
    "phrases":    {"반값 택배 서비스": 2}      # 연속 명사 복합어(공백 유지) 빈도
  }
"""

import re

from kiwipiepy import Kiwi

# 분석 로직 버전 - 로직이 바뀌면 값을 올려서 재분석(backfill) 대상 판별에 사용
KEYWORD_VERSION = "kiwi-v2"

# 독립적으로 명사로 취급할 품사 태그
NOUN_TAGS = {"NNG", "NNP", "SL"}

# 뒤에 오는 명사와 결합할 때만 의미가 있는 접두사 태그 (예: "재"+"입고"→"재입고", "신"+"상품"→"신상품")
# 단독으로 남으면 대부분 1글자라 길이 필터(len>=2)로 자연히 제외됨
PREFIX_TAGS = {"XPN"}

# run(연속 구간) 구성에 포함할 태그
RUN_TAGS = NOUN_TAGS | PREFIX_TAGS

# 브랜드별 자기 브랜드 변형어 - 해당 brand 게시글에서만 제외 (상대 브랜드 언급은 유지)
BRAND_TERMS = {
    "cu": {"CU", "씨유", "포켓CU", "포켓씨유", "씨유편"},
    "gs": {"GS25", "GS", "gs25", "지에스", "지에스25", "우동지", "우리동네", "우리동네GS"},
}

# 브랜드 무관 공통 불용어 (모든 게시글에 사실상 항상 등장해 정보량이 없는 단어)
GENERIC_STOPWORDS = {"편의점"}


def _get_stopwords(brand: str) -> set:
    return BRAND_TERMS.get(brand, set()) | GENERIC_STOPWORDS


_kiwi_instance = None


def _get_kiwi() -> Kiwi:
    global _kiwi_instance
    if _kiwi_instance is None:
        _kiwi_instance = Kiwi()
    return _kiwi_instance


def _clean_text(text: str) -> str:
    """URL / HTML 태그 / 이미지 placeholder 등을 제거해 분석 노이즈를 줄인다."""
    if not text:
        return ""
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\[이미지\s*\d+장\]", " ", text)
    return text


def _merge_run(run: list) -> list:
    """
    연속 명사 run 안에서 원문상 공백 없이 붙어있는 토큰들을 하나의 단어로 병합한다.
    예: 크림(0-2) + 빵(2-3) → "크림빵" 1개 단어
        반값(11-13) + 택배(14-16) → "반값", "택배" 2개 단어 (공백 있음, 유지)
    """
    merged = []
    for tok in run:
        if merged and merged[-1]["end"] == tok.start:
            merged[-1]["form"] += tok.form
            merged[-1]["end"] = tok.end
        else:
            merged.append({"form": tok.form, "start": tok.start, "end": tok.end})
    return [m["form"] for m in merged]


def _analyze(text: str, stopwords: set):
    """
    text를 분석해 (nouns, phrases)를 반환한다.
    nouns: 스톱워드/2자 미만/숫자를 제외한 단어 리스트 (공백 없는 명사는 병합됨)
    phrases: run 내 단어가 2개 이상일 때, 공백으로 이어붙인 복합어 리스트
    """
    text = _clean_text(text)
    if not text.strip():
        return [], []

    tokens = _get_kiwi().tokenize(text)

    nouns = []
    phrases = []
    run = []

    def flush_run():
        if not run:
            return
        words = _merge_run(run)
        # 2글자 미만 파편(예: 짧은 문맥에서 오분석된 "재" 등)은 phrase 구성에서 제외
        meaningful = [w.strip() for w in words if len(w.strip()) >= 2]
        if len(meaningful) >= 2:
            phrases.append(" ".join(meaningful))
        for w in meaningful:
            if w not in stopwords and not w.isdigit():
                nouns.append(w)
        run.clear()

    for tok in tokens:
        if tok.tag in RUN_TAGS:
            run.append(tok)
        else:
            flush_run()
    flush_run()

    # 구성 단어가 전부 스톱워드인 phrase는 제외 (예: "CU GS25" 같은 무의미한 조합)
    cleaned_phrases = [
        p for p in phrases
        if not all(part in stopwords for part in p.split(" "))
    ]

    return nouns, cleaned_phrases


def extract_keywords(title: str, content: str, brand: str) -> dict:
    """
    title, content, brand(해당 게시글의 자기 브랜드 "cu"/"gs")로부터
    posts.keywords jsonb에 저장할 dict를 생성한다.
    반복 횟수 캡 없음 (모듈 상단 설명 참고).
    """
    title = title or ""
    content = content or ""
    stopwords = _get_stopwords(brand)

    title_nouns, title_phrases = _analyze(title, stopwords)
    body_nouns, body_phrases = _analyze(content, stopwords)

    terms: dict = {}
    for w in title_nouns + body_nouns:
        terms[w] = terms.get(w, 0) + 1

    title_terms: dict = {}
    for w in title_nouns:
        title_terms[w] = title_terms.get(w, 0) + 1

    phrases: dict = {}
    for p in title_phrases + body_phrases:
        phrases[p] = phrases.get(p, 0) + 1

    return {
        "terms": terms,
        "titleTerms": title_terms,
        "phrases": phrases,
    }
