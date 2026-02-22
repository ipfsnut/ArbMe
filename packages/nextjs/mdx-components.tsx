import type { MDXComponents } from 'mdx/types'
import Link from 'next/link'

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children, ...props }) => (
      <h1 className="blog-h1" {...props}>{children}</h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 className="blog-h2" {...props}>{children}</h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 className="blog-h3" {...props}>{children}</h3>
    ),
    h4: ({ children, ...props }) => (
      <h4 className="blog-h4" {...props}>{children}</h4>
    ),
    p: ({ children, ...props }) => (
      <p className="blog-p" {...props}>{children}</p>
    ),
    a: ({ href, children, ...props }) => {
      if (href?.startsWith('/') || href?.startsWith('#')) {
        return <Link href={href} className="blog-link" {...props}>{children}</Link>
      }
      return (
        <a href={href} className="blog-link" target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      )
    },
    ul: ({ children, ...props }) => (
      <ul className="blog-ul" {...props}>{children}</ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="blog-ol" {...props}>{children}</ol>
    ),
    li: ({ children, ...props }) => (
      <li className="blog-li" {...props}>{children}</li>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote className="blog-blockquote" {...props}>{children}</blockquote>
    ),
    table: ({ children, ...props }) => (
      <div className="blog-table-wrapper">
        <table className="blog-table" {...props}>{children}</table>
      </div>
    ),
    th: ({ children, ...props }) => (
      <th className="blog-th" {...props}>{children}</th>
    ),
    td: ({ children, ...props }) => (
      <td className="blog-td" {...props}>{children}</td>
    ),
    code: ({ children, ...props }) => (
      <code className="blog-inline-code" {...props}>{children}</code>
    ),
    hr: (props) => <hr className="blog-hr" {...props} />,
    img: ({ src, alt, ...props }) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt || ''} className="blog-img" {...props} />
    ),
    ...components,
  }
}
