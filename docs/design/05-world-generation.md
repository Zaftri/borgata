# Design 05: World Generation

Status: design, 2026-09-21. Defines how a new game builds Sicily from a seed: the ordered pipeline, the archetypes and their economies, the constraint system that guarantees the tutorial beats, determinism, naming, performance targets and generator invariants. Consistent with design 01 (named RNG streams, compact provinces), design 02 (state tree), design 03 (meters and chains), design 04 (regional templates for pre-history), and requirements FR-K, FR-C (C12 to C16), K0 to K8, K5 and C13.

Generation is a pure function `generate(spec: GenerationSpec, content: Content): World` followed by `prehistory(world, years): World`, both deterministic in the seed. Nothing in generation reads the clock or platform random.

```ts
type GenerationSpec = {
  seed: string;
  start: { archetype: TownArchetype | "any"; provinceId?: ProvinceId };
  background: "born" | "outsider";
  difficulty: DifficultyPreset; ironman: boolean;
  prehistoryYears: number;             // 15..20, default 18
};
```

---

## Stage 0. Streams

Every stage draws from its own stream derived from the seed and the stage name: `gen.island`, `gen.provinces`, `gen.districts`, `gen.towns`, `gen.blocks`, `gen.institutions`, `gen.families`, `gen.cast`, `gen.household`, `gen.state`, `gen.names`, `gen.prehistory`. Each province additionally owns `gen.province.<id>`, used for everything generated inside it, including lazy expansion later (stage 10). Adding a draw in one stage never perturbs another.

---

## Stage 1. Island and fixed cities

The island outline is authored content: a low-resolution polygon of Sicily with the nine provincial capitals (Palermo, Trapani, Agrigento, Caltanissetta, Enna, Catania, Messina, Siracusa, Ragusa) and the small islands (Egadi, Aeolian, Ustica, Pantelleria, Lampedusa) at fixed positions. Nothing here is generated; players recognize the map, and the codex history matches it (decision 12).

Generated on top: the coastline is subdivided into coastal cells; the interior into hinterland cells with a terrain tag (plain, hill, mountain) from an authored heightmap. Cells are the placement grid for towns.

---

## Stage 2. Provinces

Each province gets `detail: "full" | "compact"` (the start province is full, all others compact, K0) and a **character** drawn from the authored list in C6, weighted by the research's provincial personalities:

| Character | Default provinces | Effect on generation |
|---|---|---|
| Commission politics | Palermo | More families, more districts, contract table present, higher starting shared Attention |
| Orthodox and business-heavy | Trapani | Fewer, larger families; salt and fishing institutions; low starting Attention |
| Feud-prone with a rival network | Agrigento, Caltanissetta | A rival network exists (C7); more `war` events in pre-history |
| Business-mafia symbiosis | Catania | Big legitimate business partners generated (B15); high asset values |
| Weak and subsidy-driven | Enna, Messina | Small families, rural rackets, subsidy institutions |
| Open and contested | Siracusa, Ragusa | Unclaimed towns exist; no district head at start |

The `gen.provinces` stream may swap one province's character per world so the map is not identical every run; the start province's character is never swapped away from what the archetype needs.

Compact provinces receive only stage 6's family records and stage 8's regional actors. Everything else in them is created lazily (stage 10).

---

## Stage 3. Districts

Within a full province, families are grouped into districts (mandamenti) of three or more contiguous towns' families (C2). The generator first places family territories (stage 4), then runs a contiguity clustering with a target of 3 to 5 families per district and merges any leftover district under 3. Each district gets a `districtHead: FamilyId | null` chosen in pre-history (stage 9), never at generation.

Palermo city is subdivided into 8 to 12 generated neighborhoods, each a town record with `archetype` in {harbor quarter, market quarter, expansion neighborhood, provincial capital}; the hinterland gets agricultural towns; the coast gets fishing towns; the small islands get `smallIsland` towns.

---

## Stage 4. Towns and archetypes

```ts
type Archetype = {
  id: TownArchetype;
  placement: { cells: TerrainTag[]; coastal?: boolean; palermoOnly?: boolean };
  population: Range;
  blocks: Range;
  businessMix: Record<BusinessType, Weight>;      // draws for stage 5
  sizeDistribution: Record<1|2|3|4|5, Weight>;
  institutions: { type: InstitutionType; probability: Permille }[];
  economy: ArchetypeEconomy;                        // C12: associate, chief, prize
  tutorialBeats: BeatSpec[];                        // which C13 beats this archetype supplies and from what
  ruralRackets?: RacketId[];                        // B14, for agricultural towns
};
```

