// Period-correct Sicilian name pools (design 05 stage 12, `NamePools` binding in
// packages/sim/src/content-types.ts). Adults in the 1970s-1980s setting were born in the 1920s-1960s, so
// given names lean on the grandfathers'-and-saints' generation the research report names (Salvatore,
// Giuseppe, Antonino, Francesco, Vincenzo, Gaetano, Calogero; Maria, Giuseppa, Rosalia, Concetta, Antonina).
//
// Surnames, nicknames, town names and neighborhood names are all invented: none of them names a real person,
// real notorious Mafia surname, or real Sicilian town or Palermo neighborhood (docs/research/03, respecting
// the fictional-cast rule in design 06 and NF-7's register). Family name suffixes follow the brief's examples
// ("della Marina", "dei Cortili", "del Ponte").
import type { NamePools } from "@borgata/sim";

const givenMale: string[] = [
  "Salvatore", "Giuseppe", "Antonino", "Calogero", "Vito", "Rosario", "Gaetano", "Turi", "Pino", "Nino",
  "Francesco", "Vincenzo", "Giovanni", "Carmelo", "Filippo", "Angelo", "Pietro", "Matteo", "Michele", "Domenico",
  "Antonio", "Mario", "Paolo", "Stefano", "Gaspare", "Nunzio", "Leonardo", "Emanuele", "Ignazio", "Sebastiano",
  "Bartolomeo", "Girolamo", "Onofrio", "Liborio", "Pasquale", "Alfio", "Santo", "Cataldo", "Raimondo", "Diego",
  "Cosimo", "Biagio", "Rocco", "Sergio", "Alfredo", "Aurelio", "Ciro", "Claudio", "Ettore", "Fabio",
  "Gerlando", "Giacomo", "Lorenzo", "Marco", "Massimo", "Nicola", "Orazio", "Renato", "Silvio", "Tommaso",
  "Umberto", "Valerio", "Vittorio", "Raffaele", "Corrado", "Franco", "Giulio", "Leone", "Mimmo", "Nello",
];

const givenFemale: string[] = [
  "Maria", "Giuseppa", "Rosalia", "Concetta", "Antonina", "Rosa", "Anna", "Caterina", "Francesca", "Vincenza",
  "Giovanna", "Carmela", "Angela", "Grazia", "Santa", "Nunzia", "Agata", "Filippa", "Teresa", "Lucia",
  "Provvidenza", "Michela", "Paola", "Assunta", "Domenica", "Rosetta", "Vita", "Serafina", "Pina", "Franca",
  "Letizia", "Immacolata", "Calogera", "Onofria", "Ignazia", "Liboria", "Santuzza", "Carmelina", "Concettina", "Marietta",
  "Anita", "Bianca", "Dora", "Elena", "Fina", "Gilda", "Iole", "Loredana", "Marisa", "Ninfa",
];

const surnames: string[] = [
  "Russo", "Romano", "Rizzo", "Marino", "Bruno", "Costa", "Ferrara", "Ferraro", "Conti", "Ricci",
  "Lombardo", "Moretti", "Barbera", "Fontana", "Santoro", "Mancini", "Rinaldi", "Farina", "Gatto", "Caruso",
  "Longo", "Leone", "Martino", "Basile", "Milazzo", "Termini", "Vassallo", "Randazzo", "Calandra", "Cusimano",
  "Sciortino", "Lo Iacono", "Lo Bianco", "Lo Verde", "Lo Cascio", "La Rosa", "La Manna", "La Placa", "La Spina", "Di Salvo",
  "Di Stefano", "Di Maggio", "Di Marco", "Di Pasquale", "Di Fresco", "D'Amico", "D'Angelo", "D'Anna", "D'Asaro", "Fricano",
  "Pantano", "Cangemi", "Bua", "Butera", "Cascio", "Cammarata", "Gargano", "Adamo", "Cusenza", "Fiorentino",
  "Scalia", "Sciacca", "Bellante", "Tusa", "Mineo", "Gulotta", "Faraci", "Bonfiglio", "Cracolici", "Ferrante",
  "Zito", "Bono", "Bevilacqua", "Cardella", "Cusumano", "Guarino", "Salerno", "Lentini", "Militello", "Cangialosi",
  "Ciotta", "Restivo", "Abbate", "Alagna", "Armato", "Bertolino", "Cinquemani", "Colletti", "Cutrona", "Damiani",
  "Ditta", "Falsone", "Ferrigno", "Giordano", "Grillo", "Gucciardi", "Ingrassia", "Lauricella", "Liotta", "Lupo",
  "Maniscalco", "Mazzola", "Miceli", "Montalto", "Nobile", "Oddo", "Palazzolo", "Pecoraro", "Pipitone", "Riggio",
  "Romeo", "Sanfilippo", "Scavone", "Schiera", "Serio", "Spataro", "Termine", "Trapanese", "Vaccaro", "Vitrano",
  "Zappulla", "Zummo", "Cordaro", "Fallica", "Guttilla", "Pace", "Pantaleo", "Portella", "Quartararo", "Scibetta",
  "Taibi", "Trupiano", "Vazzano", "Zafarana", "Cardinale", "Casamento", "Curatolo", "Dispenza", "Ferrantelli", "Gattuso",
];

