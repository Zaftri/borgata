# Cosa Nostra Strategy Game: Requirements Brief

Status: brainstorm output, revised 2026-09-21 after the expert panel review (`docs/spec-review.md`); nineteen decisions logged. This is a requirements specification, not a design or architecture. Next step: `/sc:design`.

## Decisions taken (2026-09-21)

1. Single-player only. No multiplayer features.
2. No calendar-driven eras or prescribed growth path. Progression runs on Weight, pressure runs on Attention.
3. Rank is the explicit progression ladder and the soft tutorial. The player starts as an associate; the highest rank is head of the family. Weight earns promotion.
4. Setting: Sicily. The whole island with Palermo as the center, the provinces as their own districts, and the small surrounding islands as smuggling nodes and as a possible starting place. Harbors are controllable institutions and smuggling routes are chains with an island or coastal landing at one end and a mainland harbor at the other (decision 19).
5. Pacing: turn-based. The world moves only when the player ends the turn; turn length follows decision 13.
6. Narcotics: in, as the real high-risk, high-margin racket (heroin refining and export), contested inside the Commission.
7. Outside events: yes, with real consequences, but generated with logic rather than scripted. Events chain into each other and some are caused by player or rival actions. None fire on a date.
8. Art: pixel art, because the world is generated.
9. Business model: free hobby project, no monetization, no payment or account infrastructure required.
10. Audience: strategy players (Crusader Kings, Frostpunk, Blades in the Dark, Gangsters 1998).
11. History: fully fictional cast and families plus a codex that explains the real history behind each mechanic.
12. World generation: Sicily keeps its real outline and major cities; towns, neighborhoods, businesses, institutions, families, district borders, cast and pre-history are generated from a seed.
13. Turn length is adaptive: it grows with rank (weeks as associate and man of honor, fortnights as crew chief, months from the administration up) and contracts back to weeks whenever something important is happening (a war, a campaign, a trial, a succession), then relaxes again. Early turns are short in real time (1 to 3 minutes); later ones 5 to 10.
14. Retirement is the shelved state: the player steps back into legitimate business, remains bound by the code, can still be called or killed, and the residual risk decays with Attention. Nobody leaves.
15. Period look: 1970s to 1980s Sicily for art, newspaper and texture. Rules are still not dated.
16. Island scope at first release: the whole island is generated with families everywhere; only the player's province runs the detailed simulation, other provinces are simplified and become detailed as the player's Weight reaches them.
17. Terms: the interface shows the Italian or Sicilian term with its English translation in parentheses, for example "pizzo (protection tax)", "capodecina (crew chief)". Once a term has been introduced and defined in the codex, panels may show the Italian term alone with the translation in a tooltip. This brief uses the English terms in prose for readability; the glossary in section 13 gives the mapping.
18. Fourteen further areas adopted from the audit: family treasury, rural rackets, big business seeking the family, banks and the cocaine shift, policing the turf, civil justice for civilians, Commission bans as general policy, women and the household as actors, prison as a network, personal reputation facets, named civil-society antagonists, the negotiation with the state, corrupt judges.
19. Starting-place economies: each starting archetype has its own associate-level income, mid-game rackets and one institution that is the prize; the generator guarantees the tutorial beats inside that economy. Harbors and the near islands are a gameplay layer of their own (FR-C12 to C16).

Research backing this brief:
- `docs/research/01-how-the-mafia-works.md` (Cosa Nostra structure, rules, economics, law enforcement; American and Sicilian; 30 gameable dynamics)
- `docs/research/02-mafia-games-landscape.md` (what 20+ mafia games got right and wrong; browser feasibility)
- `docs/research/03-sicilian-cosa-nostra.md` (Sicily in depth: structure, protection tax tariffs, the contract table, heroin, politics, violence, the anti-Mafia state, civil society, geography; 33 gameable mechanics)

---

## 1. Clarified vision

**One sentence.** A single-player, browser-based, pixel-art strategy and economy game in which you rise from associate to head of a Sicilian Cosa Nostra family on a procedurally generated Sicily, running a territory as a hierarchy of people who pay you tribute, while the state builds a case against you and any one of your men could become the collaborator who ends you.

**What "accurate" means here.** Systems mirror how the Sicilian Mafia really worked: every family owns a territory and everything on it pays; tribute flows upward; disputes go to the district head and the Commission before anyone is killed; the boss is insulated by intermediaries; politics is a racket; the informant is the existential threat; public violence against the state brings the state down on everyone. Names, families and characters are fictional and generated. Rackets, rules, institutions and law-enforcement tools are real, and a codex tells the player where each came from.

**What "fun" means here, based on the research.**
- Every praised mafia game won on period texture and lost on repetitive loops. Texture is a first-class requirement even in pixel art.
- Players of Empire of Sin, City of Gangsters and Gangsters (1998) asked for the same missing things: characters whose relationships matter, law enforcement that is a real opponent, captains with autonomy, peace that is worth something, and tribute politics. Those five gaps are the design opportunity.
- Emergent stories need a world that differs each run. Generation plus consequential events is what makes the second game different from the first.

**Tensions between accuracy and fun, and how this brief resolves them.**
- Real mafia life is slow and most soldiers are poor. Resolution: a turn covers a week to a month of family business at once, and the drama is money, loyalty and law rather than gunfire.
- Real bosses never touch anything. Resolution: insulation is the central dial the player controls (the Buffer mechanic).
- Real violence is rare and, against the state, suicidal in the long run. Resolution: violence is an expensive, permission-gated operation whose consequences arrive through the event system, not a verb you spam.

---

## 2. Core concept

### Working title
"Borgata". In Palermo a borgata was one of the old outlying neighborhoods that the families were named after. Placeholder only.

### The fantasy
You start as an associate attached to a man of honor in a generated Palermo neighborhood or provincial town. You climb: man of honor, crew chief, the administration, and finally head of the family. At every rank the man above expects his share every turn and the territory expects to be protected. Around you are the other families of your district, the Provincial Commission, a police force and carabinieri that can be bought at the edges, magistrates who cannot, politicians who need votes, and a public whose fear can turn into refusal. How hard the state comes for you depends entirely on how loudly you grow. The player who climbs as far as they choose, with money, freedom and a family that has not produced a collaborator, has won.

### The rank ladder
Rank is the explicit ladder and the soft tutorial. Each rank adds one layer of systems and interface. The previous layer keeps running but is delegated to the people now below the player, who face the problems the player just solved. Each promotion is a scene that states the rules of the next rank in character.

| Rank | What the player has | What it teaches | Promotion requires |
|---|---|---|---|
| Associate | A sponsor, a few shops on his block, a card game or a small betting book | Protection tax collection, paying the sponsor his share, being on record, street-scale heat, watching a dispute settled by the crew chief | Steady earning, low Attention, the family accepting new men, sponsor's proposal |
| Man of honor | Membership and its protection, own loans and book, associates on record | The rules stated at the initiation, loansharking on the crew chief's capital, tribute going up, first dispute as a party, first associate arrested and the flip risk | Weight threshold, the head of family's favor, a crew vacancy |
| Crew chief | A crew of men and their associates, a stretch of territory | Managing people (loyalty, traits, autonomy), setting shares, protection tax across a territory, construction and procurement, fronts and laundering, the accountant and lawyer, Attention as a watched band | Weight threshold, favor, an administration seat opening |
| Administration (underboss or counselor) | Family-wide view, crew chiefs below | The buffer (the player is now the intermediary), arbitration between crews, proposing policy, dealing with the other families of the district, succession positioning, the association case as family-level risk | The head of family dies, retires, is jailed or is deposed; backing of the family's men and the district head, or a seizure with its Attention and grudge |
| Head of the family | The territory | The district and the Commission, votes and politicians, public works allocation, approving every killing and induction, the buffer as the central dial | Top rank. Win by holding it, being shelved, or placing a successor |

At the top rank, Weight continues to matter as standing: election as district head by the heads of the district's families, a seat and then a voice on the Provincial Commission, and influence over the regional Commission. These are not ranks; they are what a head of family with enough Weight can reach.

Promotion is never automatic: it needs Weight above the rank's threshold, the favor of the man above, and a vacancy or an open intake. A player can wait for a vacancy or create one, at the cost of Attention and a permanent enemy.

