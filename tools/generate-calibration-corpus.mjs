/**
 * Calibration corpus generator (Stage 1 of DESIGN-drift-calibration-2026-09-12).
 *
 * Generates clean continuation volumes of the Greyhook Rock story (pilot ch1+ch2
 * backstory) with the app's own critic evals, or one degraded-prompt volume.
 * Each scene = 1 writer call (temp 0.8) + 1 critic call (temp 0.3).
 *
 * Usage:
 *   npx vite-node tools/generate-calibration-corpus.mjs --dir reports/calib-<stamp> --volume 1
 *   npx vite-node tools/generate-calibration-corpus.mjs --dir <same> --volume 4 --degraded
 *   Flags: --model qwen3:8b --words 400 --chapters 3 --scenes 3 --chapter 2 (single chapter, for resume)
 *
 * Output per volume: <dir>/volume-N.json (prose + critic scores) and appended
 * eval records in <dir>/eval-history.json using the drift monitor schema with
 * controlled sequential timestamps (one scene per hour from dir state).
 * reports/ is gitignored.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { callAI, buildPrompt } from './libs/criticSnapshot.mjs'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const DIR = arg('--dir')
if (!DIR) {
  console.error('Missing required --dir reports/calib-<stamp>')
  process.exit(1)
}
const VOLUME = Number(arg('--volume', '1'))
const DEGRADED = process.argv.includes('--degraded')
const MODEL = arg('--model') || process.env.SAMPLE_MODEL || 'qwen3:8b'
const TARGET_WORDS = Number(arg('--words', '400'))
const CHAPTER_COUNT = Number(arg('--chapters', '3'))
const SCENES_PER_CHAPTER = Number(arg('--scenes', '3'))
const ONLY_CHAPTER = arg('--chapter') ? Number(arg('--chapter')) : null
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'

const CLEAN_SYSTEM =
  'You are a literary fiction writer. Write in close third person, present or past tense, concrete sensory detail. No headings, no preamble, no notes — prose only.'
// Degraded variant: a realistic prompt regression — someone "simplified" the
// system prompt and dropped every craft constraint. Recorded, not hidden.
const DEGRADED_SYSTEM = 'You are a fiction writer. Write the scene as prose.'
const SYSTEM_PROMPT = DEGRADED ? DEGRADED_SYSTEM : CLEAN_SYSTEM
const PROMPT_VARIANT = DEGRADED ? 'degraded' : 'clean'

const STORY_BIBLE = `## Mara Voss — lighthouse keeper, 58. Twenty years alone on Greyhook Rock since her husband drowned. Speaks little, keeps the log in pencil. Failing eyesight she hides from the mainland inspector.
## June Voss — daughter, 31. Left at nineteen after the funeral. Marine engineer in Bergen. Stayed the winter; keeps the watch now, pencil in her pocket.
## Elias Voss — dead thirty years. Kept the light one winter; mended a chair; carved E.V. in a beam. Mara named him to June at the storm watch.`

// Seed: everything the pilot established (ch1 autumn storm + ch2 solstice),
// compressed the way the pipeline's digest/ledger carry would hold it.
const VOLUME_SEED = `Previously on Greyhook Rock: June Voss returned after twelve years and stayed the winter. They weathered an autumn storm together and found the logbook carries two handwritings; Mara named the other writer Elias, dead thirty years, who kept the light one winter. June took over stores inventory; the pencil moved to her pocket. At solstice, feverish Mara slept while June kept the gale watch alone and logged the hour in her own hand. Key facts: Mara 58, failing eyesight, hides it; June 31, marine engineer; Elias Voss, mended chair, initials E.V.`

// Volume 1: deep winter into first thaw. Later volumes get their briefs at
// their gates — continuations must follow what actually got generated.
const VOLUMES = {
  1: {
    title: 'Wintering',
    chapters: [
      {
        title: 'Deep Winter',
        scenes: [
          {
            title: 'Rationing',
            emotionalGoal: 'care expressed as arithmetic',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'stores, January cold',
            payoff: 'June reworks the stores math to stretch the flour; Mara accepts the correction without comment',
            tension: 'stores running thinner than Mara admitted; pride against hunger',
            brief: 'Deep January. June audits the stores and finds the flour will not last to the spring boat. She reworks the ration quietly, the way she would a fuel budget. Mara watches, corrects one figure from memory, and lets the new numbers stand.'
          },
          {
            title: 'The Lamp Mechanism',
            emotionalGoal: 'competence earning trust',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'lamp room, maintenance day',
            payoff: 'June strips and rebuilds the rotation mechanism; the light runs smoother than it has in years',
            tension: 'Mara hovering, unable to help, forced to watch her daughter handle the light',
            brief: 'The rotation mechanism starts grinding. June takes it apart on the lamp-room floor with engine-room method while Mara hovers, handing tools she is asked for and none she is not. The light turns silent and true. Mara logs it in one line.'
          },
          {
            title: 'Misread Line',
            emotionalGoal: 'fear held underwater',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'keeper’s cottage, evening',
            payoff: 'Mara misreads a log line aloud; June hears it, understands, and deliberately lets it pass',
            tension: 'the eyesight failing past hiding; June deciding not to force the reckoning yet',
            brief: 'Over supper Mara reads back the day’s log entry wrong — a small error, unmistakable. June hears it. She corrects the entry later in her own hand without a word. Both know. Neither says.'
          }
        ]
      },
      {
        title: 'The Inspector',
        scenes: [
          {
            title: 'Winter Boat',
            emotionalGoal: 'dread arriving on schedule',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'landing, grey February morning',
            payoff: 'a fishing boat lands the mainland inspector, three months early, unsurprised to find June there',
            tension: 'no time to prepare; the cottage and log exactly as they are',
            brief: 'A fishing boat makes the landing in weather no scheduled boat would attempt, and puts ashore the mainland inspector with his case and his forms. He is three months early. He already knows June is on the rock.'
          },
          {
            title: 'Inspection',
            emotionalGoal: 'alliance under pressure',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'lamp room and cottage, inspection day',
            payoff: 'June shadows every close-vision task; the lamp, the log, the stores all pass',
            tension: 'the inspector’s eyes everywhere; one dropped form, one fine-print line, and it is over',
            brief: 'The inspection: lamp mechanism (June’s rebuild draws a nod), stores (June’s ration figures hold), the log. June positions herself at every reading task — offering, never blocking. Mara’s hands stay steady. Everything passes.'
          },
          {
            title: 'The Old Entry',
            emotionalGoal: 'the past almost surfacing',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage, inspector’s last evening',
            payoff: 'the inspector notices the Elias handwriting in an old log and asks; Mara answers with weather',
            tension: 'an official question about the dead man in the books',
            brief: 'Leafing the archived logs, the inspector finds the Elias entries and asks who kept the light that winter. Mara answers with the weather that winter, the stores landed, the lamp hours — everything around the man, nothing of him. He writes something down. He leaves satisfied.'
          }
        ]
      },
      {
        title: 'First Thaw',
        scenes: [
          {
            title: 'Breakup',
            emotionalGoal: 'relief arriving sideways',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'landing and shore, March',
            payoff: 'the ice goes out overnight; the sound wakes them both and neither admits to crying',
            tension: 'winter ending means the spring boat, the world, decisions',
            brief: 'The shore ice goes out in the night with a sound like the rock clearing its throat. They stand at the window in the dark listening. Morning shows open water to the horizon. Neither mentions the tears.'
          },
          {
            title: 'Elias’s Box',
            emotionalGoal: 'grief given an object',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'boathouse, thaw afternoon',
            payoff: 'behind the spare lens crate: a box of Elias’s things, kept thirty years, never opened by June until now',
            tension: 'whether Mara will stop her; whether some doors stay shut',
            brief: 'Shifting winter stores in the boathouse, June finds a box behind the spare lens crate — oilskin coat, a pipe, letters never sent, a photograph of a young keeper at this lamp. Mara stands in the doorway. She does not stop her. She comes inside.'
          },
          {
            title: 'The Whole Story',
            emotionalGoal: 'inheritance completed',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage, thaw evening',
            payoff: 'Mara tells the whole Elias winter start to finish; June writes it in the log in her own hand',
            tension: 'thirty years of silence against one evening of telling',
            brief: 'That evening Mara tells it whole: the winter Elias kept the light, the storm that took him in March, why his name stayed out of the official log. June listens without questions. Then she takes the log and writes it down — the first entry that is fully hers. The pencil is warm.'
          }
        ]
      }
    ]
  },
  // G0 gate: V1 landed as generated (not as planned) — ice out overnight to
  // open water; Elias’s box carried to the cottage table unopened; Mara’s
  // whole telling logged by June as “Elias Voss, winter 1989–1991. The light
  // was his. The storm took him. The logbook remembers.”; inspector gone
  // satisfied after writing something down; Mara’s left-eye failure still
  // unspoken. V2 continues that morning-after state; V3 assumes V2’s
  // reckoning (June stays the summer) and is re-gated once V2 lands.
  2: {
    title: 'Spring Boat',
    chapters: [
      {
        title: 'Mail Boat',
        scenes: [
          {
            title: 'Open Water',
            emotionalGoal: 'anticipation edged with dread',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage window and landing, March morning',
            payoff: 'smoke on the horizon: the spring boat is coming; June lays out the log while Mara puts Elias’s box on the high shelf',
            tension: 'the telling is written down now and the world is about to read everything else',
            brief: 'Morning after the telling. Open water to the horizon. They spot the spring boat’s smoke. June checks the log, the stores slate, the lamp. Mara lifts Elias’s box onto the high shelf, out of casual sight, without being asked why.'
          },
          {
            title: 'Landing',
            emotionalGoal: 'the world arriving all at once',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'landing, spring boat day',
            payoff: 'mail, stores, and the inspector’s written assessment: passed; plus a Bergen letter asking when June returns',
            tension: 'plenty and paperwork; every crate witnessed, every answer easy except the one about June',
            brief: 'The spring boat lands: crates, mail sack, manifest in fine print. The inspector’s assessment letter confirms the station passed. A second letter, from Bergen, asks June for her return date for the summer rotation. She folds it into her pocket unread past the first line.'
          },
          {
            title: 'Forms',
            emotionalGoal: 'alliance made official',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage, boat evening',
            payoff: 'June fills the landing forms in her own hand; Mara dictates figures from memory and they match',
            tension: 'whose hand the mainland now expects to see',
            brief: 'Evening paperwork after the boat leaves. June takes the manifest and landing forms and fills them in her own hand for the first time. Mara dictates the stores figures from memory without looking. The numbers match June’s exactly.'
          }
        ]
      },
      {
        title: 'Letters',
        scenes: [
          {
            title: 'Oilskin',
            emotionalGoal: 'grief given weight and smell',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage, grey afternoon',
            payoff: 'they lift the box down together and lay out the coat, the pipe, the photograph, one by one',
            tension: 'handling things versus reading them',
            brief: 'A grey afternoon with no boat and no chores that cannot wait. They lift Elias’s box down together. June lays out the oilskin coat, stiff with age, the tarnished pipe, the curled photograph of the young keeper at this lamp. Mara touches each once and names what it is.'
          },
          {
            title: 'Unsent',
            emotionalGoal: 'love held unsaid',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage, lamp light',
            payoff: 'June reads one unsent letter aloud; it ends mid-sentence and Mara finishes the sentence from thirty years of memory',
            tension: 'whether the letters were ever meant to be read',
            brief: 'By lamplight June opens the packet of unsent letters — looping, unfinished, one reading “The light is not enough, but it is all I have.” She reads one aloud. It stops mid-sentence. After a long quiet Mara speaks the ending she has carried thirty years.'
          },
          {
            title: 'Photograph',
            emotionalGoal: 'the past given a face',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage, night',
            payoff: 'Mara names the day the photograph was taken; June slips it inside the log’s back cover',
            tension: 'keeping him in the book without putting him in the official record',
            brief: 'Late night. Mara tells when the photograph was taken — the week before the March storm, Elias grinning because the lamp ran true. June listens, asks nothing she has not earned. She slips the photograph inside the log’s back cover, where it will ride under her hand every day.'
          }
        ]
      },
      {
        title: 'Reckoning',
        scenes: [
          {
            title: 'Fine Print',
            emotionalGoal: 'the last time it can pass unspoken',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage table, morning',
            payoff: 'Mara cannot read the manifest fine print; June covers it smoothly in front of the boatman and both know this is the last time',
            tension: 'a kindness that has become a risk',
            brief: 'The boatman returns for a signature and points at a fine-print line. Mara’s eyes find everything around it. June steps in with the ease of long practice, reads it aloud as if checking her own work, signs beneath. At the door the boatman gone, neither pretends any more.'
          },
          {
            title: 'Asking',
            emotionalGoal: 'pride laid down',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'lamp room, dusk',
            payoff: 'Mara asks plainly: stay the summer, keep the watch with me, eyes and hands together',
            tension: 'thirty years of not asking against one dusk of needing to',
            brief: 'Dusk in the lamp room, the light turning true overhead — June’s rebuild still holding. Mara stands where she once hovered and asks without weather or stores around it: stay the summer, keep the watch together, her memory and June’s eyes. June does not answer at once.'
          },
          {
            title: 'Entry',
            emotionalGoal: 'inheritance accepted',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage, night',
            payoff: 'June writes the decision in the log in her own hand — the second entry that is fully hers',
            tension: 'Bergen unanswered against the rock chosen',
            brief: 'Night. June takes the Bergen letter from her pocket, sets it aside unanswered, opens the log past her Elias entry, and writes the summer down: that she stays, that the watch is shared, eyes and hands. Mara watches the pencil move and does not correct a word.'
          }
        ]
      }
    ]
  },
  // V3 provisional: assumes V2’s reckoning (June stays the summer). Re-gate
  // after V2 lands — if V2 swerves, rewrite these briefs to follow it.
  3: {
    title: 'Summer Keeping',
    chapters: [
      {
        title: 'New Watch',
        scenes: [
          {
            title: 'Division',
            emotionalGoal: 'competence shared without comment',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'lamp room and stores, June morning',
            payoff: 'the new division holds a full day: Mara’s memory and ear, June’s eyes and hands, no seams showing',
            tension: 'a routine that has never been spoken aloud has to survive daylight',
            brief: 'First full day of the stated arrangement. Mara takes sound, smell, weather memory, and the log’s history; June takes close reading, heights, and the mechanism. They work the lamp, the stores, the log end to end. Nothing is explained. Everything holds.'
          },
          {
            title: 'Mended Chair',
            emotionalGoal: 'the dead man’s place at the table',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage, evening',
            payoff: 'June tightens the mended chair’s iron bands the way Elias would have; Mara sits in it for supper for the first time in years',
            tension: 'use versus shrine',
            brief: 'The mended chair creaks worse in summer damp. June takes it apart with engine-room method, cleans the joints, tightens Elias’s iron bands, sets it true. At supper Mara hesitates, then sits in it — E.V. under her hand — and eats there without a word.'
          },
          {
            title: 'Summer Log',
            emotionalGoal: 'a hand becoming a keeper’s',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage, night',
            payoff: 'June’s nightly entries run a full week in her own steady hand; Mara reads one back correctly by lamplight, slowly, and nods',
            tension: 'whether the log can hold two keepers at once',
            brief: 'A week of June’s nightly entries, steady and plain, lamp hours and weather and stores in her own hand. Mara reads one back aloud by lamplight — slowly, but every word right — and sets the pencil down aligned with the book’s spine. Approval, in her language.'
          }
        ]
      },
      {
        title: 'Summer Boat',
        scenes: [
          {
            title: 'Visitors',
            emotionalGoal: 'a story that holds under eyes',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'landing and lamp room, July',
            payoff: 'the summer boat’s crew and a mainland clerk see exactly what they expect: a kept light and a kept log',
            tension: 'the first test of the shared watch before witnesses',
            brief: 'The July boat lands a clerk with summer forms and curious crew. June handles every reading task openly now — offering, never blocking, the way she once did under pressure. Mara answers the clerk’s questions with weather, stores, lamp hours, steady hands. Everything passes in daylight.'
          },
          {
            title: 'Bergen Answer',
            emotionalGoal: 'a life declined kindly',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage, boat evening',
            payoff: 'June writes the Bergen answer: not this summer, the watch is here; Mara does not watch her write it',
            tension: 'what is given up to stay, named for the first time',
            brief: 'After the boat, June takes out the spring Bergen letter and writes the answer she set aside: not this summer, the watch here needs both keepers, terms plain and grateful. Mara mends a cuff across the room and does not look over once. Trust, both directions.'
          },
          {
            title: 'Glass',
            emotionalGoal: 'the failing eye named aloud',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'lamp room, bright noon',
            payoff: 'at noon glare Mara names it: the left eye gone, the right narrowing; June adjusts the watch bill accordingly, no comfort offered or needed',
            tension: 'saying it changes nothing and everything',
            brief: 'Bright noon in the lamp room, the worst light for Mara. She stands at the lens and names it plainly for the first time: left eye gone, right narrowing, distances first, then print. June listens, asks two practical questions, re-divides the high work on the spot. No comfort. Something better.'
          }
        ]
      },
      {
        title: 'Light Continued',
        scenes: [
          {
            title: 'Gale',
            emotionalGoal: 'inheritance tested',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'lamp room and cottage, August gale night',
            payoff: 'a summer gale tests June’s rebuild; they keep the gale watch turn and turn about and the light never falters',
            tension: 'the first bad weather that is fully theirs',
            brief: 'An August gale, sudden and white. The mechanism June rebuilt takes the strain and holds. They keep the gale watch turn and turn about through the night — Mara by ear and memory, June by eye and hand — logging each hour. The light never falters.'
          },
          {
            title: 'Names',
            emotionalGoal: 'the log telling the truth at last',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage, gale morning',
            payoff: 'June copies the Elias winter into the fair log with his full name; Mara countersigns beneath in her own hand',
            tension: 'official record against true record, reconciled',
            brief: 'Gale morning, quiet. June takes the fair log and copies the Elias winter clean — name, season, the light he kept, the storm that took him — no hiding. Mara takes the pencil, and beneath June’s entry, countersigns in her own large hand. Two hands. One book.'
          },
          {
            title: 'Keeping',
            emotionalGoal: 'continuity without ending',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'landing and lamp room, late August',
            payoff: 'late summer evening, the light turning true over open water; the pencil rests with whoever is nearest',
            tension: 'none left but weather — and weather is the work',
            brief: 'Late August. Open water, the light turning true at dusk over it. Stores full, mechanism silent, log current in two hands. They walk up to the lamp room together for the evening watch. The pencil sits in no one’s pocket — on the log, where either can reach it.'
          }
        ]
      }
    ]
  },
  // G1 gate: V3 landed late August — light true, stores full, log current in
  // two hands, pencil shared, Mara’s right eye narrowing, photograph in the
  // log’s back cover. V4 continues into autumn with the SAME brief quality as
  // V2/V3; the degradation comes ONLY from --degraded (weakened system
  // prompt, D15). Run: --volume 4 --degraded. Expect the critic to score it
  // lower and the monitor recent-window to fire at act-tier (Stage 2 R1).
  4: {
    title: 'Autumn Watch',
    chapters: [
      {
        title: 'Equinox',
        scenes: [
          {
            title: 'Longer Nights',
            emotionalGoal: 'light becoming work again',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'lamp room, September dusk',
            payoff: 'the lamp burns longer each night; June trims the wick while Mara times the rotation by ear',
            tension: 'summer ease ending one minute of daylight at a time',
            brief: 'September. Dusk comes earlier every evening and the lamp hours stretch. June trims and fills with the old engine-room economy while Mara sits below, timing the rotation by ear the way she did before June’s rebuild, checking it still holds.'
          },
          {
            title: 'First Gale',
            emotionalGoal: 'trust tested by weather, not people',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'lamp room and cottage, September gale',
            payoff: 'the first autumn gale batters the rock; the shared watch holds through it without a missed hour',
            tension: 'the August gale was summer; this one has teeth',
            brief: 'The first real autumn gale, rain horizontal at the lamp-room glass. They keep the watch turn and turn about as in August, but the cold is different now, and the stairs are slick. Every hour logged. The light never falters, but both feel the season turn.'
          },
          {
            title: 'Stores Against Winter',
            emotionalGoal: 'care expressed as arithmetic, again',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'stores, late September',
            payoff: 'June audits the stores against a full winter for two keepers; the math holds with margin this time',
            tension: 'last January’s thin flour against this year’s full shelves',
            brief: 'Late September audit, the way June did it alone in January. Flour, salt, oil, wicks — a full winter for two keepers, figures checked twice. Mara corrects nothing this time; she carries the tally to the cottage herself and reads it back, slowly, every word right.'
          }
        ]
      },
      {
        title: 'Autumn Boat',
        scenes: [
          {
            title: 'October Landing',
            emotionalGoal: 'the world checking in',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'landing, grey October morning',
            payoff: 'the autumn boat lands winter stores and autumn forms; the clerk finds the summer log exemplary',
            tension: 'paperwork judging three months of unwitnessed keeping',
            brief: 'The October boat in grey weather: winter crates, mail, autumn assessment forms. The clerk goes through June’s summer log page by page — lamp hours, stores, weather, two hands countersigned — and nods further down each page. Mara answers the questions she is asked, no more.'
          },
          {
            title: 'Bergen Winter',
            emotionalGoal: 'a choice renewed, not repeated',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage, boat evening',
            payoff: 'a winter-rotation letter from Bergen; June answers it the same evening, by lamplight, without setting it aside',
            tension: 'summer’s answer was easy in summer light',
            brief: 'With the boat comes a Bergen winter-rotation offer, better terms, a date to answer by. June reads it once at the table, takes the log’s pencil, and writes the refusal that evening — the watch here, through winter, plain and grateful. Mara watches the whole letter and says nothing until it is sealed.'
          },
          {
            title: 'The Clerk’s Question',
            emotionalGoal: 'the past asked about directly',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage, clerk’s last evening',
            payoff: 'the clerk asks about the countersigned Elias entry; June answers with the full winter, Mara beside her',
            tension: 'an official question with the true answer already in the book',
            brief: 'Leafing the fair log, the clerk finds the Elias winter in June’s hand, countersigned by Mara, and asks what it is. June tells it plainly — the winter he kept the light, the March storm, thirty years out of the record, now in. The clerk writes it down without surprise and closes the book.'
          }
        ]
      },
      {
        title: 'Darkening',
        scenes: [
          {
            title: 'Narrowing',
            emotionalGoal: 'loss arriving on schedule',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage, November dusk',
            payoff: 'Mara admits the right eye has narrowed past reading print; June re-divides the close work for winter without discussion',
            tension: 'what was named at noon in July must be lived in November dark',
            brief: 'November dusk, lamplight only. Mara sets down the log after two lines and says it: the right eye has narrowed past print, distances gone soft at the edges. June takes the book, re-divides the winter close work aloud — readings, fine print, heights hers; sound, weather, memory Mara’s — and it is done before supper.'
          },
          {
            title: 'Night Watch',
            emotionalGoal: 'solitude shared across hours',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'lamp room, November night',
            payoff: 'the first full winter-schedule night: June takes the dark hours alone and logs them steady; Mara relieves her at dawn',
            tension: 'keeping alone together for the first time',
            brief: 'First night of the winter schedule. June takes the dark hours alone in the lamp room, the beam turning true over black water, logging each hour in her steady hand. At dawn Mara climbs the stairs by memory and touch, tea in hand, and takes the morning. Neither slept well. Both are glad.'
          },
          {
            title: 'Pencil',
            emotionalGoal: 'inheritance carried, not completed',
            charactersPresent: ['Mara Voss', 'June Voss'],
            location: 'cottage, November evening',
            payoff: 'June sharpens the pencil and sets it on the log; Mara leaves it in June’s pocket now, as a matter of course',
            tension: 'none left but winter — and winter is the work',
            brief: 'November evening, stores full, lamp true, log current. June sharpens the keeper’s pencil down to a clean point and sets it on the closed log. Mara picks it up, presses it into June’s hand, and closes her fingers over it. Not a ceremony. A fact. The pocket it goes into is June’s.'
          }
        ]
      }
    ]
  }
}

async function writeSceneOnce(scene, priorContext) {
  // Streaming: headers arrive immediately and tokens concatenate, so a
  // multi-minute generation can never trip the HTTP headers timeout the way
  // a buffered stream:false call does at ~280s+ per scene.
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      options: { temperature: 0.8, num_ctx: 8192 },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPromptFor(scene, priorContext) }
      ]
    })
  })
  if (!res.ok) throw new Error(`Ollama chat failed: ${res.status} ${await res.text()}`)
  let prose = ''
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      const t = line.trim()
      if (!t) continue
      try {
        prose += JSON.parse(t).message?.content || ''
      } catch {
        // keep-alive whitespace / partial chunk — next read completes it
      }
    }
  }
  return prose.trim()
}

function userPromptFor(scene, priorContext) {
  return `Write a complete short scene of about ${TARGET_WORDS} words.

${priorContext}

TITLE: ${scene.title}
LOCATION: ${scene.location}
CHARACTERS: ${scene.charactersPresent.join(', ')}
EMOTIONAL GOAL: ${scene.emotionalGoal}
TENSION: ${scene.tension}
PAYOFF: ${scene.payoff}
BRIEF: ${scene.brief}

Write the scene now as prose.`
}

async function writeScene(scene, priorContext) {
  let lastErr = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await writeSceneOnce(scene, priorContext)
    } catch (err) {
      lastErr = err
      console.log(`  writer attempt ${attempt + 1} failed: ${err.message}`)
    }
  }
  throw lastErr
}

async function criticScene(record, chapterLog) {
  const fixture = {
    scene: {
      title: record.title,
      emotionalGoal: record.emotionalGoal,
      charactersPresent: record.charactersPresent,
      payoff: record.payoff,
      tension: record.tension
    },
    draft: record.prose,
    storyBible: STORY_BIBLE,
    chapterLog,
    existingEntitiesJson: '',
    categoryType: 'creative'
  }
  const { systemPrompt, userPrompt } = buildPrompt(fixture)
  const { parsed } = await callAI(systemPrompt, userPrompt)
  const dimensionScores = parsed.dimensionScores || {}
  const scores = Object.values(dimensionScores).filter((s) => typeof s === 'number')
  const score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  return { score, dimensionScores, issues: parsed.issues || [], strengths: parsed.strengths || [] }
}

function loadState() {
  const p = join(DIR, 'state.json')
  if (existsSync(p)) return { sceneIndex: 0, done: [], ...JSON.parse(readFileSync(p, 'utf-8')) }
  return { sceneIndex: 0, done: [] }
}
function saveState(s) {
  writeFileSync(join(DIR, 'state.json'), JSON.stringify(s, null, 2))
}
function loadHistory() {
  const p = join(DIR, 'eval-history.json')
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8'))
  return null
}

const spec = VOLUMES[VOLUME]
if (!spec) {
  console.error(`No briefs for volume ${VOLUME} yet — write them at the gate, continuations must follow what got generated.`)
  process.exit(1)
}

mkdirSync(DIR, { recursive: true })
const state = loadState()
let history = loadHistory()
if (!history) {
  history = {
    version: 1,
    description: `Calibration corpus: Greyhook Rock continuation, qwen3:8b, writer temp 0.8 / critic temp 0.3. Sequential timestamps, one scene per hour.`,
    config: { model: MODEL, writerTemp: 0.8, criticTemp: 0.3, wordsPerScene: TARGET_WORDS },
    evals: []
  }
}
const t0 = history.evals.length
  ? new Date(history.evals[history.evals.length - 1].timestamp).getTime() + 3600_000 - state.sceneIndex * 3600_000
  : Date.now() - state.sceneIndex * 3600_000
const tsFor = (idx) => new Date(t0 + idx * 3600_000).toISOString()

const chapters = spec.chapters.filter((_, i) => !ONLY_CHAPTER || i + 1 === ONLY_CHAPTER)
console.log(`Calib vol ${VOLUME}${DEGRADED ? ' DEGRADED' : ''} | model ${MODEL} | prompt ${PROMPT_VARIANT} | ${chapters.length} chapter(s) -> ${DIR}`)

const volumePath = join(DIR, `volume-${VOLUME}.json`)
const volumeRecord = existsSync(volumePath)
  ? JSON.parse(readFileSync(volumePath, 'utf-8'))
  : { volume: VOLUME, promptVariant: PROMPT_VARIANT, model: MODEL, chapters: [] }
let criticFailures = 0
let calls = 0
let resumed = 0
for (const [ci, chapter] of spec.chapters.entries()) {
  if (ONLY_CHAPTER && ci + 1 !== ONLY_CHAPTER) continue
  // Prior context chains: seed, then everything generated so far in this run
  // (including scenes recovered from a previous partial run for resume).
  const priorBits = [VOLUME_SEED]
  for (const done of volumeRecord.chapters) {
    priorBits.push(
      `Chapter "${done.title}" so far: ` +
        done.scenes.map((s) => `${s.title}: ${s.prose.slice(0, 300)}…`).join(' ')
    )
  }
  let chapterRecord = volumeRecord.chapters.find((c) => c.title === chapter.title)
  if (!chapterRecord) {
    chapterRecord = { title: chapter.title, scenes: [] }
    volumeRecord.chapters.push(chapterRecord)
  }
  const chapterLogBits = chapterRecord.scenes.map(
    (s) => `Scene "${s.title}": ${s.prose.slice(0, 600)}…`
  )
  for (const scene of chapter.scenes) {
    const key = `${ci}|${scene.title}`
    const recorded = chapterRecord.scenes.find((s) => s.title === scene.title && s.prose)
    if (state.done.includes(key) && recorded) {
      resumed++
      continue
    }
    const priorContext = `Story so far:\n${priorBits.join('\n\n')}`
    const tGen = Date.now()
    const prose = await writeScene(scene, priorContext)
    calls++
    const genSecs = ((Date.now() - tGen) / 1000).toFixed(0)
    if (!prose) throw new Error(`Vol ${VOLUME} ch "${chapter.title}" scene "${scene.title}" came back empty — aborting`)
    const words = prose.split(/\s+/).filter(Boolean).length
    console.log(`V${VOLUME} "${chapter.title}" / "${scene.title}": ${words} words in ${genSecs}s`)

    let crit = null
    for (let attempt = 0; attempt < 2 && !crit; attempt++) {
      try {
        const tCrit = Date.now()
        crit = await criticScene({ ...scene, prose }, chapterLogBits.join('\n'))
        calls++
        console.log(`  critic: ${crit.score?.toFixed(2) ?? 'n/a'} in ${((Date.now() - tCrit) / 1000).toFixed(0)}s`)
      } catch (err) {
        console.log(`  critic attempt ${attempt + 1} failed: ${err.message}`)
        if (attempt === 1) {
          criticFailures++
          crit = { score: null, dimensionScores: {}, issues: [], strengths: [], evalUnavailable: true }
        }
      }
    }

    const idx = state.sceneIndex++
    const sceneId = `calib-v${VOLUME}-ch${ci + 1}-s${chapterRecord.scenes.length + 1}`
    if (!history.evals.some((e) => e.sceneId === sceneId)) {
      history.evals.push({
        projectId: 'calib-greyhook',
        sceneId,
        evalType: 'story',
        score: crit.score,
        dimensionScores: crit.dimensionScores,
        issues: crit.issues,
        strengths: crit.strengths,
        timestamp: tsFor(idx),
        workspaceType: 'creative',
        volume: VOLUME,
        chapter: chapter.title,
        promptVariant: PROMPT_VARIANT,
        model: `ollama/${MODEL}`,
        ...(crit.evalUnavailable ? { evalUnavailable: true } : {})
      })
    }
    chapterRecord.scenes.push({ ...scene, prose, words, critic: crit })
    chapterLogBits.push(`Scene "${scene.title}": ${prose.slice(0, 600)}…`)
    state.done.push(key)
    saveState(state)
    writeFileSync(join(DIR, 'eval-history.json'), JSON.stringify(history, null, 2))
    writeFileSync(volumePath, JSON.stringify(volumeRecord, null, 2))
  }
  if (criticFailures > 2) throw new Error(`Too many critic failures (${criticFailures}) — aborting volume for data quality`)
}

console.log(`Saved ${DIR}/volume-${VOLUME}.json + eval-history.json (${history.evals.length} evals, ${calls} calls this run, ${resumed} resumed, ${criticFailures} critic failures)`)
