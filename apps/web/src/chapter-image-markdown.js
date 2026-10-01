// Only URLs issued by the chapter-image API are eligible for rendering.
export function parseChapterImage(line) {
  const match = /^!\[((?:\\.|[^\]\\])*)\]\((\/api\/chapters\/[1-9]\d*\/images\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\)$/.exec(String(line).trim());
  if (!match) return null;
  return { src: match[2], caption: match[1].replace(/\\([\\[\]<>*_`])/g, "$1") || "章节配图" };
}