### The core loop: Planning, the Turn, the Report
1. **Planning (the player's decisions).** On the island map, the territory view and the family chart, the player assigns people to rackets, sets or approves shares, answers requests from below (a man wants to open a book, wants permission to punish a shopkeeper, wants a loan), answers demands from above (the crew chief wants a bigger share, wants a favor, wants a man for a job), invests dirty money into fronts and construction, decides disputes, and handles events.
2. **The Turn (resolution).** The turn, a week at the lowest ranks and up to a month at the top, plays out as a watchable pixel-art sequence on the territory (the Working Week, as players of Gangsters remember it): collections, loans, a building site, a shop with glue in its lock, a carabinieri patrol, an arrest, a beating that went too far. The player can pause but cannot intervene.
3. **The Report.** Shares arrive or do not. The newspaper prints headlines. The lawyer and accountant report. A man asks for a meeting. The player learns what the state might know only through indirect signs: a car parked near the meeting place, a friend in the prefecture who has gone quiet, a magistrate's name in the paper.

A turn should take 1 to 3 minutes at the two lowest ranks, where little is decided, and 5 to 10 minutes from crew chief up. Turn length is adaptive (decision 13): weeks at the lower ranks, fortnights as crew chief, months from the administration up, contracting back to weeks during a war, a campaign, a trial or a succession. A forty-year career lands in the range of 500 to 700 turns plus crisis weeks (see `docs/gameplay-walkthrough.md` for the arithmetic). Seasonal events (the patron saint's feast, Christmas, elections, the harvest) fall on the calendar whatever the turn length. Chapters are marked by the ranks the player reaches, not by the calendar.

### Weight and Attention (the game's spine)
No calendar-driven eras. Progression and pressure are driven by two player-facing metrics shown as bands with diegetic signs, not bare numbers. This is also the accurate model: the Italian state historically responded to prominence and provocation (the Ciaculli bomb, the excellent cadavers, the 1992 massacres), while quiet bosses survived for decades on the run in their own territory.

- **Weight** (power). Built from men on record, territory and institutions controlled, tribute per turn, owned assets, votes deliverable, and standing with the district and Commission. Rank is not part of Weight; Weight is what earns rank. Weight thresholds unlock territory, permission to make men, a voice in disputes, eligibility for the next rank, and at the top the district head election and Commission standing.
- **Attention** (pressure). Rises with public violence, headlines, attacks on the state, visible wealth, arrests and size. Decays slowly with quiet turns; can be bought down through politicians and lawyers but never erased. Attention thresholds bring in the state's tools in order: local investigators and informants, a dedicated squad, an anti-Mafia magistrate assigned to the territory, wiretaps and bugs, asset seizures, an association case against the whole family, and at the extreme the army in the streets and the isolation regime for jailed bosses. Rival families have their own Attention and a provincial component is shared.
- **Exposure** (per person). The evidence score. Attention decides how hard the state looks; Exposure decides what it finds.

Every action moves Weight and Attention in a different ratio (a public-works contract: high Weight, low Attention; killing a magistrate: some Weight, catastrophic Attention). Choosing the ratio is the strategy. A loud rival draws the state onto the whole province, which is why the Commission historically tried to control who could kill whom.

Time still passes for people (aging, sons, succession), but rules never change on a date. The setting is a fixed 1970s to 1980s Sicily in look and texture.

### Seven signature mechanics
1. **The Share.** Money flows up, not orders down. Associates pay men of honor, men pay the crew chief, the crew chief pays the family, the family pays the district and the Commission on shared business. Loyalty below is driven by what people keep and how well they are protected. Favor above is driven by how big and regular the share is. Skimming is always possible and only an accountant can detect it.
2. **The Territory.** A family owns a place, and everything on it is the family's business: every shop pays protection tax, every building site is "squared" (given the family's permission to operate, for a fee), every job needs permission. Territory changes hands through the Commission, absorption of a weakened family, or war.
3. **The Buffer.** The player chooses how insulated they are: direct orders (fast, precise, evidence accumulates on the player) or intermediaries and notes (slow, distorted, underlings skim, the case stalls). The historical range runs from a boss holding court to a boss on the run communicating by notes for years.
4. **The Flip Roll.** Every character has exposure and loyalty. Every arrest is a roll of pressure against loyalty. A flipped man costs a racket. A flipped administration member ends the game. The state's collaborator program makes flipping more attractive when Attention is high.
5. **The Dispute.** Every conflict inside the family or between families is first a meeting: at the crew chief, then the head of family, then the district head, then the Commission. Outcomes are compensation, transfer of a racket or a stretch of territory, an apology, or a sanctioned killing. War is what happens when the meeting fails, and it is always expensive.
6. **The Vote.** Politics is a racket. Families deliver votes; politicians deliver contracts, protection, and fixed trials. A politician who fails to deliver becomes a liability, and killing him is the loudest thing a family can do short of killing a magistrate.
7. **The Case Clock.** The state's own progression, visible only through signs. Each crime adds evidence to individual dossiers. At high Attention the dossiers link into an association case against the whole family that only resets when someone takes a conviction. Bribes buy delay, not erasure.

---

## 3. Functional requirements

Each requirement is written to be testable. "Must" means the game is not the game described without it (release). "Should" means release quality. "Could" means expansion. What the first playable contains is stated only in section 9 (the vertical slice), which is a strict subset of the Core tier in section 9c.

### FR-A. People and hierarchy
- A1 (must). The family is modeled as individual characters with rank, traits (earner, muscle, greedy, hothead, loyal, gambler, womanizer, devout, family man), skills (collecting, violence, business, discretion), age, and relationships (sponsor, friends, grudges, blood family, godparent ties).
- A2 (must). Every character has loyalty and exposure, shown to the player as estimates.
- A3 (must). Every associate and every business is "on record" with exactly one man of honor. Overlapping claims trigger a dispute (FR-E).
- A4 (must). Crew chiefs run their crews semi-autonomously according to traits when not given orders.
- A5 (should). Characters age, marry, have children, get sick, retire, go on the run and die. Sons, nephews and godsons are candidates for recruitment. A game spans generations.
- A6 (should). Characters remember slights, favors, unpaid shares and dead relatives; memory feeds loyalty and grudges.
- A7 (could). Outsiders who can earn and partner but never be made: Camorra smugglers, Calabrian partners, foreign suppliers, non-Sicilian contractors.
- A8 (should). Kinship as alliance: marriages, godparenthood and baptisms bind families and men; a marriage between two families' children is a treaty, a godfather tie is a loyalty modifier, and a killed relative is a grudge that outlives the war.
### FR-B. Economy, rackets and money
- B1 (must). At least eight racket types with distinct income, Attention and counter-play profiles: protection tax (universal territorial tax), loansharking, gambling and betting, public works and procurement (contract allocation, forced subcontracts and suppliers), construction and real estate, smuggling (cigarettes, using the coast and small islands), heroin refining and wholesale (highest margin, highest Attention and exposure, contested in the Commission), and votes for politicians (delivering votes in exchange for contracts, protection and fixed trials).
- B1a (must). Protection tax follows the real rhythm: small businesses pay weekly or monthly; shops and sites pay in three large collections at Christmas, Easter and mid-August, which become the year's cash peaks. Tariffs scale by business type from a market stall to a supermarket to a percentage of a building site's contract.
- B2 (must). Loansharking uses weekly interest on principal that never amortizes, with defaults converting into seized assets rather than cash.
- B3 (must). Two currencies: dirty cash and clean income. Dirty cash spent visibly raises exposure and Attention. Fronts (bars, construction firms, supermarkets, transport, agriculture) convert dirty to clean at a capacity limit. Members need a visible occupation.
- B4 (must). Tribute is configurable: a fixed share per turn, a percentage, or both. Shared business (public works, heroin) carries a percentage to the district and Commission.
- B5 (must). An accountant detects skimming and manages fronts; a lawyer affects arrests, delays and trials. Both are characters who can flip. They can be hired outsiders or people the family groomed through the career system (FR-T); groomed ones are cheaper over time and harder to flip, hired ones are available now.
- B6 (should). Protection tax compliance per business is driven by fear, the family's reputation for enforcement, the state's credibility in the territory, and town Sentiment (C4). Refusal spreads when refusers are seen to survive.
- B6a (should). Refusal is answered on an escalation ladder the player chooses to climb: glue in the lock, a burned car, a bomb at the shutter, murder. Each step raises the reporting risk and town Sentiment against the family; murder of a merchant earns nothing and is the fastest way to create a refusal movement.
- B6b (should). Being "squared" also grants the business real benefits: no theft, dispute arbitration, competitors kept out. Some merchants seek it voluntarily. The family's word must be honored or its reputation, and with it compliance, collapses.
- B7 (should). Public works as a shared institution: a contract allocation table run at district or provincial level. Winners are pre-agreed; the historical split was roughly 3 percent to the local family, 2 percent to politicians, 2 percent to the dominant faction and 1 percent to the coordinator, plus forced subcontracts (earthmoving, concrete, site guarding, transport) worth more than the cut itself.
- B8 (could). Advanced schemes unlocked by Weight and institutions: EU and state subsidy fraud, waste contracts, wind farms, healthcare, online betting.
- B9 (should). Asset confiscation targets wealth disproportionate to declared income. Assets can be held through clean nominees, which lowers seizure risk but adds a nominee-betrayal chance. Confiscated assets do not vanish: they become social assets in the territory that lower the family's legitimacy and raise Sentiment against it.
- B10 (should). Supply chains as slots, not deliveries: each advanced racket needs a fixed set of roles filled (heroin: a morphine supplier abroad, a chemist, a refinery site, an export buyer; cigarettes: a supplier, boats, a landing point, distribution). Filling a slot is a decision; once filled, the chain runs on its own each turn. No manual routing.
- B11 (should). Off-map partners as characters: the American cousins who buy heroin, Neapolitan smugglers who supply cigarettes, foreign morphine suppliers, mainland contractors. They have reliability, price and exposure, and can be lost to their own arrests.
- B12 (must). A racket is a source of money; a chain is how a racket runs (its slots); laundering is a chain but not a racket, and votes are a mechanic (E7) with a light chain. Goods and chain counts as a scope target. Goods are seven counters, never an inventory: dirty cash, clean income, cigarettes, morphine base, heroin, materials, weapons. Votes are handled as a mechanic (E7), not a counter. Chains are nine at release, five in core: protection tax, loansharking, gambling, laundering and a light vote chain in core; cigarette smuggling, heroin, public works, and construction and real estate at release. Late chains (fuel fraud, waste, subsidies, wind farms, betting shops) are one slot board each in expansion.
- B13 (must). Every chain is a slot board: filling a slot (a man, a business, a partner, a place) is the decision; a filled chain runs on its own each turn and appears in the report. No manual routing, trucks or stock. Each slot is an exposure point the state can hit.
- B14 (should). Rural rackets so generated towns outside the capital have an economy: water monopoly, control of agricultural markets, livestock theft, land agency, farm subsidy fraud. Each town archetype (K1) carries its own racket mix.
- B15 (should). Legitimate big business seeking the family: entrepreneurs and contractors who approach the family for partnership, protection or a rigged market, as an event type feeding ownership (FR-M) and the grey zone (FR-T). They bring capital and cover, and their own exposure.
- B16 (could). Banks and the cocaine shift: late-game bankers as laundering partners at scale, with the reputational and physical risks history records; and a decline of heroin margins replaced by cocaine bought from a mainland organization, turning a production chain into a partner relationship (B11).
### FR-C. Island, territory and map
- C1 (must). Sicily with its real outline and major cities in fixed positions; generated towns, neighborhoods, businesses, institutions and district borders (FR-K). Palermo is subdivided into generated neighborhoods.
- C2 (must). Territory is modeled the Sicilian way: each family owns a contiguous territory (a town or a Palermo neighborhood) and everything on it is the family's business. Families do not overlap. Three or more contiguous families form a district.
- C3 (must). Businesses have owners with fear and compliance and pay protection tax scaled to business size and type.
- C4 (should). Every town and neighborhood has a Sentiment value that governs reporting rates, protection tax compliance, recruitment and the size of the vote block the family can deliver. It shifts with the family's behavior and the state's presence: a murdered shopkeeper, a magistrate's arrival, a priest who speaks out, a confiscated villa turned into a cooperative, a consumer campaign against protection tax.
- C4a (should). The parish is a character in the territory: a compliant priest eases recruitment and festivals; a hostile one lowers recruitment and raises Sentiment against the family; killing him is a catastrophic legitimacy and Attention hit.
- C4b (should). The saint's feast has a committee the family can control; sponsoring the feast, the church and local charities buys Sentiment and votes, and losing the committee to an honest priest or a rival is a visible loss of face.
- C5 (should). The small islands (Egadi, Aeolian, Pantelleria, Lampedusa, Ustica) and the fishing fleets of the coast act as smuggling route nodes with capacity, interdiction risk and Attention profiles (detailed in C14 to C16).
- C6 (could). Provinces differ in character (Commission politics in the capital; orthodox and business-heavy; feud-prone with a rival network; business-mafia symbiosis; weak and subsidy-driven), used as generation flavor (K2).
- C7 (could). A rival network outside the Commission's rules, formed from expelled and shelved men. Wars with it drain both sides and invite the state.
- C8 (should). The press as an actor: a generated local journalist who investigates raises Attention over time and can be bought, frightened or killed; killing one is a catastrophic Attention and Sentiment event.
- C9 (should). Policing the turf: petty criminals on the territory (thieves, dealers, robbers) ask permission or are punished. Keeping the turf clean costs men each turn, raises compliance and Sentiment, and is the real content of "protection"; neglect lets crime rise and the protection tax start to feel like theft.
- C10 (should). Civil justice for civilians: settling disputes, recovering stolen goods, guaranteeing deals and debts, paid in money and in consent. A small service racket that feeds Sentiment and votes and makes the family the local government in practice.
- C11 (should). Named civil-society antagonists: Sentiment events produce persistent characters (a merchant who refuses and becomes a symbol, a priest who preaches against the family, an activist, a widow who speaks). They gain a following over time, raise Sentiment against the family and Attention, and can be dealt with only at the cost history records.
- C12 (must). Starting-place economies. Each starting archetype (K1) defines what an associate collects from in the first weeks, what a crew chief earns from, and which institution is the prize: harbor quarter (porters, dockers' bars, cargo pilfering; dock labor, fish market, warehouses, a landing; the port); market quarter (many small stall payers, a lottery book, loans to vendors; wholesale brokerage, gambling dens; the wholesale market); expansion neighborhood (site tax, selling site jobs, site guarding, materials theft; subcontracts, concrete, rezoning, apartments through nominees; the construction pipeline and planning office); agricultural town (estate guarding, water fees, livestock brokerage; water monopoly, markets, land agency, subsidies; the water consortium and the market); coastal fishing town (boat and fuel tax, a share of landings, crew work on a run; the fleet as smuggling capacity, fuel depot, cannery, the landing chain; the harbor and fleet); provincial capital (cafe and shop tax, brokering public jobs, a betting book; procurement, clinics, prefecture contracts, politics; the provincial administration); small island (season tax, boat services, landing fees; the route itself; the landing and a mainland partner).
- C13 (must). The generator places the guaranteed tutorial beats (K5) inside the starting archetype's economy: the late payer, the claim collision and the first arrest are drawn from that place's businesses and people.
- C14 (should). The harbor as a bundled institution with slots: dock labor cooperative (labor peace payments, visible jobs, control of what moves), a customs officer (intelligence and a blind eye, with his own exposure), the fish market (stalls, brokerage, cash to launder), warehouses and the fuel depot (contraband capacity, fuel for the fleet, where raids happen), the landing point (the slot every smuggling chain needs), and later the boatyard and ferry line (repair, a legal front, tourism). Holding a harbor draws a distinct Attention profile: customs police and coast guard, with patrols, seizures and radar as tools at higher bands.
- C15 (should). Smuggling routes as contested chains with two ends: supplier, mother ship offshore, an island or open-coast landing, fishing boats, a mainland harbor, warehouse, distribution. Every link is a slot owned by someone (B13); losing the landing to a rival or a coast-guard station cuts the chain. Routes are the reason mainland harbor families need island families, through favors, kinship, a share, or war.
- C16 (should). The small islands as a starting place and as nodes: a thin, seasonal local economy (tuna season, summer visitors, boat services) so the money is in being the landing; the first partner is a mainland family and the first vulnerability is being replaceable. Fishing seasons, the tuna run and storm weeks give the coast its own calendar and its own events.
### FR-D. The state and Attention
- D1 (must). Three layers of the state: local police and carabinieri (bribable at the edges, handle raids and arrests for individual crimes), investigating magistrates (not bribable; arrive at an Attention threshold; direct investigations and build cases), and national response (asset seizures, association prosecutions, army deployment, isolation regime) at the highest bands.
- D2 (must). Every crime adds evidence to the dossier of everyone who participated or ordered it, discounted by the number of buffers.
- D3 (must). Local heat is the short-term, local component of Attention: per town and per crew, it rises with visible crime and decays within weeks, and triggers raids and arrests. Family-level Attention (D5) is its slow, cumulative counterpart. Design should treat them as one metric with two time scales, not two systems.
- D4 (must). Every arrest triggers a flip roll: pressure (sentence exposure, murder knowledge, tape evidence, family threatened or killed, the collaborator program's terms) against loyalty. Outcomes: silence, plea without cooperation, or cooperation, which converts the character's knowledge into evidence against everyone he knows.
- D4a (should). Internal legitimacy: rule violations by the leadership (killing women or children, killing without approval, lying to peers, purging allies) lower every member's loyalty and raise flip risk. Fear of one's own side is a flip driver alongside the state's pressure.
- D4b (should). Making a body disappear is a choice: it denies the state evidence and lowers heat, but denies the victim's kin a funeral, which raises their grievance and their own flip risk.
- D5 (must). Attention is a family-level metric visible as a band. It rises with public violence, headlines, attacks on the state, visible wealth, arrests and size; decays slowly; can be reduced by politicians and lawyers but never erased. Rival families have their own Attention; a provincial component is shared.
- D6 (must). At the top Attention band, an association case aggregates dossiers across the family. It resets only on a conviction. Bribes delay it. The player sees indirect signs only. A single high-rank collaborator can escalate it into a mass trial that removes an entire Commission, which is the historical loss condition for a whole province. Roughly one member in twenty historically became a collaborator; the game's base rate should sit near that and rise with Attention and internal illegitimacy.
- D7 (should). State tools unlock against the player by Attention band, in order: informant networks, a dedicated squad, an assigned magistrate, bugs and wiretaps, asset seizures, the collaborator program at full strength, the army in the streets, isolation for jailed bosses. Each has a counter: no phones, notes by courier, no fixed meeting places, vetting recruits, keeping assets in others' names, living on the run.
- D7a (should). Living on the run inside the territory is a state the player can enter once a warrant or an association case exists against them (which the upper Attention bands produce): the fugitive keeps ruling through written notes and couriers at an upkeep cost for the support network; each courier and each supplier is a capture-risk node; command is slower and more distorted.
- D8 (should). Bribery buys delay and local blindness, never the magistrates; politicians can transfer a magistrate or fix a trial at a Weight cost and an Attention risk.
- D9 (could). Prison as a state, not removal: a jailed boss rules through visits and lawyers until the isolation regime is imposed at high Attention, which severs the command link, hands control to a regent and lets factions split.
- D10 (should). The state is bands and people: each Attention band is embodied by generated characters (a police chief who can be corrupt or honest, a prefect, a magistrate with ambition and a career). Their traits modulate the band's effect, they can be transferred through politicians (D8), and their careers are visible in the newspaper.
### FR-E. Politics: disputes, the Commission, war
- E1 (must). Disputes are the primary conflict resolution, escalating by rank: crew chief, head of family, district head, Provincial Commission. Played as short scenes with a small set of approaches; resolved by rank, prior claim, evidence, reputation and relationships.
- E2 (must). Permission gates on violence: an associate can be disciplined by his sponsor, but killing anyone on the territory, including associates and civilians, requires the head of family's approval; a man of honor can be killed only with the head of family's approval; a head of family only with the Commission's; anyone of the state only with the Commission's. Violating a gate is itself a capital dispute.
- E3 (must). Several generated families per province with distinct characters, strengths and rackets, driven by AI that prefers meetings to war and treats war as a last resort.
- E4 (should). The district and the Provincial Commission: district head election among the heads of families, seats, standing with each family, policy votes (intake open or closed, heroin allowed or not, who may be killed), arbitration, expulsion. Opens to the player at head of family.
- E4a (should). Commission bans as a general policy tool: the Commission allows or bans whole rackets and actions (heroin, kidnapping for ransom, attacks on the state, bombs). A ban is a policy vote; breaking a ban is a discoverable scheme (FR-V) and a capital dispute.
- E5 (should). War as a failure state: collections drop, men go into hiding, heat and Attention spike, the Commission may side against the aggressor, and every death raises the flip risk of the survivors.
- E6 (should). Succession contests when a head of family dies, retires or is convicted. The head is formally elected by the family's men, usually as a pre-negotiated acclamation; in a contested family the vote is where factions form. Coalitions, the district head's backing and prearranged support decide.
- E7 (should). Politicians as characters: votes delivered, favors owed, contracts returned, trials fixed, and the liability they become when they fail. Elections as recurring events. Politicians are either outsiders the family backs or the family's own candidates funded through the career system (FR-T); funding your own competes for votes with paying off those who already owe you.
- E8 (could). A regional Commission layer with the heads of the provincial commissions.
- E9 (should). Design rule for violence: hits on politicians remove a blocker but earn nothing; hits on merchants earn nothing and raise Sentiment against the family; the only profitable violence is intimidation that never has to be carried out. Every violence action's expected value should reflect this.
- E10 (could). Lodges as neutral meeting rooms: membership speeds deals with politicians and contractors but leaves lists that can be seized.
- E11 (should). Danger from above and beside (mechanics in FR-V): the head of family and peer crew chiefs are actors toward the player. The player can be shelved, have men reassigned, be suspected of talking, be set up by a peer competing for the same favor, or be judged a liability. These arrive as events with warning signs and countermoves (gifts, a bigger share, an alliance, a preemptive move).
### FR-F. Membership
- F1 (must). Recruitment path: associate, proposed by a sponsor, made in the initiation ceremony scene. The sponsor answers for the recruit.
- F2 (must). Intake open or closed as a family policy, set by the head of family or imposed by the Commission when provincial Attention is high.
- F3 (should). A required act of violence for membership as a configurable rule: on, it filters infiltrators and binds recruits by shared guilt while creating witnesses; off, it speeds recruitment and raises infiltration risk.
- F4 (should). Formal introductions gate who may deal with whom across families. Only a man of honor can introduce a man of honor.
### FR-G. Time, progression and endgame
- G1 (must). Adaptive turn length: one turn is a week at associate and man of honor, a fortnight at crew chief, a month from the administration up. Any crisis flagged by the event system (war, campaign, trial, succession, a magistrate's arrival, and, as a design option, a planned killing operation) contracts the turn back to a week until it resolves. Quiet turns with no pending decisions resolve into a single report. Seasonal events fall on the calendar: the three protection-tax collections at Christmas, Easter and mid-August, the patron saint's feast, elections, harvest.
- G1a (must). The player is told when and why the turn length changes, in character (the newspaper, the lawyer, the head).
- G2 (must). Weight is the progress metric, computed from men on record, territory and institutions, tribute per turn, owned assets, votes deliverable and standing. Rank is not an input to Weight, since rank promotion requires Weight. Weight thresholds unlock territory, permission to make men, dispute invitations and eligibility for the next rank; the district and Commission open at head of family. No unlock is gated by calendar date.
- G3 (must). Rank is the explicit ladder: associate, man of honor, crew chief, administration, head of family. Each rank adds one layer of systems and interface; promotion requires Weight above threshold, favor of the man above, and a vacancy or open intake. Each promotion is staged as a scene.
- G4 (must). Changes in the state's posture are announced diegetically (newspaper, a lawyer's warning, a Commission meeting) when an Attention threshold is crossed.
- G5 (must). Loss conditions: the player character is killed or convicted for life without a groomed heir, or the player's family is dissolved (FR-U). Weakened, regency and dormant are recoverable.
- G6 (must). Win conditions, all valid: reach head of family and hold the territory for a sustained period; place a son or protégé as head and step back; or be shelved (G6a). Dominating the island is not a win condition by itself.
- G6a (must). Retirement is the shelved state, not an exit: the player steps back into legitimate business, remains a man of honor bound by the code, can be called on or killed, and the residual risk decays as Attention falls. The game continues in a quiet mode with long turns until the player ends it, is pulled back in, or dies. The legacy summary is available at any point in this state.
- G7 (should). A legacy summary at the end: years survived, peak income, men made, men lost, men who flipped, headlines, what the codex says the real history did at the same junctures.
### FR-H. Presentation and texture
- H1 (must). Pixel art throughout: an island map, generated town and neighborhood views with animated turn events, a family chart with layered pixel portraits that age, and period-styled panels (ledgers, envelopes, newspaper, notes).
- H2 (must). A newspaper, issued every turn, that reports the player's world in period voice: murders, arrests, building sites, elections, magistrates. It is also the main feedback channel about what the public and the state know.
- H3 (must). Disputes, initiations, promotions and turn reports staged as short scenes with dialogue.
- H4 (should). Period audio: radio, street ambience, church bells, feast bands, shifting in mood with the family's Attention band.
- H5 (should). Portraits age with characters across decades.
- H6 (must). A history codex, unlocked as mechanics are met, explaining the real Sicilian history behind each: protection tax, districts, the initiation, the contract allocation table, the heroin refineries, the vote exchange, the collaborator law, the association crime, asset confiscation and its social reuse, the isolation regime, the anti-protection tax movement, the excellent cadavers and the laws that followed each. Fictional cast; real history in the codex only.
- H7 (must). Period look: 1970s to 1980s Sicily in cars, clothes, shopfronts, typography and the newspaper's voice. The look is fixed; the rules are not dated.
### FR-I. Onboarding
- I1 (must). The rank ladder is the tutorial. The associate and man of honor ranks introduce systems one at a time through the sponsor, the crew chief and the head of family speaking in character; no rank exposes interface for systems the player has not yet met. Reaching crew chief should take roughly the first two to three hours.
- I2 (must). Every failure has a readable cause: why a share was short, why a man was arrested, why a dispute went against the player.
- I3 (should). A "what the state may know" panel that shows estimates and signs, so the Case Clock never feels arbitrary.
### FR-J. Persistence
- J1 (must). Single-player only. The first release is a static site: saves persist in the browser with export and import, and no account is required. A light backend for cross-device saves is expansion scope.
- J2 (should). Ironman mode (single save, no reloading) as the intended way to play.
- J3 (could). A second playable side: the anti-Mafia magistrate building the case against a family, using the same simulation.
### FR-K. World generation
- K0 (must). The whole island is generated with families everywhere, but only the player's province runs the detailed simulation. Other provinces run as simplified families that hold territory, trade, ally, feed events and appear at the regional level; a province becomes detailed when the player's Weight or actions reach it. This is what keeps the performance budget (NF-12).
- K1 (must). Each new game generates a world from a seed on a real-shaped Sicily with major cities fixed: generated towns and Palermo neighborhoods from authored archetypes (harbor quarter, market quarter, expansion neighborhood, agricultural town, coastal fishing town, provincial capital, small island), each with its own economy (C12), their businesses, institutions and precincts, and district borders.
- K2 (must). Families are generated: names, size (5 to 30 men in towns, 20 to 60 in Palermo neighborhoods, up to 100 to 200 for a great family), territory, rackets and institutions held, loudness (starting Attention), internal factions, the head's age and personality. Provinces carry generated character (C6).
- K3 (must). The cast around the player is generated with traits, debts, vices, relationships and exposure: sponsor, crew chief, head of family, rival men, the police commander, the prefect, the local politician, and later the magistrate.
- K4 (should). A pre-history of 15 to 20 simulated years runs before play begins, producing grudges, old claims, a past war, a Commission record and a newspaper archive.
- K5 (must). Guaranteed tutorial beats: the generator must satisfy constraints so the rank ladder can teach reliably (the sponsor's crew chief carries high exposure so a vacancy is plausible, a neighboring family has a weak stretch of border, at least one public-works institution is reachable, an early claim collision and an early associate arrest are plausible).
- K6 (must). Rules, archetypes and templates are authored, never generated: the code, dispute logic, tribute, flip roll, Attention bands, racket and institution types, trait pool, scene and newspaper templates, period-correct Sicilian name pools.
- K7 (should). Portraits composed from layered pixel parts so generated characters have faces that age.
- K8 (could). Seed sharing, since the simulation is deterministic from a seed (NF-4).
### FR-L. Consequential events
- L1 (must). An event system whose events have real consequences on the game state and are generated by logic, never by date. Each event template has preconditions (Attention band, Weight, recent actions, world state), effects, and possible follow-ups.
- L2 (must). Chains: events can schedule or enable later events with probabilities, so a single cause unfolds over weeks or years (a killed shopkeeper leads to a funeral, a protest, a refusal movement, a squad assigned to the town).
- L3 (must). Causality from player and rival actions: attacking the state, a public war, visible wealth, or a collaborator produce state responses (a magistrate assigned, a new tool unlocked, mass arrests, the army); quiet growth produces business opportunities (a contract table invitation, a politician seeking votes).
- L4 (should). Outside events with logic: elections, a scandal in the capital, a change of prefect, an economic downturn, a construction boom, a new port or motorway. They are drawn from a weighted pool conditioned on world state, and their consequences feed the same chains.
- L5 (should). Events are reported through the newspaper, the lawyer, the Commission and the sponsor, never as bare modal text, and the codex links each event archetype to the history it is drawn from.
- L6 (could). Event authoring in data files so chains can be extended without code changes.
- L7 (should). The negotiation with the state: at the extreme Attention band an event chain in which the state offers, or appears to offer, an easing of pressure (softer prison regime, a transferred magistrate, a pause in seizures) in exchange for an end to violence. Accepting, refusing or exploiting it has consequences for Attention, legitimacy and the Commission's view of the player, and the chain can be a trap.
### FR-M. Business ownership and investment
- M1 (must). Beyond squaring businesses for protection tax, the player can own them. Owned businesses are a portfolio with real functions, not income tiles. Each business type carries a different mix of five functions: clean income, laundering capacity, jobs (visible occupations for members and votes from the families employed), racket enabling (a concrete plant unlocks the contract table, a transport firm unlocks smuggling, a bar hosts a gambling den), and cover (meeting place, warehouse, safe house for a fugitive).
- M2 (must). Acquisition paths, each with its own cost and exposure: forced partnership (the family becomes a silent partner in a merchant's business; he keeps running it, the family takes a share and uses the books); loan default (the loansharking book pays out in assets); purchase through a clean nominee; founding a company (typically construction or supply); and taking over a collapsed neighbor's holdings through the Commission.
- M3 (should). Building: land bought cheap at the edge of town, a rezoning favor from a politician, and the family's own construction firm produce a development that is sold or rented. Highest return in the game, longest horizon, needs the Vote mechanic (E7).
- M4 (should). Upgrades change function rather than raw income: a bar becomes a gambling den, a construction firm gains a concrete plant, a supermarket becomes a chain, a fishing company becomes a smuggling fleet.
- M5 (should). Ownership and confiscation (B9) are one system: a portfolio out of line with declared income invites seizure; nominees lower the risk and add betrayal chances; the accountant manages plausibility.
- M6 (should). Owning shrinks the tax base: an owned business pays no protection tax, and buying into another man's block is a claim that can trigger a dispute.
- M7 (must). Gambling is Sicilian, not Las Vegas: clandestine dens behind bars and clubs, clandestine betting, machines forced into bars. No legal casinos exist on the island; the codex explains why.
- M8 (could). Business types available for ownership, by archetype: construction firm, concrete plant or quarry, earthmoving, transport, supermarket and wholesale, bar, restaurant, hotel, petrol station, fishing company, agricultural estate, and late-game wind farm, waste contractor, private clinic and betting shop.
### FR-PC. The player character
- PC-1 (must). The player is a character, not a hand: name, age, background chosen at setup (from a mafia family or an outsider; town or Palermo), traits that affect what the player is good at and how others read them, personal exposure and personal loyalty ties. The character is visible on the family chart like anyone else.
- PC-2 (must). The character has a household: a wife or not, children who grow up, kin who can be recruited, godchildren. Household events are a source of obligations, alliances (A8) and vulnerability.
- PC-2a (should). Women of the household as actors: wives carry messages and run money while men are jailed, mothers anchor loyalty, sisters' and daughters' marriages seal alliances (A8), and a woman of the household can become a collaborator, with the same flip logic and a distinct motive set.
- PC-3 (should). Continuity: if the player character dies of natural causes, is killed, or retires, the player may continue as a designated heir who has been groomed (a son, nephew or protégé already in the family), inheriting his position, some of the Weight, and all of the grudges. If no heir was groomed, the game ends. Conviction with a life sentence ends the game.
- PC-4 (should). Personal lifestyle is a choice with consequences (FR-P): modest and invisible, or visible and respected, which raises Weight with the men and Attention with the state.
- PC-5 (should). Personal reputation facets: the player and key characters carry adjectives that others read (feared, fair, greedy, weak, a man of his word, a talker). They are earned by actions, visible as rumors (S-1), and used in disputes, recruitment, schemes and the Commission's decisions.
### FR-O. Violence operations and personal security
- O-1 (must). A killing is a planned operation, not a click: choose the target, the crew (shooters, driver, lookout, the friend who brings the victim), the method (lure to a meeting, ambush, car bomb which the Commission forbids, disappearance), and the timing. Each choice moves success odds, evidence produced, and who carries the exposure.
- O-2 (must). Outcomes include success, failure, wrong victim, survivor, witnesses, a shooter arrested, and the crew's own reactions. Every participant gains exposure; the victim's kin gain a grudge; the newspaper reports what the public saw.
- O-3 (must). Intimidation is the profitable form of violence (E9): threats, property damage and beatings have their own smaller operations with their own escalation and Sentiment costs.
- O-4 (should). Personal security for the player and for key men: bodyguards, varied routines, safe houses, going into hiding. Security costs money and Weight (a boss who hides looks weak), and lowers the odds of being hit. Rival families and the state both use the same model when the player targets them.
- O-5 (should). War state (E5) uses these operations at scale: men go into hiding, collections stop, every operation is riskier, and both families bleed until a meeting or a collapse.
### FR-P. Obligations, spending and lifestyle
- P-1 (must). Money has sinks with consequences: monthly support for jailed men's families (the single strongest anti-flip lever), lawyers for anyone arrested, bribes, gifts to politicians and officials, upkeep for fugitives, funerals and weddings, feast sponsorship, church and charity.
- P-2 (must). Unmet obligations are events: a jailed man's family left without support raises his flip risk sharply; a skipped funeral is an insult; a politician without his gift stops answering.
- P-3 (should). Lifestyle spending is a slider per key character: modest (low Attention, lower respect from the men) to lavish (high respect, high Attention, a target for confiscation). Visible wealth is the bridge between the economy and the state.
- P-4 (should). War and hiding cost money every turn while income falls; the treasury is what lets a family survive one.
- P-5 (must). The family treasury (the common fund): a fixed part of every share flows into it; it pays lawyers, prisoners' families, widows and the costs of war. Its size is Weight and its health is loyalty. Skimming from it and disputes over it are schemes (FR-V) and disputes (FR-E). The player controls it at head of family and contributes to it below.
### FR-Q. Diplomacy and favors
- Q-1 (must). A favor ledger between the player and every significant character and family: favors done, favors owed, gifts, hospitality, standing guarantor for someone. Favors are the positive currency that disputes draw on.
- Q-2 (should). Cooperation actions between families: lending men, joint operations on shared rackets, sharing a smuggling route, backing someone in a dispute or a succession, marriage proposals (A8).
- Q-3 (should). Guarantees: vouching for a man or a deal puts the player's own standing at stake; a guaranteed man who talks or a guaranteed deal that fails is the player's debt.
### FR-R. Arrest, trial and witnesses
- R-1 (must). A pipeline, not a roll: arrest, pretrial detention, evidence strength against defense strength, trial, verdict, appeal, sentence. The flip roll (D4) sits inside it. The lawyer is a character whose skill and loyalty shape each stage.
- R-2 (must). Witnesses are characters: a shopkeeper who saw, a rival's man who talked, a collaborator. They can be left alone, paid, frightened into retraction, or killed; each option has odds, Sentiment and Attention costs, and the killing of a witness is itself a new case.
- R-3 (should). Fixing a trial through a politician (D8) at appeal or final instance is a high-Weight, high-Attention favor with a chance of exposure that damages the politician too.
- R-3a (should). Corrupt judges: judges are generated characters alongside politicians in the trial-fixing path; a judge who can be reached at appeal or final instance is a rare, high-Weight asset whose exposure is shared with the family.
- R-4 (should). The player in custody: on a minor charge the player keeps directing through the lawyer and visits at a delay and with distortion, at a cost; on an association charge the isolation regime can cut the link (D9).
- R-5 (should). Sentences have lengths that matter: men return years later older, poorer, owed support, and either loyal or resentful depending on how they were treated inside.
- R-6 (should). Prison as a network: men serving sentences meet, ally and recruit inside; they return with new ties, grudges and debts formed there, which feed schemes (FR-V), alliances (FR-Q) and intelligence (FR-S).
### FR-S. Information and intelligence
- S-1 (must). Fog of war: the player sees exact values only for what they directly control, estimates for their own men (loyalty, exposure), rumors for rival families, and signs for the state. Every number the player sees should be attributable to a source.
- S-2 (should). The player's own intelligence: a friend in the police who leaks (a corrupt officer as a character with his own exposure), the lawyer reading case files, a clerk in the prefecture, gossip through the parish and the market. Each source has cost, reliability and a chance of being discovered, which is itself evidence.
- S-3 (should). Counter-intelligence: vetting recruits, sweeping cars, watching who talks to whom, and the paranoia cost of doing so (loyalty falls when men feel suspected).
- S-4 (could). Rival families and the state run the same model against the player, so a leak in the player's family is a discoverable character, not a die roll.
### FR-T. Careers and the grey zone
- T-1 (should). The player can invest in a person's career over years: kin, a groomed heir, or a trusted associate's child. Paying for study and placement produces, after a realistic delay, a professional with a capability for the family: lawyer, accountant or notary, doctor, engineer or architect, politician, priest, or a police officer (only from a non-member's family, since members' close kin are barred).
- T-2 (should). Each career has a cost profile, a duration, a payoff and a failure mode: a lawyer runs the trial pipeline (FR-R) and carries messages to jailed men; an accountant or notary runs laundering and nominee transfers (M5); a doctor treats wounded men off the record, issues certificates that keep men out of prison, and can run a clinic front; an engineer serves public works and developments (B7, M3); a politician climbs council, mayor, region, parliament, each level unlocking rezoning, contracts, transfers and trial fixes; a priest moves Sentiment and the feast committee (C4a, C4b); a police officer is an intelligence source (S-2).
- T-3 (should). Traits decide outcomes. Study can fail, a person can choose a different path, and a devout, ambitious or independent trait can turn a planned lawyer into a priest, a politician or someone who leaves the island. Education is a bet on a person, not a purchase.
- T-4 (must, if T-1 is adopted). Professionals must stay unmade to be useful. Induction puts them inside the association case and ends their public career. The grey zone is valuable because it is outside the code, and therefore never fully bound by it.
- T-5 (should). Loyalty drifts with success. A relative who becomes a regional deputy or a respected surgeon develops interests of their own. The family answers with money, favors, kinship pressure or a reminder; each answer has a cost and can push the person toward distance or toward the state.
- T-6 (should). Campaigns: funding the family's own candidate costs money at each election and draws on the territory's vote block, competing with votes promised to outside politicians. A candidate's scandal raises the family's Attention.
- T-7 (could). A groomed professional as heir (PC-3): a lawyer or politician son who takes over is a different kind of head, with Weight drawn from the legal world and a lower Attention profile, and with men who may not respect him.
### FR-U. Rise and fall of families
Applies to every family, the player's and the generated ones. Falls create the vacancies that make gaining territory possible without war.
- U-1 (must). Family states: healthy, weakened (lost head or most earners, or income below obligations), under regency (administered by a neighbor with the Commission's consent), dormant (surviving men, no activity, territory unclaimed in practice), dissolved (territory reassigned, men absorbed or exiled). Transitions are driven by the systems below and announced through the newspaper and the Commission.
- U-2 (must). Modes of destruction, each with a distinct signature: extermination in war (men killed, survivors exile, territory to the victor's regents); purge by allies (a family's men killed by the side they backed); mass trial from a high-rank collaborator (leadership and most men convicted at once, territory vacant); decapitation by arrest of a fugitive head (regent installed, factions split, weakened state); economic strangulation by confiscation (men kept, money gone, weakened state); dissolution by the Commission (after a provocation that brings the state down on everyone; dormant state); revenue collapse from refusal (Sentiment-driven weakening).
- U-3 (should). Exiles: survivors of an exterminated or purged family leave the island, keep their grudges and their kin ties, and can return years later as a revenge chain (FR-L) or as partners abroad (B11).
- U-4 (should). Regency and absorption: a weakened family can be placed under a neighbor's regency by the Commission. The regent administers the territory, takes a share, and after a period either restores the family or absorbs it with the Commission's consent. Regency is how most territory historically changed hands.
- U-5 (should). Splitting: a large family can carve out a new family for a loyal man with the Commission's approval, losing land and gaining a client family that votes with it. The Commission can also redraw districts, merge families and create new ones at the proposal of a head with enough Weight.
- U-6 (should). Decapitation rule: when a head is arrested or killed, a regent is chosen (the underboss, or the strongest crew chief), factions form, and for a period the family's Weight and coordination fall; a second decapitation within the period tips it to weakened or under regency.
- U-7 (must). Player loss is a family state: the player's family dissolved, or the player dead or convicted for life without a groomed heir (PC-3). Weakened, under regency and dormant are recoverable states for the player, and recovering a family is a valid arc.
- U-8 (should). New territory can be created: a development (M3) that urbanizes land adds blocks to the map that belong to the family that built them, with protection tax and jobs attached.
### FR-V. Treason, plots and secrets
Internal treason is modeled as schemes, distinct from cooperation with the state (D4, FR-R), which is the external half.
- V-1 (must). A scheme has a schemer, a motive, accomplices, a duration and a discovery chance. Motives are produced by existing systems: an unpaid or cut share, a passed-over promotion, a dead relative, a banned racket the man wants, fear of a purge, ambition with a coalition available. Schemes run in the background and surface through signs (S-1), not announcements.
- V-2 (must). Treason from below, as schemes NPCs can run against the player and each other: skimming beyond tolerance; secret dealing against family policy (heroin during a ban); acting as a police confidant (quiet information for protection, distinct from a collaborator who testifies); secret membership in another family (inducted unknown to his own, reporting and striking from inside); a plot to depose the head with a coalition and a neighbor's or the Commission's quiet backing.
- V-3 (should). Treason from above, as schemes the head or a superior can run against the player and others: handing a man to the police to remove him without a body; giving a man to a rival as the settlement of a dispute; selling the family's interests for a personal deal with a stronger family; purging allies on suspicion or ambition. Discovery of treason from above collapses internal legitimacy (D4a) and makes the head the target.
- V-4 (must). Treason by the player, with the same mechanics: a coup against the head (needs a coalition, a fait accompli the Commission will tolerate, or a war); anonymous letters to the police against a rival (uses the state as a weapon: Attention rises on the target's family and slightly on the province); placing secret men inside a rival family; switching allegiance to another family (rare, needs an accepting head, a casus belli); and collaboration with the state as an ending (V-7).
- V-5 (must). Suspicion is a ladder, not a verdict: watch, shelve, question, judge. Evidence comes from counter-intelligence (S-3), from the scheme's own slips, and from rivals who may plant it. False suspicion is possible; every step on the ladder costs loyalty across the family, which is the price of paranoia.
- V-6 (must). Consequences scale by rank: a low-rank traitor is killed cheaply with the sponsor answering for him; a high-rank traitor is a dispute, a Commission matter and a war risk; a head discovered selling his men is deposed or killed. The code makes some treasons invisible to outsiders (secret men are known only to the top of the other family), which is why they work.
- V-7 (should). Collaboration as an ending: the player may become a collaborator when arrested or when their family has turned on them. The game ends with the state's case built on what the player knows, everyone named convicted or fled, and a legacy screen that records what was traded. Accurate, valid, and not a win.
- V-8 (could). Symmetric schemes: rival families and the state run the same scheme model against the player, so a leak or a plot in the player's family is a discoverable character and chain, not a die roll.

---

## 4. Non-functional requirements

- NF-1 Platform: runs in current desktop browsers without plugins; mobile-web usable for Planning and the Report, with the animated turn simplified on small screens.
- NF-2 Load time: first playable screen within 5 seconds on typical broadband; pixel-art assets keep the initial download small.
- NF-3 Session fit: a turn resolves in 1 to 3 minutes at associate and man of honor and 5 to 10 minutes from crew chief up, whatever the turn's calendar length; a player can stop after any report with nothing lost.
- NF-4 Determinism: the simulation, including world generation and events, is reproducible from a seed and an action log, so saves are small and bugs are reproducible.
- NF-5 No monetization: no payments, no store, no purchasable advantage of any kind.
- NF-6 No appointment mechanics: no energy timers or login rewards; pacing comes from the turn structure.
- NF-7 Content: violence depicted through consequence and reporting, not graphic imagery; no real persons; real history only in the codex.
- NF-8 Accessibility: keyboard-navigable planning UI, readable pixel fonts at 100% zoom, colorblind-safe map states.
- NF-9 Terms and localization: interface labels use the Italian or Sicilian term with the English translation in parentheses on first and prominent use, and the Italian term alone with a tooltip once the codex has introduced it (decision 17, glossary in section 13). All text externalized; Italian as the natural second language, where the parentheses fall away.
- NF-10 Moddability (could): rackets, Attention bands, traits, event templates and name pools in data files.
- NF-11 Setup and difficulty: a new game offers seed, starting place by archetype (C12) or by province, character background, and difficulty presets that scale state aggressiveness, Attention decay and flip base rates. Ironman is a setup toggle.
- NF-12 Performance budget: a turn resolves in under 2 seconds and a full world with pre-history generates in under 15 seconds on a mid-range laptop in the browser; the active simulation layer (K0) is what keeps this true.
- NF-13 Content volume targets for release, to be set in design and used to judge scope: event templates, names per pool, portrait parts, scene templates, codex entries. Event templates are the largest content cost in the game and should be estimated first.

---

## 5. User stories and acceptance criteria

1. **The share.** As a crew chief, I want to set each man's share so that I can balance my own tribute to the family against my men's loyalty.
   Accepts when: changing a share visibly changes that man's projected loyalty trend and the projected tribute upward within the same planning screen, and the report shows what arrived and why it differed.

2. **The claim.** As a man of honor, I want to put a new business on record so that another man cannot collect there without a dispute.
   Accepts when: a second collector at that business triggers a dispute with the correct ranks, and the outcome transfers or confirms the claim.

3. **The arrest.** As a player, I want to see the risk that an arrested man cooperates so that I can decide whether to pay his lawyer, support his family, or act.
   Accepts when: the arrest event shows estimated pressure and loyalty, the available actions, and a next-turn outcome that follows from them; a flipped man's known crimes move into the dossiers of those he can implicate.

4. **The buffer.** As head of family, I want to choose whether an order goes directly or through my underboss so that I control the trade between speed and exposure.
   Accepts when: a direct order resolves within the turn and adds evidence to my dossier; a buffered order may resolve a turn later, may be distorted by the intermediary's traits, and adds evidence to the intermediary instead.

5. **The dispute.** As a player, I want conflicts settled at a meeting with arguments and consequences so that war is a choice, not the default.
   Accepts when: a dispute scene offers at least three approaches, the outcome depends on rank, evidence and standing, and declining or violating the outcome starts a war state with visible costs.

6. **The pressure ladder.** As a player, I want the state's response to scale with how visibly I grow so that a quiet family and a loud family of the same size face different opponents.
   Accepts when: two families with equal Weight but different Attention bands face different state tools; crossing a band is announced diegetically; behavior safe in a lower band produces warning signs within a few in-game months in a higher one.

7. **The intake.** As head of family, I want to open or close intake so that I control growth against infiltration.
   Accepts when: with open intake, sponsors propose recruits at a set rate and at least one recruit archetype is an infiltrator discovered only by vetting or events; with closed intake, no inductions happen and the family's average age rises.

8. **The animated turn.** As a player, I want to watch my orders play out on the territory so that the place feels alive and I learn from what went wrong.
   Accepts when: at least ten distinct event types animate over a turn, each can be clicked for a plain-language explanation, and the animation can be skipped to the report.

9. **The newspaper.** As a player, I want a paper every turn so that I learn what the public and the state can see about my family.
   Accepts when: every violent act with witnesses produces a headline, arrests are reported by name, and the paper's tone shifts with the family's Attention band.

10. **The vote.** As head of family, I want to deliver votes to a politician so that contracts and protection flow back, and I want to feel the cost when he fails.
    Accepts when: an election event lets the player commit deliverable votes, a successful candidate returns contract access or a fixed delay within a set period, and a failed or disloyal candidate becomes a liability with a visible Attention cost for removing him.

11. **The chain.** As a player, I want my actions to have consequences that unfold over time so that the world reacts with logic rather than at random.
    Accepts when: a public killing produces at least a three-step chain (headline, state response, follow-up) whose steps are visibly connected in the newspaper, and a different cause produces a different chain in the same world.

12. **Stepping back.** As a player, I want to be shelved into legitimate business so that domination is not the only way to end a career, while knowing that nobody truly leaves.
    Accepts when: a player with sufficient clean income and low exposure can request to be shelved, the game continues in a quiet long-turn mode with a residual risk of being called or targeted that visibly decays with Attention, and the legacy summary can be taken at any point in that state.

13. **The partnership.** As a crew chief, I want to become a silent partner in a business on my territory so that its books launder my cash and its jobs employ my men.
    Accepts when: a forced partnership offers the merchant a choice with fear and Sentiment consequences, the business's laundering capacity and job slots become available to the player the following turn, and the business stops paying protection tax while the previous claimant, if any, raises a dispute.

14. **The son at university.** As head of family, I want to pay for a nephew's law degree so that in a few years the family has a lawyer who cannot be bought by the other side.
    Accepts when: the investment appears as a recurring cost with a visible expected completion, the outcome depends on the nephew's traits and can fail or divert, and a completed lawyer becomes selectable in the trial pipeline with loyalty that starts higher than a hired lawyer's and drifts with his own success.

15. **The regency.** As head of family, I want the Commission to place a weakened neighbor under my care so that I can grow without a war.
    Accepts when: a neighbor entering the weakened state produces a Commission event in which the player can bid for regency against other heads by Weight, favors and standing; a granted regency yields a share of that territory's income and a visible timer; and at its end the player chooses restore or absorb, with the Commission's consent depending on standing and the neighbor's men reacting by loyalty.

16. **The confidant.** As a crew chief, I want to notice that one of my men is feeding a detective so that I can decide whether to watch, shelve, question or judge him before he becomes a witness.
    Accepts when: a running confidant scheme produces at least two distinct signs over several turns (a raid that was too precise, a man suddenly flush), each suspicion step has a loyalty cost across the crew, a wrong judgment is possible and visibly costly, and a correct one ends the scheme with the sponsor's standing affected.

17. **The coup.** As underboss, I want to depose a head who is bleeding the family so that I can take the seat without a war.
    Accepts when: the player can recruit crew chiefs into a coalition through favors and grievances, the Commission's tolerance is estimable from standing, a coup resolves as a bloodless deposition, a killing, or a failed plot with the player judged, and the outcome changes Weight, Attention and legitimacy in ways the newspaper and the Commission report.

18. **The landing.** As a crew chief on a small island, I want to be the landing that a mainland family's route needs so that a thin local economy still makes me money and a partner.
    Accepts when: an island start offers landing fees, storage and transfer as its main income, a mainland family proposes a route with a share, the route's chain shows my landing as a slot the state can hit and a rival can replace, and losing or holding the landing changes the mainland family's standing with me.

19. **A new island.** As a returning player, I want each new game to give me a different Sicily so that I cannot replay from memory.
    Accepts when: two seeds produce different neighborhood layouts, different families with different strengths, a different cast around the player, and a different pre-history in the newspaper archive, while both satisfy the guaranteed tutorial beats.

---

## 6. Anti-goals

- No action or tactical combat layer. Violence resolves as a planned operation with a risk roll and consequences.
- No energy timers, daily rewards or monetization of any kind.
- No "kill the boss, take everything" territory logic. Peace must have value.
- No real persons or real families as characters; real history lives in the codex.
- No scripted campaign and no dated eras. The world is generated and history emerges from the event system.
- No multiplayer.

---

## 7. Why this can be built small

Management depth does not need expensive rendering: Cultist Simulator, Melvor Idle, Torn and Prosperous Universe succeeded on systems and interface. Pixel art plus DOM panels, layered portraits and a text-driven newspaper deliver the texture at hobby cost. Procedural generation and the event system reuse a fixed pool of art and templates, which is what keeps a replayable island within reach. Single-player with browser saves needs no server to start. The magistrate side, the regional Commission and rival organizations are deliberate "could" items.

---

## 8. Risks

- **Depth without clarity.** Gangsters (1998) had this scope and lost half its reviewers to an opaque interface. I2 and I3 exist to prevent that; UI clarity should be tested from the first prototype.
- **Late-game micromanagement.** City of Gangsters players babysat 50 gangsters per turn. Crew chief autonomy (A4) must be in the first playable.
- **The invisible opponent feels random.** The Case Clock is hidden by design. If the signs are too faint, players feel cheated. Tuning and I3 are the mitigation.
- **Event chains feel scripted or feel arbitrary.** Too few templates and players see the same chain every run; too loose a logic and consequences feel random. The event system needs a wide template pool and visible causality in the newspaper (L5).
- **Procedural blandness.** Generated towns can all feel the same. Mitigation: strong archetypes, the pre-history, and hand-written signature events per archetype.
- **Metric gaming.** If Weight and Attention are too legible, players optimize numbers instead of the family. Both are shown as bands with diegetic signs.
- **Tone.** The subject is real crime with real victims, and Sicily's is recent. The newspaper, the codex and the civil-society model (B6, C4) keep the game honest about consequences without lecturing.
- **Metric sprawl.** Weight, Attention (with local heat), Exposure and Sentiment are four meters plus favor ledgers. Design must give each a single owner question (how strong am I; how hard is the state looking; what would it find; what does the town feel) and resist adding a fifth.
- **Scope.** Twenty-two requirement groups is a multi-year scope for a hobby project. Section 9c tiers them so design knows what is core, what is release, and what is expansion.
- **Accuracy fatigue.** Real Mafia economics are repetitive by nature. The changing state posture, the event system and the character layer provide variety over a long game.

---

## 9. Scope proposal for a first playable (vertical slice)

One generated Palermo neighborhood, one family, the player rising from associate to man of honor to crew chief, three rackets (protection tax, loansharking, a betting book), one neighboring family with a weak border, local police plus one Attention band above it, one short event chain (a refusing shopkeeper), one in-game year. It is a strict subset of the Core tier (9c). Must include: shares, on-record claims and one dispute, arrests with flip rolls, autonomy for the men the player does not direct, the pixel-art animated turn, the report and newspaper, generation from a seed with guaranteed tutorial beats. This slice tests the three hypotheses the whole game rests on: that the share economy is interesting week to week, that the fear of a flip creates tension without combat, and that a generated neighborhood feels like a place.

---

## 9b. Opening and progression

### The first hours (associate to crew chief)
1. **Associate.** The player is attached to a man of honor. The first weeks teach protection tax collection, a card game or betting book, and paying the sponsor his share. A scripted-by-constraint collision (a neighboring family's collector on the player's block) leads to a dispute the player watches, not decides. Goal: earn steadily until the sponsor proposes the player.
2. **The initiation.** Intake is open; the initiation scene states the rules the player will be judged by.
3. **Man of honor.** The crew chief lends capital for loans: the player begins in debt to the man above. The player puts first associates on record, pays a share each turn, sits as a party in a first dispute, and sees a first associate arrested with a visible flip risk.
4. **Crew chief.** A crew vacancy opens (a crew chief arrested or shelved); with enough Weight and favor the head of family hands the player the crew: men, associates, a stretch of territory, a meeting place. The family's expected share is set just above current crew income. Closing that gap is the crew chief game.

### Money progression
1. Squeeze existing territory (higher protection tax, tighter shares): fast, costs loyalty and compliance.
2. Widen the book (more businesses squared, more games, more loans): needs capital and men.
3. Enter public works and construction: the step-change; contract percentages, forced subcontracts and suppliers, jobs for the territory.
4. Own businesses (FR-M): forced partnerships, defaulted loans, nominee purchases, founded firms, then developments. Each adds clean income, laundering capacity, jobs and votes, and racket access, at the cost of seizable wealth and people to trust.
5. Advanced schemes unlocked by Weight and institutions (smuggling routes, heroin refining, subsidy fraud): large, short-lived, high Attention.

### Power progression
- Favor above, measured by share size and regularity; buys territory on vacancies, permission to make men, a voice in disputes.
- Men below: every sponsored recruit is on record with the player for life; a crew chief with many loyal men is a faction.
- Votes: a territory that votes as told is Weight that politicians can see.
- Rank, then standing: district head election and Commission seat at head of family.
- Every gain in power adds exposure; power and safety pull against each other from week one.

### Territory progression
- Territory is a place and everything on it. The player's family owns a neighborhood or town; the player's crew owns a stretch of it.
- Growth inside the family: more of the territory assigned to the player's crew as vacancies open.
- Growth of the family, in rough order of cost: assignment of a vacant territory after a neighbor falls; regency over a weakened neighbor and later absorption (FR-U); new blocks created by the family's own developments; redrawing the district at the Commission with enough Weight; war; extermination.
- Splitting the family to create a client family is a way to convert land into standing.
- Institutions cross borders: a seat at the contract allocation table is leverage over every site in the province.

### Shape of a full game (by rank, not by date)
| Rank | What the game is about | Typical state posture if grown loud |
|---|---|---|
| Associate, man of honor | Learning the loop, feeding the share, first claims | Local investigators, occasional raids |
| Crew chief | Public works, fronts, a faction of sponsored men | A dedicated squad, informants |
| Administration | Buffers, succession, who talks, intake open or closed | An assigned magistrate, bugs, wiretaps, seizures |
| Head of family | The district, the Commission, votes, surviving success | Association case, collaborators, the army in the streets |

A player who keeps Attention low can sit at any rank indefinitely with a lighter opponent. The ranks describe scale and unlock systems; Attention, not rank, decides the opponent.

---

## 9c. Scope tiers

| Tier | Groups | Why |
|---|---|---|
| Core (first playable; section 9 is its vertical slice) | A people, B economy (protection tax, loans, betting), C territory, D state to one band, E disputes, F membership, G progression, H pixel presentation, I onboarding, J saves, K generation, L a first event chain, PC player character, O intimidation and one killing operation, P obligations, S fog of war, U family states and one destruction mode, V skimming, confidants and the suspicion ladder, P-5 treasury, C9 turf policing, C12 and C13 starting-place economies, adaptive turns | The loop, the ladder, the fear, the place |
| Release | Full B including public works and ownership (M), full D bands and D10 state characters, E4 to E11 politics and danger from above, L outside events, Q favors, R trial pipeline, T careers and the grey zone, U full rise and fall with regency, exiles and splitting, V full plots including coups, secret men, treason from above and the collaboration ending, B14 rural rackets, B15 big business, C14 to C16 harbors, routes and islands, C10 civil justice, C11 named antagonists, E4a bans, PC-2a household, PC-5 reputation, R-6 prison network, R-3a judges, L7 the negotiation, A8 kinship, C4b feasts, C8 press, K4 pre-history, codex | The full family game |
| Expansion | B8 late rackets, B16 banks and the cocaine shift, B11 off-map partners in depth, C6 and C7 provinces and rival network, E8 regional Commission, J3 magistrate side, K8 seeds, PC-3 heirs in depth, S4 symmetric intelligence, mod support | Depth after the game exists |

## 10. Remaining open questions

Every question raised during the brainstorm has been closed; see Decisions at the top. Design-level questions carried forward are listed in sections 11 and 12 and in `docs/spec-review.md`.

---

## 11. Gap analysis record (2026-09-21)

Gaps found on a full pass and where they were closed: player character and continuity (FR-PC); violence operations and personal security (FR-O); spending, obligations and lifestyle (FR-P); positive diplomacy and favors (FR-Q); arrest-to-trial pipeline and witnesses (FR-R); information and intelligence (FR-S); supply chains and off-map partners (B10, B11); danger from above and beside (E11); kinship alliances (A8); feasts and press (C4b, C8); state as characters (D10); setup, performance and content targets (NF-11 to NF-13); Weight circularity (G2); heat folded into Attention (D3); scope tiers (9c). Added afterwards from user input: careers and the grey zone (FR-T); rise and fall of families with regency, exiles, splitting and new territory (FR-U), which also closed the undefined "family collapses" loss condition; treason, plots and secrets (FR-V), covering internal betrayal from below, above and by the player, and collaboration as an ending. Open design questions raised by the pass: how many decisions a week may demand before it becomes tedious; whether the heir mechanic (PC-3) is core or release.

## 12. Audit record (2026-09-21)

A full audit found fourteen Mafia areas not yet covered and five structural questions. All were decided the same day (decisions 13 to 18) and folded into the requirements: adaptive turn length (G1), shelved retirement (G6a), period look (H7), one active province (K0), bilingual terms (NF-9), treasury (P-5), rural rackets (B14), big business (B15), banks and cocaine (B16), turf policing (C9), civil justice (C10), named antagonists (C11), Commission bans (E4a), women of the household (PC-2a), reputation facets (PC-5), prison network (R-6), corrupt judges (R-3a), the negotiation (L7). Two design-level questions remain for `/sc:design`: the cap on decisions surfaced per turn, and what the animated turn shows at island scale (suggested: one chosen place, the rest in the report).

## 13. Glossary: interface labels

The brief uses English in prose. The interface uses the Italian or Sicilian term with the English translation in parentheses (decision 17). Design should treat this table as the label source.

| English in this brief | Interface label |
|---|---|
| protection tax | pizzo (protection tax) |
| squaring a business | messa a posto (squaring) |
| district | mandamento (district) |
| district head | capomandamento (district head) |
| family | famiglia (family) |
| neighborhood (Palermo) | borgata (neighborhood) |
| associate | avvicinato (associate) |
| man of honor | uomo d'onore (man of honor) |
| crew | decina (crew) |
| crew chief | capodecina (crew chief) |
| counselor | consigliere (counselor) |
| underboss | sottocapo (underboss) |
| head of family | capofamiglia (head of family) |
| the Commission | la Commissione (the Commission) |
| initiation | punciuta (initiation) |
| shelved | posato (shelved) |
| notes by courier | pizzini (notes) |
| collaborator | pentito (collaborator) |
| making a body disappear | lupara bianca (disappearance) |
| the common fund | la cassa (the common fund) |
| the contract table | il tavolino (the contract table) |
| rival network outside the Commission | stidda (rival network) |
| hard prison regime | hard prison regime (41-bis) |
| association crime | mafia association (416-bis) |

Note: the working title "Borgata" collides with the interface label for neighborhood; if the title is kept, the label should read "quartiere (neighborhood)" for Palermo neighborhoods.

## 14. Next step

Run `/sc:design` to produce the game design document, system model (Weight, Attention, Exposure, the share economy, the event system, world generation) and technical architecture from this brief. Read the Sicily research report (`docs/research/03-sicilian-cosa-nostra.md`) and the panel review (`docs/spec-review.md`) first; the review's design-level items (one event engine with scheduling semantics, measured requirements, band counts, determinism rules, failure modes, versioned saves, a headless test harness, stories per rank, a reference turn) are inputs to design.
