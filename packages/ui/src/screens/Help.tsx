// The little ⓘ (design 07 §2: every term the player can act on explains itself). Hover or focus shows the text;
// focus makes it work on touch and keyboard. Texts describe rules in words, never hidden numbers the player
// could not know (first-ranks §6).
import type { JSX } from "preact";

export const HELP: Record<string, string> = {
  setShare:
    "La quota (the share): the rule for how much a man under you pays up each week, a fixed amount plus a percentage of what he took in. Half is customary. Take more and his loyalty drifts down week by week; a disloyal man talks when he is arrested.",
  claimBusiness:
    "La pretesa (the claim): the family's record that a business is yours to collect from. Claiming an unclaimed shop on your crew's blocks puts it on your round. One claim per shop; a rival's claim is a dispute.",
  releaseClaim:
    "Giving up a claim returns the shop or the man to the crew's pool. Do it for a shop that refuses to pay or that a rival is fighting you over.",
  askPermission:
    "Two things a soldier asks the crew chief for: to open a loan book (he lends you capital at one point a week, from the family treasury if his own purse is short) and to bring an associate onto your book. He says yes while his favor toward you is not negative; a no costs a little favor.",
  lend:
    "Il libro (the book): you lend a shop a principal (capitale) and it pays you points (punti) percent of it every week, so 100 kL at 4 points is 4 kL a week while the block stays compliant. A week it cannot pay is a late week; four in a row is a default. On default an unclaimed shop becomes your claim; a claimed one loses you the principal and gains fear.",
  rank:
    "Your rank in the family and your Weight. Weight counts men on record with you, the value of your claims and the tribute flowing up; as an associate it follows your record. Rank rises when Weight crosses the line and the family has a place for you.",
  balance:
    "Dirty money is what the street pays; clean money has been through a business. Envelopes, stakes, loans and bribes all move dirty money.",
  loyalty: "How your sponsor's men, and you, feel about him: it decays toward the middle and moves with fair or heavy shares. Loyalty is what a man weighs against a prosecutor's offer.",
  sponsor:
    "Your sponsor's mood toward you, from the favor ledger between you two. Favors done, cash lent and money chipped in raise it; refusals, borrowed stakes and telling on your own stall lower it. Below a floor he warns you, then drops you.",
  attention:
    "The state's interest in the family, in five bands. Heat on the streets feeds it; time cools it. Each band unlocks tools against you: patrols, informants, a case, arrests, a trial.",
  proposta:
    "How close you are to being made. It rises with envelopes paid on time, favors done and your sponsor's goodwill, and falls with refusals and arrests. If the family requires bones, it says so here. At the top band, with the books open, your sponsor proposes you.",
  cards: "Two or three situations a week. Each option says what it usually brings, what can go wrong and how often, and what it costs. The week's summary tells you what came of it.",
  lifestyle: "Tenore di vita (lifestyle): how you live. Modest costs nothing and draws nothing; ordinary costs a little and earns respect; lavish costs a lot, earns more respect, and brings the state's eye to your town every week. When you cannot pay for it, you fall to modest.",
  duties: "I miei doveri (my duties): what you owe and to whom. A jailed man's family left without support is the surest way to make him talk; a lawyer gets him out sooner; a funeral missed is an insult the crew remembers. Each duty comes due as a card.",
  book: "Il libro (the book): everything under you on one page. Your men and what each paid you last turn, your stalls and whether they paid, your loans and how late each is, and what you owe the chief.",
  news: "What happens around you without asking anything of you: other men's disputes, the crew chief's decisions, the state's moves.",
  district:
    "Il mandamento (the district): the families that share it, and who heads it. A quarrel over a stall that will not settle goes up to the district head, who rules on it. Standing is how each family stands with your own, from cold (bad blood) through even to close (an ally); it fades back toward even over time. A family the district has ruled against, and that refuses the ruling, risks war.",
  war: "Guerra (war): what follows when a family refuses the district's ruling and its head chooses to fight rather than accept it. While it lasts, both sides collect at half, men sleep away from home instead of on their own beds, and heat rises in both towns. It ends at a peace meeting the district head offers every few weeks, or when one side is too weakened to go on.",
};

export function Info({ topic, label }: { topic: keyof typeof HELP; label?: string }): JSX.Element {
  const text = HELP[topic] ?? "";
  return (
    <span className="help" tabIndex={0} role="note" aria-label={label ?? "Information"}>
      <span className="help-icon" aria-hidden="true">i</span>
      <span className="help-pop" role="tooltip">{text}</span>
    </span>
  );
}
