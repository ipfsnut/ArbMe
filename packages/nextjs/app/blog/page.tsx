import Link from 'next/link';
import { getBlogPosts } from '@/lib/blog';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog | ArbMe',
  description: 'Updates, guides, and insights from the ArbMe team on DeFi liquidity, arbitrage, and Base ecosystem.',
  alternates: { canonical: 'https://arbme.epicdylan.com/blog' },
};

export default function BlogIndex() {
  const posts = getBlogPosts();

  return (
    <div className="blog-index">
      <header className="blog-index-header">
        <h1 className="blog-index-title">Blog</h1>
        <p className="blog-index-desc">
          Updates, guides, and insights on DeFi liquidity and the Base ecosystem.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="blog-empty">No posts yet. Check back soon!</p>
      ) : (
        <div className="blog-grid">
          {posts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="blog-card">
              <div className="blog-card-body">
                <div className="blog-card-meta">
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </time>
                  <span className="blog-card-dot">&middot;</span>
                  <span>{post.readingTime}</span>
                </div>
                <h2 className="blog-card-title">{post.title}</h2>
                <p className="blog-card-desc">{post.description}</p>
                <div className="blog-card-tags">
                  {post.tags.map((tag) => (
                    <span key={tag} className="blog-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
