import type { Staff, Checklist, ChecklistLog, Schedule } from '@/types/database'

export const mockStaffs: Staff[] = [
  { id: 'staff-1', name: '김지수', hourly_wage: 10000, is_active: true },
  { id: 'staff-2', name: '이민준', hourly_wage: 10500, is_active: true },
  { id: 'staff-3', name: '박서연', hourly_wage: 11000, is_active: true },
]

export const mockChecklists: Checklist[] = [
  // ── 오픈 체크리스트 ────────────────────────────────────
  { id: 'cl-01', tab: '오픈', order: 1, title: '에스프레소 머신 예열',   description: '오픈 30분 전 전원 켜기',             is_active: true },
  { id: 'cl-02', tab: '오픈', order: 2, title: '원두 보충',              description: '각 그라인더 원두 잔량 확인',          is_active: true },
  { id: 'cl-03', tab: '오픈', order: 3, title: '우유 스팀 온도 확인',     description: '스팀 완드 청소 후 테스트',            is_active: true },
  { id: 'cl-05', tab: '오픈', order: 4, title: '냉장고 온도 확인',        description: '2~5도 유지 여부 확인',               is_active: true },
  { id: 'cl-07', tab: '오픈', order: 5, title: '시럽·소스 보충',          description: '바닐라, 카라멜, 헤이즐넛 잔량 확인',  is_active: true },
  { id: 'cl-09', tab: '오픈', order: 6, title: '포스 시스템 켜기',        description: '영수증 용지 잔량 확인',              is_active: true },
  { id: 'cl-10', tab: '오픈', order: 7, title: '영업 전 음악 설정',       description: '볼륨 및 플레이리스트 확인',           is_active: true },
  { id: 'cl-11', tab: '오픈', order: 8, title: '간판·외부 조명 켜기',     description: '오픈 15분 전 확인',                 is_active: true },
  // ── 마감 체크리스트 ────────────────────────────────────
  { id: 'cl-04', tab: '마감', order: 1, title: '테이블 닦기',             description: '전 테이블 소독제로 닦기',            is_active: true },
  { id: 'cl-06', tab: '마감', order: 2, title: '쓰레기통 비우기',         description: '홀/주방 쓰레기통 교체',              is_active: true },
  { id: 'cl-08', tab: '마감', order: 3, title: '컵 세척 확인',            description: '식기세척기 사이클 완료 여부',         is_active: true },
  { id: 'cl-12', tab: '마감', order: 4, title: '영업 종료 후 머신 세척',  description: '백플러시 및 그룹헤드 청소',           is_active: true },
]

export const mockChecklistLogs: ChecklistLog[] = []

// 날짜별 완료 기록 (과거 조회용 mock)
export interface HistoryEntry {
  checklist_id: string
  staff_name: string
  checked_at: string  // "HH:MM"
}

