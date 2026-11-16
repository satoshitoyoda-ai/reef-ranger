// Fish Guide entries. Facts use the kid wording checked in ../research_20261116.md (section 4).
export const KIND = {
  fish: { label: 'FISH', cls: 'fish' },
  mammal: { label: 'NOT A FISH · mammal', cls: 'not' },
  reptile: { label: 'NOT A FISH · reptile', cls: 'not' },
  mollusk: { label: 'NOT A FISH · mollusk', cls: 'not' },
  jelly: { label: 'NOT A FISH · jelly', cls: 'not' },
};
export const PLACES = {
  reef: { name: 'Coral Reef', depth: '0–30 m', zone: 'Sunlight zone' },
  kelp: { name: 'Kelp Forest', depth: '5–30 m', zone: 'Sunlight zone' },
  open: { name: 'Open Ocean', depth: '0–200 m', zone: 'Sunlight zone' },
  deep: { name: 'Deep Sea', depth: '1,000 m+', zone: 'Midnight zone' },
};
export const SPECIES = [
  { id: 'pip', name: 'Blacktip reef shark', kind: 'fish', where: 'reef', fact: "That's Pip! Sharks have no bones. Their skeleton is cartilage, like the tip of your nose. Blacktip pups grow up in warm, shallow water." },
  { id: 'clown', name: 'Clownfish', kind: 'fish', where: 'reef', fact: 'Clownfish live in sea anemones. A special slime on their skin means the anemone does not sting them.' },
  { id: 'tang', name: 'Blue tang', kind: 'fish', where: 'reef', fact: 'Blue tangs have a sharp spine near the tail, like a tiny knife, to keep them safe.' },
  { id: 'parrot', name: 'Parrotfish', kind: 'fish', where: 'reef', fact: 'Parrotfish crunch coral with beak-like teeth. Their poop makes lots of white sand!' },
  { id: 'puffer', name: 'Pufferfish', kind: 'fish', where: 'reef', fact: 'Puffers gulp water into a stretchy tummy to get big. Many have spines that stand up.' },
  { id: 'lion', name: 'Lionfish', kind: 'fish', where: 'reef', fact: "Lionfish have stinging spines, so look but don't touch! In the Atlantic Ocean they don't belong." },
  { id: 'seahorse', name: 'Seahorse', kind: 'fish', where: 'reef', fact: 'A seahorse is a fish! Mom gives the eggs to Dad, and Dad carries the babies in his pouch.' },
  { id: 'turtle', name: 'Green sea turtle', kind: 'reptile', where: 'reef', fact: 'Sea turtles are reptiles, not fish. They swim up to breathe air, and grown-ups munch seagrass.' },
  { id: 'manta', name: 'Manta ray', kind: 'fish', where: 'reef', fact: 'Manta rays are cousins of sharks. They eat tiny plankton, and big ones can be 7 meters wide or more!' },
  { id: 'moray', name: 'Moray eel', kind: 'fish', where: 'reef', fact: 'A moray eel is a fish with a second set of jaws hiding in its throat!' },
  { id: 'barracuda', name: 'Barracuda', kind: 'fish', where: 'reef', fact: 'Barracudas are fast hunters with long, shiny silver bodies.' },
  { id: 'chromis', name: 'Blue chromis', kind: 'fish', where: 'reef', fact: 'Blue chromis swim together in big groups called schools.' },
  { id: 'whale', name: 'Whale shark', kind: 'fish', where: 'reef', fact: 'The whale shark is the biggest fish in the world, but it eats tiny plankton.' },
  { id: 'hammer', name: 'Hammerhead shark', kind: 'fish', where: 'reef', fact: "Scientists think a hammerhead's wide head helps it feel tiny signals from fish hiding in the sand." },
  { id: 'garibaldi', name: 'Garibaldi', kind: 'fish', where: 'kelp', fact: "The bright orange garibaldi is California's state marine fish." },
  { id: 'dolphin', name: 'Dolphin', kind: 'mammal', where: 'kelp', fact: 'Dolphins are mammals, not fish. They swim up to breathe through a blowhole on top of the head.' },
  { id: 'otter', name: 'Sea otter', kind: 'mammal', where: 'kelp', fact: "Sea otters sometimes wrap up in kelp so they don't drift away while they rest.", locked: true },
  { id: 'octopus', name: 'Octopus', kind: 'mollusk', where: 'reef', fact: 'An octopus has three hearts and blue blood!', locked: true },
  { id: 'flying', name: 'Flying fish', kind: 'fish', where: 'open', fact: 'Flying fish leap out of the water and glide on wing-like fins.', locked: true },
  { id: 'angler', name: 'Anglerfish', kind: 'fish', where: 'deep', fact: 'Some deep-sea anglerfish have a glowing lure. Tiny glowing bacteria live inside it!' },
  { id: 'jelly', name: 'Jellyfish', kind: 'jelly', where: 'deep', fact: "Jellyfish aren't fish! They have no bones and no brain." },
  { id: 'squid', name: 'Giant squid', kind: 'mollusk', where: 'deep', fact: 'Giant squid have eyes as big as a dinner plate, the biggest eyes of any animal!' },
];
export const FUN = {
  reef: 'Coral looks like rock, but it is made of tiny animals!',
  kelp: 'Giant kelp can grow about 60 centimeters in one day!',
  deep: "It's so dark down here that many animals make their own light.",
};
