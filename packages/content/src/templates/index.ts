// All process templates shipped with the content package (design 06). Each domain file exports an array;
// this file concatenates them. The loader validates the result against the schema.
import type { ProcessTemplate } from "@borgata/sim";
import { CIVIL_TEMPLATES } from "./civil.js";
import { STATE_TEMPLATES } from "./state.js";
import { DISPUTE_TEMPLATES } from "./disputes.js";
import { DISTRICT_TEMPLATES } from "./district.js";
import { WAR_TEMPLATES } from "./war.js";
import { ASSOCIATE_WEEK_TEMPLATES } from "./associate-week.js";
import { ASSOCIATE_PEOPLE_TEMPLATES } from "./associate-people.js";
import { SOLDIER_TEMPLATES } from "./soldier.js";
import { SITUATIONS_B_TEMPLATES } from "./situations-b.js";
import { SITUATIONS_A_TEMPLATES } from "./situations-a.js";
import { SITUATIONS_C_TEMPLATES } from "./situations-c.js";
import { OBLIGATION_TEMPLATES } from "./obligations.js";

export const ALL_TEMPLATES: ProcessTemplate[] = [
  ...STATE_TEMPLATES,
  ...CIVIL_TEMPLATES,
  ...DISPUTE_TEMPLATES,
  ...DISTRICT_TEMPLATES,
  ...WAR_TEMPLATES,
  ...ASSOCIATE_WEEK_TEMPLATES,
  ...ASSOCIATE_PEOPLE_TEMPLATES,
  ...SOLDIER_TEMPLATES,
  ...SITUATIONS_B_TEMPLATES,
  ...SITUATIONS_A_TEMPLATES,
  ...SITUATIONS_C_TEMPLATES,
  ...OBLIGATION_TEMPLATES,
];