export const mockHistory: Record<string, HistoryEntry[]> = {
  '2026-06-17': [
    { checklist_id: 'cl-01', staff_name: '이민준', checked_at: '08:12' },
    { checklist_id: 'cl-02', staff_name: '이민준', checked_at: '08:19' },
    { checklist_id: 'cl-03', staff_name: '박서연', checked_at: '09:04' },
    { checklist_id: 'cl-04', staff_name: '박서연', checked_at: '09:11' },
    { checklist_id: 'cl-05', staff_name: '이민준', checked_at: '08:27' },
    { checklist_id: 'cl-07', staff_name: '박서연', checked_at: '09:18' },
    { checklist_id: 'cl-09', staff_name: '이민준', checked_at: '08:33' },
    { checklist_id: 'cl-10', staff_name: '박서연', checked_at: '09:22' },
    { checklist_id: 'cl-11', staff_name: '이민준', checked_at: '08:46' },
    { checklist_id: 'cl-12', staff_name: '박서연', checked_at: '21:35' },
  ],
  '2026-06-16': [
    { checklist_id: 'cl-01', staff_name: '김지수', checked_at: '07:58' },
    { checklist_id: 'cl-02', staff_name: '김지수', checked_at: '08:05' },
    { checklist_id: 'cl-03', staff_name: '김지수', checked_at: '08:11' },
    { checklist_id: 'cl-04', staff_name: '이민준', checked_at: '09:32' },
    { checklist_id: 'cl-05', staff_name: '김지수', checked_at: '08:16' },
    { checklist_id: 'cl-06', staff_name: '이민준', checked_at: '09:37' },
    { checklist_id: 'cl-07', staff_name: '김지수', checked_at: '08:21' },
    { checklist_id: 'cl-08', staff_name: '이민준', checked_at: '21:44' },
    { checklist_id: 'cl-09', staff_name: '김지수', checked_at: '08:29' },
    { checklist_id: 'cl-11', staff_name: '김지수', checked_at: '08:41' },
    { checklist_id: 'cl-12', staff_name: '이민준', checked_at: '21:51' },
  ],
  '2026-06-15': [
    { checklist_id: 'cl-01', staff_name: '박서연', checked_at: '08:02' },
    { checklist_id: 'cl-02', staff_name: '박서연', checked_at: '08:09' },
    { checklist_id: 'cl-03', staff_name: '박서연', checked_at: '08:15' },
    { checklist_id: 'cl-04', staff_name: '박서연', checked_at: '08:20' },
    { checklist_id: 'cl-05', staff_name: '김지수', checked_at: '08:55' },
    { checklist_id: 'cl-06', staff_name: '김지수', checked_at: '09:00' },
    { checklist_id: 'cl-07', staff_name: '박서연', checked_at: '08:25' },
    { checklist_id: 'cl-09', staff_name: '박서연', checked_at: '08:31' },
    { checklist_id: 'cl-10', staff_name: '김지수', checked_at: '09:05' },
    { checklist_id: 'cl-11', staff_name: '박서연', checked_at: '08:44' },
    { checklist_id: 'cl-12', staff_name: '김지수', checked_at: '22:01' },
  ],
}

