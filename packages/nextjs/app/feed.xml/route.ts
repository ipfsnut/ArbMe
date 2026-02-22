import { Feed } from 'feed';
import { getBlogPosts } from '@/lib/blog';

const SITE_URL = 'https://arbme.epicdylan.com';

export async function GET() {
  const posts = getBlogPosts();

  const feed = new Feed({
    title: 'ArbMe Blog',
    description: 'Updates, guides, and insights on DeFi liquidity and the Base ecosystem.',
    id: SITE_URL,
    link: `${SITE_URL}/blog`,
    language: 'en',
    favicon: `${SITE_URL}/favicon.ico`,
    copyright: `All rights reserved ${new Date().getFullYear()}, ArbMe`,
    feedLinks: {
      rss2: `${SITE_URL}/feed.xml`,
    },
  });

  for (const post of posts) {
    feed.addItem({
      title: post.title,
      id: `${SITE_URL}/blog/${post.slug}`,
      link: `${SITE_URL}/blog/${post.slug}`,
      description: post.description,
      date: new Date(post.date),
    });
  }

  return new Response(feed.rss2(), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}
