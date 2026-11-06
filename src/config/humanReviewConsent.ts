/**
 * The consent copy shown before a participant sees any scene.
 *
 * One version, one list. `CONSENT_VERSION` is stored on the session so a run
 * can name which consent text the participant accepted; the full text is not
 * stored, and neither is a name, signature or contact detail.
 */
export const CONSENT_VERSION = 'v1'

export interface ConsentPoint {
  title: string
  body: string
}

export const CONSENT_POINTS: ConsentPoint[] = [
  {
    title: 'Purpose',
    body: 'Your answers help compare human scene judgments with the automated critic, so the quality checks can be evaluated honestly.'
  },
  {
    title: 'What you do',
    body: 'Read 12 scenes one at a time and answer Keep or Revise, plus Problem, Fine or Unsure for five dimensions. Unsure is a valid answer.'
  },
  {
    title: 'What is recorded',
    body: 'Your anonymous rater ID, the pass label, your answers, optional notes, timestamps, and the study pack id and hash.'
  },
  {
    title: 'What is not recorded',
    body: 'Your name, email or account. You will not see critic, score or gate output, and no other participant sees your answers.'
  },
  {
    title: 'It stays on this device',
    body: 'Answers are stored only in this browser. They are not synced and are never sent to a cloud provider.'
  },
  {
    title: 'Export',
    body: 'The facilitator can export a JSON file with your answers and your anonymous rater ID. It cannot identify you beyond that code.'
  },
  {
    title: 'Withdrawal and deletion',
    body: 'You can stop at any time. Delete this session from the Sessions list to remove your answers from this device. Ask the facilitator to delete any exported copy.'
  },
  {
    title: 'Notes',
    body: 'Do not put personal information in the notes; they are exported with the session.'
  }
]

export const CONSENT_CHECKBOX_LABEL =
  'I have read this and consent to taking part. I know I can stop or delete this session at any time.'