export const mockSchedules: Schedule[] = [
  // ── 1주차 6/1(월) – 6/7(일) ──────────────────────────────
  // 김지수: 4 shifts = 24h
  { id: 'w1-01', staff_id: 'staff-1', date: '2026-06-01', shift_type: '오픈',  note: '', recorded_hours: 6 },
  { id: 'w1-02', staff_id: 'staff-1', date: '2026-06-03', shift_type: '마감',  note: '', recorded_hours: 6 },
  { id: 'w1-03', staff_id: 'staff-1', date: '2026-06-05', shift_type: '미들',  note: '', recorded_hours: 6 },
  { id: 'w1-04', staff_id: 'staff-1', date: '2026-06-06', shift_type: '오픈',  note: '', recorded_hours: 6 },
  // 이민준: 4 shifts = 24h
  { id: 'w1-05', staff_id: 'staff-2', date: '2026-06-02', shift_type: '오픈',  note: '', recorded_hours: 6 },
  { id: 'w1-06', staff_id: 'staff-2', date: '2026-06-04', shift_type: '미들',  note: '', recorded_hours: 6 },
  { id: 'w1-07', staff_id: 'staff-2', date: '2026-06-05', shift_type: '오픈',  note: '', recorded_hours: 6 },
  { id: 'w1-08', staff_id: 'staff-2', date: '2026-06-07', shift_type: '마감',  note: '', recorded_hours: 6 },
  // 박서연: 4 shifts = 24h
  { id: 'w1-09', staff_id: 'staff-3', date: '2026-06-01', shift_type: '마감',  note: '', recorded_hours: 6 },
  { id: 'w1-10', staff_id: 'staff-3', date: '2026-06-03', shift_type: '오픈',  note: '', recorded_hours: 6 },
  { id: 'w1-11', staff_id: 'staff-3', date: '2026-06-06', shift_type: '마감',  note: '', recorded_hours: 6 },
  { id: 'w1-12', staff_id: 'staff-3', date: '2026-06-07', shift_type: '미들',  note: '', recorded_hours: 6 },

  // ── 2주차 6/8(월) – 6/14(일) ─────────────────────────────
  // 김지수: 4 shifts = 24h
  { id: 'w2-01', staff_id: 'staff-1', date: '2026-06-08', shift_type: '오픈',  note: '', recorded_hours: 6 },
  { id: 'w2-02', staff_id: 'staff-1', date: '2026-06-10', shift_type: '마감',  note: '', recorded_hours: 6 },
  { id: 'w2-03', staff_id: 'staff-1', date: '2026-06-12', shift_type: '오픈',  note: '', recorded_hours: 6 },
  { id: 'w2-04', staff_id: 'staff-1', date: '2026-06-13', shift_type: '미들',  note: '', recorded_hours: 6 },
  // 이민준: 4 shifts = 24h
  { id: 'w2-05', staff_id: 'staff-2', date: '2026-06-09', shift_type: '마감',  note: '', recorded_hours: 6 },
  { id: 'w2-06', staff_id: 'staff-2', date: '2026-06-10', shift_type: '미들',  note: '', recorded_hours: 6 },
  { id: 'w2-07', staff_id: 'staff-2', date: '2026-06-12', shift_type: '마감',  note: '', recorded_hours: 6 },
  { id: 'w2-08', staff_id: 'staff-2', date: '2026-06-14', shift_type: '오픈',  note: '인수인계', recorded_hours: 6 },
  // 박서연: 4 shifts = 24h
  { id: 'w2-09', staff_id: 'staff-3', date: '2026-06-08', shift_type: '마감',  note: '', recorded_hours: 6 },
  { id: 'w2-10', staff_id: 'staff-3', date: '2026-06-10', shift_type: '오픈',  note: '', recorded_hours: 6 },
  { id: 'w2-11', staff_id: 'staff-3', date: '2026-06-11', shift_type: '미들',  note: '', recorded_hours: 6 },
  { id: 'w2-12', staff_id: 'staff-3', date: '2026-06-14', shift_type: '마감',  note: '', recorded_hours: 6 },

  // ── 3주차 6/15(월) – 6/21(일) ────────────────────────────
  // 월 6/15
  { id: 'sch-01', staff_id: 'staff-1', date: '2026-06-15', shift_type: '오픈',  note: '',            recorded_hours: 8 },
  { id: 'sch-02', staff_id: 'staff-3', date: '2026-06-15', shift_type: '마감',  note: '',            recorded_hours: 8 },
  // 화 6/16
  { id: 'sch-03', staff_id: 'staff-2', date: '2026-06-16', shift_type: '오픈',  note: '',            recorded_hours: 8 },
  { id: 'sch-04', staff_id: 'staff-1', date: '2026-06-16', shift_type: '미들',  note: '',            recorded_hours: 6 },
  { id: 'sch-05', staff_id: 'staff-3', date: '2026-06-16', shift_type: '마감',  note: '',            recorded_hours: 8 },
  // 수 6/17
  { id: 'sch-06', staff_id: 'staff-1', date: '2026-06-17', shift_type: '오픈',  note: '',            recorded_hours: 8 },
  { id: 'sch-07', staff_id: 'staff-2', date: '2026-06-17', shift_type: '마감',  note: '인수인계 필요', recorded_hours: 8 },
  // 목 6/18 (오늘)
  { id: 'sch-08', staff_id: 'staff-1', date: '2026-06-18', shift_type: '오픈',  note: '',            recorded_hours: 8 },
  { id: 'sch-09', staff_id: 'staff-2', date: '2026-06-18', shift_type: '마감',  note: '',            recorded_hours: 8 },
  { id: 'sch-10', staff_id: 'staff-3', date: '2026-06-18', shift_type: '미들',  note: '조기 퇴근',   recorded_hours: 6 },
  // 금 6/19
  { id: 'sch-11', staff_id: 'staff-1', date: '2026-06-19', shift_type: '미들',  note: '',            recorded_hours: 7 },
  { id: 'sch-12', staff_id: 'staff-2', date: '2026-06-19', shift_type: '오픈',  note: '',            recorded_hours: 8 },
  // 토 6/20
  { id: 'sch-13', staff_id: 'staff-3', date: '2026-06-20', shift_type: '오픈',  note: '',            recorded_hours: 8 },
  { id: 'sch-14', staff_id: 'staff-1', date: '2026-06-20', shift_type: '마감',  note: '',            recorded_hours: 8 },
  // 일 6/21
  { id: 'sch-15', staff_id: 'staff-2', date: '2026-06-21', shift_type: '미들',  note: '',            recorded_hours: 6 },
  { id: 'sch-16', staff_id: 'staff-3', date: '2026-06-21', shift_type: '마감',  note: '',            recorded_hours: 8 },
]
