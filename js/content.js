export function indexContent(sections, sourcesById) {
  const sentenceById = {};
  const sourceOfSentence = {};
  for (const src of Object.values(sourcesById)) {
    for (const s of src.sentences) {
      sentenceById[s.id] = s;
      sourceOfSentence[s.id] = src.id;
    }
  }
  return { sections, sourcesById, sentenceById, sourceOfSentence };
}

export function withCustom(base, custom) {
  const sourcesById = {};
  for (const [id, src] of Object.entries(base.sourcesById)) {
    const extra = custom[id] || [];
    sourcesById[id] = { ...src, sentences: [...src.sentences, ...extra] };
  }
  return indexContent(base.sections, sourcesById);
}

export async function loadContent(basePath = 'data') {
  const res = await fetch(`${basePath}/sections.json`);
  const { sections } = await res.json();
  const sourcesById = {};
  const ids = sections.flatMap((sec) => sec.sources);
  const loaded = await Promise.all(ids.map((id) => fetch(`${basePath}/${id}.json`).then((r) => r.json())));
  for (const src of loaded) sourcesById[src.id] = src;
  return indexContent(sections, sourcesById);
}

export async function loadScript(sourceId, basePath = 'data') {
  const res = await fetch(`${basePath}/script-${sourceId.replace('drama-', '')}.json`);
  if (!res.ok) return { lines: [] };
  return res.json();
}
