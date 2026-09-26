import fs from "node:fs";
import path from "node:path";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function GuidePage() {
  const md = fs.readFileSync(path.join(process.cwd(), "GUIDE.md"), "utf8");
  return (
    <article className="prose-guide pb-8">
      <Markdown remarkPlugins={[remarkGfm]}>{md}</Markdown>
    </article>
  );
}
