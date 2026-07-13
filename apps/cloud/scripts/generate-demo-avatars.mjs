import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createAvatar } from "@dicebear/core";
import * as notionistsNeutral from "@dicebear/notionists-neutral";

const outputDirectory = fileURLToPath(
  new URL("../public/demo/avatars/", import.meta.url),
);

// Stable seeds make demo identities recognizable across database resets,
// browsers, and screenshots. Colors provide role-level variety without
// encoding authorization or presence in the image itself.
const people = [
  { file: "sarah-chen.svg", seed: "runory:sarah-chen", background: "e0e7ff" },
  { file: "michael-torres.svg", seed: "runory:michael-torres", background: "ede9fe" },
  { file: "lisa-wang.svg", seed: "runory:lisa-wang", background: "fef3c7" },
  { file: "david-park.svg", seed: "runory:david-park", background: "dbeafe" },
  { file: "james-wilson.svg", seed: "runory:james-wilson", background: "d1fae5" },
  { file: "maria-garcia.svg", seed: "runory:maria-garcia", background: "ffe4e6" },
  { file: "robert-kim.svg", seed: "runory:robert-kim", background: "e2e8f0" },
];

await mkdir(outputDirectory, { recursive: true });

for (const person of people) {
  const avatar = createAvatar(notionistsNeutral, {
    seed: [person.seed],
    backgroundColor: [person.background],
    size: 256,
  });

  await writeFile(`${outputDirectory}${person.file}`, avatar.toString(), "utf8");
}

console.log(`Generated ${people.length} demo avatars in ${outputDirectory}`);
