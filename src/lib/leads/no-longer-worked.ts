/**
 * Has anybody stopped working this lead?
 *
 * Two different ways a lead leaves the queue, and both have to mean the
 * same thing to everything that chases people:
 *
 * - **A terminal stage.** Won or lost: the funnel is finished with them.
 * - **Dead.** The counsellor's own judgement, recorded on the
 *   temperature, which is a separate dimension from the stage
 *   (non-negotiable #1) precisely so it can say this while the stage
 *   still reads "Demo Scheduled".
 *
 * Before this, only the first counted. A lead marked Dead went on
 * breaching its SLA every night and sitting in the overdue list, so the
 * one action a counsellor takes to say "stop chasing this person"
 * produced no change at all in what the system chased them about —
 * which is how an overdue queue stops being read.
 *
 * ## The one hardcoded value in a configurable list
 *
 * Temperature values are admin-editable (CLAUDE.md), and `dead` is the
 * single one with behaviour attached. Renaming its **label** changes
 * nothing here — "Gone cold", "Not proceeding", whatever an institute
 * calls it — because this matches on the stored value, the same way the
 * stage rules match on `stage_type` rather than on the stage's name. An
 * admin who deletes the `dead` value entirely simply has no temperature
 * that stops the chasing, which is a coherent thing to want and not a
 * failure.
 */

export const DEAD_TEMPERATURE = "dead";

export function isDeadTemperature(temperature: string | null | undefined): boolean {
  return temperature === DEAD_TEMPERATURE;
}

/**
 * The whole test, for a lead that has already been loaded.
 *
 * `terminalStageIds` is passed in rather than looked up: every caller is
 * working through a batch and has the stage list in hand, and a query per
 * lead to re-answer the same question would be the most expensive thing
 * in the sweep.
 */
export function isNoLongerWorked(
  lead: { stageId: string | null; temperature: string | null },
  terminalStageIds: ReadonlySet<string>,
): boolean {
  if (isDeadTemperature(lead.temperature)) return true;
  return lead.stageId !== null && terminalStageIds.has(lead.stageId);
}
