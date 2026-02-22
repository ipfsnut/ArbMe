import Link from 'next/link';

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lp">
      <div className="lp-gradient-bg" />
      <div className="lp-content">
        <nav className="blog-nav">
          <div className="blog-nav-inner">
            <Link href="/" className="blog-nav-logo">
              ArbMe
            </Link>
            <div className="blog-nav-links">
              <Link href="/blog">Blog</Link>
              <Link href="/pools" className="blog-nav-cta">
                Launch App
              </Link>
            </div>
          </div>
        </nav>
        <main className="blog-main">{children}</main>
        <footer className="blog-footer">
          <div className="blog-footer-inner">
            <p>
              &copy; {new Date().getFullYear()} ArbMe &middot;{' '}
              <Link href="/blog">Blog</Link> &middot;{' '}
              <Link href="/feed.xml">RSS</Link>
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
