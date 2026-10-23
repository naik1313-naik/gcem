import { suggestRootCause } from "@/lib/alarm-logic";
import { recommendDepartment } from "@/lib/console";
import type { AlarmInsert } from "@/lib/types";

/**
 * Normalizes a new alarm before it is persisted. Kept pure so creation behavior
 * can be tested without a live Supabase connection.
 */
export function prepareAlarmForInsert(input: AlarmInsert): AlarmInsert {
  const rootCause = suggestRootCause(input);
  const deptRec = recommendDepartment(input.alarm_code, input.description);

  return {
    ...input,
    suggested_root_cause: input.suggested_root_cause ?? rootCause.cause,
    source: input.source ?? "manual",
    // Department recommendation (provisional rule-based, no ML training)
    department_recommendation:
      input.department_recommendation ?? deptRec.recommended_department,
    department_confidence:
      input.department_confidence ?? deptRec.confidence,
    department_is_provisional:
      input.department_is_provisional ?? deptRec.is_provisional,
    department_review_status:
      input.department_review_status ?? "pending",
  };
}
