// ── AMC / Servicing — status derivation ────────────────────────────────────
// Pure, no Supabase import. Shared by the project detail page and the
// /servicing dashboard so they can never disagree on what a status means.

import type { AmcReminderLog, AmcServiceLog, ProjectAmcService } from './types';

export const AMC_SERVICE_TYPES = ['cleaning', 'checkup', 'repairing'] as const;
export type AmcServiceType = (typeof AMC_SERVICE_TYPES)[number];

export const AMC_SERVICE_LABELS: Record<AmcServiceType, string> = {
  cleaning: 'Panel Cleaning',
  checkup: 'Checkup',
  repairing: 'Repairing',
};

export const AMC_SERVICE_ICONS: Record<AmcServiceType, string> = {
  cleaning: '💧',
  checkup: '🩺',
  repairing: '🔧',
};

export type AmcStatusCode =
  | 'overdue' | 'due' | 'upcoming'           // recurring, in AMC
  | 'not_scheduled' | 'done_once'            // one-time, in AMC
  | 'not_in_amc' | 'reminder_sent' | 'said_yes' | 'declined'; // not in AMC yet

export interface AmcStatus {
  code: AmcStatusCode;
  label: string;
  /** YYYY-MM-DD, null when there's no recurring due date to show. */
  dueDate: string | null;
  color: string;
  /** Most recent reminder/proposal date, null when never approached. Set only when !in_amc. */
  lastContactDate: string | null;
  /** True when it's worth checking in — no reply / declined 3+ months ago, or a
   *  recurring service is 2+ months past its last visit. */
  needsReapproach: boolean;
}

const DUE_SOON_DAYS = 30;
const REAPPROACH_MONTHS = 3;
const EARLY_FOLLOWUP_MONTHS = 2;
const MS_PER_MONTH = 30.44 * 86400000;

const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr.length <= 10 ? `${dateStr}T00:00:00Z` : dateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toDateOnly(d);
}

/** Latest service_date among logs for one service type, or null if never serviced. */
export function lastServiceDate(logs: Pick<AmcServiceLog, 'service_date'>[]): string | null {
  if (!logs.length) return null;
  return logs.reduce((latest, l) => (l.service_date > latest ? l.service_date : latest), logs[0].service_date);
}

/** Latest reminder/proposal created_at among reminders for one service type, or null if never contacted. */
export function lastContactDate(reminders: Pick<AmcReminderLog, 'created_at'>[]): string | null {
  if (!reminders.length) return null;
  return reminders.reduce(
    (latest, r) => ((r.created_at || '') > latest ? r.created_at || '' : latest),
    reminders[0].created_at || ''
  ) || null;
}

const COLORS: Record<AmcStatusCode, string> = {
  overdue: '#ef4444',
  due: '#22c55e',
  upcoming: '#94a3b8',
  not_scheduled: '#f59e0b',
  done_once: '#22c55e',
  not_in_amc: '#8b5cf6',
  reminder_sent: '#f59e0b',
  said_yes: '#22c55e',
  declined: '#64748b',
};

/**
 * Precedence:
 *  1. NOT in_amc:
 *       customer_response === 'said_yes' -> 'said_yes'
 *       customer_response === 'declined' -> 'declined' (said no, or never heard back)
 *       customer_response === 'proposed' -> 'reminder_sent' (awaiting response)
 *       else ('none')                    -> 'not_in_amc'
 *     'proposed' and 'declined' both carry lastContactDate + needsReapproach —
 *     no reply counts the same as "no" for follow-up purposes.
 *  2. in_amc, one-time (is_recurring=false): no due-date math at all.
 *       never serviced -> 'not_scheduled'; serviced at least once -> 'done_once'.
 *  3. in_amc, recurring: due-date math using the service's own interval_months.
 *       Also flags needsReapproach once EARLY_FOLLOWUP_MONTHS have passed since
 *       the last visit, ahead of the formal due date, as a proactive nudge.
 */
