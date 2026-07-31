# 연설문 섹션 리뷰 — 이월된 마이너 (2026-07-31)

리뷰 판정: 전부 비차단. 다음 폴리시 패스 때 일괄 처리 후보.

- ko 과소특정 4건: farewell-028 (a deep debt of gratitude → 감사 누락), farewell-026 (Take the challenge → 예시 제시로 큐잉), farewell-012 (help us 누락), farewell-035 (about this country 누락)
- 컨텍스트에 원문 말더듬 노출: dnc-016 ("Now -- Now let me be clear."), watson-013 ("that that")
- 태그 핏: dnc-016 지시?, queen-001 조언? (감사/위로→스몰토크/조언 매핑은 공개된 관례)
- queen-006 note: as strong as any는 비교급이 아니라 원급 비교 (뜻풀이는 맞음)
- data.test.js 드라마 script 하한이 500→8로 완화됨 (플로어만 보호)
- Because 문두 조각 2건 (farewell-012, -017) — 연설 관용으로 용인, 의식적 결정 필요
- "It falls to each of us to…" 미채택 (원문 전사 중복 "those those" 때문) — raw 토큰 1건 수정으로 복구 가능, 판단 보류
- 큐레이션 생성 스크립트 미커밋 — JSON 수편집만 가능

# 변형 콘텐츠 리뷰 — 이월 마이너 (2026-07-31)
- core가 변형에서 실제로 드릴되지 않는 청크 포함 8건 (s01e01-019 give you a shot, s01e02-024/-052/-056, s01e01-039 dangling them, dnc-021, queen-003 assuring, s01e01-042 v2 이미지 소실)
- 근접 재서술 5건 추가 발견 (farewell-033 v1, watson-016 v2, watson-021 v2 인용구, queen-013 v1, farewell-031 v1)
- 영어 폴리시: dnc-024 "the overloaded" 신조어투, farewell-016 v2 work/work 에코, farewell-026 v1 particle+prep 어색
- 테스트 미고정: core substring 화이트리스트, 단어수 범위, 문장 간 변형 중복, verbatim+tail 패턴
- 관찰: 일부 core가 상급자에게 trivial (My apologies 등) — 기저 큐레이션 유래, 난이도 재큐레이션(Task 24)에서 함께 다룰 것

# 변형 UI 코드 리뷰 — 이월 마이너 (2026-08-01)
- build_audio.py 고아 정리가 디렉터리 무관(잘못된 폴더의 파일 생존 가능) — 1줄 강화 후보
- drill.js onSpeechStart의 #countdown null 가드 부재(홈 화면에서 잔류 인식 중 발화 시 throw) — main부터 존재
- 잔류 SpeechRecognition과 신규 세션 겹침 시 새 rec.start() throw → recFails 오증가 가능 — rec.abort() on generation mismatch 후보
- learn 카드 1·2단계에 note 중복 표시
- speech.js onended의 finish()가 가드 밖 무조건 호출 (pause된 스테일은 onended 미발화라 실위험 낮음, 동일 형상 버그 — 차기 라운드 후보)
- contextBefore 큐 + hideCueText 조합에서 영어 텍스트를 ko-KR 음성으로 읽음 (인지된 한계)