const nicknames: string[] = [
  "u Longu", "u Storto", "u Tignusu", "u Pilusu", "u Lestu", "u Sonnu", "u Muzzu", "u Zittu", "u Sceccu", "u Lampu",
  "u Cecatu", "u Sordu", "u Ruggiu", "u Nivuru", "u Ranni", "u Nicu", "u Sfacciatu", "u Malandrinu", "u Fitusu", "u Duci",
  "Vucca Ranni", "Vucca Storta", "Manu Lesta", "Manu di Focu", "Occhi Nivuri", "Occhi di Gattu", "Denti d'Oru", "Denti Storti", "Testa Quadra", "Testa i Focu",
  "Panza Ranni", "Panza Vacanti", "Coda Longa", "Facci Tosta", "Facci di Petra", "Pedi Lesti", "Pedi Chiatti", "Nasu Stortu", "Cori Duru", "Sangu Friddu",
  "Parola d'Oru", "Beddu Picciottu",
];

const townNames: string[] = [
  "Serralta", "Montecorvo", "Casalvento", "Torrebianca", "Pianoserra", "Campolongo", "Vallenera", "Roccascura", "Fontanamara", "Portoscuro",
  "Serramarina", "Gebbiabianca", "Case Nuove", "Contrada Rossa", "Piano dei Falchi", "Torre dei Venti", "Serra dei Falchi", "Chiusa Nuova", "Vallescura", "Campobianco",
  "Rocca dei Corvi", "Fondaco Nuovo", "Serra Longa", "Piano Ventoso", "Torresecca", "Serrafredda", "Valloscuro", "Pianalta", "Torredoro", "Campomurato",
  "Gebbianera", "Contrada dei Pini", "Serra del Corvo", "Piano del Lupo", "Fondaco Rosso", "Contrada Vecchia", "Serra Alta", "Piano Grande", "Fontana Amara", "Case Vecchie",
  "Pizzo Alto", "Serra Corta", "Contrada Piana", "Fondaco Vecchio", "Torre del Vento", "Poggio Ventoso", "Cava Bianca", "Fiume Secco", "Campo Sacro", "Vallata Rossa",
];

const neighborhoodNames: string[] = [
  "Borgo Sant'Aloe", "Quartiere delle Fontanelle", "Rione dei Gelsi", "Borgo Marinaro", "Quartiere del Carmine Vecchio", "Rione Sant'Onofrio", "Borgo dei Tigli", "Quartiere delle Palme Vecchie", "Rione della Noria", "Borgo Faro",
  "Quartiere dei Cortili", "Rione delle Zagare", "Borgo Sant'Elmo", "Quartiere della Fenice", "Rione dei Pescatori Vecchi", "Borgo dell'Arancio", "Quartiere Sant'Ignazio", "Rione delle Mura Antiche", "Borgo dei Vespri", "Quartiere della Cala Vecchia",
  "Rione Santa Croce Nuova", "Borgo delle Terrazze", "Quartiere dei Mulini a Vento", "Rione San Basilio", "Borgo Sant'Aureliano", "Quartiere della Fontana Grande", "Rione dei Giardini Vecchi", "Borgo Santa Oliva", "Quartiere del Faro Vecchio", "Rione della Marina Piccola",
  "Borgo delle Conche", "Rione dei Tre Ponti",
];

const islandNames: string[] = [
  "Isola dei Venti", "Isola Serena", "Isola Bianca", "Isola del Faro Vecchio", "Isola dei Pescatori", "Isola Rossa", "Isola del Sale", "Isola Lunga", "Isola dei Gabbiani", "Isola Scura",
  "Isola del Vento del Sud", "Isola dei Coralli", "Isola Piatta", "Isola dei Marinai",
];

const familyNameSuffixes: string[] = [
  "della Marina", "dei Cortili", "del Ponte", "delle Saline", "del Piano", "dei Mulini", "della Torre", "del Vento",
  "dei Giardini", "della Costa", "del Fondaco", "dei Pozzi", "della Chiesa Vecchia", "del Feudo", "delle Terre",
];

export const NAMES: NamePools = {
  givenMale,
  givenFemale,
  surnames,
  nicknames,
  townNames,
  neighborhoodNames,
  islandNames,
  familyNameSuffixes,
  provinceName: "Provincia di Val d'Ombra",
  capitalName: "Montesilva",
};
