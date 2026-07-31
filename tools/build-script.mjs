import { readFileSync, writeFileSync } from 'node:fs';

function build(rawPath, outPath, id) {
  const text = readFileSync(rawPath, 'utf8');
  const lines = text.split('\n').slice(3) // 헤더 3줄 제거
    .map((l) => l.trim()).filter((l) => l.length > 0);
  writeFileSync(outPath, JSON.stringify({ id, lines }, null, 1));
  console.log(outPath, lines.length + ' lines');
}

build('raw/suits_s01e01_pilot.txt', 'data/script-suits-s01e01.json', 'drama-suits-s01e01');
build('raw/suits_s01e02_errors_and_omissions.txt', 'data/script-suits-s01e02.json', 'drama-suits-s01e02');