The seven archetypes and what they generate (from C12):

| Archetype | Population | Businesses per block | Institutions (probability) | Prize |
|---|---|---|---|---|
| Harbor quarter | 6k to 15k | 8 to 14, many bars and warehouses | Port (always), fish market (800), customs office (always) | The port bundle (C14) |
| Market quarter | 8k to 20k | 20 to 40, mostly size 1 to 2 stalls | Wholesale market (always), lottery office (600) | The wholesale market |
| Expansion neighborhood | 5k to 25k | 6 to 12 plus 3 to 8 building sites | Planning office (always), concrete plant (500) | Construction pipeline and planning office |
| Agricultural town | 2k to 12k | 4 to 9, shops plus estates | Water consortium (always), livestock fair (700), subsidy office (400) | Water consortium and market |
| Coastal fishing town | 3k to 15k | 6 to 12, boats as businesses | Harbor (always), fuel depot (always), cannery (500), landing node (always) | Harbor and fleet |
| Provincial capital | 20k to 80k | 10 to 18 per block, cafes and offices | Prefecture (always), contract table (600), hospital (700), courthouse (always) | The provincial administration |
| Small island | 300 to 4k | 3 to 6, seasonal | Landing node (always), tuna fishery (500), ferry line (always) | The landing and a mainland partner |

Town placement fills cells by archetype placement rules until the province's population budget is spent; the start town is placed first from `spec.start.archetype` (or drawn if `any`).

---

## Stage 5. Blocks and businesses

Each town gets its block count from the archetype range; each block draws businesses from the archetype's `businessMix` and `sizeDistribution`. Business records are complete (type, size, functions, compliance and fear seeded from the town's starting Sentiment), but **civilian owners are not generated**. `ownerId` is null until an event binds the business (a refusal, a partnership, a witness), at which point the `gen.province.<id>` stream produces the owner with a name, household and traits. This keeps the World small (design 02 §8) without losing determinism: the owner of business X in seed S is always the same person whenever first needed.

Building sites are businesses of type `site` with a contract value, a duration and a `squared` flag; they expire and are replaced by new sites in expansion neighborhoods, which is how construction income recurs.

---

## Stage 6. Institutions, harbors and routes

Institutions are placed by archetype probability. Each has typed slots (design 02 `InstitutionSlot`), all `controllerFamilyId: null` at generation; pre-history assigns some.

The harbor bundle (C14) generates six slots: dock labor cooperative, customs officer (a state actor character, stage 8), fish market, warehouses and fuel depot, landing point, and a dormant boatyard/ferry pair that unlocks with Weight.

**Routes** (C15) are generated as a graph: sea legs connect off-map suppliers (Naples, North Africa, the Levant, all `external` nodes) to landing nodes (every small island town and every fishing town, plus 1 to 3 open-coast landings per coastal province) and landing nodes to mainland harbors. Each leg carries `interdictionRisk` (per 10,000) seeded by distance and by whether a coast-guard station exists in pre-history. Every landing node is a chain slot (design 03 §4); islands therefore exist in the chain graph from turn one.

---

## Stage 7. Families

Each full-province town gets exactly one family (C2). Family size follows K2 by archetype: towns 5 to 30 men, Palermo neighborhoods 20 to 60, and one to two "great families" per Palermo world at 100 to 200 (drawn from `gen.families`; a great family always owns two or three adjacent neighborhoods). Per family:

- Head, underboss, counselor and 1 to 8 crew chiefs generated as characters (stage 8 supplies traits); soldiers filled to size; 3 to 10 associates per soldier as **counts only**, materialized lazily like civilian owners, except the associates on the player's block.
- Rackets and institutions held: from the archetype's prize list, weighted by size; the player's family never starts holding its own archetype's prize (it must be taken).
- `attention` starting meter: by province character and family size (design 03 §2 floor plus 0 to 150).
- `factions`: 0 to 2, each a subset of crew chiefs with a shared grievance tag, produced by pre-history rather than drawn.
- `goals` for the AI: from the head's traits (greedy → expand rackets; devout → protect Sentiment; hothead → higher war propensity).
- Kinship links between families (A8): 1 to 3 marriages per district, drawn now and given a history in stage 9.

Compact provinces get family records only: name, size class, territory value, Attention band, standing vector, goal state, no characters.

---

## Stage 8. Cast, household and state actors

**The cast around the player** (K3) is generated deliberately, not drawn from the family pool:

| Role | Guaranteed properties |
|---|---|
| Sponsor (a soldier) | Loyalty to the player's line high; one vice (gambler or womanizer) that will produce a request event; on record with the start crew chief |
| Start crew chief | Exposure 500 to 700 so a vacancy is plausible (K5); a trait that makes his fall slow rather than instant (discretion high) |
| Head of the player's family | Age 55 to 70; a succession question latent in pre-history |
| Two rival men of honor | One in the player's crew competing for the same blocks; one in the neighboring family's crew who collects on the border block |
| The neighboring family | A weak border stretch: one block whose crew chief has low loyalty and low men count |
| Police chief of the start town | Corruptible (bribable trait) with a price, or honest, drawn 70/30 |
| Prefect of the province | Ambition trait drawn; determines how fast lane-1 escalation happens |
| Parish priest of the start town | Compliant or outspoken, 60/40 |
| Local journalist | Present in provincial capitals and Palermo neighborhoods; curiosity meter |
| Local politician | Owes a favor to the player's family from pre-history or to the neighbor, 50/50 |
| Investigating magistrate | Generated as a person now, assigned to the province only when Attention reaches band 2 |

**The player character** gets the setup background: `born` gives kin inside the family (an uncle who is a crew chief) and higher starting loyalty from the sponsor; `outsider` gives a debt to the sponsor and one extra skill point. The **household** is generated for every character of soldier rank and above and for the player: spouse or not, children with ages, parents alive or not, 1 to 4 kin. Women of the household are characters with traits from stage 8's pool (PC-2a).

Traits, debts and vices come from authored pools with weights per role; each character gets 2 to 4 traits, at most one vice, and `memory` is empty until pre-history fills it.

---

## Stage 9. Pre-history

Fifteen to twenty simulated years run before the player arrives (K4). Pre-history uses the **compact model** for every province including the start province: families as records, no characters, driven by the event engine's `regional` templates (design 04, scope `province` and `island`) on one turn per quarter. Templates in the pre-history pool: territory disputes, a district war, a succession, a Commission ruling, an election, a contract scandal, a trial with a collaborator, a decapitation by arrest, a regency, a feast tradition established, a marriage between families.

At the end, pre-history **materializes** into the full state of the start province:

- Standing vectors between families and the `favor` ledger between heads.
- Grudges written into `memory` of the generated characters whose families were on the losing side (the dead relatives are named, with dates).
- Old claims: a business or block whose ownership was contested in a past war carries a `disputedHistory` tag that raises dispute probability.
- District heads chosen by the pre-history's last election; the provincial Commission's seat list and its recorded rulings and active bans.
- Newspaper archive: one issue per pre-history quarter, generated from the same report templates the live game uses, so the archive reads like the game.
- Factions inside families, seeded from the pre-history succession that did or did not happen.
- Coast-guard stations and squads placed where pre-history violence was high, which feeds route interdiction and starting heat.

Pre-history never touches the player's character, sponsor or start crew chief except to give them memories; the tutorial cast is protected so that constraints (stage 11) hold.

---

## Stage 10. Lazy expansion

