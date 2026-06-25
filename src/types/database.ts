export type ShiftType    = '오픈' | '미들' | '마감'
export type ChecklistTab = '오픈' | '마감'

export interface Staff {
  id: string
  name: string
  hourly_wage: number
  is_active: boolean
}

export interface Checklist {
  id: string
  tab: ChecklistTab
  section: string | null
  order: number
  title: string
  description: string | null
  is_active: boolean
  start_date: string | null
  image_url: string | null
}

export interface ChecklistLog {
  id: string
  checklist_id: string
  staff_id: string
  checked_at: string
  is_completed: boolean
}

export interface Schedule {
  id: string
  staff_id: string
  date: string
  shift_type: ShiftType | null
  note: string | null
  recorded_hours: number
}
