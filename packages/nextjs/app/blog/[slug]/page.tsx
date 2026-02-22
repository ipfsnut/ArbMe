import { notFound } from 'next/navigation';
import { getBlogPosts, getPost } from '@/lib/blog';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getBlogPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};

  return {
    title: `${post.metadata.title} | ArbMe Blog`,
    description: post.metadata.description,
    alternates: { canonical: `https://arbme.epicdylan.com/blog/${slug}` },
    openGraph: {
      title: post.metadata.title,
      description: post.metadata.description,
      type: 'article',
      publishedTime: post.metadata.date,
      url: `https://arbme.epicdylan.com/blog/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.metadata.title,
      description: post.metadata.description,
    },
  };
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  let MDXContent;
  try {
    MDXContent = (await import(`@/content/blog/${slug}.mdx`)).default;
  } catch {
    notFound();
  }

  const formattedDate = new Date(post.metadata.date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <article className="blog-article">
      <header className="blog-article-header">
        <div className="blog-article-meta">
          <time dateTime={post.metadata.date}>{formattedDate}</time>
          <span className="blog-card-dot">&middot;</span>
          <span>{post.metadata.readingTime}</span>
        </div>
        <h1 className="blog-article-title">{post.metadata.title}</h1>
        <p className="blog-article-desc">{post.metadata.description}</p>
        <div className="blog-card-tags">
          {post.metadata.tags.map((tag) => (
            <span key={tag} className="blog-tag">
              {tag}
            </span>
          ))}
        </div>
      </header>
      <div className="blog-prose">
        <MDXContent />
      </div>
    </article>
  );
}