A compact province becomes full when the player's Weight crosses the district-head threshold, when the player's family acquires a route or asset there, or when a regional template binds a role there (a war the Commission asks the player's district to mediate). Expansion runs stages 3 to 8 for that province from `gen.province.<id>`, then replays the province's own pre-history facts (kept in `history.prehistoryEvents`) into the materialized characters' memories. Because the stream is per province and the pre-history facts are stored, expansion at turn 300 produces the same province as expansion at turn 30.

Civilian owners, associates beyond the player's block, and witnesses are generated on first touch from the same province stream, keyed by the entity id, so the same business always yields the same owner.

---

## Stage 11. Constraints and the tutorial beats

```ts
type Constraint = {
  id: string; scope: "startBlock" | "startTown" | "startFamily" | "district" | "province";
  check: (world: World) => boolean;
  relaxable: boolean; relaxOrder?: number;   // lower relaxes first
  beat?: TutorialBeat;                        // which C13 beat it serves
};
```

Constraints for a valid start (K5, C13), checked after stage 9:

| Constraint | Beat served | Relaxable |
|---|---|---|
| Start block has 3 to 5 size-1/2 businesses paying weekly and one with compliance below 450 | The late payer | Yes (order 3): widen to 2 to 6 businesses |
| A neighboring family's crew claims a block adjacent to the start block with loyalty below 500 | The claim collision, the weak border | Yes (order 4): adjacency may be one block further |
| Start crew chief exposure 500 to 700 | A plausible vacancy | Yes (order 2): 450 to 750 |
| Sponsor has exactly one vice | The first favor request | Yes (order 1): any vice count 1 to 2 |
| At least one of the archetype's prize institutions is reachable within the district | Mid-game goal | No |
| The start family does not hold its own prize institution | Something to take | No |
| Start town has a parish priest and a police chief | Sentiment and heat lessons | No |
| Intake is open in the start family at generation | The initiation can happen | No |
| An associate arrest is plausible: at least one associate of the start crew has exposure above 300 | The first arrest | Yes (order 5): any associate in the family |
| Start family state is `healthy` and its head is alive | The ladder exists | No |
| The beats are drawn from the archetype's own economy (a stallholder in the market quarter, a boat owner on the coast) | C13 | No |

**Re-roll and relaxation policy (review N-2).** If any constraint fails: re-roll the start block and its immediate neighbors up to 8 times from a `gen.reroll` stream that advances per attempt (so re-rolls are deterministic); then re-roll the start town's cast up to 4 times; then relax relaxable constraints in `relaxOrder`, one at a time, re-checking after each; if a non-relaxable constraint still fails, re-roll the start town itself up to 3 times. Only then does generation fail, which is a harness bug, not a player-facing outcome. Every relaxation is recorded in `history` so the harness can count how often the generator needed it (target: under 5 percent of seeds relax anything, under 0.1 percent re-roll the town).

---

## Stage 12. Names

Name pools are content (`packages/content/names/*.json`), validated by schema, period-correct for 1970s to 1980s Sicily:

- **Given names** weighted by generation: grandfathers' names recur (Salvatore, Giuseppe, Antonino, Francesco, Vincenzo, Gaetano, Calogero); women's pools likewise (Maria, Giuseppa, Rosalia, Concetta, Antonina); saints' names weighted by the town's patron.
- **Surnames** by region pool: Palermo, western hinterland, Trapani coast, Agrigento, Catania and the east, so a family from Trapani does not carry an eastern surname. Kin share surnames; marriages produce the historical double reference ("Rosalia Di Maggio, married Greco") in the codex, not in labels.
- **Nicknames** (`u Curtu`, `Tano Bambino`, `il Papa`) from an authored pool keyed to traits and events; assigned to about one man in three by pre-history, never to the player at start.
- **Family names** follow the historical rule: a family is named for its town or neighborhood ("the Brancaccio family"), never for a surname, so the generated town names are the family names. Palermo neighborhood names are drawn from an authored pool of plausible toponyms (saints, gates, springs, estates) that avoids the real neighborhood names to respect the fictional-cast rule.
- Uniqueness: within a province no two living men of honor share both given name and surname; the generator appends a nickname or switches given name on collision.

---

## Performance targets

Budget from NF-12: a full world with pre-history in under 15 seconds on a mid-range laptop in the browser.

| Stage | Budget | Notes |
|---|---|---|
| Island, provinces, districts | under 0.2 s | Authored polygons and small clustering |
| Towns, blocks, businesses (full province) | under 1.5 s | 30 to 120 towns, 400 to 2,000 businesses, no owners |
| Institutions and routes | under 0.3 s | Graph of under 200 nodes |
| Families and cast (full province) | under 1.0 s | 150 to 600 characters with households |
| Pre-history, 18 years at one turn per quarter, compact model, nine provinces | under 8 s | 72 turns, roughly 100 family records, regional templates only; generation shows progress per year |
| Materialization and constraints | under 1.0 s | Includes up to 8 block re-rolls |
| Reserve | 3 s | Slow devices, relaxation passes |

If the budget is exceeded on a device (measured on first run), generation falls back to a shorter pre-history (12 years) and records the fallback in `meta`.

---

## Generator invariants

Checked by the harness over at least 1,000 seeds in CI (design 08):

- Every town in a full province has exactly one family; every family has at least one town; families do not overlap; every district has at least three families and is contiguous.
- Every block belongs to a town of the family whose crew it is assigned to, or to no crew.
- Every business has a block; sizes match the archetype's distribution within tolerance over the seed set.
- Every landing node has at least one sea leg to an external supplier and one leg to a mainland harbor; every fishing town and island has a landing node.
- All eleven start constraints hold after relaxation; relaxations are recorded.
- No character is younger than 16 or older than 90 at start; every soldier and above has a household record; no two living men of honor in a province share full name.
- Pre-history produced at least one war or one trial in the start province, at least one recorded Commission ruling, and a newspaper archive with one issue per quarter.
- The player character, sponsor and start crew chief are alive, in the same crew, and hold the properties in stage 8.
- Generating the same seed twice yields identical World hashes; expanding a compact province at different turns yields identical province hashes.
- Total World serialization under 4 MB for a full province plus eight compact provinces.