export function computeAmcStatus(
  service: Pick<ProjectAmcService, 'in_amc' | 'customer_response' | 'created_at' | 'is_recurring' | 'interval_months'>,
  logsForType: Pick<AmcServiceLog, 'service_date'>[],
  remindersForType: Pick<AmcReminderLog, 'created_at'>[],
  today: Date = new Date()
): AmcStatus {
  if (!service.in_amc) {
    const contact = lastContactDate(remindersForType);
    const monthsSince = contact ? (today.getTime() - new Date(contact).getTime()) / MS_PER_MONTH : null;

    if (service.customer_response === 'said_yes') {
      return { code: 'said_yes', label: 'Said yes', dueDate: null, color: COLORS.said_yes, lastContactDate: contact, needsReapproach: false };
    }
    if (service.customer_response === 'declined') {
      const needsReapproach = monthsSince !== null && monthsSince >= REAPPROACH_MONTHS;
      return { code: 'declined', label: 'Said no', dueDate: null, color: COLORS.declined, lastContactDate: contact, needsReapproach };
    }
    if (service.customer_response === 'proposed') {
      const needsReapproach = monthsSince !== null && monthsSince >= REAPPROACH_MONTHS;
      return { code: 'reminder_sent', label: 'Awaiting response', dueDate: null, color: COLORS.reminder_sent, lastContactDate: contact, needsReapproach };
    }
    return { code: 'not_in_amc', label: 'Not in AMC · Propose', dueDate: null, color: COLORS.not_in_amc, lastContactDate: contact, needsReapproach: false };
  }

  const last = lastServiceDate(logsForType);

  if (!service.is_recurring) {
    if (!last) {
      return { code: 'not_scheduled', label: 'Not yet scheduled', dueDate: null, color: COLORS.not_scheduled, lastContactDate: null, needsReapproach: false };
    }
    return { code: 'done_once', label: `Done ${last}`, dueDate: null, color: COLORS.done_once, lastContactDate: null, needsReapproach: false };
  }

  const intervalMonths = service.interval_months || 3;
  const anchor = last ?? (service.created_at ? String(service.created_at).slice(0, 10) : toDateOnly(today));
  const dueDate = addMonths(anchor, intervalMonths);
  const todayStr = toDateOnly(today);
  const soonCutoff = toDateOnly(new Date(today.getTime() + DUE_SOON_DAYS * 86400000));
  const monthsSinceAnchor = (today.getTime() - new Date(`${anchor}T00:00:00Z`).getTime()) / MS_PER_MONTH;
  const needsFollowUp = monthsSinceAnchor >= EARLY_FOLLOWUP_MONTHS;

  if (dueDate < todayStr) {
    return { code: 'overdue', label: 'Overdue', dueDate, color: COLORS.overdue, lastContactDate: null, needsReapproach: true };
  }
  if (dueDate <= soonCutoff) {
    return { code: 'due', label: `Due ${dueDate}`, dueDate, color: COLORS.due, lastContactDate: null, needsReapproach: needsFollowUp };
  }
  return { code: 'upcoming', label: 'Upcoming', dueDate, color: COLORS.upcoming, lastContactDate: null, needsReapproach: needsFollowUp };
}

/** Which /servicing filter pill a status belongs to. */
export function queueBucket(code: AmcStatusCode): 'overdue' | 'due_this_month' | 'no_amc' | 'said_yes' | 'other' {
  if (code === 'overdue') return 'overdue';
  if (code === 'not_in_amc') return 'no_amc';
  if (code === 'said_yes') return 'said_yes';
  if (code === 'due') return 'due_this_month';
  return 'other';
}

export type AmcPlanLabel = 'No AMC' | 'Partial AMC' | 'Full AMC';

/** The plan is never picked manually — it's always exactly what the 3 cards say,
 *  so the header and the cards can never contradict each other. */
export function computeAmcPlan(services: Pick<ProjectAmcService, 'in_amc'>[]): { label: AmcPlanLabel; count: number } {
  const count = services.filter((s) => s.in_amc).length;
  if (count === 0) return { label: 'No AMC', count };
  if (count === AMC_SERVICE_TYPES.length) return { label: 'Full AMC', count };
  return { label: 'Partial AMC', count };
}
