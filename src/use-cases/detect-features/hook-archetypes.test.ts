import { describe, expect, it } from 'vitest';
import { classifyHook } from './hook-archetypes.js';

describe('classifyHook', () => {
  it('returns shortcode-replacement when on_page_markdown uses re.sub on <!-- md:* --> tokens', () => {
    const src = `
import re
def on_page_markdown(markdown, **kwargs):
    return re.sub(r"<!--\\s*md:version\\s*(\\S+)\\s*-->", repl, markdown)
`;
    expect(classifyHook(src)).toEqual([
      'shortcode-replacement',
    ]);
  });

  it('returns i18n-fallback when on_files subclasses File or filters by language', () => {
    const src = `
class EnFile(File):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

def on_files(files, *, config):
    for f in files:
        if not f.src_uri.startswith("en/"):
            ...
    return files
`;
    expect(classifyHook(src)).toContain('i18n-fallback');
  });

  it('returns title-extraction when on_page_markdown sets page.meta["title"]', () => {
    const src = `
def on_page_markdown(markdown, *, page, config, files):
    page.meta["title"] = first_h1(markdown)
    return markdown
`;
    expect(classifyHook(src)).toContain('title-extraction');
  });

  it('returns extension-registration when on_config registers a Markdown Extension', () => {
    const src = `
from markdown.extensions import Extension

class CustomExt(Extension):
    def extendMarkdown(self, md):
        md.preprocessors.register(MyPre(md), "my", 50)

def on_config(config, **kwargs):
    config.markdown_extensions.append(CustomExt())
    return config
`;
    expect(classifyHook(src)).toContain('extension-registration');
  });

  it('returns post-build-emission when on_post_build writes files or pushes to external services', () => {
    const src = `
def on_post_build(config, **kwargs):
    with open("schema.json", "w") as f:
        f.write(json.dumps(...))
`;
    expect(classifyHook(src)).toContain('post-build-emission');
  });

  it('returns dynamic-content when on_page_markdown reads YAML data and renders templates', () => {
    const src = `
import yaml

def on_page_markdown(markdown, *, page, config, files):
    if page.url == "people/":
        people = yaml.safe_load(open("people.yml"))
        return render_template(markdown, people=people)
    return markdown
`;
    expect(classifyHook(src)).toContain('dynamic-content');
  });

  it('returns multiple archetypes when several hook entry points appear in one file', () => {
    const src = `
def on_config(config):
    config.markdown_extensions.append(SomeExt)
    return config

def on_page_markdown(markdown, *, page, **kwargs):
    page.meta["title"] = first_h1(markdown)
    return re.sub(r"<!--\\s*md:version\\s*(\\S+)\\s*-->", "", markdown)

def on_post_build(config):
    with open("out.json", "w") as f: ...
`;
    const archetypes = classifyHook(src);
    expect(archetypes).toContain('extension-registration');
    expect(archetypes).toContain('title-extraction');
    expect(archetypes).toContain('shortcode-replacement');
    expect(archetypes).toContain('post-build-emission');
  });

  it('returns ["unknown"] for code with no recognized signatures', () => {
    expect(classifyHook('print("hello")\n')).toEqual(['unknown']);
  });

  it('returns ["unknown"] for empty source', () => {
    expect(classifyHook('')).toEqual(['unknown']);
  });
});
