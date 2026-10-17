import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Renders an assistant answer as Markdown. Raw HTML is intentionally not
// enabled: `react-markdown` drops embedded HTML by default, so text quoted from
// an untrusted document (which the backend already treats as data, never as
// instructions) cannot inject markup into the workspace. Tables and lists are
// styled through the wrapper below rather than a global prose reset.
export function MarkdownAnswer({ content }: { content: string }) {
  return (
    <div
      className={[
        'text-sm leading-relaxed text-ink',
        '[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
        '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-0.5',
        '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2',
        '[&_strong]:font-semibold',
        '[&_code]:rounded-sm [&_code]:border [&_code]:border-line [&_code]:bg-paper [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs',
        '[&_h1]:mt-3 [&_h1]:font-serif [&_h1]:text-base [&_h1]:text-ink',
        '[&_h2]:mt-3 [&_h2]:font-serif [&_h2]:text-sm [&_h2]:text-ink',
        '[&_h3]:mt-3 [&_h3]:font-serif [&_h3]:text-sm [&_h3]:text-ink',
        '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-graphite',
        '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs',
        '[&_th]:border [&_th]:border-line [&_th]:bg-paper [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold',
        '[&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
        '[&_hr]:my-3 [&_hr]:border-line',
      ].join(' ')}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent underline underline-offset-2"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
